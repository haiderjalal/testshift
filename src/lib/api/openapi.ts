/** OpenAPI 3.x helpers. Pure: no network, so the rules can be tested directly. */

export type JsonObject = Record<string, unknown>;

const METHODS = ["get", "head", "post", "put", "patch", "delete"] as const;
/** Only read-only methods run before the domain-ownership check exists. Everything else is reported as skipped. */
const SAFE_METHODS = new Set(["GET", "HEAD"]);
const MAX_REF_DEPTH = 8;

export interface ApiOperation {
  method: string;
  /** Path as written in the spec, e.g. /products/{id}. */
  template: string;
  /** Path with example values filled in, including any base path from the spec's servers. */
  requestPath: string;
  /** Documented success codes, e.g. ["200", "2XX"]. Empty when the spec documents none. */
  successStatuses: string[];
  /** JSON schema of the first documented success response, or null. Carries `components` for $ref resolution. */
  responseSchema: JsonObject | null;
  /** Why this operation must not be sent. Null when it is safe to run now. */
  blockedReason: string | null;
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function isOpenApiDocument(value: unknown): value is JsonObject {
  return isObject(value) && typeof value.openapi === "string" && /^3\./.test(value.openapi) && isObject(value.paths);
}

/** Follows local `#/...` references only. External references are never fetched. */
export function deref(spec: JsonObject, value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < MAX_REF_DEPTH && isObject(current) && typeof current.$ref === "string"; depth++) {
    const ref = current.$ref;
    if (!ref.startsWith("#/")) return undefined;
    current = ref
      .slice(2)
      .split("/")
      .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
      .reduce<unknown>((node, key) => (isObject(node) ? node[key] : undefined), spec);
  }
  return current;
}

/** The base URL the spec says its operations live under, resolved against the site it was found on. */
export function serverBase(spec: JsonObject, origin: URL): URL | null {
  const first = asArray(spec.servers)[0];
  const url = isObject(first) && typeof first.url === "string" ? first.url : "/";
  try {
    return new URL(url, origin);
  } catch {
    return null;
  }
}

function exampleOf(spec: JsonObject, param: JsonObject): string | undefined {
  const schema = deref(spec, param.schema);
  const schemaObject: JsonObject = isObject(schema) ? schema : {};
  const candidates = [param.example, schemaObject.example, schemaObject.default, asArray(schemaObject.enum)[0]];
  const found = candidates.find((value) => value !== undefined && value !== null);
  if (found === undefined) return undefined;
  return typeof found === "object" ? JSON.stringify(found) : String(found);
}

/** Fills path parameters with examples. Returns a reason when a required value is missing. */
function fillParameters(spec: JsonObject, template: string, params: unknown[]): { path: string; blockedReason: string | null } {
  let path = template;
  for (const raw of params) {
    const param = deref(spec, raw);
    if (!isObject(param) || typeof param.name !== "string") continue;
    const value = exampleOf(spec, param);
    const required = param.in === "path" || param.required === true;
    if (value === undefined) {
      if (required) return { path, blockedReason: `Needs an example value for the ${String(param.in)} parameter "${param.name}"` };
      continue;
    }
    if (param.in === "path") path = path.replace(`{${param.name}}`, encodeURIComponent(value));
  }
  return { path, blockedReason: null };
}

function successSchema(spec: JsonObject, responses: JsonObject, codes: string[]): JsonObject | null {
  const code = codes.find((c) => c === "200") ?? codes[0];
  const response = deref(spec, code ? responses[code] : undefined);
  if (!isObject(response) || !isObject(response.content)) return null;
  const media = deref(spec, response.content["application/json"]);
  const schema = isObject(media) ? deref(spec, media.schema) : undefined;
  return isObject(schema) ? { ...schema, components: spec.components ?? {} } : null;
}

export function describeOperation(
  spec: JsonObject,
  base: URL,
  origin: URL,
  template: string,
  method: string,
  operation: JsonObject,
  params: unknown[],
): ApiOperation {
  const responses = isObject(operation.responses) ? operation.responses : {};
  const successStatuses = Object.keys(responses).filter((code) => /^(2\d\d|2XX)$/i.test(code));
  const filled = fillParameters(spec, template, params);
  const requestPath = `${base.pathname.replace(/\/$/, "")}${filled.path}`;
  const body = deref(spec, operation.requestBody);
  const bodyRequired = isObject(body) && body.required === true;

  let blockedReason: string | null = filled.blockedReason;
  if (base.origin !== origin.origin) blockedReason = "The spec points to a different host, so it is not tested from this site";
  else if (!SAFE_METHODS.has(method)) blockedReason = "Changes data. Write tests are not enabled yet.";
  else if (bodyRequired) blockedReason = "Needs a request body";

  return {
    method,
    template,
    requestPath,
    successStatuses,
    responseSchema: successSchema(spec, responses, successStatuses),
    blockedReason,
  };
}

/** Every operation in the spec, each either ready to run or marked with the reason it must be skipped. */
export function listOperations(spec: JsonObject, origin: URL): ApiOperation[] {
  const base = serverBase(spec, origin);
  const operations: ApiOperation[] = [];
  const paths = isObject(spec.paths) ? spec.paths : {};
  for (const [template, item] of Object.entries(paths)) {
    if (!isObject(item)) continue;
    const shared = asArray(item.parameters);
    for (const method of METHODS) {
      const operation = item[method];
      if (!isObject(operation)) continue;
      const upper = method.toUpperCase();
      if (!base) {
        operations.push({ method: upper, template, requestPath: template, successStatuses: [], responseSchema: null, blockedReason: "The spec's server URL is not valid" });
        continue;
      }
      operations.push(describeOperation(spec, base, origin, template, upper, operation, [...shared, ...asArray(operation.parameters)]));
    }
  }
  return operations;
}
