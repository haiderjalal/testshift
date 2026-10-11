import assert from "node:assert/strict";
import { test } from "node:test";

import { AUTH_CHECK, LATENCY_BUDGET_MS, type ApiCheck } from "../src/lib/api/checks";
import { importPostmanEndpoints } from "../src/lib/api/postman";
import { buildPostmanCollection, type ExportRow } from "../src/lib/api/postman-export";

const origin = new URL("https://shop.example.com/");

const check = (name: string, passed: boolean): ApiCheck => ({ name, passed, severity: passed ? null : "major", detail: "detail" });

test("Postman: a {{baseUrl}} variable that points at the site resolves, so its requests are kept", () => {
  const collection = JSON.stringify({
    info: { name: "Shop", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
    variable: [
      { key: "baseUrl", value: "https://shop.example.com/api/" },
      { key: "other", value: "https://elsewhere.example.net" },
      { key: "secret", value: "https://user:pass@shop.example.com/api" },
    ],
    item: [
      { name: "List", request: { method: "GET", url: { raw: "{{baseUrl}}/products?page=2" } } },
      { name: "Elsewhere", request: { method: "GET", url: "{{other}}/products" } },
      { name: "Credentials", request: { method: "GET", url: "{{secret}}/products" } },
      { name: "Token", request: { method: "GET", url: "{{token}}/products" } },
    ],
  });
  const result = importPostmanEndpoints(collection, origin);
  assert.deepEqual(result.endpoints, [{ method: "GET", path: "/api/products" }]);
  assert.equal(result.skipped, 3, "other sites, embedded credentials and unknown variables are all skipped");
  assert.doesNotMatch(JSON.stringify(result), /elsewhere|pass|token/);
});

test("the export holds only passing reads, each with tests for what passed", () => {
  const rows: ExportRow[] = [
    {
      method: "GET",
      path: "/api/products?page=2",
      statusCode: 200,
      checks: [check("Status", true), check("Documented status", true), check("Latency", true)],
    },
    { method: "GET", path: "/api/orders", statusCode: 401, checks: [check(AUTH_CHECK, true), check("Latency", true)] },
    { method: "GET", path: "/api/broken", statusCode: 500, checks: [check("Status", false)] },
    { method: "POST", path: "/api/products", statusCode: 201, checks: [check("Status", true)] },
    { method: "GET", path: "/api/skipped", statusCode: null, checks: [] },
  ];
  const collection = buildPostmanCollection({ host: "shop.example.com", origin, exportedAt: new Date("2026-10-11T12:00:00Z"), rows });

  assert.deepEqual(collection.item.map((item) => item.name), ["GET /api/products?page=2", "GET /api/orders"]);
  const [products, orders] = collection.item;
  assert.equal(products.request.url.raw, "https://shop.example.com/api/products?page=2");
  assert.deepEqual(products.request.url.query, [{ key: "page", value: "2" }]);
  assert.deepEqual(products.request.url.path, ["api", "products"]);
  assert.match(products.event[0].script.exec[0], /to\.have\.status\(200\)/);
  assert.match(orders.event[0].script.exec[0], /oneOf\(\[401, 403\]\)/, "an anonymous refusal is asserted as a refusal");
  assert.ok(products.event[0].script.exec.some((line) => line.includes(`below(${LATENCY_BUDGET_MS})`)));
  assert.match(collection.info.description, /2026-10-11/);
});

test("the export writes nothing from a check's text into its script: only numbers from the shift reach the tests", () => {
  const hostile = `"); process.exit(1); //`;
  const rows: ExportRow[] = [
    { method: "GET", path: "/api/products", statusCode: 200, checks: [{ name: hostile, passed: true, severity: null, detail: hostile }] },
  ];
  const script = buildPostmanCollection({ host: "shop.example.com", origin, exportedAt: new Date(0), rows }).item[0].event[0].script.exec.join("\n");
  assert.doesNotMatch(script, /process|exit|hostile/);
});
