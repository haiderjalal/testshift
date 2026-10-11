/**
 * Postman collections, reduced to what the API engine needs: each request's method and path on this site.
 * Collections often hold secrets, so headers, auth, variables, bodies and query strings are never kept.
 */
import { isObject, type JsonObject } from "./openapi";

export const MAX_COLLECTION_CHARS = 500_000;
const MAX_ENDPOINTS = 60;
const MAX_PATH_LENGTH = 500;
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

export interface PostmanEndpoint {
  method: string;
  /** Path only, starting with "/". */
  path: string;
}

export interface PostmanImport {
  endpoints: PostmanEndpoint[];
  /** Requests that could not be used, with the reason (for example Postman variables in the URL). */
  skipped: number;
}

/** Postman's own URL object or a raw string; only the raw form is used, and only when it is concrete. */
function rawUrl(url: unknown): string | null {
  if (typeof url === "string") return url;
  if (isObject(url) && typeof url.raw === "string") return url.raw;
  return null;
}

/** Postman's `{{baseUrl}}` prefix, which collections use for the site the requests are sent to. */
const BASE_VARIABLE = /^\{\{\s*([A-Za-z_][\w.-]*)\s*\}\}(?=\/|$)/;

/** The collection's own variables, text values only. They are read to find the site, never stored. */
function collectionVariables(value: unknown): Map<string, string> {
  const variables = new Map<string, string>();
  for (const entry of Array.isArray(value) ? value : []) {
    if (isObject(entry) && typeof entry.key === "string" && typeof entry.value === "string") variables.set(entry.key, entry.value);
  }
  return variables;
}

/**
 * Replaces a leading `{{baseUrl}}` with the collection's value for it, but only when that value is an address on the
 * site being tested. Any other variable is left in place, so the request is skipped as before.
 */
function resolveBaseVariable(raw: string | null, variables: Map<string, string>, site: URL): string | null {
  const match = raw?.match(BASE_VARIABLE);
  if (!raw || !match) return raw;
  const value = variables.get(match[1]);
  if (value === undefined) return raw;
  let base: URL;
  try {
    base = new URL(value);
  } catch {
    return raw;
  }
  if (base.origin !== site.origin || base.username || base.password) return raw;
  return `${base.origin}${base.pathname.replace(/\/$/, "")}${raw.slice(match[0].length)}`;
}

/** Folders nest under `item`; requests sit under `request`. */
function* requestsIn(items: unknown[]): Generator<JsonObject> {
  for (const item of items) {
    if (!isObject(item)) continue;
    if (Array.isArray(item.item)) yield* requestsIn(item.item);
    if (isObject(item.request)) yield item.request;
  }
}

/** Reads a Postman collection (v2.x) and keeps the request methods and paths that belong to this site. */
export function importPostmanEndpoints(text: string, site: URL): PostmanImport {
  if (text.length > MAX_COLLECTION_CHARS) throw new Error("collection too large");
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed) || !Array.isArray(parsed.item)) throw new Error("not a Postman collection");

  const variables = collectionVariables(parsed.variable);
  const endpoints: PostmanEndpoint[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const request of requestsIn(parsed.item)) {
    const method = typeof request.method === "string" ? request.method.toUpperCase() : "GET";
    const raw = resolveBaseVariable(rawUrl(request.url), variables, site);
    if (!METHODS.has(method) || !raw || raw.includes("{{")) {
      skipped++;
      continue;
    }
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      skipped++;
      continue;
    }
    if (url.origin !== site.origin || url.username || url.password) {
      skipped++;
      continue;
    }
    const path = url.pathname.slice(0, MAX_PATH_LENGTH);
    // A path must be a single leading slash: "//host/x" would resolve to another origin when joined later.
    if (!/^\/(?!\/)/.test(path)) {
      skipped++;
      continue;
    }
    const key = `${method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (endpoints.length >= MAX_ENDPOINTS) {
      skipped++;
      continue;
    }
    endpoints.push({ method, path });
  }
  return { endpoints, skipped };
}
