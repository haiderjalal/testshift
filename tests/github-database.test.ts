import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { claimGitHubJob, recordWebhook } from "../src/lib/github/store";
import { saveState, takeState } from "../src/lib/github/auth-store";
import { opaque, digest } from "../src/lib/github/crypto";
import { processGitHubJob } from "../worker/github";
const database = new PGlite(); let socket: PGLiteSocketServer; let sql: postgres.Sql;
let connection: string;
before(async () => {
  for (const file of (await readdir("supabase/migrations")).filter((name) => name.endsWith(".sql")).sort()) await database.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  socket = new PGLiteSocketServer({ db: database, port: 0, host: "127.0.0.1" }); await socket.start();
  sql = postgres(`postgres://postgres:postgres@${socket.getServerConn()}/postgres`, { prepare: false, max: 1 }); Object.assign(globalThis, { sql });
  await sql`insert into github_users (id,login) values (1,'owner'),(2,'other')`;
  const rows = await sql`insert into github_connections (user_id,installation_id,repository_id,full_name) values (1,5,7,'owner/project') returning id`; connection = rows[0].id;
});
after(async () => { await sql?.end(); await socket?.stop(); await database.close(); });
const payload = (run = 20) => ({ action: "completed", installation: { id: 5 }, repository: { id: 7, full_name: "owner/project" }, workflow_run: { id: run, run_attempt: 1, head_sha: "a".repeat(40), path: ".github/workflows/testshift.yml", status: "completed" } });
test("OAuth state is bound to browser, purpose and customer and can be consumed only once", async () => {
  const state = opaque(), browser = opaque(), verifier = opaque(); await saveState(sql, state, browser, "install", verifier, "1");
  assert.equal(await takeState(sql, state, opaque(), "install"), null); assert.equal(await takeState(sql, state, browser, "login"), null);
  const results = await Promise.all([takeState(sql, state, browser, "install"), takeState(sql, state, browser, "install")]);
  assert.equal(results.filter(Boolean).length, 1); assert.equal(results.find(Boolean)?.user_id, "1"); assert.equal(results.find(Boolean)?.verifier, verifier);
  const expired = opaque(); await saveState(sql, expired, browser, "login", verifier);
  await sql`update github_states set expires_at = now() - interval '1 second' where state_hash = ${digest(expired)}`;
  assert.equal(await takeState(sql, expired, browser, "login"), null);
});
test("webhook deduplication and immutable workflow jobs survive repeated deliveries", async () => {
  const delivery = randomUUID(); assert.equal(await recordWebhook(sql, delivery, "workflow_run", payload()), "accepted");
  assert.equal(await recordWebhook(sql, delivery, "workflow_run", payload()), "duplicate");
  await recordWebhook(sql, randomUUID(), "workflow_run", payload());
  const rows = await sql`select * from github_jobs where connection_id = ${connection}`; assert.equal(rows.length, 1); assert.equal(rows[0].head_sha, "a".repeat(40));
});
test("wrong repositories, installations and workflow paths cannot enqueue customer jobs", async () => {
  for (const value of [{ ...payload(21), installation: { id: 6 } }, { ...payload(22), repository: { id: 8, full_name: "other/project" } },
    { ...payload(23), workflow_run: { ...payload().workflow_run, id: 23, path: ".github/workflows/other.yml" } }]) await recordWebhook(sql, randomUUID(), "workflow_run", value);
  assert.equal((await sql`select count(*)::int as count from github_jobs`)[0].count, 1);
  const delivery = randomUUID(); await assert.rejects(recordWebhook(sql, delivery, "workflow_run", { ...payload(), workflow_run: { id: "invalid" } }));
  assert.equal((await sql`select id from github_deliveries where id = ${delivery}`).length, 0);
});
test("a job lease is exclusive, recoverable after expiry and cannot outlive repository removal", async () => {
  const claimed = await Promise.all([claimGitHubJob(sql), claimGitHubJob(sql)]); assert.equal(claimed.filter(Boolean).length, 1);
  const first = claimed.find(Boolean)!; await sql`update github_jobs set lease_until = now() - interval '1 second' where id = ${first.id}`;
  const second = await claimGitHubJob(sql); assert.ok(second); assert.notEqual(second.lease_id, first.lease_id); assert.equal(second.attempts, 2);
  await recordWebhook(sql, randomUUID(), "installation_repositories", { action: "removed", installation: { id: 5 }, repositories_removed: [{ id: 7 }] });
  assert.equal((await sql`select active from github_connections where id = ${connection}`)[0].active, false);
  assert.equal((await sql`select status from github_jobs where id = ${first.id}`)[0].status, "blocked"); assert.equal(await claimGitHubJob(sql), null);
});
test("authorization revocation removes sessions and blocks pending jobs", async () => {
  await sql`update github_connections set active = true where id = ${connection}`;
  await recordWebhook(sql, randomUUID(), "workflow_run", payload(25));
  await sql`insert into github_sessions (token_hash,user_id,encrypted_token,expires_at) values (${'c'.repeat(64)},1,'fixture',now()+interval '1 hour')`;
  await recordWebhook(sql, randomUUID(), "github_app_authorization", { action: "revoked", sender: { id: 1 } });
  assert.equal((await sql`select * from github_sessions where user_id = 1`).length, 0);
  assert.equal((await sql`select status from github_jobs where workflow_run_id = 25`)[0].status, "blocked");
});
test("broker verifies GitHub metadata, publishes one check and commits the private report", async () => {
  await sql`update github_connections set active = true where id = ${connection}`;
  await recordWebhook(sql, randomUUID(), "workflow_run", payload(40));
  const savedFetch = globalThis.fetch; const savedId = process.env.GITHUB_APP_ID; const savedKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const { generateKeyPairSync } = await import("node:crypto");
  process.env.GITHUB_APP_ID = "123"; process.env.GITHUB_APP_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  let checks = 0; let revoked = false;
  globalThis.fetch = async (input, options) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/access_tokens")) return Response.json({ token: "fixture-scoped-installation-token" });
    if (path.endsWith("/permission")) return Response.json({ permission: "admin" });
    if (path.endsWith("/attempts/1")) return Response.json({ ...payload(40).workflow_run, conclusion: "success", event: "push", repository: { id: 7, full_name: "owner/project" }, head_repository: { id: 7 } });
    if (path.endsWith("/jobs")) return Response.json({ jobs: [{ id: 1, name: "fixture-suite", status: "completed", conclusion: "success", steps: [{ name: "Unit tests", number: 1, status: "completed", conclusion: "success" }] }] });
    if (path.endsWith("/check-runs") && options?.method === "GET") return Response.json({ check_runs: [] });
    if (path.endsWith("/check-runs") && options?.method === "POST") { checks++; const body = JSON.parse(String(options.body)); assert.equal(body.head_sha, "a".repeat(40)); return Response.json({ id: 99 }); }
    if (path === "/installation/token") { revoked = true; return new Response(null, { status: 204 }); }
    throw new Error("Unexpected API request");
  };
  try {
    assert.equal(await processGitHubJob(), true); assert.equal(checks, 1); assert.equal(revoked, true);
    const job = (await sql`select * from github_jobs where workflow_run_id = 40`)[0]; assert.equal(job.status, "completed"); assert.equal(Number(job.check_id), 99); assert.equal(job.report.conclusion, "success");
    assert.equal(await processGitHubJob(), false);
    await sql`delete from github_connections where id = ${connection} and user_id = 2`; assert.equal((await sql`select id from github_connections where id = ${connection}`).length, 1);
    await sql`delete from github_connections where id = ${connection} and user_id = 1`; assert.equal((await sql`select id from github_jobs where connection_id = ${connection}`).length, 0);
  } finally { globalThis.fetch = savedFetch; if (savedId === undefined) delete process.env.GITHUB_APP_ID; else process.env.GITHUB_APP_ID = savedId; if (savedKey === undefined) delete process.env.GITHUB_APP_PRIVATE_KEY; else process.env.GITHUB_APP_PRIVATE_KEY = savedKey; }
});
test("broker recovers a check created before a transient response failure without publishing a duplicate", async () => {
  const row = await sql`insert into github_connections (user_id,installation_id,repository_id,full_name) values (1,5,7,'owner/project') returning id`;
  const connectionId = row[0].id; await recordWebhook(sql, randomUUID(), "workflow_run", payload(41));
  const savedFetch = globalThis.fetch; const savedId = process.env.GITHUB_APP_ID; const savedKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const { generateKeyPairSync } = await import("node:crypto"); process.env.GITHUB_APP_ID = "123";
  process.env.GITHUB_APP_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  let created = 0, patched = 0; let externalId: string | null = null;
  globalThis.fetch = async (input, options) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/access_tokens")) return Response.json({ token: "fixture-scoped-installation-token" });
    if (path.endsWith("/permission")) return Response.json({ permission: "admin" });
    if (path.endsWith("/attempts/1")) return Response.json({ ...payload(41).workflow_run, conclusion: "success", event: "push", repository: { id: 7, full_name: "owner/project" }, head_repository: { id: 7 } });
    if (path.endsWith("/jobs")) return Response.json({ jobs: [{ id: 1, name: "fixture-suite", status: "completed", conclusion: "success", steps: [{ name: "Test suite", number: 1, status: "completed", conclusion: "success" }] }] });
    if (path.endsWith("/check-runs") && options?.method === "GET") return Response.json({ check_runs: externalId ? [
      { id: 888, external_id: externalId, app: { id: 999 } }, { id: 399, external_id: externalId, app: { id: 123 } },
    ] : [] });
    if (path.endsWith("/check-runs") && options?.method === "POST") { created++; externalId = JSON.parse(String(options.body)).external_id; return Response.json({}, { status: 503 }); }
    if (path.endsWith("/check-runs/399") && options?.method === "PATCH") { patched++; assert.equal(JSON.parse(String(options.body)).head_sha, undefined); return Response.json({ id: 399 }); }
    if (path === "/installation/token") return new Response(null, { status: 204 });
    throw new Error("Unexpected API request");
  };
  try {
    await processGitHubJob(); const first = (await sql`select * from github_jobs where connection_id = ${connectionId}`)[0]; assert.equal(first.status, "queued");
    await sql`update github_jobs set next_attempt_at = now() where id = ${first.id}`; await processGitHubJob();
    const second = (await sql`select * from github_jobs where id = ${first.id}`)[0]; assert.equal(second.status, "completed"); assert.equal(Number(second.check_id), 399);
    assert.equal(created, 1); assert.equal(patched, 1);
  } finally { globalThis.fetch = savedFetch; if (savedId === undefined) delete process.env.GITHUB_APP_ID; else process.env.GITHUB_APP_ID = savedId; if (savedKey === undefined) delete process.env.GITHUB_APP_PRIVATE_KEY; else process.env.GITHUB_APP_PRIVATE_KEY = savedKey; }
});
