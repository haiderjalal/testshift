import assert from "node:assert/strict";
import { test } from "node:test";

import { exampleBody } from "../src/lib/api/examples";
import { listOperations, type JsonObject } from "../src/lib/api/openapi";
import type { HttpResponse } from "../src/lib/outbound";
import { runApiChecks, type Transport } from "../worker/api";

const origin = new URL("https://shop.example.com/");
const until = Date.now() + 60_000;

function response(status: number, body = "", contentType = "application/json"): HttpResponse {
  return { status, contentType, body, latencyMs: 10, truncated: false, headers: {} };
}

/** A fake API: records every call, and answers from a small in-memory product list. */
function fakeApi(spec: JsonObject) {
  const calls: { method: string; path: string; body?: string }[] = [];
  const transport: Transport = async (url, init) => {
    calls.push({ method: init.method, path: url.pathname, body: init.body });
    if (url.pathname === "/openapi.json") return response(200, JSON.stringify(spec));
    if (init.method === "GET" && url.pathname === "/products") return response(200, JSON.stringify([{ id: 5 }]));
    if (init.method === "GET" && url.pathname === "/products/5") return response(200, JSON.stringify({ id: 5 }));
    if (init.method === "POST" && url.pathname === "/products") return response(201, JSON.stringify({ id: 9, name: "Test item" }));
    if (init.method === "PUT" && url.pathname === "/products/9") return response(200, JSON.stringify({ id: 9 }));
    if (init.method === "DELETE" && url.pathname === "/products/9") return response(204, "");
    return response(404, "not found");
  };
  return { calls, transport };
}

const productSpec = (withDelete: boolean): JsonObject => ({
  openapi: "3.0.3",
  info: { title: "Shop", version: "1" },
  paths: {
    "/products": {
      get: { responses: { "200": { description: "ok" } } },
      post: {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["name"], properties: { name: { type: "string", example: "Test item" } } },
            },
          },
        },
        responses: { "201": { description: "created" } },
      },
    },
    "/products/{id}": {
      get: { parameters: [{ name: "id", in: "path", required: true }], responses: { "200": { description: "ok" } } },
      put: {
        parameters: [{ name: "id", in: "path", required: true }],
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string", example: "Renamed item" } } } } } },
        responses: { "200": { description: "ok" } },
      },
      ...(withDelete ? { delete: { parameters: [{ name: "id", in: "path", required: true }], responses: { "204": { description: "gone" } } } } : {}),
    },
  },
});

test("an example body comes only from the spec's own examples; a required field without one means no guess", () => {
  assert.deepEqual(exampleBody({ type: "object", properties: { name: { type: "string", example: "Widget" } } }), { name: "Widget" });
  assert.deepEqual(exampleBody({ type: "object", properties: { size: { type: "string", enum: ["S", "M"] } } }), { size: "S" });
  assert.equal(exampleBody({ type: "object", required: ["price"], properties: { price: { type: "number" } } }), null);
  assert.deepEqual(exampleBody({ example: { id: 1 } }), { id: 1 });
});

test("with write tests enabled, a created record is updated and then deleted, and only that record is touched", async () => {
  const api = fakeApi(productSpec(true));
  const result = await runApiChecks(origin, until, [], { writesEnabled: true, transport: api.transport });
  const writes = api.calls.filter((c) => ["POST", "PUT", "DELETE"].includes(c.method));
  assert.deepEqual(writes.map((c) => `${c.method} ${c.path}`), ["POST /products", "PUT /products/9", "DELETE /products/9"]);
  assert.equal(writes[0].body, JSON.stringify({ name: "Test item" }), "the body is the spec's example");
  assert.ok(!api.calls.some((c) => c.method !== "GET" && c.path === "/products/5"), "the record that already existed is never changed");
  assert.ok(result.rows.every((r) => r.passed !== false), "no write or read failed");
  const del = result.rows.find((r) => r.method === "DELETE");
  assert.equal(del?.chainedFrom, "POST /products");
  assert.ok(!result.rows.some((r) => r.skippedReason?.startsWith("Left in the test environment")), "nothing is reported as left behind");
});

test("without an approved write environment, nothing is sent and every write says why", async () => {
  const api = fakeApi(productSpec(true));
  const result = await runApiChecks(origin, until, [], { writesEnabled: false, transport: api.transport });
  assert.ok(!api.calls.some((c) => ["POST", "PUT", "DELETE"].includes(c.method)), "no write request was sent");
  const post = result.rows.find((r) => r.method === "POST");
  assert.match(post?.skippedReason ?? "", /Changes data/);
});

test("a create without a record to fall back on is left behind and reported, not silently forgotten", async () => {
  const api = fakeApi(productSpec(false));
  const result = await runApiChecks(origin, until, [], { writesEnabled: true, transport: api.transport });
  const left = result.rows.find((r) => r.skippedReason?.startsWith("Left in the test environment"));
  assert.equal(left?.path, "/products/9");
});

test("a write whose body needs a value the spec does not give is skipped, and nothing is guessed", async () => {
  const spec = productSpec(true);
  const post = ((spec.paths as JsonObject)["/products"] as JsonObject).post as JsonObject;
  post.requestBody = { required: true, content: { "application/json": { schema: { type: "object", required: ["price"], properties: { price: { type: "number" } } } } } };
  const api = fakeApi(spec);
  const result = await runApiChecks(origin, until, [], { writesEnabled: true, transport: api.transport });
  assert.ok(!api.calls.some((c) => c.method === "POST"), "no POST was sent with a guessed body");
  assert.match(result.rows.find((r) => r.method === "POST")?.skippedReason ?? "", /no guessed data/);
});

test("collection writes are listed but not sent, because collections keep no bodies", async () => {
  const api = fakeApi({ openapi: "3.0.3", paths: {} });
  const result = await runApiChecks(origin, until, [{ method: "DELETE", path: "/api/products/9" }], { writesEnabled: true, transport: api.transport });
  assert.ok(!api.calls.some((c) => c.method === "DELETE"));
  assert.match(result.rows[0].skippedReason ?? "", /collections do not keep request bodies/);
  assert.equal(listOperations({ openapi: "3.0.3", paths: {} }, origin).length, 0);
});
