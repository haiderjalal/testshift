/**
 * Malformed-input probes: values no client should send, to see whether one reaches a server error. Only GET
 * operations are probed, and nothing here is an attack payload: the values are type violations, a NUL byte, a broken
 * UTF-8 escape and an overlong string. Pure: requests are sent by the worker.
 */
import type { ApiCheck } from "./checks";
import type { ApiOperation, ApiParameter } from "./openapi";

export const PROBE_CHECK = "Malformed input";
/** A few probes per operation keep the request count predictable. */
export const MAX_PROBES_PER_OPERATION = 6;

/** Numeric parameters: text, a negative, zero, and a number past 64-bit range. */
const NUMBER_VALUES = ["abc", "-1", "0", "9".repeat(25)];
/** Text parameters: a broken UTF-8 escape, a NUL byte and an overlong value. */
const TEXT_VALUES = ["%E0%A4%A", "%00", "a".repeat(512)];
const BOOLEAN_VALUES = ["maybe"];
const SHORT_VALUE = 24;

export interface Probe {
  parameter: ApiParameter;
  value: string;
  /** Path and query relative to the site, ready to request. The value is sent as written, escapes included. */
  target: string;
  /** Human description of the probe for the report, e.g. `path parameter "id" set to "abc"`. */
  label: string;
}

export interface ProbeOutcome {
  probe: Probe;
  /** The HTTP status, or null when the request got no answer. */
  status: number | null;
}

function valuesFor(parameter: ApiParameter): string[] {
  if (parameter.type === "integer" || parameter.type === "number") return NUMBER_VALUES;
  if (parameter.type === "boolean") return BOOLEAN_VALUES;
  // Text, or no declared type. Arrays and objects need structured input, which a probe does not build.
  if (parameter.type === null || parameter.type === "string") return TEXT_VALUES;
  return [];
}

function describeValue(value: string): string {
  return value.length > SHORT_VALUE ? `a value of ${value.length} characters` : JSON.stringify(value);
}

/** The path with one parameter replaced by the probe; every other path parameter uses its example. */
function pathWith(op: ApiOperation, probe: { parameter: ApiParameter; value: string } | null): string {
  return op.template.replace(/{([^{}]+)}/g, (_match, name: string) => {
    if (probe && probe.parameter.in === "path" && probe.parameter.name === name) return probe.value;
    const example = op.parameters.find((p) => p.in === "path" && p.name === name)?.example ?? "";
    return encodeURIComponent(example);
  });
}

/** The query string as the sample request sends it, with the probed query parameter replaced. */
function queryWith(op: ApiOperation, probe: { parameter: ApiParameter; value: string } | null): string {
  const pairs: string[] = [];
  for (const parameter of op.parameters) {
    if (parameter.in !== "query") continue;
    if (probe && probe.parameter === parameter) {
      pairs.push(`${encodeURIComponent(parameter.name)}=${probe.value}`);
    } else if (parameter.required && parameter.example !== null) {
      pairs.push(`${encodeURIComponent(parameter.name)}=${encodeURIComponent(parameter.example)}`);
    }
  }
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

/** Every malformed request worth sending for one operation, capped per operation. */
export function probesFor(op: ApiOperation): Probe[] {
  // Probes are reads only: a POST or DELETE is never sent to find out how it fails.
  if (op.method !== "GET") return [];
  const probes: Probe[] = [];
  for (const parameter of op.parameters) {
    if (parameter.in !== "path" && parameter.in !== "query") continue;
    for (const value of valuesFor(parameter)) {
      const probe = { parameter, value };
      probes.push({
        parameter,
        value,
        target: `${op.basePath}${pathWith(op, probe)}${queryWith(op, probe)}`,
        label: `${parameter.in} parameter "${parameter.name}" set to ${describeValue(value)}`,
      });
    }
  }
  return probes.slice(0, MAX_PROBES_PER_OPERATION);
}

/** One check for the whole operation: any server error on a malformed value fails it. Null when nothing answered. */
export function probeCheck(outcomes: ProbeOutcome[]): ApiCheck | null {
  const answered = outcomes.filter((outcome): outcome is ProbeOutcome & { status: number } => outcome.status !== null);
  if (answered.length === 0) return null;
  const failures = answered.filter((outcome) => outcome.status >= 500);
  if (failures.length === 0) {
    return {
      name: PROBE_CHECK,
      passed: true,
      severity: null,
      detail: `Answered ${answered.length} malformed ${answered.length === 1 ? "value" : "values"} without a server error`,
    };
  }
  const first = failures[0];
  return {
    name: PROBE_CHECK,
    passed: false,
    severity: "major",
    detail: `Server error (HTTP ${first.status}) on malformed input: ${first.probe.label}. ${failures.length} of ${answered.length} malformed values caused a server error.`,
  };
}
