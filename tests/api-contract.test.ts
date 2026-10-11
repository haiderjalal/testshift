import assert from "node:assert/strict";
import { test } from "node:test";

import { AUTH_CHECK, DOCUMENTED_STATUS_CHECK, evaluateResponse, worstSeverity, type ApiResponse } from "../src/lib/api/checks";
import { listOperations, requiresCredentials, serverBase, type ApiOperation, type JsonObject } from "../src/lib/api/openapi";
import { normalizeSpec } from "../src/lib/api/spec";
import type { HttpResponse } from "../src/lib/outbound";
import { runApiChecks, type Transport } from "../worker/api";

const origin = new URL("https://shop.example.com/");
const until = Date.now() + 60_000;

function response(overrides: Partial<ApiResponse>): ApiResponse {
  return { status: 200, contentType: "application/json", body: "{}", latencyMs: 100, truncated: false, ...overrides };
}

function operationFor(spec: JsonObject, method: string, template: string): ApiOperation {
  const found = listOperations(spec, origin).find((op) => op.method === method && op.template === template);
  assert.ok(found, `${method} ${template} missing`);
  return found;
}

const SECURED: JsonObject = {
  openapi: "3.0.3",
  info: { title: "Shop", version: "1" },
  components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
  security: [{ bearer: [] }],
  paths: {
    "/orders": { get: { responses: { "200": { description: "ok" } } } },
    "/status": { get: { security: [], responses: { "200": { description: "ok" } } } },
    "/catalogue": { get: { security: [{}, { bearer: [] }], responses: { "200": { description: "ok" } } } },
  },
};

const respond = (status: number, body = "{}", contentType = "application/json"): HttpResponse => ({
  status,
  contentType,
  body,
  latencyMs: 10,
  truncated: false,
  headers: {},
});

test("an operation requires credentials only when every security alternative needs them", () => {
  assert.equal(operationFor(SECURED, "GET", "/orders").requiresAuth, true, "inherits the spec-wide requirement");
  assert.equal(operationFor(SECURED, "GET", "/status").requiresAuth, false, "an empty list makes the operation public");
  assert.equal(operationFor(SECURED, "GET", "/catalogue").requiresAuth, false, "an empty requirement is an anonymous alternative");
  assert.equal(requiresCredentials({}, {}), false, "no security anywhere means no credentials are needed");
});

test("a refusal without credentials passes the auth check and leaves the status check out", () => {
  const checks = evaluateResponse(operationFor(SECURED, "GET", "/orders"), response({ status: 401 }));
  const auth = checks.find((c) => c.name === AUTH_CHECK);
  assert.equal(auth?.passed, true);
  assert.equal(checks.some((c) => c.name === "Status"), false, "a 401 says nothing about the body, so no status verdict is given");
  assert.equal(worstSeverity(checks), null);
});

test("a success without credentials on a protected operation is a critical failure", () => {
  const checks = evaluateResponse(operationFor(SECURED, "GET", "/orders"), response({ status: 200 }));
  const auth = checks.find((c) => c.name === AUTH_CHECK);
  assert.equal(auth?.passed, false);
  assert.equal(auth?.severity, "critical");
  assert.equal(worstSeverity(checks), "critical");
});

test("unprotected operations get no auth check, and other errors on protected ones are judged as statuses", () => {
  assert.equal(evaluateResponse(operationFor(SECURED, "GET", "/status"), response({ status: 200 })).some((c) => c.name === AUTH_CHECK), false);
  const serverError = evaluateResponse(operationFor(SECURED, "GET", "/orders"), response({ status: 500 }));
  assert.equal(serverError.some((c) => c.name === AUTH_CHECK), false, "a 500 does not prove the endpoint enforces anything");
  assert.equal(worstSeverity(serverError), "critical");
});

test("a success the description does not document is a minor finding, and a documented range covers it", () => {
  const op: ApiOperation = { ...operationFor(SECURED, "GET", "/status"), successStatuses: ["200"] };
  const undocumented = evaluateResponse(op, response({ status: 201 }));
  assert.equal(undocumented.find((c) => c.name === DOCUMENTED_STATUS_CHECK)?.passed, false);
  assert.equal(worstSeverity(undocumented), "minor");

  const ranged = evaluateResponse({ ...op, successStatuses: ["2XX"] }, response({ status: 204 }));
  assert.equal(ranged.find((c) => c.name === DOCUMENTED_STATUS_CHECK)?.passed, true);
});

test("an OpenAPI 3.0 boolean exclusiveMinimum is read as a bound instead of failing the response", () => {
  const spec: JsonObject = {
    openapi: "3.0.3",
    info: { title: "Prices", version: "1" },
    paths: {
      "/prices": {
        get: {
          responses: {
            "200": {
              description: "ok",
              content: {
                "application/json": {
                  schema: { type: "object", properties: { price: { type: "number", minimum: 0, exclusiveMinimum: true } } },
                },
              },
            },
          },
        },
      },
    },
  };
  const op = operationFor(spec, "GET", "/prices");
  const zero = evaluateResponse(op, response({ body: JSON.stringify({ price: 0 }) }));
  assert.equal(zero.find((c) => c.name === "Response schema")?.passed, false, "0 is not above an exclusive minimum of 0");
  const half = evaluateResponse(op, response({ body: JSON.stringify({ price: 0.5 }) }));
  assert.equal(half.find((c) => c.name === "Response schema")?.passed, true);
});

test("a response schema that cannot be compiled is left out instead of reported as a failed connection", async () => {
  const spec: JsonObject = {
    openapi: "3.0.3",
    info: { title: "Odd", version: "1" },
    paths: {
      "/x": { get: { responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "nonsense" } } } } } } },
    },
  };
  const transport: Transport = async (url) => (url.pathname === "/openapi.json" ? respond(200, JSON.stringify(spec)) : respond(200, "{}"));
  const result = await runApiChecks(origin, until, [], { writesEnabled: false, transport });
  const row = result.rows.find((r) => r.path === "/x");
  assert.ok(row);
  assert.equal(row.checks.some((c) => c.name === "Reachable"), false, "a checker error is never reported as an unreachable site");
  assert.equal(row.checks.some((c) => c.name === "Response schema"), false);
  assert.equal(row.passed, true);
});

test("a spec that lists several servers uses the one for this site", () => {
  const spec: JsonObject = {
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    servers: [{ url: "https://staging.example.net/api" }, { url: "https://shop.example.com/api" }],
    paths: { "/products": { get: { responses: { "200": { description: "ok" } } } } },
  };
  assert.equal(serverBase(spec, origin)?.href, "https://shop.example.com/api");
  const op = operationFor(spec, "GET", "/products");
  assert.equal(op.requestPath, "/api/products");
  assert.equal(op.blockedReason, null);
});

test("Swagger 2 security is carried into the converted description, so protected operations are recognised", () => {
  const spec = normalizeSpec({
    swagger: "2.0",
    host: "shop.example.com",
    basePath: "/api",
    schemes: ["https"],
    securityDefinitions: { api_key: { type: "apiKey", name: "X-Key", in: "header" } },
    security: [{ api_key: [] }],
    paths: { "/items": { get: { responses: { "200": { description: "ok" } } } } },
  });
  assert.ok(spec);
  assert.equal(operationFor(spec, "GET", "/items").requiresAuth, true);
  assert.ok(Object.hasOwn((spec.components as JsonObject).securitySchemes as JsonObject, "api_key"));
});
