import { NextResponse } from "next/server";
import { githubConfigured, githubOrigin } from "@/lib/github/api";
import { integrationFailure, integrationRedirect, privateHeaders } from "@/lib/github/http";
import { customerSession, startState } from "@/lib/github/session";
import { allow } from "@/lib/rateLimit";
export async function GET() {
  if (!githubConfigured()) return integrationRedirect("not-configured");
  try {
    githubOrigin();
    const customer = await customerSession();
    if (!customer) return integrationRedirect("sign-in");
    if (!(await allow(`github-install:${customer.user_id}`, 10, 600))) return integrationRedirect("rate-limit");
    const { state } = await startState("install", customer.user_id);
    const url = new URL(`https://github.com/apps/${process.env.GITHUB_APP_SLUG}/installations/new`);
    url.searchParams.set("state", state);
    return NextResponse.redirect(url, { headers: privateHeaders });
  } catch { return integrationFailure("GitHub installation unavailable"); }
}
