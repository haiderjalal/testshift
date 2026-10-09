import assert from "node:assert/strict";
import { test } from "node:test";
import type postgres from "postgres";
import { loadBetaPrices, loadLandingPrices } from "../src/lib/beta-orders";

test("landing prices degrade safely while strict order pricing still rejects a database failure", async () => {
  const cache = globalThis as typeof globalThis & { sql?: postgres.Sql };
  const previousSql = cache.sql;
  const previousWarn = console.warn;
  const lines: string[] = [];
  console.warn = (line: string) => lines.push(line);
  try {
    cache.sql = (() => Promise.resolve([{ plan: "junior", estimated_token_hour_cents: 100 }])) as unknown as postgres.Sql;
    assert.deepEqual(await loadLandingPrices(), { prices: { junior: 1000 }, unavailable: false });
    const failure = new Error("Sensitive provider details must not be logged");
    cache.sql = (() => Promise.reject(failure)) as unknown as postgres.Sql;
    assert.deepEqual(await loadLandingPrices(), { prices: {}, unavailable: true });
    await assert.rejects(loadBetaPrices(), failure);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).operation, "loadLandingPrices");
    assert.ok(!lines[0].includes(failure.message));
  } finally {
    console.warn = previousWarn;
    if (previousSql === undefined) delete cache.sql; else cache.sql = previousSql;
  }
});
