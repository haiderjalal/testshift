import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";

import { evaluateResponse, worstSeverity, type ApiResponse } from "../src/lib/api/checks";
import { listOperations, type ApiOperation, type JsonObject } from "../src/lib/api/openapi";
import { sendGet } from "../worker/api";

const origin = new URL("https://shop.example.com/");

function spec(paths: JsonObject, extra: JsonObject = {}): JsonObject {
  return { openapi: "3.0.3", info: { title: "t", version: "1" }, paths, ...extra };
}

function op(list: ApiOperation[], method: string, template: string): ApiOperation {
  const found = list.find((o) => o.method === method && o.template === template);
  assert.ok(found, `${method} ${template} missing`);
  return found;
}

const response = (overrides: Partial<ApiResponse>): ApiResponse => ({
  status: 200,
  contentType: "application/json",
  body: "{}",
  latencyMs: 100,
  truncated: false,
  ...overrides,
});

test("listOperations: read-only operations run, writes are skipped with a reason", () => {
  const ops = listOperations(
    spec({
      "/products": {
        get: { responses: { "200": { description: "ok" } } },
        post: { responses: { "201": { description: "created" } } },
      },
    }),
    origin,
  );
  assert.equal(op(ops, "GET", "/products").blockedReason, null);
  assert.match(op(ops, "POST", "/products").blockedReason ?? "", /Changes data/);
});

test("listOperations: path parameters use spec examples; missing required values block the operation", () => {
  const ops = listOperations(
    spec({
      "/products/{id}": {
        get: {
          parameters: [{ name: "id", in: "path", required: true, example: "sku 42" }],
          responses: { "200": { description: "ok" } },
        },
      },
      "/orders/{orderId}": {
        get: {
          parameters: [{ name: "orderId", in: "path", required: true }],
          responses: { "200": { description: "ok" } },
        },
      },
    }),
    origin,
  );
  assert.equal(op(ops, "GET", "/products/{id}").requestPath, "/products/sku%2042");
  assert.equal(op(ops, "GET", "/products/{id}").blockedReason, null);
  assert.match(op(ops, "GET", "/orders/{orderId}").blockedReason ?? "", /orderId/);
});

test("listOperations: resolves local $ref parameters and refuses specs that point to another host", () => {
  const ops = listOperations(
    spec(
      {
        "/items": {
          get: {
            parameters: [{ $ref: "#/components/parameters/Page" }],
            responses: { "200": { description: "ok" } },
          },
        },
      },
      { components: { parameters: { Page: { name: "page", in: "query", schema: { type: "integer", default: 1 } } } } },
    ),
    origin,
  );
  assert.equal(op(ops, "GET", "/items").blockedReason, null);

  const elsewhere = listOperations(
    spec({ "/x": { get: { responses: { "200": { description: "ok" } } } } }, { servers: [{ url: "https://api.other.net/v1" }] }),
    origin,
  );
  assert.match(elsewhere[0].blockedReason ?? "", /different host/);
});

test("evaluateResponse: 5xx is critical; 4xx explains that the spec example may be wrong", () => {
  const getOp = { method: "GET", template: "/a", requestPath: "/a", successStatuses: ["200"], responseSchema: null, blockedReason: null } satisfies ApiOperation;
  const serverError = evaluateResponse(getOp, response({ status: 500 }));
  assert.equal(worstSeverity(serverError), "critical");

  const notFound = evaluateResponse(getOp, response({ status: 404 }));
  assert.equal(worstSeverity(notFound), "major");
  assert.match(notFound[0].detail, /example values are wrong/);
});

test("evaluateResponse: schema validation resolves $ref through components and reports the failing field", () => {
  const schema = {
    type: "object",
    required: ["items"],
    properties: { items: { type: "array", items: { $ref: "#/components/schemas/Item" } } },
    components: { schemas: { Item: { type: "object", required: ["price"], properties: { price: { type: "number" } } } } },
  };
  const getOp: ApiOperation = { method: "GET", template: "/a", requestPath: "/a", successStatuses: ["200"], responseSchema: schema, blockedReason: null };

  const valid = evaluateResponse(getOp, response({ body: JSON.stringify({ items: [{ price: 9.5 }] }) }));
  assert.equal(worstSeverity(valid), null);

  const invalid = evaluateResponse(getOp, response({ body: JSON.stringify({ items: [{ price: "free" }] }) }));
  const schemaCheck = invalid.find((c) => c.name === "Response schema");
  assert.equal(schemaCheck?.passed, false);
  assert.match(schemaCheck?.detail ?? "", /items\/0\/price/);
});

test("evaluateResponse: wrong content type, invalid JSON, slow responses and truncated bodies are handled", () => {
  const schema = { type: "object" };
  const getOp: ApiOperation = { method: "GET", template: "/a", requestPath: "/a", successStatuses: ["200"], responseSchema: schema, blockedReason: null };

  assert.equal(worstSeverity(evaluateResponse(getOp, response({ contentType: "text/html", body: "<html>" }))), "major");
  assert.equal(worstSeverity(evaluateResponse(getOp, response({ body: "{not json" }))), "major");
  assert.equal(worstSeverity(evaluateResponse(getOp, response({ latencyMs: 5_000 }))), "minor");

  const big = evaluateResponse(getOp, response({ truncated: true, body: "" }));
  const schemaCheck = big.find((c) => c.name === "Response schema");
  assert.equal(schemaCheck?.passed, true);
  assert.match(schemaCheck?.detail ?? "", /not validated/);
});

test("sendGet: returns status, content type and body, and does not follow redirects", async () => {
  const server = await listen((req, res) => {
    if (req.url === "/data") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    } else {
      res.writeHead(302, { location: "http://169.254.169.254/" });
      res.end();
    }
  });
  try {
    const port = server.port;
    const ok = await sendGet(new URL(`http://pinned.invalid:${port}/data`), { timeoutMs: 5_000, resolve: async () => "127.0.0.1" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body, '{"ok":true}');
    assert.match(ok.contentType, /json/);

    const redirect = await sendGet(new URL(`http://pinned.invalid:${port}/redirect`), { timeoutMs: 5_000, resolve: async () => "127.0.0.1" });
    assert.equal(redirect.status, 302);
  } finally {
    await server.close();
  }
});

test("sendGet: the connection is pinned to the validated address, so a second DNS answer is never used", async () => {
  const server = await listen((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("pinned");
  });
  try {
    // "pinned.invalid" does not resolve. Success proves the connection used the address the check returned.
    const result = await sendGet(new URL(`http://pinned.invalid:${server.port}/`), { timeoutMs: 5_000, resolve: async () => "127.0.0.1" });
    assert.equal(result.body, "pinned");
  } finally {
    await server.close();
  }
});

test("sendGet: refuses private destinations and credentials in the URL", async () => {
  await assert.rejects(sendGet(new URL("http://127.0.0.1:9/"), { timeoutMs: 2_000 }), /Non-public destination refused/);
  await assert.rejects(sendGet(new URL("https://user:pass@example.com/"), { timeoutMs: 2_000 }), /Credentials/);
});

test("sendGet: bodies over the limit are cut off and flagged as truncated", async () => {
  const server = await listen((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("x".repeat(1_200_000));
  });
  try {
    const result = await sendGet(new URL(`http://pinned.invalid:${server.port}/`), { timeoutMs: 10_000, resolve: async () => "127.0.0.1" });
    assert.equal(result.truncated, true);
  } finally {
    await server.close();
  }
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<{ port: number; close: () => Promise<void> }> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
