import { NextResponse } from "next/server";
import { log } from "../log";
import { appUrl } from "../email";
export const privateHeaders = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
export function integrationRedirect(code?: string) {
  const url = new URL("/repositories", appUrl());
  if (code) url.searchParams.set("notice", code);
  return NextResponse.redirect(url, { status: 303, headers: privateHeaders });
}
export function integrationFailure(event: string) {
  log("error", event, { requestId: crypto.randomUUID() });
  return integrationRedirect("github-unavailable");
}
