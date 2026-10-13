/**
 * Spec review: problems in the API description itself, and calls the page makes that the description does not
 * document. Pure: the worker supplies the description and the calls the browser made.
 */
import { canValidate } from "./checks";
import { exampleBody } from "./examples";
import { isObject, listOperations, serverBase, type JsonObject } from "./openapi";

export const MAX_FINDINGS = 100;

/** Rules are named after what they check, so the report can explain each one without a glossary. */
export type SpecRule =
  | "info-description"
  | "info-version"
  | "servers-declared"
  | "operation-id"
  | "operation-id-unique"
  | "operation-description"
  | "success-response"
  | "error-responses"
  | "path-parameter-declared"
  | "parameter-example"
  | "request-body-example"
  | "security-scheme"
  | "write-security"
  | "path-naming"
  | "response-schema"
  | "undocumented-call";

export interface SpecFinding {
  /** "spec" for the description itself, "browser" for a call the page made. */
  source: "spec" | "browser";
  rule: SpecRule;
  severity: "warning" | "info";
  message: string;
  /** "GET /products/{id}" when it concerns one operation, the call itself for browser findings, null otherwise. */
  location: string | null;
}

const METHODS = ["get", "head", "post", "put", "patch", "delete"] as const;
const BROWSER_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const PARAMETER_SEGMENT = /^\{[^{}]+\}$/;
/** A path segment that starts with a verb, such as "getProducts" or "add-to-cart". */
const PATH_VERB = /^(get|create|update|delete|remove|add|fetch|list|set|save)(?=[A-Z_-]|$)/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Paths a page loads for its own purposes (framework bundles and data), which are never API calls. */
const FRAMEWORK_PATHS = ["/_next/", "/__", "/_vercel/", "/static/"];
/** Longer segments are probably personal or generated values, so they are collapsed rather than stored. */
const MAX_SEGMENT_LENGTH = 40;
const MAX_CALL_LENGTH = 200;

const nonEmpty = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;
const templateParameters = (template: string): string[] => [...template.matchAll(/{([^{}]+)}/g)].map((match) => match[1]);

function securityNames(requirements: unknown[]): string[] {
  return requirements.flatMap((requirement) => (isObject(requirement) ? Object.keys(requirement) : []));
}

/** Checks the description for problems that make tests weaker or skipped. Warnings first, then suggestions. */
export function lintSpec(spec: JsonObject, origin: URL): SpecFinding[] {
  const findings: SpecFinding[] = [];
  const add = (rule: SpecRule, severity: SpecFinding["severity"], message: string, location: string | null = null): void => {
    findings.push({ source: "spec", rule, severity, message, location });
  };

  const info = isObject(spec.info) ? spec.info : {};
  const components = isObject(spec.components) ? spec.components : {};
  const schemeNames = new Set(Object.keys(isObject(components.securitySchemes) ? components.securitySchemes : {}));
  // Without a usable server URL the operations carry no parameters, so parameter rules would report false gaps.
  const usable = serverBase(spec, origin) !== null;
  if (!nonEmpty(info.description)) add("info-description", "info", "The description has no info.description, so readers get no overview of the API.");
  if (!nonEmpty(info.version)) add("info-version", "warning", "info.version is missing.");
  if (!Array.isArray(spec.servers) || spec.servers.length === 0) {
    add("servers-declared", "info", "No servers are declared, so the operations are assumed to be served from the site root.");
  }
  if (Array.isArray(spec.security)) {
    for (const name of securityNames(spec.security)) {
      if (!schemeNames.has(name)) add("security-scheme", "warning", `The description requires the security scheme "${name}", which it does not define.`);
    }
  }

  const described = new Map(listOperations(spec, origin).map((op) => [`${op.method} ${op.template}`, op]));
  const operationIds = new Map<string, string[]>();
  for (const [template, item] of Object.entries(isObject(spec.paths) ? spec.paths : {})) {
    if (!isObject(item)) continue;
    for (const method of METHODS) {
      const raw = item[method];
      if (!isObject(raw)) continue;
      const location = `${method.toUpperCase()} ${template}`;
      if (nonEmpty(raw.operationId)) {
        const id = raw.operationId as string;
        operationIds.set(id, [...(operationIds.get(id) ?? []), location]);
      } else {
        add("operation-id", "info", `${location} has no operationId, so tools cannot name it consistently.`, location);
      }
      if (!nonEmpty(raw.summary) && !nonEmpty(raw.description)) add("operation-description", "info", `${location} has no summary or description.`, location);

      const codes = Object.keys(isObject(raw.responses) ? raw.responses : {});
      if (!codes.some((code) => /^(2\d\d|2XX)$/i.test(code))) {
        add("success-response", "warning", `${location} documents no 2xx response, so its success status cannot be checked.`, location);
      }
      if (!codes.some((code) => /^([45]\d\d|[45]XX|default)$/i.test(code))) {
        add("error-responses", "info", `${location} documents no error response (4xx, 5xx or default), so failures are not described.`, location);
      }
      if (Array.isArray(raw.security)) {
        for (const name of securityNames(raw.security)) {
          if (!schemeNames.has(name)) add("security-scheme", "warning", `${location} requires the security scheme "${name}", which the description does not define.`, location);
        }
      }

      const op = described.get(location);
      if (!op || !usable) continue;
      for (const name of templateParameters(template)) {
        if (!op.parameters.some((param) => param.in === "path" && param.name === name)) {
          add("path-parameter-declared", "warning", `${location} uses {${name}}, but no path parameter named "${name}" is declared.`, location);
        }
      }
      for (const param of op.parameters) {
        if (param.example !== null) continue;
        if (param.in === "path") {
          add("parameter-example", "info", `${location}: the ${param.name} path parameter has no example, so the operation runs only when an earlier list response supplies a value.`, location);
        } else if (param.in === "query" && param.required) {
          add("parameter-example", "info", `${location}: the required query parameter "${param.name}" has no example, so the operation is not sent.`, location);
        }
      }
      if (op.isWrite && op.bodySchema && exampleBody(op.bodySchema) === null) {
        add("request-body-example", "info", `${location} needs an example request body, so a write test cannot send one.`, location);
      }
      if (op.isWrite && raw.security === undefined && spec.security === undefined && schemeNames.size > 0) {
        add("write-security", "info", `${location} changes data but has no security requirement, although the description defines security schemes.`, location);
      }
      if (template.split("/").some((segment) => PATH_VERB.test(segment))) {
        add("path-naming", "info", `${location} uses a verb in its path. Name the resource in the path and the action in the HTTP method.`, location);
      }
      if (op.responseSchema && !canValidate(op.responseSchema)) {
        add("response-schema", "warning", `${location}: its success response schema cannot be read, so responses are not checked against it.`, location);
      }
    }
  }

  for (const [id, locations] of operationIds) {
    if (locations.length > 1) add("operation-id-unique", "warning", `operationId "${id}" is used by ${locations.length} operations.`, locations[0]);
  }
  const rank = (finding: SpecFinding): number => (finding.severity === "warning" ? 0 : 1);
  return findings.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_FINDINGS);
}

/** Collapses the parts of a path that vary between requests, so the same endpoint is compared as one call. */
function normalizeSegment(segment: string): string {
  if (/^\d+$/.test(segment) || UUID.test(segment) || /^[0-9a-f]{16,}$/i.test(segment)) return "{id}";
  if (segment.length > MAX_SEGMENT_LENGTH || segment.includes("@")) return "{value}";
  return segment;
}

function normalizePath(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

/**
 * The form a browser request takes in the review: "GET /api/products/{id}". Only the method and the path survive:
 * no query string, headers or body. Null for requests to other sites and for framework paths.
 */
export function observedApiCall(method: string, url: string, origin: URL): string | null {
  const upper = method.toUpperCase();
  if (!BROWSER_METHODS.has(upper)) return null;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return null;
  }
  if (target.origin !== origin.origin) return null;
  if (FRAMEWORK_PATHS.some((prefix) => target.pathname.startsWith(prefix))) return null;
  const path = normalizePath(target.pathname.split("/").map(normalizeSegment).join("/"));
  return `${upper} ${path}`.slice(0, MAX_CALL_LENGTH);
}

function segmentsMatch(observed: string, template: string): boolean {
  const seen = observed.split("/");
  const want = template.split("/");
  return seen.length === want.length && want.every((segment, index) => PARAMETER_SEGMENT.test(segment) || segment === seen[index]);
}

function browserFinding(message: string, call: string): SpecFinding {
  return { source: "browser", rule: "undocumented-call", severity: "info", message, location: call };
}

/**
 * Browser calls the description does not document. Without a description, every call is reported as untested. When the
 * description points at another host, nothing can be matched, so nothing is reported.
 */
export function browserFindings(observed: string[], spec: JsonObject | null, origin: URL): SpecFinding[] {
  if (observed.length === 0) return [];
  if (!spec) {
    return observed.slice(0, MAX_FINDINGS).map((call) => browserFinding(`The page calls ${call}. No API description was found, so the call is not tested.`, call));
  }
  const base = serverBase(spec, origin);
  if (!base || base.origin !== origin.origin) return [];
  const documented = listOperations(spec, origin).map((op) => ({ method: op.method, path: normalizePath(`${op.basePath}${op.template}`) }));
  return observed
    .filter((call) => {
      const space = call.indexOf(" ");
      const method = call.slice(0, space);
      const path = call.slice(space + 1);
      return !documented.some((op) => op.method === method && segmentsMatch(path, op.path));
    })
    .slice(0, MAX_FINDINGS)
    .map((call) => browserFinding(`The page calls ${call} in the browser, but the API description does not document it.`, call));
}
