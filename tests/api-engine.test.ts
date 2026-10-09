import assert from "node:assert/strict";
import { test } from "node:test";

import { listTemplateFor, valueFromListResponse } from "../src/lib/api/chain";
import { listOperations, type JsonObject } from "../src/lib/api/openapi";
import { importPostmanEndpoints } from "../src/lib/api/postman";
import { normalizeSpec, parseSpecText } from "../src/lib/api/spec";
import { chainOperation, collectionOperation } from "../worker/api";

const site = new URL("https://shop.example.com/");

test("YAML descriptions are read the same way as JSON", () => {
  const yaml = `openapi: 3.0.3\ninfo:\n  title: Shop\n  version: "1"\npaths:\n  /products:\n    get:\n      responses:\n        "200":\n          description: ok\n`;
  const spec = normalizeSpec(parseSpecText(yaml));
  assert.ok(spec);
  const ops = listOperations(spec, site);
  assert.equal(ops[0].method, "GET");
  assert.equal(ops[0].blockedReason, null);
});

test("Swagger 2 is converted: host and basePath become the server, definitions become components, body params become requestBody", () => {
  const swagger = {
    swagger: "2.0",
    host: "shop.example.com",
    basePath: "/api",
    schemes: ["https"],
    definitions: { Product: { type: "object", required: ["id"], properties: { id: { type: "integer" } } } },
    paths: {
      "/products": {
        get: { responses: { "200": { description: "ok", schema: { type: "array", items: { $ref: "#/definitions/Product" } } } } },
        post: {
          parameters: [{ name: "body", in: "body", required: true, schema: { $ref: "#/definitions/Product" } }],
          responses: { "201": { description: "created" } },
        },
      },
    },
  };
  const spec = normalizeSpec(JSON.parse(JSON.stringify(swagger)));
  assert.ok(spec);
  const ops = listOperations(spec, site);
  const get = ops.find((o) => o.method === "GET");
  assert.ok(get);
  assert.equal(get.requestPath, "/api/products");
  assert.equal(get.blockedReason, null);
  assert.deepEqual(get.successStatuses, ["200"]);
  assert.match(JSON.stringify(get.responseSchema), /#\/components\/schemas\/Product/, "refs are rewritten to the OpenAPI 3 location");
  assert.equal(ops.find((o) => o.method === "POST")?.isWrite, true);
});

test("Swagger 2 path parameters use their default when one is given", () => {
  const spec = normalizeSpec({
    swagger: "2.0",
    host: "shop.example.com",
    paths: { "/items/{id}": { get: { parameters: [{ name: "id", in: "path", required: true, type: "integer", default: 7 }], responses: { "200": { description: "ok" } } } } },
  });
  assert.ok(spec);
  assert.equal(listOperations(spec, site)[0].requestPath, "/items/7");
});

test("documents that are neither OpenAPI 3 nor Swagger 2 are not read", () => {
  assert.equal(normalizeSpec({ openapi: "2.0", paths: {} }), null);
  assert.equal(normalizeSpec({ hello: "world" }), null);
  assert.equal(normalizeSpec("<html>not a spec</html>"), null);
});

test("a detail path can only chain from its list path", () => {
  assert.equal(listTemplateFor("/products/{id}", "id"), "/products");
  assert.equal(listTemplateFor("/shops/{shop}/items/{id}", "id"), null, "nested lists need their parent id, so they are not chained");
  assert.equal(listTemplateFor("/{id}", "id"), null);
});

test("the first list item supplies the value, by the parameter's name or by its id", () => {
  assert.equal(valueFromListResponse([{ id: 42 }, { id: 43 }], "id"), "42");
  assert.equal(valueFromListResponse({ data: [{ id: "abc" }] }, "id"), "abc");
  assert.equal(valueFromListResponse([{ sku: "S-1", id: 9 }], "sku"), "S-1");
  assert.equal(valueFromListResponse([{ productId: 5 }], "productId"), "5", "the field with the parameter's name wins");
  assert.equal(valueFromListResponse([{ productId: 5 }], "id"), null, "no id to fall back to");
  assert.equal(valueFromListResponse({ message: "nothing here" }, "id"), null);
  assert.equal(valueFromListResponse([{ id: "x".repeat(300) }], "id"), null, "values longer than 200 characters are not used");
});

test("a detail call is only chained when its list call succeeded earlier", () => {
  const detail = listOperations(
    { openapi: "3.0.3", paths: { "/products/{id}": { get: { parameters: [{ name: "id", in: "path", required: true }], responses: { "200": { description: "ok" } } } } } } as JsonObject,
    site,
  )[0];
  assert.equal(chainOperation(detail, new Map()), null);
  const chained = chainOperation(detail, new Map([["/products", [{ id: "a/b" }]]]));
  assert.ok(chained);
  assert.equal(chained.op.requestPath, "/products/a%2Fb", "the value is URL-encoded into the path");
  assert.equal(chained.from, "GET /products");
  assert.equal(chained.op.missingPathParams.length, 0);
});

test("Postman: only method and path are kept; headers, auth, variables and queries never are", () => {
  const collection = JSON.stringify({
    info: { name: "Shop", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    item: [
      {
        name: "Catalogue",
        item: [
          {
            name: "List products",
            request: {
              method: "GET",
              header: [{ key: "Authorization", value: "Bearer SECRET-TOKEN" }],
              url: { raw: "https://shop.example.com/api/products?api_key=SECRET-KEY" },
            },
          },
        ],
      },
      { name: "Templated", request: { method: "GET", url: { raw: "{{baseUrl}}/products" } } },
      { name: "Elsewhere", request: { method: "GET", url: "https://other.example.net/products" } },
      { name: "Create", request: { method: "POST", url: "https://shop.example.com/api/products", body: { mode: "raw", raw: "{\"password\":\"SECRET-PW\"}" } } },
      { name: "Duplicate", request: { method: "GET", url: "https://shop.example.com/api/products?page=2" } },
    ],
  });
  const result = importPostmanEndpoints(collection, site);
  assert.deepEqual(result.endpoints, [
    { method: "GET", path: "/api/products" },
    { method: "POST", path: "/api/products" },
  ]);
  assert.equal(result.skipped, 2, "the templated URL and the other host are counted as skipped");
  const stored = JSON.stringify(result);
  assert.doesNotMatch(stored, /SECRET/);
});

test("Postman: text that is not a collection is refused", () => {
  assert.throws(() => importPostmanEndpoints("not json", site));
  assert.throws(() => importPostmanEndpoints(JSON.stringify({ hello: 1 }), site), /not a Postman collection/);
});

test("collection requests that change data are listed but blocked from being sent", () => {
  assert.equal(collectionOperation({ method: "GET", path: "/api/products" }).blockedReason, null);
  assert.equal(collectionOperation({ method: "DELETE", path: "/api/products/1" }).isWrite, true);
});
