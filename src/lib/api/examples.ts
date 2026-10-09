/** Request bodies for write tests, built only from examples the API description itself states. Pure. */
import { deref, isObject, type JsonObject } from "./openapi";

const MAX_PROPERTIES = 30;

/**
 * A body from the schema's own examples: the schema's example, or each property's example, default or first enum
 * value. A required property with none of these means no body is built. Null then means: do not send a guess.
 */
export function exampleBody(schema: JsonObject): JsonObject | null {
  const root = deref(schema, schema);
  if (!isObject(root)) return null;
  if (isObject(root.example)) return root.example;

  const required = new Set(Array.isArray(root.required) ? root.required.filter((r): r is string => typeof r === "string") : []);
  const properties = isObject(root.properties) ? Object.entries(root.properties).slice(0, MAX_PROPERTIES) : [];
  const body: JsonObject = {};
  for (const [name, raw] of properties) {
    const property = deref(schema, raw);
    const value = isObject(property)
      ? property.example ?? property.default ?? (Array.isArray(property.enum) ? property.enum[0] : undefined)
      : undefined;
    if (value === undefined) {
      if (required.has(name)) return null;
      continue;
    }
    body[name] = value as JsonObject[string];
  }
  for (const name of required) if (!(name in body)) return null;
  return body;
}
