import assert from "node:assert/strict";
import { test } from "node:test";

import { clampLimits, gradeLoad, LOAD_CEILING, runLoad, summarizeLoad, type LoadSample } from "../src/lib/load-test";

/** A clock that only moves when the runner sleeps, so the schedule is exact and the test is instant. */
function virtualClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => { t += ms; },
  };
}

test("approval limits can never exceed the hard ceilings, and never drop below one", () => {
  const limits = clampLimits({ maxRequests: 1_000_000, maxRps: 500, maxConcurrency: 99, durationMs: 9_999_999 });
  assert.deepEqual(limits, {
    maxRequests: LOAD_CEILING.requests,
    maxRps: LOAD_CEILING.rps,
    maxConcurrency: LOAD_CEILING.concurrency,
    durationMs: LOAD_CEILING.durationMs,
  });
  assert.equal(clampLimits({ maxRequests: 0, maxRps: -3, maxConcurrency: 0, durationMs: 0.4 }).maxRps, 1);
});

test("requests follow the approved rate and stop at the request limit", async () => {
  const clock = virtualClock();
  const limits = { maxRequests: 15, maxRps: 5, maxConcurrency: 4, durationMs: 60_000 };
  let sent = 0;
  const samples = await runLoad({
    limits,
    now: clock.now,
    sleep: clock.sleep,
    send: async () => { sent++; return { ok: true, status: 200, latencyMs: 20 }; },
  });
  assert.equal(sent, 15, "the request limit caps the run");
  assert.equal(samples.length, 15);
  // 15 requests at 5 per second need about 3 seconds of schedule.
  assert.ok(clock.now() >= 2_800 && clock.now() <= 3_200, `schedule took ${clock.now()} ms`);
});

test("no more requests are in flight at once than the concurrency limit allows", async () => {
  const limits = { maxRequests: 12, maxRps: 20, maxConcurrency: 2, durationMs: 60_000 };
  let inflight = 0;
  let peak = 0;
  await runLoad({
    limits,
    send: async () => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inflight--;
      return { ok: true, status: 200, latencyMs: 5 };
    },
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  assert.ok(peak <= 2, `peak in-flight was ${peak}`);
});

test("failed requests and HTTP errors count as errors; error rate and percentiles come from the samples", () => {
  const limits = { maxRequests: 10, maxRps: 5, maxConcurrency: 2, durationMs: 2_000 };
  const samples: LoadSample[] = [
    ...Array.from({ length: 8 }, (_, i) => ({ ok: true, status: 200, latencyMs: 100 + i })),
    { ok: false, status: 500, latencyMs: 900 },
    { ok: false, status: null, latencyMs: 0 },
  ];
  const summary = summarizeLoad(samples, 2_000, limits);
  assert.ok(summary);
  assert.equal(summary.requests, 10);
  assert.equal(summary.errors, 2);
  assert.equal(summary.errorRate, 0.2);
  assert.equal(summary.achievedRps, 5);
  assert.equal(summarizeLoad([], 2_000, limits), null);
});

test("grading: errors above 1% are major; a slow p95 is minor, then major; a clean run passes", () => {
  const base = { requests: 100, errors: 0, errorRate: 0, p50: 100, p95: 300, p99: 400, achievedRps: 5, durationMs: 20_000, limits: { maxRequests: 100, maxRps: 5, maxConcurrency: 2, durationMs: 20_000 } };
  assert.deepEqual(gradeLoad(base), { passed: true, severity: null });
  assert.deepEqual(gradeLoad({ ...base, errorRate: 0.02, errors: 2 }), { passed: false, severity: "major" });
  assert.deepEqual(gradeLoad({ ...base, p95: 1_500 }), { passed: false, severity: "minor" });
  assert.deepEqual(gradeLoad({ ...base, p95: 2_500 }), { passed: false, severity: "major" });
});
