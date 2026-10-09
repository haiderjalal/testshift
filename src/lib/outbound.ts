import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { connect as tlsConnect } from "node:tls";

import { isPrivateIp } from "./net";

/** Largest response body we read. Anything bigger is cut off and flagged, never buffered in full. */
export const MAX_RESPONSE_BYTES = 1_000_000;
const DNS_TIMEOUT_MS = 5_000;
const USER_AGENT = "TestShift-Checker/1.0";

/** DNS validation and the connection use the SAME address, closing the check/resolve rebinding gap. */
export async function resolvePublicAddress(hostname: string): Promise<string> {
  const host = hostname.replace(/^\[|\]$/g, "");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = isIP(host) ? [{ address: host }] : await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DNS timeout")), DNS_TIMEOUT_MS); }),
    ]);
    if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) throw new Error("Non-public destination refused");
    return addresses[0].address;
  } finally { clearTimeout(timer); }
}

export interface HttpResponse {
  status: number;
  contentType: string;
  body: string;
  latencyMs: number;
  /** True when the body was larger than MAX_RESPONSE_BYTES. */
  truncated: boolean;
  /** Lower-case header names. Repeated headers (Set-Cookie) are joined with newlines. */
  headers: Record<string, string>;
}

export interface SendOptions {
  timeoutMs: number;
  /** Extra request headers, e.g. an Origin for a cross-origin check. Never credentials. */
  headers?: Record<string, string>;
  /** Override only in tests. Production always resolves through the public-address check. */
  resolve?: (hostname: string) => Promise<string>;
}

export type RequestMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Largest JSON body we send. Example bodies from an API description are small by nature. */
export const MAX_REQUEST_BODY_BYTES = 16_000;

export interface RequestOptions extends SendOptions {
  method?: RequestMethod;
  /** A JSON document, already serialised. */
  body?: string;
}

/**
 * One HTTP request. The DNS answer is checked for public addresses, and the connection is pinned to that same
 * address, so a second DNS lookup cannot send it somewhere else. Redirects are not followed.
 */
export async function sendRequest(url: URL, options: RequestOptions): Promise<HttpResponse> {
  if (options.body !== undefined && Buffer.byteLength(options.body) > MAX_REQUEST_BODY_BYTES) throw new Error("Request body too large");
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported protocol");
  if (url.username || url.password) throw new Error("Credentials in URL are refused");
  const address = await (options.resolve ?? resolvePublicAddress)(url.hostname);
  const family = isIP(address) === 6 ? 6 : 4;
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  const started = performance.now();

  return new Promise<HttpResponse>((resolve, reject) => {
    const req = send(
      url,
      {
        method: options.method ?? "GET",
        headers: {
          accept: "application/json, */*;q=0.5",
          "user-agent": USER_AGENT,
          ...(options.body !== undefined ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(options.body)) } : {}),
          ...options.headers,
        },
        timeout: options.timeoutMs,
        // Node asks for every address when connecting with happy-eyeballs; the pinned answer satisfies both forms.
        lookup: (_hostname, lookupOptions, callback) =>
          lookupOptions.all ? callback(null, [{ address, family }]) : callback(null, address, family),
      },
      (res: IncomingMessage) => readBody(res, started, resolve),
    );
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

/** A read-only GET, sent with the same checks as every request. */
export function sendGet(url: URL, options: SendOptions): Promise<HttpResponse> {
  return sendRequest(url, { ...options, method: "GET" });
}

function flattenHeaders(raw: IncomingMessage["headers"]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw).map(([name, value]) => [name, Array.isArray(value) ? value.join("\n") : String(value ?? "")]),
  );
}

function readBody(res: IncomingMessage, started: number, resolve: (value: HttpResponse) => void): void {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  res.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size <= MAX_RESPONSE_BYTES) chunks.push(chunk);
    else if (!truncated) {
      truncated = true;
      res.destroy();
    }
  });
  res.on("error", () => undefined);
  res.on("close", () => {
    resolve({
      status: res.statusCode ?? 0,
      contentType: String(res.headers["content-type"] ?? ""),
      body: Buffer.concat(chunks).toString("utf8"),
      latencyMs: performance.now() - started,
      truncated,
      headers: flattenHeaders(res.headers),
    });
  });
}

export interface CertificateStatus {
  /** When the certificate stops being valid. */
  validTo: Date;
  daysLeft: number;
}

/**
 * Reads the site's TLS certificate over the same public address the check validated. Node's own verification
 * runs too, so an untrusted, expired or mismatched certificate fails here with its error code.
 */
export async function certificateStatus(hostname: string, options: { timeoutMs: number }): Promise<CertificateStatus> {
  const address = await resolvePublicAddress(hostname);
  return new Promise<CertificateStatus>((resolve, reject) => {
    const socket = tlsConnect({ host: address, port: 443, servername: hostname, rejectUnauthorized: true }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.valid_to) {
        reject(new Error("NO_CERTIFICATE"));
        return;
      }
      const validTo = new Date(cert.valid_to);
      resolve({ validTo, daysLeft: Math.floor((validTo.getTime() - Date.now()) / 86_400_000) });
    });
    socket.setTimeout(options.timeoutMs, () => socket.destroy(new Error("TLS_TIMEOUT")));
    socket.on("error", (error: NodeJS.ErrnoException) => reject(new Error(error.code ?? "TLS_ERROR")));
  });
}
