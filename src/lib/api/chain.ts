/**
 * Read-only chaining: a detail call such as GET /products/{id} gets its value from an earlier list call such as
 * GET /products. Only GET responses feed values forward, and the values are only ever used in more GET requests.
 */
import { isObject } from "./openapi";

const LIST_KEYS = ["data", "items", "results", "records"] as const;
const MAX_VALUE_LENGTH = 200;

/** The list endpoint for a detail endpoint: "/products/{id}" with "id" gives "/products". Null otherwise. */
export function listTemplateFor(template: string, param: string): string | null {
  const suffix = `/{${param}}`;
  if (!template.endsWith(suffix)) return null;
  const list = template.slice(0, -suffix.length);
  return list.length > 0 && !list.includes("{") ? list : null;
}

function itemsOf(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (isObject(body)) {
    for (const key of LIST_KEYS) {
      const value = body[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

const scalarText = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length > 0 && value.length <= MAX_VALUE_LENGTH) return value;
  return null;
};

/**
 * A value for the parameter from the first item of a list response: the item's field with the parameter's
 * name if it has one, otherwise its id.
 */
export function valueFromListResponse(body: unknown, param: string): string | null {
  const first = itemsOf(body).find(isObject);
  if (!first) return null;
  return scalarText(first[param]) ?? scalarText(first.id);
}
