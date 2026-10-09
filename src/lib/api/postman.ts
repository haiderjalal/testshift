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

  const endpoints: PostmanEndpoint[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const request of requestsIn(parsed.item)) {
    const method = typeof request.method === "string" ? request.method.toUpperCase() : "GET";
    const raw = rawUrl(request.url);
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
