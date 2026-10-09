/**
 * Reads API descriptions the customer publishes: OpenAPI 3 and Swagger 2, in JSON or YAML. Everything is turned
 * into the OpenAPI 3 shape the rest of the engine reads. Pure: no network.
 */
import { load as loadYaml } from "js-yaml";

import { isObject, type JsonObject } from "./openapi";

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch"] as const;
const SWAGGER_REF_MAP: [string, string][] = [
  ["#/definitions/", "#/components/schemas/"],
  ["#/parameters/", "#/components/parameters/"],
  ["#/responses/", "#/components/responses/"],
];

/** JSON first, then YAML. YAML is parsed with js-yaml's default schema, which runs no code. */
export function parseSpecText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return loadYaml(text);
  }
}

/** Above this many nodes a spec is refused unwalked. YAML aliases let a tiny file expand to billions of nodes
 * (a "billion laughs" bomb); counting visits without de-duplication bounds our own walk and rejects the bomb. */
export const MAX_SPEC_NODES = 200_000;

/** Counts nodes by walking without de-duplication, bailing as soon as the budget is passed. */
export function withinNodeBudget(value: unknown, budget = MAX_SPEC_NODES): boolean {
  const stack: unknown[] = [value];
  let seen = 0;
  while (stack.length > 0) {
    if (++seen > budget) return false;
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
    } else if (isObject(node)) {
      for (const key in node) stack.push(node[key]);
    }
  }
  return true;
}

/** Returns an OpenAPI 3 document, converting Swagger 2 when needed. Null when the input is neither or too large. */
export function normalizeSpec(doc: unknown): JsonObject | null {
  if (!isObject(doc) || !isObject(doc.paths)) return null;
  if (!withinNodeBudget(doc)) return null;
  if (typeof doc.openapi === "string" && /^3\./.test(doc.openapi)) return doc;
  if (doc.swagger === "2.0") return swagger2ToOpenApi(doc);
  return null;
}

function rewriteRefs<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => rewriteRefs(item)) as T;
  if (!isObject(value)) return value;
  const out: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "$ref" && typeof child === "string") {
      const mapped = SWAGGER_REF_MAP.find(([from]) => child.startsWith(from));
      out[key] = mapped ? mapped[1] + child.slice(mapped[0].length) : child;
    } else {
      out[key] = rewriteRefs(child);
    }
  }
  return out as T;
}

function swagger2ToOpenApi(doc: JsonObject): JsonObject {
  const schemes = Array.isArray(doc.schemes) ? doc.schemes.filter((s): s is string => typeof s === "string") : [];
  const scheme = schemes.includes("https") || schemes.length === 0 ? "https" : schemes[0];
  const host = typeof doc.host === "string" ? doc.host : "";
  const basePath = typeof doc.basePath === "string" ? doc.basePath : "";
  const servers = host ? [{ url: `${scheme}://${host}${basePath}` }] : [];

  const sharedParams = Array.isArray(doc.parameters) ? doc.parameters : [];
  const paths: JsonObject = {};
  for (const [template, item] of Object.entries(isObject(doc.paths) ? doc.paths : {})) {
    if (!isObject(item)) continue;
    const converted: JsonObject = {};
    for (const method of METHODS) {
      const operation = item[method];
      if (!isObject(operation)) continue;
      converted[method] = convertOperation(operation, sharedParams);
    }
    paths[template] = converted;
  }

  return rewriteRefs({
    openapi: "3.0.0",
    info: isObject(doc.info) ? doc.info : {},
    servers,
    paths,
    components: {
      schemas: isObject(doc.definitions) ? doc.definitions : {},
      parameters: isObject(doc.parameters) ? doc.parameters : {},
      responses: isObject(doc.responses) ? doc.responses : {},
    },
  });
}

function convertOperation(operation: JsonObject, sharedParams: unknown[]): JsonObject {
  const parameters: unknown[] = [];
  let requestBody: JsonObject | undefined;
  for (const raw of [...sharedParams, ...(Array.isArray(operation.parameters) ? operation.parameters : [])]) {
    if (!isObject(raw)) continue;
    if (typeof raw.$ref === "string") {
      parameters.push(raw);
      continue;
    }
    if (raw.in === "body") {
      requestBody = {
        required: raw.required === true,
        content: { "application/json": { schema: isObject(raw.schema) ? raw.schema : {} } },
      };
      continue;
    }
    parameters.push({
      name: raw.name,
      in: raw.in,
      required: raw.required === true,
      schema: { type: raw.type, format: raw.format, default: raw.default, enum: raw.enum, items: raw.items },
    });
  }

  const responses: JsonObject = {};
  for (const [code, response] of Object.entries(isObject(operation.responses) ? operation.responses : {})) {
    if (!isObject(response)) continue;
    if (typeof response.$ref === "string") {
      responses[code] = response;
      continue;
    }
    responses[code] = {
      description: typeof response.description === "string" ? response.description : "",
      ...(isObject(response.schema) ? { content: { "application/json": { schema: response.schema } } } : {}),
    };
  }

  return {
    ...(requestBody ? { requestBody } : {}),
    parameters,
    responses,
  };
}
