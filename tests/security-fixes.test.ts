import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateResponse } from "../src/lib/api/checks";
import type { ApiOperation } from "../src/lib/api/openapi";
import { MAX_SPEC_NODES, normalizeSpec, withinNodeBudget } from "../src/lib/api/spec";
import type { HttpResponse } from "../src/lib/outbound";
import { visitorKey } from "../src/lib/rateLimit";
import { runApiChecks, type Transport } from "../worker/api";

test("withinNodeBudget rejects a YAML-style alias bomb without walking all of it", () => {
  // Build a shared-reference structure like js-yaml returns for aliases: each level reuses the level below.
  let level: unknown[] = [1, 2];
  for (let i = 0; i < 20; i++) level = [level, level];
  assert.equal(withinNodeBudget(level, 1_000), false);
  assert.equal(withinNodeBudget({ a: 1, b: [2, 3] }, 1_000), true);
});

test("normalizeSpec refuses a spec over the node budget", () => {
  const paths: Record<string, unknown> = {};
  for (let i = 0; i < MAX_SPEC_NODES + 10; i++) paths[`/p${i}`] = { get: { responses: {} } };
  assert.equal(normalizeSpec({ openapi: "3.0.3", paths }), null);
});

test("response-schema validation ignores a catastrophic regex pattern instead of running it", () => {
  const schema = { type: "object", properties: { s: { type: "string", pattern: "^(a+)+$" } }, components: {} };
  const op: ApiOperation = {
    method: "GET", template: "/x", requestPath: "/x", successStatuses: ["200"], responseSchema: schema,
    blockedReason: null, missingPathParams: [], isWrite: false, bodySchema: null,
  };
  const evil = "a".repeat(40) + "!";
  const res: HttpResponse = { status: 200, contentType: "application/json", body: JSON.stringify({ s: evil }), latencyMs: 1, truncated: false, headers: {} };
  const started = Date.now();
  const checks = evaluateResponse(op, res);
  // Without the strip this ReDoS would hang the event loop for seconds; the schema check must pass quickly.
  assert.ok(Date.now() - started < 1_000);
  assert.equal(checks.find((c) => c.name === "Response schema")?.passed, true);
});

test("the API engine never sends a request off the booked origin", async () => {
  const spec = {
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: { "/products": { get: { responses: { "200": { description: "ok" } } } }, "//evil.example/admin": { get: { responses: { "200": { description: "ok" } } } } },
  };
  const seen: string[] = [];
  const base: Transport = async (url) => {
    seen.push(url.origin);
    if (url.pathname === "/openapi.json") return { status: 200, contentType: "application/json", body: JSON.stringify(spec), latencyMs: 1, truncated: false, headers: {} };
    return { status: 200, contentType: "application/json", body: "{}", latencyMs: 1, truncated: false, headers: {} };
  };
  const result = await runApiChecks(new URL("https://shop.example.com/"), Date.now() + 30_000, [], { writesEnabled: false, transport: base });
  assert.ok(!seen.includes("https://evil.example"), "the off-origin path was never requested");
  const offOrigin = result.rows.find((r) => r.path.includes("evil.example"));
  assert.notEqual(offOrigin?.passed, true, "an off-origin operation is never reported as passed");
});

test("IPv6 visitors are rate-limited per /64, so rotating the suffix does not bypass limits", () => {
  const header = (ip: string) => ({ get: (name: string) => (name === "x-forwarded-for" ? ip : null) });
  const a = visitorKey(header("2001:db8:abcd:1::1"), true);
  const b = visitorKey(header("2001:db8:abcd:1:ffff:ffff:ffff:ffff"), true);
  const other = visitorKey(header("2001:db8:abcd:2::1"), true);
  assert.equal(a, b, "same /64 maps to the same key");
  assert.notEqual(a, other, "a different /64 maps to a different key");
});
