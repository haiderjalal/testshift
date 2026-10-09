/** Latency statistics for the performance review. Pure, so the grading rules are tested directly. */

import type { CheckSeverity } from "./api/checks";

/** Nearest-rank percentile: the smallest sample at or above the p-th percentile. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error("percentile of no samples");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export interface LatencySummary {
  samples: number;
  p50: number;
  p95: number;
  p99: number;
}

export function summarizeLatency(values: number[]): LatencySummary | null {
  if (values.length === 0) return null;
  return {
    samples: values.length,
    p50: Math.round(percentile(values, 50)),
    p95: Math.round(percentile(values, 95)),
    p99: Math.round(percentile(values, 99)),
  };
}

/** Typical users notice a p95 above one second; above two seconds is a real performance problem. */
export const P95_MINOR_MS = 1_000;
export const P95_MAJOR_MS = 2_000;

export function latencySeverity(p95Ms: number): CheckSeverity | null {
  if (p95Ms > P95_MAJOR_MS) return "major";
  if (p95Ms > P95_MINOR_MS) return "minor";
  return null;
}
