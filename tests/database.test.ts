import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { LeaseLostError, withRunLease } from "../worker/lease";

const db = new PGlite();
let socket: PGLiteSocketServer;
let sql: postgres.Sql;
before(async () => {
  for (const file of (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  socket = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  await socket.start();
  sql = postgres(`postgres://postgres:postgres@${socket.getServerConn()}/postgres`, { prepare: false, max: 1 });
  Object.assign(globalThis, { sql });
});
after(async () => { await sql?.end(); await socket?.stop(); await db.close(); });

test("rate limiter admits exactly the allowance in a burst and bounds stored rows", async () => {
  const results = await Promise.all(Array.from({ length: 50 }, () => db.query<{ allowed: boolean }>("select consume_rate_limit('burst', 5, 60) as allowed")));
  assert.equal(results.filter((r) => r.rows[0].allowed).length, 5);
  const { rows } = await db.query<{ hits: number }>("select hits from rate_limit_windows where bucket = 'burst'");
  assert.equal(rows.length, 1); assert.equal(rows[0].hits, 6);
});
test("rate-limit windows expire and independent buckets remain usable", async () => {
  await db.exec("update rate_limit_windows set window_started_at = now() - interval '2 minutes' where bucket = 'burst'");
  const { rows } = await db.query<{ allowed: boolean }>("select consume_rate_limit('burst', 5, 60) as allowed");
  assert.equal(rows[0].allowed, true);
  assert.equal((await db.query<{ allowed: boolean }>("select consume_rate_limit('other', 1, 60) as allowed")).rows[0].allowed, true);
});
const createTrial = (n: number, visitor: string, cap = 100) => db.query("select create_trial($1,$2,'junior',20,'',$2,$3,$4,$5,2)",
  [`https://site${n}.example/`, `qa${n}@example.com`, `site${n}.example`, visitor, cap]);
test("trial caps count only committed bookings and enforce the visitor allowance", async () => {
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, n) => createTrial(n, "visitor-a")));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal(results.filter((r) => r.status === "rejected" && /trial_ip_limit/.test(String(r.reason))).length, 10);
});
test("global trial cap applies across different visitors", async () => {
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, n) => createTrial(n + 100, `visitor-${n}`, 5)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from runs where is_trial")).rows[0].count, 5);
});
test("duplicate trial rolls back without consuming allowance", async () => {
  await assert.rejects(createTrial(0, "visitor-new"), /duplicate key/);
  await createTrial(999, "visitor-new");
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from runs where trial_ip = 'visitor-new'")).rows[0].count, 1);
});
test("new migration is idempotent and preserves created runs", async () => {
  await db.exec(await readFile("supabase/migrations/20261006000000_qa_integrity.sql", "utf8"));
  assert.equal((await db.query<{ count: number }>("select count(*)::int as count from runs")).rows[0].count, 6);
});

test("only the current running worker lease can write, and failed writes roll back", async () => {
  const [{ id }] = await sql`select id from runs limit 1`;
  const current = "22222222-2222-4222-8222-222222222222";
  const stale = "33333333-3333-4333-8333-333333333333";
  await sql`update runs set status = 'running', claim_token = ${current} where id = ${id}`;
  await withRunLease(id, current, async (tx) => { await tx`update runs set notes = 'owned' where id = ${id}`; });
  await assert.rejects(withRunLease(id, stale, async (tx) => { await tx`update runs set notes = 'stale overwrite' where id = ${id}`; }), LeaseLostError);
  await assert.rejects(withRunLease(id, current, async (tx) => {
    await tx`update runs set notes = 'partial write' where id = ${id}`;
    throw new Error("Injected crash");
  }), /Injected crash/);
  assert.equal((await sql`select notes from runs where id = ${id}`)[0].notes, "owned");
  await sql`update runs set status = 'completed' where id = ${id}`;
  await assert.rejects(withRunLease(id, current, async () => undefined), LeaseLostError);
});
