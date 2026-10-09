import { NextResponse } from "next/server";
import { githubConfigured, githubOrigin } from "@/lib/github/api";
import { pkceChallenge } from "@/lib/github/crypto";
import { integrationFailure, integrationRedirect, privateHeaders } from "@/lib/github/http";
import { startState } from "@/lib/github/session";
import { allow, clientKey } from "@/lib/rateLimit";

export async function GET() {
  if (!githubConfigured()) return integrationRedirect("not-configured");
  try {
    if (!(await allow(`github-auth:${await clientKey()}`, 10, 600))) return integrationRedirect("rate-limit");
    const { state, verifier } = await startState("login");
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID!, redirect_uri: `${githubOrigin()}/api/github/callback`,
      state, code_challenge: pkceChallenge(verifier), code_challenge_method: "S256" }).toString();
    return NextResponse.redirect(url, { headers: privateHeaders });
  } catch { return integrationFailure("GitHub sign-in unavailable"); }
}
