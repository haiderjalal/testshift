import assert from "node:assert/strict";
import { test } from "node:test";

import type { JsonObject } from "../src/lib/api/openapi";
import { browserFindings, lintSpec, observedApiCall } from "../src/lib/api/review";

const origin = new URL("https://shop.example.com/");

const CLEAN: JsonObject = {
  openapi: "3.0.3",
  info: { title: "Shop", version: "1", description: "Products for the storefront." },
  servers: [{ url: "/api" }],
  paths: {
    "/products/{id}": {
      get: {
        operationId: "getProduct",
        summary: "One product",
        parameters: [{ name: "id", in: "path", required: true, example: 5, schema: { type: "integer" } }],
        responses: {
          "200": { description: "ok", content: { "application/json": { schema: { type: "object", properties: { id: { type: "integer" } } } } } },
          "404": { description: "not found" },
        },
      },
    },
  },
};

const rules = (findings: { rule: string }[]): string[] => findings.map((f) => f.rule);

test("a complete description has no warnings", () => {
  assert.deepEqual(lintSpec(CLEAN, origin).filter((f) => f.severity === "warning"), []);
});

test("problems that weaken or skip tests are reported as warnings, ahead of suggestions", () => {
  const spec: JsonObject = {
    openapi: "3.0.3",
    info: { title: "Shop" },
    paths: {
      "/getProducts": {
        get: { operationId: "list", responses: { "200": { description: "ok" } } },
      },
      "/orders/{id}": {
        get: {
          operationId: "list",
          responses: { "200": { description: "ok", content: { "application/json": { schema: { type: "nonsense" } } } } },
        },
      },
      "/orders": {
        post: {
          operationId: "list",
          requestBody: { content: { "application/json": { schema: { type: "object", required: ["total"], properties: { total: { type: "number" } } } } } },
          responses: { "201": { description: "created" } },
        },
      },
      "/reports": {
        get: { operationId: "reports", summary: "Reports", responses: { default: { description: "error" } } },
      },
    },
  };
  const findings = lintSpec(spec, origin);
  const found = rules(findings);
  assert.ok(found.includes("info-version"), "a missing version is a warning");
  assert.ok(found.includes("operation-id-unique"), "a duplicated operationId is a warning");
  assert.ok(found.includes("path-parameter-declared"), "an undeclared {id} is a warning");
  assert.ok(found.includes("response-schema"), "a schema that cannot be read is a warning");
  assert.ok(found.includes("success-response"), "an operation with no 2xx is a warning");
  assert.ok(found.includes("path-naming"), "a verb in the path is a suggestion");
  assert.ok(found.includes("request-body-example"), "a write without an example body is a suggestion");
  assert.equal(findings[0].severity, "warning", "warnings come first");
  const last = findings.at(-1);
  assert.equal(last?.severity, "info");
});

test("security problems: a requirement with no definition is a warning, and an open write is a suggestion when schemes exist", () => {
  const spec: JsonObject = {
    openapi: "3.0.3",
    info: { title: "Shop", version: "1", description: "d" },
    servers: [{ url: "/" }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    paths: {
      "/private": { get: { operationId: "priv", summary: "p", security: [{ api_key: [] }], responses: { "200": { description: "ok" }, "401": { description: "no" } } } },
      "/orders": { post: { operationId: "make", summary: "m", responses: { "201": { description: "ok" }, "400": { description: "bad" } } } },
    },
  };
  const findings = lintSpec(spec, origin);
  assert.ok(findings.some((f) => f.rule === "security-scheme" && f.location === "GET /private" && f.severity === "warning"));
  assert.ok(findings.some((f) => f.rule === "write-security" && f.location === "POST /orders" && f.severity === "info"));
});

test("an observed call is reduced to its method and path: IDs collapse, query, fragment and personal values are dropped", () => {
  assert.equal(observedApiCall("get", "https://shop.example.com/api/products/42?page=2#top", origin), "GET /api/products/{id}");
  assert.equal(
    observedApiCall("GET", "https://shop.example.com/api/orders/550e8400-e29b-41d4-a716-446655440000/items", origin),
    "GET /api/orders/{id}/items",
  );
  assert.equal(observedApiCall("POST", "https://shop.example.com/api/users/jane@example.com/notes", origin), "POST /api/users/{value}/notes");
  assert.equal(observedApiCall("GET", "https://shop.example.com/api/cart/", origin), "GET /api/cart", "a trailing slash is the same call");
});

test("calls that are not the site's own API are never recorded", () => {
  assert.equal(observedApiCall("GET", "https://tracker.example.net/collect", origin), null, "another site");
  assert.equal(observedApiCall("OPTIONS", "https://shop.example.com/api/cart", origin), null, "a preflight is not a call");
  assert.equal(observedApiCall("GET", "https://shop.example.com/_next/data/build/index.json", origin), null, "framework data");
  assert.equal(observedApiCall("GET", "not a url", origin), null);
});

test("browser calls the description documents pass; others are suggestions, and nothing is matched against another host", () => {
  const described: JsonObject = {
    openapi: "3.0.3",
    info: { title: "Shop", version: "1" },
    servers: [{ url: "/api" }],
    paths: { "/products/{id}": { get: { responses: { "200": { description: "ok" } } } } },
  };
  const findings = browserFindings(["GET /api/products/{id}", "GET /api/cart", "POST /api/products/{id}"], described, origin);
  assert.deepEqual(findings.map((f) => f.location), ["GET /api/cart", "POST /api/products/{id}"]);
  assert.equal(findings[0].source, "browser");
  assert.equal(findings[0].severity, "info");

  const untested = browserFindings(["GET /api/cart"], null, origin);
  assert.equal(untested.length, 1);
  assert.match(untested[0].message, /not tested/);

  const elsewhere: JsonObject = { ...described, servers: [{ url: "https://api.other.net/v1" }] };
  assert.deepEqual(browserFindings(["GET /v1/products/{id}"], elsewhere, origin), []);
});

test("an unusable server URL does not make every templated path look undeclared", () => {
  const spec: JsonObject = {
    openapi: "3.0.3",
    info: { title: "Shop", version: "1", description: "d" },
    servers: [{ url: "https://[broken" }],
    paths: {
      "/products/{id}": {
        get: { operationId: "getProduct", summary: "p", responses: { "200": { description: "ok" }, "404": { description: "no" } } },
      },
    },
  };
  assert.equal(lintSpec(spec, origin).some((f) => f.rule === "path-parameter-declared"), false);
});
