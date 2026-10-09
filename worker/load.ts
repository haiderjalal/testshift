import { checkTestEnvironment } from "@/lib/test-environments";
import { errorMessage, log } from "@/lib/log";
import { clampLimits, gradeLoad, runLoad, summarizeLoad, type LoadSummary } from "@/lib/load-test";
import { sendGet, type SendOptions } from "@/lib/outbound";

const DEFAULT_DURATION_MS = 30_000;
const MIN_DURATION_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface LoadCheck {
  title: string;
  url: string;
  /** null means blocked: the test did not run, and `actual` says why. */
  passed: boolean | null;
  severity: "major" | "minor" | null;
  steps: string[];
  expected: string;
  actual: string;
  summary: LoadSummary | null;
}

interface LoadDeps {
  /** Tests only: the production path always uses the public-address check. */
  resolve?: SendOptions["resolve"];
}

const TITLE = "Home page stays responsive under light load";
const blocked = (url: string, actual: string): LoadCheck => ({
  title: TITLE,
  url,
  passed: null,
  severity: null,
  steps: [],
  expected: "",
  actual,
  summary: null,
});

/**
 * Light load on an approved test environment only. The host needs a current approval record and a verified
 * domain. Requests are GETs of the home page, held to the approval's limits, which are clamped to the hard ceilings.
 */
export async function runLoadCheck(siteUrl: string, until: number, emailKey: string, deps: LoadDeps = {}): Promise<LoadCheck> {
  const site = new URL(siteUrl);
  const gate = await checkTestEnvironment(siteUrl, "load", emailKey);
  if (!gate.ok) return blocked(siteUrl, gate.reason);
  const durationMs = Math.min(DEFAULT_DURATION_MS, until - Date.now());
  if (durationMs < MIN_DURATION_MS) {
    return blocked(siteUrl, "Not enough time is left in this shift for a load test.");
  }

  const limits = clampLimits({
    maxRequests: gate.maxRequests,
    maxRps: gate.maxRps,
    maxConcurrency: gate.maxConcurrency,
    durationMs,
  });
  const home = new URL("/", site);
  const started = Date.now();
  const samples = await runLoad({
    limits,
    send: async () => {
      try {
        const response = await sendGet(home, { timeoutMs: REQUEST_TIMEOUT_MS, resolve: deps.resolve });
        return { ok: response.status >= 200 && response.status < 300, status: response.status, latencyMs: response.latencyMs };
      } catch (e) {
        log("warn", "Load request failed", { error: errorMessage(e) });
        return { ok: false, status: null, latencyMs: 0 };
      }
    },
  });
  const summary = summarizeLoad(samples, Date.now() - started, limits);
  if (!summary) return blocked(siteUrl, "No requests were sent.");
  const grade = gradeLoad(summary);
  const percent = (summary.errorRate * 100).toFixed(1);
  return {
    title: TITLE,
    url: siteUrl,
    passed: grade.passed,
    severity: grade.severity,
    steps: [`Send up to ${limits.maxRequests} GET requests to ${home.href} at ${limits.maxRps} per second`, "Measure errors and latency"],
    expected: "At most 1% of requests fail, and the 95th percentile response time stays under 1 second.",
    actual: `${summary.requests} requests at ${summary.achievedRps}/s over ${Math.round(summary.durationMs / 1_000)} s: ${percent}% failed; p50 ${summary.p50} ms, p95 ${summary.p95} ms, p99 ${summary.p99} ms.`,
    summary,
  };
}
