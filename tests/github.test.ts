import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, generateKeyPairSync, verify } from "node:crypto";
import { appJwt, digest, opaque, openToken, pkceChallenge, sealToken, validSignature } from "../src/lib/github/crypto";
import { authorizedRepository, github, GitHubError, withInstallation, repositoryWorkflows, activeRepositoryWorkflow } from "../src/lib/github/api";
import { customerConfig, customerWorkflow } from "../src/lib/github/workflow";
import { sourceZip } from "../src/lib/github/zip";
import { reportMarkdown, verifiedReport } from "../worker/github";
const originalEnv = { ...process.env }; const originalFetch = globalThis.fetch;
let publicKey: ReturnType<typeof generateKeyPairSync>["publicKey"];
before(() => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 }); publicKey = keys.publicKey;
  process.env.GITHUB_APP_PRIVATE_KEY = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  process.env.GITHUB_APP_ID = "123"; process.env.GITHUB_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});
after(() => { process.env = originalEnv; globalThis.fetch = originalFetch; });
test("GitHub signatures reject body tampering, invalid formats and weak secrets", () => {
  const secret = "fixture-webhook-secret-with-32-characters"; const body = '{"action":"completed"}';
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(validSignature(body, signature, secret), true);
  assert.equal(validSignature(body + " ", signature, secret), false);
  assert.equal(validSignature(body, "sha256=é", secret), false);
  assert.equal(validSignature(body, signature, "short"), false);
});
test("GitHub user credentials are encrypted and cannot move between accounts", () => {
  const encrypted = sealToken("fixture-user-access-token", "10");
  assert.ok(!encrypted.includes("fixture-user-access-token")); assert.equal(openToken(encrypted, "10"), "fixture-user-access-token");
  assert.throws(() => openToken(encrypted, "11"));
  const parts = encrypted.split("."); parts[1] = Buffer.alloc(16, 0).toString("base64url"); assert.throws(() => openToken(parts.join("."), "10"));
  assert.notEqual(sealToken("fixture-user-access-token", "10"), encrypted);
});
test("PKCE and signed App JWT use independent random secrets and bounded expiration", () => {
  const verifier = opaque(); assert.equal(verifier.length, 43); assert.equal(pkceChallenge(verifier).length, 43); assert.equal(digest(verifier).length, 64);
  const token = appJwt(1_800_000_000_000); const [header, payload, signature] = token.split(".");
  assert.equal(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")), true);
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString()); assert.equal(claims.iss, "123"); assert.equal(claims.exp - claims.iat, 600);
});
test("GitHub API never sends credentials to arbitrary hosts or follows redirects", async () => {
  let calls = 0;
  globalThis.fetch = async (_url, options) => { calls++; assert.equal(options?.redirect, "error"); return Response.json({ ok: true }); };
  await assert.rejects(github("//attacker.test", "fixture-token")); await assert.rejects(github("/\\attacker.test", "fixture-token"));
  assert.equal(calls, 0); await github("/user", "fixture-token"); assert.equal(calls, 1);
});
test("repository connection needs both selected-installation access and current administration", async () => {
  let permission = "read";
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/user/installations") return Response.json({ installations: [{ id: 5, app_id: 123, suspended_at: null, account: { login: "owner" } }] });
    if (path === "/user/installations/5/repositories") return Response.json({ repositories: [{ id: 7, full_name: "owner/project" }] });
    if (path.endsWith("/permission")) return Response.json({ permission });
    return Response.json({}, { status: 404 });
  };
  await assert.rejects(authorizedRepository("fixture-token", 6, 7, "owner"), GitHubError);
  await assert.rejects(authorizedRepository("fixture-token", 5, 8, "owner"), GitHubError);
  await assert.rejects(authorizedRepository("fixture-token", 5, 7, "owner"), GitHubError);
  permission = "admin"; assert.equal((await authorizedRepository("fixture-token", 5, 7, "owner")).id, 7);
});
test("workflow discovery paginates, hides disabled or unsupported paths, and returns only names and IDs", async () => {
  const workflow = { id: 50, name: "Quality checks", path: ".github/workflows/quality-checks.yml", state: "active" };
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    const page = new URL(String(url)).searchParams.get("page");
    if (page === "1") return Response.json({ workflows: Array.from({ length: 100 }, (_, index) => ({ ...workflow, id: index + 1, state: index === 0 ? "active" : "disabled_manually" })) });
    return Response.json({ workflows: [{ ...workflow, id: 1 }, workflow, { ...workflow, id: 101, path: ".github/workflows/../../outside.yml" }] });
  };
  assert.deepEqual(await repositoryWorkflows("fixture-token", "owner/project"), [{ id: 1, name: "Quality checks" }, { id: 50, name: "Quality checks" }]);
  assert.equal(calls, 2);
  globalThis.fetch = async () => Response.json({ workflows: [] });
  assert.deepEqual(await repositoryWorkflows("fixture-token", "owner/project"), []);
});

test("selected workflows are resolved within the authorized repository and must still be active", async () => {
  const workflow = { id: 50, name: "Quality checks", path: ".github/workflows/quality-checks.yml", state: "active" };
  globalThis.fetch = async (url) => { assert.equal(new URL(String(url)).pathname, "/repos/owner/project/actions/workflows/50"); return Response.json(workflow); };
  assert.equal((await activeRepositoryWorkflow("fixture-token", "owner/project", 50)).path, workflow.path);
  for (const changed of [{ id: 51 }, { state: "disabled_manually" }, { path: ".github/workflows/../outside.yml" }]) {
    globalThis.fetch = async () => Response.json({ ...workflow, ...changed });
    await assert.rejects(activeRepositoryWorkflow("fixture-token", "owner/project", 50), GitHubError);
  }
});

test("broker scopes installation tokens to one repository and revokes them on failure", async () => {
  let revoked = false;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/access_tokens")) {
      const body = JSON.parse(String(options?.body)); assert.deepEqual(body.repository_ids, [7]); assert.deepEqual(body.permissions, { contents: "read", actions: "read", checks: "write" });
      return Response.json({ token: "fixture-installation-token" });
    }
    if (String(url).endsWith("/installation/token")) { revoked = true; assert.equal(options?.method, "DELETE"); return new Response(null, { status: 204 }); }
    throw new Error("Unexpected request");
  };
  await assert.rejects(withInstallation(5, 7, true, async () => { throw new Error("Fixture failure"); })); assert.equal(revoked, true);
});
const run = { id: 20, run_attempt: 2, head_sha: "a".repeat(40), path: ".github/workflows/testshift.yml", status: "completed", conclusion: "success", event: "push", repository: { id: 7, full_name: "owner/project" }, head_repository: { id: 7 } };
const jobs = [{ id: 30, name: "suite", status: "completed", conclusion: "success", steps: [{ name: "Run suite", status: "completed", conclusion: "success", number: 1 }] }];
const expected = { repositoryId: 7, runId: 20, attempt: 2, sha: "a".repeat(40), workflow: ".github/workflows/testshift.yml" };
test("verified CI reports reject other repositories, commits, attempts, workflows and fork execution", () => {
  for (const changed of [{ id: 21 }, { head_sha: "b".repeat(40) }, { run_attempt: 3 }, { path: ".github/workflows/other.yml" }, { repository: { id: 8, full_name: "owner/other" } }, { head_repository: { id: 8 } }, { status: "in_progress" }, { event: "pull_request_target" }])
    assert.throws(() => verifiedReport({ ...run, ...changed }, jobs, expected), GitHubError);
  assert.throws(() => verifiedReport(run, [], expected));
  const report = verifiedReport(run, jobs, expected); assert.equal(report.conclusion, "success"); assert.ok(report.untested.length);
  assert.match(reportMarkdown(report), /Individual test assertions/);
});
test("skipped CI work is neutral and workflow failure is not reported as a pass", () => {
  assert.equal(verifiedReport(run, [{ ...jobs[0], conclusion: "skipped", steps: [] }], expected).conclusion, "neutral");
  assert.equal(verifiedReport({ ...run, conclusion: "failure" }, jobs, expected).conclusion, "failure");
});
test("customer workflow is secret-free, pinned and includes a local action and explicit test categories", () => {
  assert.ok(customerWorkflow.includes("pull_request:")); assert.ok(!customerWorkflow.includes("pull_request_target")); assert.ok(!customerWorkflow.includes("secrets."));
  assert.ok(customerWorkflow.includes("persist-credentials: false")); assert.ok(customerWorkflow.includes("TESTSHIFT_DISPOSABLE"));
  for (const line of customerWorkflow.split("\n").filter((line) => line.includes("uses: actions/"))) assert.match(line, /@[a-f0-9]{40}/);
  assert.ok(customerConfig.checks.some((check) => check.category === "integration")); assert.equal(customerConfig.destructiveApproved, false);
  const zip = sourceZip([{ name: "testshift.config.json", data: "{}" }]); assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.throws(() => sourceZip([{ name: "../private", data: "" }]));
});
