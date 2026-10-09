import { errorMessage, log } from "@/lib/log";
import { evaluateResponse, worstSeverity, type ApiCheck, type CheckSeverity } from "@/lib/api/checks";
import { isOpenApiDocument, listOperations, type ApiOperation, type JsonObject } from "@/lib/api/openapi";
import { summarizeLatency, type LatencySummary, percentile } from "@/lib/performance";
import { sendGet } from "@/lib/outbound";

/** Where OpenAPI documents are commonly published. Discovery stays on the customer's own site. */
const SPEC_PATHS = ["/openapi.json", "/swagger.json", "/v3/api-docs", "/api-docs", "/api/openapi.json"];
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_OPERATIONS = 60;
/** Requests per read-only operation. The first also checks correctness; all of them feed the latency numbers. */
const SAMPLES_PER_OPERATION = 3;

export interface ApiRow {
  method: string;
  path: string;
  statusCode: number | null;
  /** Median latency across this operation's samples. */
  latencyMs: number | null;
  latencyP95Ms: number | null;
  skippedReason: string | null;
  passed: boolean | null;
  severity: CheckSeverity | null;
  checks: ApiCheck[];
}

export interface ApiRunResult {
  specUrl: string | null;
  rows: ApiRow[];
  /** Latency across every sample the API phase took. Null when no operation was sent. */
  latency: LatencySummary | null;
}

/** Finds the first OpenAPI 3 document on the site. Only JSON is read in this version. */
export async function discoverSpec(origin: URL, until: number): Promise<{ url: string; spec: JsonObject } | null> {
  for (const path of SPEC_PATHS) {
    if (Date.now() >= until) return null;
    const url = new URL(path, origin);
    const response = await sendGet(url, { timeoutMs: remaining(until) }).catch(() => null);
    if (!response || response.status !== 200 || response.truncated || !/json/i.test(response.contentType)) continue;
    try {
      const parsed: unknown = JSON.parse(response.body);
      if (isOpenApiDocument(parsed)) return { url: url.href, spec: parsed };
    } catch {
      // Not JSON after all; keep looking.
    }
  }
  return null;
}

const remaining = (until: number): number => Math.max(1, Math.min(REQUEST_TIMEOUT_MS, until - Date.now()));

function skipped(op: ApiOperation, reason: string): ApiRow {
  return { method: op.method, path: op.requestPath, statusCode: null, latencyMs: null, latencyP95Ms: null, skippedReason: reason, passed: null, severity: null, checks: [] };
}

interface OperationResult {
  row: ApiRow;
  samples: number[];
}

async function testOperation(op: ApiOperation, origin: URL, until: number): Promise<OperationResult> {
  if (op.blockedReason) return { row: skipped(op, op.blockedReason), samples: [] };
  if (Date.now() >= until) return { row: skipped(op, "Not reached: the API time for this shift ran out"), samples: [] };
  const url = new URL(op.requestPath, origin);
  try {
    const response = await sendGet(url, { timeoutMs: remaining(until) });
    const samples = [response.latencyMs];
    // Extra samples only while time remains: they make the latency numbers meaningful, not the verdict.
    for (let i = 1; i < SAMPLES_PER_OPERATION && Date.now() < until; i++) {
      const extra = await sendGet(url, { timeoutMs: remaining(until) }).catch(() => null);
      if (extra) samples.push(extra.latencyMs);
    }
    const checks = evaluateResponse(op, response);
    return {
      samples,
      row: {
        method: op.method,
        path: op.requestPath,
        statusCode: response.status,
        latencyMs: Math.round(percentile(samples, 50)),
        latencyP95Ms: Math.round(percentile(samples, 95)),
        skippedReason: null,
        passed: checks.every((c) => c.passed),
        severity: worstSeverity(checks),
        checks,
      },
    };
  } catch (e) {
    log("warn", "API request failed", { method: op.method, error: errorMessage(e) });
    // The customer sees a fixed message: connection errors can carry internal addresses.
    const check: ApiCheck = { name: "Reachable", passed: false, severity: "major", detail: "The request timed out or the connection failed" };
    return {
      samples: [],
      row: { method: op.method, path: op.requestPath, statusCode: null, latencyMs: null, latencyP95Ms: null, skippedReason: null, passed: false, severity: "major", checks: [check] },
    };
  }
}

/**
 * Finds the site's OpenAPI document and tests every read-only operation in it, within the time budget.
 * Anything not sent (writes, missing example values, time ran out) is recorded as skipped, never as a pass.
 */
export async function runApiChecks(origin: URL, until: number): Promise<ApiRunResult> {
  const found = await discoverSpec(origin, until);
  if (!found) return { specUrl: null, rows: [], latency: null };
  const operations = listOperations(found.spec, origin);
  const rows: ApiRow[] = [];
  const samples: number[] = [];
  for (const op of operations.slice(0, MAX_OPERATIONS)) {
    const result = await testOperation(op, origin, until);
    rows.push(result.row);
    samples.push(...result.samples);
  }
  for (const op of operations.slice(MAX_OPERATIONS)) rows.push(skipped(op, `Over the ${MAX_OPERATIONS}-operation limit for one shift`));
  return { specUrl: found.url, rows, latency: summarizeLatency(samples) };
}
