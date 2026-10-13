import assert from "node:assert/strict";
import { test } from "node:test";

import { listOperations, type ApiOperation, type JsonObject } from "../src/lib/api/openapi";
import { MAX_PROBES_PER_OPERATION, PROBE_CHECK, probeCheck, probesFor, type Probe } from "../src/lib/api/probes";
import type { HttpResponse } from "../src/lib/outbound";
import { runApiChecks, type Transport } from "../worker/api";

const origin = new URL("https://shop.example.com/");
const until = Date.now() + 60_000;

function operationFor(spec: JsonObject, method: string, template: string): ApiOperation {
  const found = listOperations(spec, origin).find((op) => op.method === method && op.template === template);
  assert.ok(found, `${method} ${template} missing`);
  return found;
}

const respond = (status: number, body = "{}"): HttpResponse => ({ status, contentType: "application/json", body, latencyMs: 10, truncated: false, headers: {} });

const SHOP: JsonObject = {
  openapi: "3.0.3",
  info: { title: "Shop", version: "1" },
  paths: {
    "/products/{id}": {
      get: {
        parameters: [{ name: "id", in: "path", required: true, example: 5, schema: { type: "integer" } }],
        responses: { "200": { description: "ok" } },
      },
      patch: {
        parameters: [{ name: "id", in: "path", required: true, example: 5, schema: { type: "integer" } }],
        responses: { "200": { description: "ok" } },
      },
    },
    "/users/{name}": {
      get: {
        parameters: [{ name: "name", in: "path", required: true, example: "ada" }],
        responses: { "200": { description: "ok" } },
      },
    },
    "/search": {
      get: {
        parameters: [
          { name: "category", in: "query", required: true, schema: { type: "string", example: "tools" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "ok" } },
      },
    },
  },
};

const targets = (probes: Probe[]): string[] => probes.map((probe) => probe.target);

test("integer path parameters are probed with text, a negative, zero and a number past 64-bit range", () => {
  const probes = probesFor(operationFor(SHOP, "GET", "/products/{id}"));
  assert.deepEqual(targets(probes), ["/products/abc", "/products/-1", "/products/0", `/products/${"9".repeat(25)}`]);
  assert.equal(probes[0].label, 'path parameter "id" set to "abc"');
});

test("text path parameters keep malformed escapes as written, so the server receives the broken encoding", () => {
  const probes = probesFor(operationFor(SHOP, "GET", "/users/{name}"));
  assert.deepEqual(targets(probes), ["/users/%E0%A4%A", "/users/%00", `/users/${"a".repeat(512)}`]);
});

test("query probes keep the required example, replace only the probed parameter, and respect the per-operation cap", () => {
  const probes = probesFor(operationFor(SHOP, "GET", "/search"));
  assert.equal(probes.length, MAX_PROBES_PER_OPERATION);
  assert.ok(targets(probes).includes("/search?category=tools&limit=abc"), "the required example is sent with the probe");
  assert.ok(targets(probes).includes("/search?category=%E0%A4%A"), "an optional limit is left out of a probe on category");
});

test("writes are never probed: a probe is a read that changes nothing", () => {
  assert.deepEqual(probesFor(operationFor(SHOP, "PATCH", "/products/{id}")), []);
});

test("probe verdicts: no answers means no check, a server error fails the operation as a major finding", () => {
  const probe = probesFor(operationFor(SHOP, "GET", "/products/{id}"))[0];
  assert.equal(probeCheck([{ probe, status: null }]), null, "a timeout says nothing about the server");

  const fine = probeCheck([
    { probe, status: 400 },
    { probe, status: 404 },
  ]);
  assert.equal(fine?.name, PROBE_CHECK);
  assert.equal(fine?.passed, true);

  const broken = probeCheck([
    { probe, status: 500 },
    { probe, status: 404 },
  ]);
  assert.equal(broken?.passed, false);
  assert.equal(broken?.severity, "major");
  assert.match(broken?.detail ?? "", /HTTP 500.*1 of 2/);
});

test("the engine sends malformed reads after the normal checks, grades the row, and sends no write for them", async () => {
  const calls: { method: string; path: string }[] = [];
  const transport: Transport = async (url, init) => {
    calls.push({ method: init.method, path: url.pathname });
    if (url.pathname === "/openapi.json") return respond(200, JSON.stringify(SHOP));
    if (url.pathname === "/products/abc") return respond(500, "Internal error");
    if (url.pathname.startsWith("/products/")) return respond(200, JSON.stringify({ id: 5 }));
    return respond(404);
  };
  const result = await runApiChecks(origin, until, [], { writesEnabled: false, transport });

  const row = result.rows.find((r) => r.method === "GET" && r.path === "/products/5");
  assert.ok(row, "the normal read is still reported for its own operation");
  assert.equal(row.passed, false);
  assert.equal(row.severity, "major");
  const probeRow = row.checks.find((c) => c.name === PROBE_CHECK);
  assert.equal(probeRow?.passed, false);
  assert.match(probeRow?.detail ?? "", /path parameter "id" set to "abc"/);

  assert.ok(calls.every((c) => c.method === "GET"), "no write was sent, probes included");
  // Three reads (products, users, search), three samples each. Probes are not latency samples.
  assert.equal(result.latency?.samples, 9);
});

test("a probe that times out is not counted as a server error, but the answered probes still are", async () => {
  const transport: Transport = async (url) => {
    if (url.pathname === "/openapi.json") return respond(200, JSON.stringify(SHOP));
    if (url.pathname === "/products/-1") throw new Error("Request timed out");
    if (url.pathname.startsWith("/products/")) return respond(200, "{}");
    return respond(404);
  };
  const result = await runApiChecks(origin, until, [], { writesEnabled: false, transport });
  const row = result.rows.find((r) => r.method === "GET" && r.path === "/products/5");
  assert.equal(row?.checks.find((c) => c.name === PROBE_CHECK)?.passed, true);
});
