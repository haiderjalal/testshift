import assert from "node:assert/strict";
import { test } from "node:test";

import { latencySeverity, percentile, summarizeLatency } from "../src/lib/performance";

test("nearest-rank percentiles on a known sample", () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100 ms
  assert.equal(percentile(values, 50), 50);
  assert.equal(percentile(values, 95), 95);
  assert.equal(percentile(values, 99), 99);
  assert.equal(percentile(values, 100), 100);
});

test("a single sample is its own every percentile", () => {
  assert.equal(percentile([42], 50), 42);
  assert.equal(percentile([42], 99), 42);
});

test("percentile does not depend on input order", () => {
  assert.equal(percentile([300, 100, 200], 50), 200);
});

test("summaries round to whole milliseconds and report the sample count", () => {
  const summary = summarizeLatency([100.4, 200.6, 300]);
  assert.deepEqual(summary, { samples: 3, p50: 201, p95: 300, p99: 300 });
  assert.equal(summarizeLatency([]), null);
});

test("latency grades: above 1 s is minor, above 2 s is major, and fast is clean", () => {
  assert.equal(latencySeverity(900), null);
  assert.equal(latencySeverity(1_000), null, "exactly the budget is still within it");
  assert.equal(latencySeverity(1_500), "minor");
  assert.equal(latencySeverity(2_500), "major");
});
