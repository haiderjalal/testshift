import { evaluateResponse, worstSeverity, type ApiCheck, type CheckSeverity } from "@/lib/api/checks";
import { listTemplateFor, valueFromListResponse } from "@/lib/api/chain";
import { listOperations, MISSING_EXAMPLE_REASON, type ApiOperation, type JsonObject } from "@/lib/api/openapi";
import { normalizeSpec, parseSpecText } from "@/lib/api/spec";
import type { PostmanEndpoint } from "@/lib/api/postman";
import { errorMessage, log } from "@/lib/log";
import { sendGet } from "@/lib/outbound";
import { percentile, summarizeLatency, type LatencySummary } from "@/lib/performance";

/** Where API descriptions are commonly published. Discovery stays on the customer's own site. */
const SPEC_PATHS = [
  "/openapi.json",
  "/openapi.yaml",
  "/openapi.yml",
  "/swagger.json",
  "/swagger.yaml",
  "/swagger.yml",
  "/v3/api-docs",
  "/api-docs",
  "/api/openapi.json",
];
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_OPERATIONS = 60;
const WRITE_BLOCKED = "Changes data. Write tests are not enabled yet.";
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
  /** Set when a path parameter came from an earlier list response: "GET /products". */
  chainedFrom: string | null;
}

export interface ApiRunResult {
  specUrl: string | null;
  rows: ApiRow[];
  /** Latency across every sample the API phase took. Null when no operation was sent. */
  latency: LatencySummary | null;
}

const remaining = (until: number): number => Math.max(1, Math.min(REQUEST_TIMEOUT_MS, until - Date.now()));

function specFrom(body: string): JsonObject | null {
  try {
    return normalizeSpec(parseSpecText(body));
  } catch {
    return null;
  }
}

/** Finds the first OpenAPI 3 or Swagger 2 description on the site, in JSON or YAML. */
export async function discoverSpec(origin: URL, until: number): Promise<{ url: string; spec: JsonObject } | null> {
  for (const path of SPEC_PATHS) {
    if (Date.now() >= until) return null;
    const url = new URL(path, origin);
    const response = await sendGet(url, { timeoutMs: remaining(until) }).catch(() => null);
    if (!response || response.status !== 200 || response.truncated || /html/i.test(response.contentType)) continue;
    const spec = specFrom(response.body);
    if (spec) return { url: url.href, spec };
  }
  return null;
}

/** A request from a customer's Postman collection. It has no response schema, so only status and latency are checked. */
/** Operations from a customer's collection. Their query strings are not stored, so a 4xx may be our fault. */
const fromCollection = new WeakSet<ApiOperation>();

export function collectionOperation(endpoint: PostmanEndpoint): ApiOperation {
  const safe = endpoint.method === "GET" || endpoint.method === "HEAD";
  const op: ApiOperation = {
    method: endpoint.method,
    template: endpoint.path,
    requestPath: endpoint.path,
    successStatuses: [],
    responseSchema: null,
    blockedReason: safe ? null : WRITE_BLOCKED,
    missingPathParams: [],
  };
  fromCollection.add(op);
  return op;
}

/** A 4xx on a collection request is minor: the collection's query parameters are missing from what we store. */
function softenCollectionClientError(checks: ApiCheck[], status: number): ApiCheck[] {
  if (status < 400 || status >= 500) return checks;
  return checks.map((c) =>
    c.name === "Status" && !c.passed
      ? { ...c, severity: "minor" as const, detail: `${c.detail} The collection's query strings are not stored, so a missing parameter can cause this.` }
      : c,
  );
}

function skipped(op: ApiOperation, reason: string): ApiRow {
  return { method: op.method, path: op.requestPath, statusCode: null, latencyMs: null, latencyP95Ms: null, skippedReason: reason, passed: null, severity: null, checks: [], chainedFrom: null };
}

interface OperationResult {
  row: ApiRow;
  samples: number[];
  /** The parsed JSON body of a successful GET, kept so later calls can take values from it. */
  body?: unknown;
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
    const checks = fromCollection.has(op) ? softenCollectionClientError(evaluateResponse(op, response), response.status) : evaluateResponse(op, response);
    return {
      samples,
      body: op.method === "GET" && response.status >= 200 && response.status < 300 && !response.truncated ? parseJson(response.body) : undefined,
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
        chainedFrom: null,
      },
    };
  } catch (e) {
    log("warn", "API request failed", { method: op.method, error: errorMessage(e) });
    // The customer sees a fixed message: connection errors can carry internal addresses.
    const check: ApiCheck = { name: "Reachable", passed: false, severity: "major", detail: "The request timed out or the connection failed" };
    return {
      samples: [],
      row: { method: op.method, path: op.requestPath, statusCode: null, latencyMs: null, latencyP95Ms: null, skippedReason: null, passed: false, severity: "major", checks: [check], chainedFrom: null },
    };
  }
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * Read-only chaining: "/products/{id}" takes its id from the first item of an earlier successful GET "/products".
 * Returns the filled operation, or null when no earlier list response can supply the value.
 */
export function chainOperation(op: ApiOperation, bodies: Map<string, unknown>): { op: ApiOperation; from: string } | null {
  if (op.method !== "GET" || op.missingPathParams.length !== 1) return null;
  // The only blocking reason chaining can resolve is the missing example itself.
  if (op.blockedReason !== null && !op.blockedReason.startsWith(MISSING_EXAMPLE_REASON)) return null;
  const [param] = op.missingPathParams;
  const listTemplate = listTemplateFor(op.template, param);
  if (!listTemplate || !bodies.has(listTemplate)) return null;
  const value = valueFromListResponse(bodies.get(listTemplate), param);
  if (!value) return null;
  return {
    op: { ...op, requestPath: op.requestPath.replace(`{${param}}`, encodeURIComponent(value)), missingPathParams: [], blockedReason: null },
    from: `GET ${listTemplate}`,
  };
}

function dedupe(operations: ApiOperation[]): ApiOperation[] {
  const seen = new Set<string>();
  return operations.filter((op) => {
    const key = `${op.method} ${op.requestPath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Tests the site's documented operations plus any requests from the customer's collection, within the time budget.
 * Anything not sent (writes, missing example values with nothing to chain from, time ran out) is recorded as
 * skipped with its reason, never as a pass.
 */
export async function runApiChecks(origin: URL, until: number, collection: PostmanEndpoint[] = []): Promise<ApiRunResult> {
  const found = await discoverSpec(origin, until);
  const operations = dedupe([...(found ? listOperations(found.spec, origin) : []), ...collection.map(collectionOperation)]);
  if (operations.length === 0) return { specUrl: found?.url ?? null, rows: [], latency: null };

  const limited = operations.slice(0, MAX_OPERATIONS);
  const rows: (ApiRow | undefined)[] = new Array(limited.length);
  const samples: number[] = [];
  const bodies = new Map<string, unknown>();
  const record = (index: number, result: OperationResult) => {
    rows[index] = result.row;
    samples.push(...result.samples);
    if (result.body !== undefined) bodies.set(limited[index].template, result.body);
  };

  // Pass 1: operations that need no values from elsewhere. List endpoints run here, so details can use them.
  for (const [index, op] of limited.entries()) {
    if (op.missingPathParams.length === 0) record(index, await testOperation(op, origin, until));
  }
  // Pass 2: detail operations, filled from earlier list responses where possible.
  for (const [index, op] of limited.entries()) {
    if (rows[index]) continue;
    const chained = chainOperation(op, bodies);
    if (chained) {
      const result = await testOperation(chained.op, origin, until);
      result.row.chainedFrom = chained.from;
      record(index, result);
    } else {
      rows[index] = skipped(op, op.blockedReason ?? "Needs an example value for a path parameter, and no earlier list response provided one");
    }
  }

  const overflow = operations.slice(MAX_OPERATIONS).map((op) => skipped(op, `Over the ${MAX_OPERATIONS}-operation limit for one shift`));
  return {
    specUrl: found?.url ?? null,
    rows: [...(rows as ApiRow[]), ...overflow],
    latency: summarizeLatency(samples),
  };
}
