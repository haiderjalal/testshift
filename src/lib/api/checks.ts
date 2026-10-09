import Ajv from "ajv";

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

const ajv = new Ajv({ strict: false, allErrors: false });
const compiled = new WeakMap<JsonObject, ReturnType<typeof ajv.compile>>();

function validatorFor(schema: JsonObject): ReturnType<typeof ajv.compile> {
  const cached = compiled.get(schema);
  if (cached) return cached;
  const validate = ajv.compile(schema);
  compiled.set(schema, validate);
  return validate;
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
  let value: unknown;
  try {
    value = JSON.parse(res.body);
  } catch {
    return { name: "Response schema", passed: false, severity: "major", detail: "Body is not valid JSON" };
  }
  const validate = validatorFor(op.responseSchema);
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
  return [statusCheck(op, res), contentTypeCheck(op, res), schemaCheck(op, res), latencyCheck(res)].filter(
    (check): check is ApiCheck => check !== null,
  );
}

const SEVERITY_RANK: Record<CheckSeverity, number> = { critical: 0, major: 1, minor: 2 };

/** The worst failed severity, or null when every check passed. */
export function worstSeverity(checks: ApiCheck[]): CheckSeverity | null {
  const failed = checks.filter((c) => !c.passed && c.severity).map((c) => c.severity as CheckSeverity);
  return failed.sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])[0] ?? null;
}
