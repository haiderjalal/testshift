/** Shared request controls; no credentials or customer data in errors. */
export const FORM_BODY_LIMIT = 32 * 1024;
export const WEBHOOK_BODY_LIMIT = 256 * 1024;

export class RequestError extends Error {
  constructor(public status: number) { super("Request rejected."); }
}

export function sameOrigin(origin: string | null, expected: string): boolean {
  try { return origin !== null && origin === new URL(origin).origin && new URL(origin).origin === new URL(expected).origin; }
  catch { return false; }
}

export function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

/** Local disposable databases use loopback; remote production databases must verify TLS certificates. */
export function databaseTls(url: string, production: boolean): false | { rejectUnauthorized: true } | undefined {
  const host = new URL(url).hostname;
  if (["localhost", "127.0.0.1", "[::1]"].includes(host)) return false;
  return production ? { rejectUnauthorized: true } : undefined;
}

export function validForm(data: FormData): boolean {
  let bytes = 0;
  const names = new Set<string>();
  for (const [key, value] of data) {
    if (typeof value !== "string" || names.has(key)) return false;
    names.add(key);
    bytes += Buffer.byteLength(key) + Buffer.byteLength(value);
    if (bytes > FORM_BODY_LIMIT) return false;
  }
  return true;
}

/** Read raw bytes (not parsed JSON) so Stripe can verify the exact signed payload. */
export async function readBoundedBody(request: Request, limit: number, timeoutMs = 5_000): Promise<string> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new RequestError(413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new RequestError(408)); void reader.cancel().catch(() => undefined); }, timeoutMs);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => undefined); throw new RequestError(413); }
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

export function contentSecurityPolicy(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // React animation components use style attributes. Script execution remains nonce restricted.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self'", "connect-src 'self'",
    "media-src 'self'", "worker-src 'self' blob:", "frame-src 'none'",
    "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'",
    "form-action 'self' https://checkout.stripe.com",
  ].join("; ");
}
