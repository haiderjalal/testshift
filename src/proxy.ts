import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { contentSecurityPolicy, FORM_BODY_LIMIT, sameOrigin } from "./lib/security";
import { log } from "./lib/log";
import { allow, visitorKey } from "./lib/rateLimit";

export async function proxy(request: NextRequest) {
  const requestId = randomUUID();
  const nonce = randomBytes(18).toString("base64");
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const incoming = new Headers(request.headers);
  incoming.set("x-request-id", requestId);
  incoming.set("x-nonce", nonce);
  incoming.set("Content-Security-Policy", csp);
  let response: NextResponse;
  if (request.method === "POST") {
    const expected = process.env.APP_URL ?? request.nextUrl.origin;
    const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const length = request.headers.get("content-length");
    const status = !sameOrigin(request.headers.get("origin"), expected) ? 403
      : !["multipart/form-data", "application/x-www-form-urlencoded", "text/plain"].includes(type ?? "") ? 415
        : length && (!/^\d+$/.test(length) || Number(length) > FORM_BODY_LIMIT) ? 413 : 0;
    if (status) {
      log("warn", "Request rejected", { requestId, status });
      response = NextResponse.json({ message: "Request rejected.", requestId }, { status });
    } else {
      const visitor = visitorKey(request.headers, process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS === "1");
      const login = request.nextUrl.pathname === "/admin/login";
      const scope = login ? "login" : request.nextUrl.pathname === "/hire" ? "booking"
        : request.nextUrl.pathname === "/custom" ? "quote" : request.nextUrl.pathname === "/admin" ? "admin" : "other";
      const window = login ? 900 : 60;
      try {
        const allowed = await allow(`http:${scope}:${visitor}`, login ? 30 : 60, window);
        response = allowed ? NextResponse.next({ request: { headers: incoming } })
          : NextResponse.json({ message: "Please try again later.", requestId }, { status: 429, headers: { "Retry-After": String(window) } });
        if (!allowed) log("warn", "Request rate limited", { requestId, status: 429 });
      } catch {
        log("error", "Request limiter unavailable", { requestId });
        response = NextResponse.json({ message: "Temporarily unavailable.", requestId }, { status: 503, headers: { "Retry-After": "60" } });
      }
    }
  } else response = NextResponse.next({ request: { headers: incoming } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Request-ID", requestId);
  if (request.method === "POST" || /^\/(admin|runs|repositories)(\/|$)/.test(request.nextUrl.pathname)) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

// The webhook verifies Stripe signatures and streams its own bounded body; it is not browser-origin authenticated.
export const config = { matcher: ["/((?!api/|_next/static/|_next/image|favicon.ico).*)"] };
