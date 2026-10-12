/** OpenAPI 3.x helpers. Pure: no network, so the rules can be tested directly. */

export type JsonObject = Record<string, unknown>;

/** The reason given when a path parameter has no example. Chaining may still supply it from earlier responses. */
export const MISSING_EXAMPLE_REASON = "Needs an example value";

const METHODS = ["get", "head", "post", "put", "patch", "delete"] as const;
/** Only read-only methods run before the domain-ownership check exists. Everything else is reported as skipped. */
const SAFE_METHODS = new Set(["GET", "HEAD"]);
const MAX_REF_DEPTH = 8;

/** A parameter the description declares, with the value the engine would use for it. */
export interface ApiParameter {
  name: string;
  /** Headers and cookies are only checked for examples; the engine never sends them. */
  in: "path" | "query" | "header" | "cookie";
  /** JSON type from the schema, e.g. "integer". Null when the description gives none. */
  type: string | null;
  required: boolean;
  /** The description's example, or null. Path values are always filled in; required query values are sent too. */
  example: string | null;
}

export interface ApiOperation {
  method: string;
  /** Path as written in the spec, e.g. /products/{id}. */
  template: string;
  /** The server's path prefix, e.g. "/api". Empty when the description serves from the site root. */
  basePath: string;
  /** Path with example values filled in, including the base path and any required query values. */
  requestPath: string;
  /** Every path and query parameter the operation declares, with the value the engine would use. */
  parameters: ApiParameter[];
  /** Documented success codes, e.g. ["200", "2XX"]. Empty when the spec documents none. */
  successStatuses: string[];
  /** JSON schema of the first documented success response, or null. Carries `components` for $ref resolution. */
  responseSchema: JsonObject | null;
  /** Why this operation must not be sent. Null when it is safe to run now. */
  blockedReason: string | null;
  /** Path parameters still unfilled, so a read-only chain can supply them from an earlier list response. */
  missingPathParams: string[];
  /** True for POST, PUT, PATCH and DELETE. Whether they run is decided by the test environment, not here. */
  isWrite: boolean;
  /** The request body schema for writes, with components for $ref resolution. Null when there is none. */
  bodySchema: JsonObject | null;
  /** True when the description requires credentials for every way of calling the operation. */
  requiresAuth: boolean;
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

/** The first non-null JSON type of a schema, so `["string", "null"]` (OpenAPI 3.1) reads as "string". */
function typeOf(schema: JsonObject): string | null {
  const type = Array.isArray(schema.type) ? schema.type.find((t) => typeof t === "string" && t !== "null") : schema.type;
  return typeof type === "string" ? type : null;
}

/**
 * The base URL the operations live under. A spec may list several servers (staging and production, say): the one on
 * the site being tested is used, otherwise the first valid one. Null only when no server URL is usable.
 */
export function serverBase(spec: JsonObject, origin: URL): URL | null {
  const urls = asArray(spec.servers).map((server) => (isObject(server) && typeof server.url === "string" ? server.url : "/"));
  if (urls.length === 0) urls.push("/");
  const resolved: URL[] = [];
  for (const url of urls) {
    try {
      resolved.push(new URL(url, origin));
    } catch {
      // An unusable server URL is ignored when another server can be used.
    }
  }
  return resolved.find((base) => base.origin === origin.origin) ?? resolved[0] ?? null;
}

function exampleOf(spec: JsonObject, param: JsonObject): string | undefined {
  const schema = deref(spec, param.schema);
  const schemaObject: JsonObject = isObject(schema) ? schema : {};
  const candidates = [param.example, schemaObject.example, schemaObject.default, asArray(schemaObject.enum)[0]];
  const found = candidates.find((value) => value !== undefined && value !== null);
  if (found === undefined) return undefined;
  return typeof found === "object" ? JSON.stringify(found) : String(found);
}

/**
 * The operation's parameters, with its own entries replacing shared path-level ones of the same name and location.
 * The operation's own list comes last, so it wins.
 */
function collectParameters(spec: JsonObject, raws: unknown[]): ApiParameter[] {
  const byKey = new Map<string, ApiParameter>();
  for (const raw of raws) {
    const param = deref(spec, raw);
    if (!isObject(param) || typeof param.name !== "string") continue;
    const location = param.in;
    if (location !== "path" && location !== "query" && location !== "header" && location !== "cookie") continue;
    const schema = deref(spec, param.schema);
    byKey.set(`${location}:${param.name}`, {
      name: param.name,
      in: location,
      type: isObject(schema) ? typeOf(schema) : null,
      required: location === "path" || param.required === true,
      example: exampleOf(spec, param) ?? null,
    });
  }
  return [...byKey.values()];
}

/** Fills path parameters with examples. Returns a reason when a required value is missing. */
function fillParameters(template: string, parameters: ApiParameter[]): { path: string; blockedReason: string | null } {
  let path = template;
  for (const param of parameters) {
    if (param.example === null) {
      if (param.required) return { path, blockedReason: `${MISSING_EXAMPLE_REASON} for the ${param.in} parameter "${param.name}"` };
      continue;
    }
    if (param.in === "path") path = path.replace(`{${param.name}}`, encodeURIComponent(param.example));
  }
  return { path, blockedReason: null };
}

/** Required query parameters with examples are sent. Optional ones are left to the API's own defaults. */
function queryString(parameters: ApiParameter[]): string {
  const search = new URLSearchParams();
  for (const param of parameters) {
    if (param.in === "query" && param.required && param.example !== null) search.append(param.name, param.example);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

function successSchema(spec: JsonObject, responses: JsonObject, codes: string[]): JsonObject | null {
  const code = codes.find((c) => c === "200") ?? codes[0];
  const response = deref(spec, code ? responses[code] : undefined);
  if (!isObject(response) || !isObject(response.content)) return null;
  const media = deref(spec, response.content["application/json"]);
  const schema = isObject(media) ? deref(spec, media.schema) : undefined;
  return isObject(schema) ? { ...schema, components: spec.components ?? {} } : null;
}

/** The JSON body schema of an operation, resolved against the spec's components. */
function requestBodySchema(spec: JsonObject, requestBody: unknown): JsonObject | null {
  const body = deref(spec, requestBody);
  const media = isObject(body) && isObject(body.content) ? deref(spec, body.content["application/json"]) : undefined;
  const schema = isObject(media) ? deref(spec, media.schema) : undefined;
  return isObject(schema) ? { ...schema, components: spec.components ?? {} } : null;
}

/**
 * Whether anonymous calls are refused by the description. The operation's own `security` replaces the spec-wide list,
 * an empty list makes it public, and an empty requirement object (`{}`) allows anonymous calls as an alternative.
 */
export function requiresCredentials(spec: JsonObject, operation: JsonObject): boolean {
  const requirements = Array.isArray(operation.security) ? operation.security : asArray(spec.security);
  return requirements.length > 0 && !requirements.some((requirement) => isObject(requirement) && Object.keys(requirement).length === 0);
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
  const parameters = collectParameters(spec, params);
  const filled = fillParameters(template, parameters);
  const basePath = base.pathname.replace(/\/$/, "");

  let blockedReason: string | null = filled.blockedReason;
  if (base.origin !== origin.origin) blockedReason = "The spec points to a different host, so it is not tested from this site";

  return {
    method,
    template,
    basePath,
    requestPath: `${basePath}${filled.path}${queryString(parameters)}`,
    parameters,
    successStatuses,
    responseSchema: successSchema(spec, responses, successStatuses),
    missingPathParams: [...filled.path.matchAll(/{([^{}]+)}/g)].map((match) => match[1]),
    isWrite: !SAFE_METHODS.has(method),
    bodySchema: requestBodySchema(spec, operation.requestBody),
    requiresAuth: requiresCredentials(spec, operation),
    blockedReason,
  };
}

function unusableOperation(method: string, template: string): ApiOperation {
  return {
    method,
    template,
    basePath: "",
    requestPath: template,
    parameters: [],
    successStatuses: [],
    responseSchema: null,
    blockedReason: "The spec's server URL is not valid",
    missingPathParams: [],
    isWrite: false,
    bodySchema: null,
    requiresAuth: false,
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
        operations.push(unusableOperation(upper, template));
        continue;
      }
      operations.push(describeOperation(spec, base, origin, template, upper, operation, [...shared, ...asArray(operation.parameters)]));
    }
  }
  return operations;
}
