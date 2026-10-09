import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

import { errorMessage, log } from "@/lib/log";
import { evaluateResponse, worstSeverity, type ApiCheck, type ApiResponse, type CheckSeverity } from "@/lib/api/checks";
import { isOpenApiDocument, listOperations, type ApiOperation, type JsonObject } from "@/lib/api/openapi";

import { resolvePublicAddress } from "./egress";

/** Where OpenAPI documents are commonly published. Discovery stays on the customer's own site. */
const SPEC_PATHS = ["/openapi.json", "/swagger.json", "/v3/api-docs", "/api-docs", "/api/openapi.json"];
const MAX_BODY_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_OPERATIONS = 60;
const USER_AGENT = "TestShift-API-Tester/1.0";

export interface ApiRow {
  method: string;
  path: string;
  statusCode: number | null;
  latencyMs: number | null;
  skippedReason: string | null;
  passed: boolean | null;
  severity: CheckSeverity | null;
  checks: ApiCheck[];
}

export interface SendOptions {
  timeoutMs: number;
  /** Override only in tests. Production always resolves through the public-address check. */
  resolve?: (hostname: string) => Promise<string>;
}

/**
 * One read-only HTTP GET. The DNS answer is checked for public addresses, and the connection is pinned to
 * that same address, so a second DNS lookup cannot send it somewhere else. Redirects are not followed.
 */
export async function sendGet(url: URL, options: SendOptions): Promise<ApiResponse> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported protocol");
  if (url.username || url.password) throw new Error("Credentials in URL are refused");
  const address = await (options.resolve ?? resolvePublicAddress)(url.hostname);
  const family = isIP(address) === 6 ? 6 : 4;
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  const started = performance.now();

  return new Promise<ApiResponse>((resolve, reject) => {
    const req = send(
      url,
      {
        method: "GET",
        headers: { accept: "application/json, */*;q=0.5", "user-agent": USER_AGENT },
        timeout: options.timeoutMs,
        // Node asks for every address when connecting with happy-eyeballs; the pinned answer satisfies both forms.
        lookup: (_hostname, lookupOptions, callback) =>
          lookupOptions.all ? callback(null, [{ address, family }]) : callback(null, address, family),
      },
      (res: IncomingMessage) => readBody(res, started, resolve),
    );
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.end();
  });
}

function readBody(res: IncomingMessage, started: number, resolve: (value: ApiResponse) => void): void {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  res.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    else if (!truncated) {
      truncated = true;
      res.destroy();
    }
  });
  res.on("error", () => undefined);
  res.on("close", () => {
    resolve({
      status: res.statusCode ?? 0,
      contentType: String(res.headers["content-type"] ?? ""),
      body: Buffer.concat(chunks).toString("utf8"),
      latencyMs: performance.now() - started,
      truncated,
    });
  });
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
  return { method: op.method, path: op.requestPath, statusCode: null, latencyMs: null, skippedReason: reason, passed: null, severity: null, checks: [] };
}

async function testOperation(op: ApiOperation, origin: URL, until: number): Promise<ApiRow> {
  if (op.blockedReason) return skipped(op, op.blockedReason);
  if (Date.now() >= until) return skipped(op, "Not reached: the API time for this shift ran out");
  try {
    const response = await sendGet(new URL(op.requestPath, origin), { timeoutMs: remaining(until) });
    const checks = evaluateResponse(op, response);
    return {
      method: op.method,
      path: op.requestPath,
      statusCode: response.status,
      latencyMs: Math.round(response.latencyMs),
      skippedReason: null,
      passed: checks.every((c) => c.passed),
      severity: worstSeverity(checks),
      checks,
    };
  } catch (e) {
    log("warn", "API request failed", { method: op.method, error: errorMessage(e) });
    // The customer sees a fixed message: connection errors can carry internal addresses.
    const check: ApiCheck = { name: "Reachable", passed: false, severity: "major", detail: "The request timed out or the connection failed" };
    return { method: op.method, path: op.requestPath, statusCode: null, latencyMs: null, skippedReason: null, passed: false, severity: "major", checks: [check] };
  }
}

/**
 * Finds the site's OpenAPI document and tests every read-only operation in it, within the time budget.
 * Anything not sent (writes, missing example values, time ran out) is recorded as skipped, never as a pass.
 */
export async function runApiChecks(origin: URL, until: number): Promise<{ specUrl: string | null; rows: ApiRow[] }> {
  const found = await discoverSpec(origin, until);
  if (!found) return { specUrl: null, rows: [] };
  const operations = listOperations(found.spec, origin);
  const rows: ApiRow[] = [];
  for (const op of operations.slice(0, MAX_OPERATIONS)) rows.push(await testOperation(op, origin, until));
  for (const op of operations.slice(MAX_OPERATIONS)) rows.push(skipped(op, `Over the ${MAX_OPERATIONS}-operation limit for one shift`));
  return { specUrl: found.url, rows };
}
