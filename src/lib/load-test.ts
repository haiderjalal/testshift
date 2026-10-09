/**
 * Light load testing on approved test environments. Pure: the requests are sent by worker/load.ts, and tests inject
 * a fake sender. Limits are enforced here, so a bad configuration can never send more than the approval allows.
 */
import { latencySeverity, percentile } from "./performance";

/** Hard ceilings, whatever an approval record says. */
export const LOAD_CEILING = { requests: 2_000, rps: 20, concurrency: 10, durationMs: 120_000 } as const;
export const ERROR_RATE_LIMIT = 0.01;

export interface LoadLimits {
  maxRequests: number;
  maxRps: number;
  maxConcurrency: number;
  durationMs: number;
}

/** Clamps an approval record's limits to the hard ceilings, and makes sure nothing is zero or negative. */
export function clampLimits(approved: LoadLimits): LoadLimits {
  const clamp = (value: number, max: number) => Math.max(1, Math.min(Math.floor(value), max));
  return {
    maxRequests: clamp(approved.maxRequests, LOAD_CEILING.requests),
    maxRps: clamp(approved.maxRps, LOAD_CEILING.rps),
    maxConcurrency: clamp(approved.maxConcurrency, LOAD_CEILING.concurrency),
    durationMs: clamp(approved.durationMs, LOAD_CEILING.durationMs),
  };
}

export interface LoadSample {
  ok: boolean;
  status: number | null;
  latencyMs: number;
}

export interface LoadSummary {
  requests: number;
  errors: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  achievedRps: number;
  durationMs: number;
  limits: LoadLimits;
}

/**
 * Sends requests at the approved rate, never more than the concurrency or request limit at once, and stops at the
 * deadline. A slow server cannot make the schedule catch up with a burst.
 */
export async function runLoad(input: {
  limits: LoadLimits;
  send: () => Promise<LoadSample>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<LoadSample[]> {
  const { limits } = input;
  const now = input.now ?? (() => Date.now());
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const interval = 1_000 / limits.maxRps;
  const started = now();
  const end = started + limits.durationMs;
  const samples: LoadSample[] = [];
  const inflight = new Set<Promise<void>>();
  let sent = 0;
  let nextAt = started;

  while (now() < end && sent < limits.maxRequests) {
    const current = now();
    if (current < nextAt) {
      await sleep(nextAt - current);
      continue;
    }
    if (inflight.size >= limits.maxConcurrency) {
      await Promise.race(inflight);
      continue;
    }
    sent++;
    nextAt = Math.max(nextAt + interval, current);
    const request: Promise<void> = input
      .send()
      .then((sample) => { samples.push(sample); }, () => { samples.push({ ok: false, status: null, latencyMs: 0 }); })
      .finally(() => { inflight.delete(request); });
    inflight.add(request);
  }
  await Promise.all(inflight);
  return samples;
}

export function summarizeLoad(samples: LoadSample[], durationMs: number, limits: LoadLimits): LoadSummary | null {
  if (samples.length === 0) return null;
  const latencies = samples.filter((s) => s.status !== null).map((s) => s.latencyMs);
  const errors = samples.filter((s) => !s.ok).length;
  const timed = latencies.length > 0 ? latencies : [0];
  return {
    requests: samples.length,
    errors,
    errorRate: errors / samples.length,
    p50: Math.round(percentile(timed, 50)),
    p95: Math.round(percentile(timed, 95)),
    p99: Math.round(percentile(timed, 99)),
    achievedRps: Math.round((samples.length / Math.max(1, durationMs)) * 1_000 * 10) / 10,
    durationMs,
    limits,
  };
}

/** Failing when errors exceed the limit or the p95 is slow; the severity follows the worse of the two. */
export function gradeLoad(summary: LoadSummary): { passed: boolean; severity: "major" | "minor" | null } {
  const errorsTooHigh = summary.errorRate > ERROR_RATE_LIMIT;
  const latency = latencySeverity(summary.p95);
  if (errorsTooHigh) return { passed: false, severity: "major" };
  if (latency === "minor") return { passed: false, severity: "minor" };
  if (latency) return { passed: false, severity: "major" };
  return { passed: true, severity: null };
}
