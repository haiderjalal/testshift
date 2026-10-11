import Ajv, { type ValidateFunction } from "ajv";

import type { ApiOperation, JsonObject } from "./openapi";

export type CheckSeverity = "critical" | "major" | "minor";

export interface ApiCheck {
  name: string;
  passed: boolean;
  severity: CheckSeverity | null;
  detail: string;
}

export interface ApiResponse {
  status: number;
  contentType: string;
  body: string;
  latencyMs: number;
  /** True when the body was larger than we read. It is then not validated, and the check says so. */
  truncated: boolean;
}

/** Above this a response is slow enough to matter for users, and is reported as a minor finding. */
export const LATENCY_BUDGET_MS = 2_000;
/** The check that asks whether a protected operation refuses a call without credentials. */
export const AUTH_CHECK = "Authentication enforced";
/** The check that asks whether a success status is one the description documents. */
export const DOCUMENTED_STATUS_CHECK = "Documented status";

const ajv = new Ajv({ strict: false, allErrors: false });
const compiled = new WeakMap<JsonObject, ValidateFunction | null>();

/** Strips regex-driven keywords from a site-supplied schema: `pattern` and `patternProperties` can be a ReDoS
 * that blocks the worker's event loop. Everything else is still validated. */
function stripRegexKeywords(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripRegexKeywords);
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "pattern" || key === "patternProperties") continue;
    out[key] = stripRegexKeywords(child);
  }
  return out;
}

/** OpenAPI 3.0 writes exclusiveMinimum and exclusiveMaximum as booleans beside the bound. The JSON Schema AJV reads
 * wants the bound itself, so a boolean becomes the bound (when there is one) and is dropped otherwise. */
function toDraft7(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toDraft7);
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) out[key] = toDraft7(child);
  for (const [flag, bound] of [["exclusiveMinimum", "minimum"], ["exclusiveMaximum", "maximum"]] as const) {
    if (typeof out[flag] !== "boolean") continue;
    if (out[flag] && typeof out[bound] === "number") {
      out[flag] = out[bound];
      delete out[bound];
    } else {
      delete out[flag];
    }
  }
  return out;
}

function validatorFor(schema: JsonObject): ValidateFunction | null {
  if (!compiled.has(schema)) {
    let validate: ValidateFunction | null;
    try {
      validate = ajv.compile(toDraft7(stripRegexKeywords(schema)) as JsonObject);
    } catch {
      // A schema AJV cannot read is a problem in the description, not in the response. The schema check is left out
      // and the spec review reports the schema.
      validate = null;
    }
    compiled.set(schema, validate);
  }
  return compiled.get(schema) ?? null;
}

/** Whether responses can be checked against this schema. */
export function canValidate(schema: JsonObject): boolean {
  return validatorFor(schema) !== null;
}

const isSuccess = (status: number): boolean => status >= 200 && status < 300;
const isJson = (contentType: string): boolean => /json/i.test(contentType);

function statusSeverity(status: number): CheckSeverity {
  return status >= 500 ? "critical" : "major";
}

function statusCheck(op: ApiOperation, res: ApiResponse): ApiCheck {
  const documented = op.successStatuses.length ? op.successStatuses.join(", ") : "none documented";
  if (isSuccess(res.status)) {
    return { name: "Status", passed: true, severity: null, detail: `Returned ${res.status} (documented: ${documented})` };
  }
  // A 4xx on a GET with spec example values can also mean the example is wrong, so the detail says so.
  const hint = res.status < 500 ? " If the spec's example values are wrong, this is not a product bug." : "";
  return {
    name: "Status",
    passed: false,
    severity: statusSeverity(res.status),
    detail: `Returned ${res.status} (documented: ${documented}).${hint}`,
  };
}

/** A success the description does not document is a contract drift: callers were never told to expect it. */
function documentedStatusCheck(op: ApiOperation, res: ApiResponse): ApiCheck | null {
  if (!isSuccess(res.status) || op.successStatuses.length === 0) return null;
  const range = `${Math.floor(res.status / 100)}XX`;
  const documented = op.successStatuses.some((code) => code === String(res.status) || code.toUpperCase() === range);
  if (documented) return { name: DOCUMENTED_STATUS_CHECK, passed: true, severity: null, detail: `Returned ${res.status}, as documented` };
  return {
    name: DOCUMENTED_STATUS_CHECK,
    passed: false,
    severity: "minor",
    detail: `Returned ${res.status}, which the description does not document for this operation (documented: ${op.successStatuses.join(", ")})`,
  };
}

/** Only for protected operations, and only when the answer decides the question: a refusal passes, a success fails. */
function authCheck(op: ApiOperation, res: ApiResponse): ApiCheck | null {
  if (!op.requiresAuth) return null;
  if (res.status === 401 || res.status === 403) {
    return {
      name: AUTH_CHECK,
      passed: true,
      severity: null,
      detail: `Refused the call without credentials (HTTP ${res.status}). TestShift holds no credentials, so calls with credentials are not tested.`,
    };
  }
  if (isSuccess(res.status)) {
    return {
      name: AUTH_CHECK,
      passed: false,
      severity: "critical",
      detail: `The description requires credentials, but the endpoint returned ${res.status} without them.`,
    };
  }
  return null;
}

function contentTypeCheck(op: ApiOperation, res: ApiResponse): ApiCheck | null {
  if (!op.responseSchema || !isSuccess(res.status)) return null;
  const passed = isJson(res.contentType);
  return {
    name: "Content type",
    passed,
    severity: passed ? null : "major",
    detail: passed ? "Returned JSON as documented" : `Documented as JSON but returned "${res.contentType || "no content type"}"`,
  };
}

function schemaCheck(op: ApiOperation, res: ApiResponse): ApiCheck | null {
  if (!op.responseSchema || !isSuccess(res.status) || !isJson(res.contentType)) return null;
  if (res.truncated) {
    return { name: "Response schema", passed: true, severity: null, detail: "Body was over the size limit, so it was not validated" };
  }
  const validate = validatorFor(op.responseSchema);
  if (!validate) return null;
  let value: unknown;
  try {
    value = JSON.parse(res.body);
  } catch {
    return { name: "Response schema", passed: false, severity: "major", detail: "Body is not valid JSON" };
  }
  if (validate(value)) return { name: "Response schema", passed: true, severity: null, detail: "Matches the documented schema" };
  const first = validate.errors?.[0];
  const where = first?.instancePath || "the top level";
  return {
    name: "Response schema",
    passed: false,
    severity: "major",
    detail: `Does not match the documented schema at ${where}: ${first?.message ?? "invalid"}`,
  };
}

function latencyCheck(res: ApiResponse): ApiCheck {
  const passed = res.latencyMs <= LATENCY_BUDGET_MS;
  return {
    name: "Latency",
    passed,
    severity: passed ? null : "minor",
    detail: `Responded in ${Math.round(res.latencyMs)} ms (budget ${LATENCY_BUDGET_MS} ms)`,
  };
}

/** Every check that applies to one response. Checks that don't apply to this operation are left out, not passed. */
export function evaluateResponse(op: ApiOperation, res: ApiResponse): ApiCheck[] {
  const auth = authCheck(op, res);
  // A refusal of an anonymous call says nothing about the body, so only the latency is still worth recording.
  if (auth?.passed) return [auth, latencyCheck(res)];
  return [
    auth,
    statusCheck(op, res),
    documentedStatusCheck(op, res),
    contentTypeCheck(op, res),
    schemaCheck(op, res),
    latencyCheck(res),
  ].filter((check): check is ApiCheck => check !== null);
}

const SEVERITY_RANK: Record<CheckSeverity, number> = { critical: 0, major: 1, minor: 2 };

/** The worst failed severity, or null when every check passed. */
export function worstSeverity(checks: ApiCheck[]): CheckSeverity | null {
  const failed = checks.filter((c) => !c.passed && c.severity).map((c) => c.severity as CheckSeverity);
  return failed.sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])[0] ?? null;
}
