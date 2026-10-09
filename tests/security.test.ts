import assert from "node:assert/strict";
import { test } from "node:test";
import { contentSecurityPolicy, databaseTls, normalizeText, readBoundedBody, RequestError, sameOrigin, validForm } from "../src/lib/security";
import { errorMessage, log } from "../src/lib/log";

test("origin checks require the exact scheme, host and port", () => {
  for (const origin of [null, "null", "https://evil.invalid", "http://app.invalid", "https://app.invalid:444", "https://app.invalid/path", "https://user@app.invalid"]) assert.equal(sameOrigin(origin, "https://app.invalid"), false);
  assert.equal(sameOrigin("https://app.invalid", "https://app.invalid"), true);
});
test("remote production DB uses certificate verification even with an insecure URL option", () => {
  assert.deepEqual(databaseTls("postgres://db.example/test?sslmode=disable", true), { rejectUnauthorized: true });
  assert.equal(databaseTls("postgres://127.0.0.1/test", true), false);
});
test("forms reject files, duplicate fields and oversized data", () => {
  const form = new FormData(); form.set("name", "safe"); assert.equal(validForm(form), true);
  form.append("name", "ambiguous"); assert.equal(validForm(form), false);
  form.delete("name"); form.set("file", new Blob(["x"]), "x.txt"); assert.equal(validForm(form), false);
  form.delete("file"); form.set("notes", "x".repeat(32769)); assert.equal(validForm(form), false);
  assert.equal(normalizeText(" e\u0301\u0000\r\n text "), "é\n text");
});
test("bounded reads reject oversized declared and streamed bodies and retain signed bytes", async () => {
  assert.equal(await readBoundedBody(new Request("https://app.invalid", { method: "POST", body: "é\n" }), 10), "é\n");
  for (const headers of [new Headers(), new Headers({ "content-length": "999" })]) {
    await assert.rejects(readBoundedBody(new Request("https://app.invalid", { method: "POST", body: "123456", headers }), 5), (e: unknown) => e instanceof RequestError && e.status === 413);
  }
  const body = new ReadableStream({ start() { /* never sends a chunk */ } });
  const request = new Request("https://app.invalid", { method: "POST", body, duplex: "half" } as RequestInit);
  await assert.rejects(readBoundedBody(request, 10, 20), (e: unknown) => e instanceof RequestError && e.status === 408);
});
test("production CSP has a nonce and disallows eval and untrusted script sources", () => {
  const policy = contentSecurityPolicy("testnonce", false);
  assert.ok(policy.includes("'nonce-testnonce' 'strict-dynamic'"));
  assert.ok(!policy.includes("'unsafe-eval'"));
  assert.ok(policy.includes("frame-ancestors 'none'"));
});
test("structured logs omit request bodies and raw provider exceptions", () => {
  assert.equal(errorMessage(new Error("sensitive payload")), "Error");
  const previous = console.warn;
  const lines: string[] = [];
  console.warn = (line: string) => lines.push(line);
  try { log("warn", "Request rejected", { requestId: "fixture", runId: "private-report-capability", body: "sensitive payload", email: "customer@example.com", error: errorMessage(new Error("credential")) }); }
  finally { console.warn = previous; }
  assert.ok(!lines[0].includes("sensitive payload")); assert.ok(!lines[0].includes("customer@"));
  assert.ok(!lines[0].includes("private-report-capability"));
  assert.equal(JSON.parse(lines[0]).requestId, "fixture");
});
