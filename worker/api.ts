import { evaluateResponse, worstSeverity, type ApiCheck, type CheckSeverity } from "@/lib/api/checks";
import { listTemplateFor, valueFromListResponse } from "@/lib/api/chain";
import { exampleBody } from "@/lib/api/examples";
import { listOperations, MISSING_EXAMPLE_REASON, type ApiOperation, type JsonObject } from "@/lib/api/openapi";
import type { PostmanEndpoint } from "@/lib/api/postman";
import { normalizeSpec, parseSpecText } from "@/lib/api/spec";
import { errorMessage, log } from "@/lib/log";
import { type HttpResponse, type RequestMethod, sendRequest } from "@/lib/outbound";
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
/** Writes per shift. Each one changes data on an approved environment, so the number stays small. */
const MAX_WRITES = 20;
/** Requests per read-only operation. The first also checks correctness; all of them feed the latency numbers. */
const SAMPLES_PER_OPERATION = 3;

/** How every request leaves this module. Production uses the checked sender; tests inject their own. */
export type Transport = (url: URL, init: { method: RequestMethod; body?: string; timeoutMs: number }) => Promise<HttpResponse>;

const liveTransport: Transport = (url, init) => sendRequest(url, init);

export interface ApiRunOptions {
  /** Set by the test environment check. Writes never run unless this is true. */
  writesEnabled: boolean;
  transport?: Transport;
}

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
  /** Set when a path parameter came from an earlier response: "GET /products" or "POST /products". */
  chainedFrom: string | null;
}

export interface ApiRunResult {
  specUrl: string | null;
  rows: ApiRow[];
  /** Latency across every read the API phase took. Writes are not counted. Null when no read was sent. */
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
export async function discoverSpec(origin: URL, until: number, transport: Transport = liveTransport): Promise<{ url: string; spec: JsonObject } | null> {
  for (const path of SPEC_PATHS) {
    if (Date.now() >= until) return null;
    const url = new URL(path, origin);
    const response = await transport(url, { method: "GET", timeoutMs: remaining(until) }).catch(() => null);
    if (!response || response.status !== 200 || response.truncated || /html/i.test(response.contentType)) continue;
    const spec = specFrom(response.body);
    if (spec) return { url: url.href, spec };
  }
  return null;
}

/** Operations from a customer's collection. Their query strings and bodies are not stored, so a 4xx may be our fault. */
const fromCollection = new WeakSet<ApiOperation>();

export function collectionOperation(endpoint: PostmanEndpoint): ApiOperation {
  const op: ApiOperation = {
    method: endpoint.method,
    template: endpoint.path,
    requestPath: endpoint.path,
    successStatuses: [],
    responseSchema: null,
    blockedReason: null,
    missingPathParams: [],
    isWrite: endpoint.method !== "GET" && endpoint.method !== "HEAD",
    bodySchema: null,
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

function skipped(op: ApiOperation, reason: string, path = op.requestPath): ApiRow {
  return { method: op.method, path, statusCode: null, latencyMs: null, latencyP95Ms: null, skippedReason: reason, passed: null, severity: null, checks: [], chainedFrom: null };
}

interface OperationResult {
  row: ApiRow;
  samples: number[];
  /** The parsed JSON body of a successful read, kept so later calls can take values from it. */
  body?: unknown;
  /** The raw response text, so a create's returned id can be read. */
  raw?: string;
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** Sends one operation and grades the response. Reads are sampled for latency; writes are sent once. */
async function sendOperation(
  op: ApiOperation,
  url: URL,
  until: number,
  transport: Transport,
  body: string | undefined,
  chainedFrom: string | null,
  sample: boolean,
): Promise<OperationResult> {
  const method = op.method as RequestMethod;
  try {
    const response = await transport(url, { method, body, timeoutMs: remaining(until) });
    const samples = [response.latencyMs];
    // Extra samples only while time remains: they make the latency numbers meaningful, not the verdict.
    for (let i = 1; sample && i < SAMPLES_PER_OPERATION && Date.now() < until; i++) {
      const extra = await transport(url, { method, timeoutMs: remaining(until) }).catch(() => null);
      if (extra) samples.push(extra.latencyMs);
    }
    const evaluated = evaluateResponse(op, response);
    const checks = fromCollection.has(op) ? softenCollectionClientError(evaluated, response.status) : evaluated;
    return {
      samples: sample ? samples : [],
      raw: response.truncated ? undefined : response.body,
      body: method === "GET" && response.status >= 200 && response.status < 300 && !response.truncated ? parseJson(response.body) : undefined,
      row: {
        method: op.method,
        path: url.pathname + url.search,
        statusCode: response.status,
        latencyMs: Math.round(percentile(samples, 50)),
        latencyP95Ms: Math.round(percentile(samples, 95)),
        skippedReason: null,
        passed: checks.every((c) => c.passed),
        severity: worstSeverity(checks),
        checks,
        chainedFrom,
      },
    };
  } catch (e) {
    log("warn", "API request failed", { method: op.method, error: errorMessage(e) });
    // The customer sees a fixed message: connection errors can carry internal addresses.
    const check: ApiCheck = { name: "Reachable", passed: false, severity: "major", detail: "The request timed out or the connection failed" };
    return {
      samples: [],
      row: { method: op.method, path: url.pathname + url.search, statusCode: null, latencyMs: null, latencyP95Ms: null, skippedReason: null, passed: false, severity: "major", checks: [check], chainedFrom },
    };
  }
}

async function testOperation(op: ApiOperation, origin: URL, until: number, transport: Transport): Promise<OperationResult> {
  if (op.blockedReason) return { row: skipped(op, op.blockedReason), samples: [] };
  if (Date.now() >= until) return { row: skipped(op, "Not reached: the API time for this shift ran out"), samples: [] };
  return sendOperation(op, new URL(op.requestPath, origin), until, transport, undefined, null, true);
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

/** The id a create returned, when the response carries one. */
function createdId(body: string): string | null {
  const parsed = parseJson(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const id = (parsed as Record<string, unknown>).id;
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  if (typeof id === "string" && id.length > 0 && id.length <= 200) return id;
  return null;
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
 *
 * Reads run first, then chained details. Writes run only when the test environment allows them, and only on records
 * this shift created: a create (POST) returns an id, and later updates and deletes use that id. Writes need the
 * request body the API description gives as an example. Anything not sent is recorded as skipped with its reason,
 * never as a pass, and records left behind are reported.
 */
export async function runApiChecks(origin: URL, until: number, collection: PostmanEndpoint[] = [], options: ApiRunOptions = { writesEnabled: false }): Promise<ApiRunResult> {
  const transport = options.transport ?? liveTransport;
  const found = await discoverSpec(origin, until, transport);
  const operations = dedupe([...(found ? listOperations(found.spec, origin) : []), ...collection.map(collectionOperation)]);
  if (operations.length === 0) return { specUrl: found?.url ?? null, rows: [], latency: null };

  const limited = operations.slice(0, MAX_OPERATIONS);
  const rows: (ApiRow | undefined)[] = new Array(limited.length);
  const samples: number[] = [];
  const bodies = new Map<string, unknown>();
  const created = new Map<string, string[]>();
  let writes = 0;

  // Pass 1: reads that need nothing else. List endpoints run here, so details can use them.
  for (const [index, op] of limited.entries()) {
    if (op.isWrite || op.missingPathParams.length > 0) continue;
    const result = await testOperation(op, origin, until, transport);
    rows[index] = result.row;
    samples.push(...result.samples);
    if (result.body !== undefined) bodies.set(op.template, result.body);
  }
  // Pass 2: reads whose path parameter comes from an earlier list response.
  for (const [index, op] of limited.entries()) {
    if (rows[index] || op.isWrite) continue;
    const chained = chainOperation(op, bodies);
    if (!chained) {
      rows[index] = skipped(op, op.blockedReason ?? `${MISSING_EXAMPLE_REASON} for a path parameter, and no earlier list response provided one`);
      continue;
    }
    const result = await sendOperation(chained.op, new URL(chained.op.requestPath, origin), until, transport, undefined, chained.from, true);
    rows[index] = result.row;
    samples.push(...result.samples);
  }
  // Pass 3: writes, creates first, then updates, then deletes, so each has the records it needs.
  for (const phase of [["POST"], ["PUT", "PATCH"], ["DELETE"]]) {
    for (const [index, op] of limited.entries()) {
      if (!op.isWrite || !phase.includes(op.method)) continue;
      rows[index] = await runWrite(op, origin, until, transport, options.writesEnabled, created, () => writes++ < MAX_WRITES);
    }
  }

  const extra: ApiRow[] = [];
  for (const [template, ids] of created) {
    const deleted = limited.some((op) => op.method === "DELETE" && listTemplateFor(op.template, "id") === template);
    if (deleted) continue;
    for (const id of ids) extra.push(skipped(limited[0], "Left in the test environment: no DELETE operation in the API description removes it", `${template}/${id}`));
  }
  const overflow = operations.slice(MAX_OPERATIONS).map((op) => skipped(op, `Over the ${MAX_OPERATIONS}-operation limit for one shift`));
  return {
    specUrl: found?.url ?? null,
    rows: [...(rows as ApiRow[]), ...extra, ...overflow],
    latency: summarizeLatency(samples),
  };
}

async function runWrite(
  op: ApiOperation,
  origin: URL,
  until: number,
  transport: Transport,
  writesEnabled: boolean,
  created: Map<string, string[]>,
  takeWriteSlot: () => boolean,
): Promise<ApiRow> {
  if (!writesEnabled) return skipped(op, "Changes data. Write tests run only on approved test environments.");
  if (fromCollection.has(op)) {
    return skipped(op, "Collection requests that change data are listed but not sent: collections do not keep request bodies. The API description enables write tests.");
  }
  // A missing path id is what this function fills from records it created, so only other reasons block here.
  if (op.blockedReason && !op.blockedReason.startsWith(MISSING_EXAMPLE_REASON)) return skipped(op, op.blockedReason);
  if (Date.now() >= until) return skipped(op, "Not reached: the API time for this shift ran out");
  if (!takeWriteSlot()) return skipped(op, `Over the ${MAX_WRITES}-write limit for one shift`);

  let target = op;
  let chainedFrom: string | null = null;
  let body: string | undefined;
  let usedList: string | null = null;
  let usedId: string | null = null;
  if (op.method !== "POST") {
    // Updates and deletes only ever touch a record this shift created. Nothing that already existed is changed.
    const [param] = op.missingPathParams;
    const list = param ? listTemplateFor(op.template, param) : null;
    const id = list ? created.get(list)?.[0] : undefined;
    if (!param || !list || !id) return skipped(op, "No record created earlier in this shift matches this operation, so nothing was changed");
    target = { ...op, requestPath: op.requestPath.replace(`{${param}}`, encodeURIComponent(id)), missingPathParams: [] };
    chainedFrom = `POST ${list}`;
    usedList = list;
    usedId = id;
  }
  if (op.bodySchema) {
    const example = exampleBody(op.bodySchema);
    if (!example) return skipped(op, "Needs an example request body in the API description, so no guessed data was sent");
    body = JSON.stringify(example);
  }

  const result = await sendOperation(target, new URL(target.requestPath, origin), until, transport, body, chainedFrom, false);
  const status = result.row.statusCode;
  const succeeded = status !== null && status >= 200 && status < 300;
  if (succeeded && op.method === "POST" && result.raw !== undefined) {
    const id = createdId(result.raw);
    if (id) created.set(op.template, [...(created.get(op.template) ?? []), id]);
  }
  if (succeeded && op.method === "DELETE" && usedId !== null && usedList !== null) {
    created.set(usedList, (created.get(usedList) ?? []).filter((id) => id !== usedId));
  }
  return result.row;
}
