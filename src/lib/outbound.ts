import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

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
}

export interface SendOptions {
  timeoutMs: number;
  /** Override only in tests. Production always resolves through the public-address check. */
  resolve?: (hostname: string) => Promise<string>;
}

/**
 * One read-only HTTP GET. The DNS answer is checked for public addresses, and the connection is pinned to
 * that same address, so a second DNS lookup cannot send it somewhere else. Redirects are not followed.
 */
export async function sendGet(url: URL, options: SendOptions): Promise<HttpResponse> {
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
        method: "GET",
        headers: { accept: "application/json, */*;q=0.5", "user-agent": USER_AGENT },
        timeout: options.timeoutMs,
        // Node asks for every address when connecting with happy-eyeballs; the pinned answer satisfies both forms.
        lookup: (_hostname, lookupOptions, callback) =>
          lookupOptions.all ? callback(null, [{ address, family }]) : callback(null, address, family),
      },
      (res: IncomingMessage) => readBody(res, started, resolve),
    );
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.end();
  });
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
    });
  });
}
