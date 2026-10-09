import { z } from "zod";
import { github, githubConfigured, githubId, githubOrigin } from "@/lib/github/api";
import { consumeState, createCustomerSession } from "@/lib/github/session";
import { integrationFailure, integrationRedirect } from "@/lib/github/http";
import { readBoundedBody } from "@/lib/security";

export async function GET(request: Request) {
  if (!githubConfigured()) return integrationRedirect("not-configured");
  try {
    const query = new URL(request.url).searchParams;
    const state = await consumeState(query.get("state"), "login");
    const code = z.string().min(1).max(512).safeParse(query.get("code"));
    if (!state || !code.success) return integrationRedirect("invalid-state");
    const response = await fetch("https://github.com/login/oauth/access_token", { method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET, code: code.data, redirect_uri: `${githubOrigin()}/api/github/callback`, code_verifier: state.verifier }) });
    if (!response.ok) throw new Error("Code exchange failed");
    const body = await readBoundedBody(new Request("https://github.com", { method: "POST", body: response.body, duplex: "half" } as RequestInit), 16_384);
    const access = z.object({ access_token: z.string().min(10).max(1000), expires_in: z.number().int().positive().optional() }).parse(JSON.parse(body));
    const user = z.object({ id: githubId, login: z.string().regex(/^[A-Za-z0-9-]{1,100}$/) }).parse(await github("/user", access.access_token));
    await createCustomerSession(user.id, user.login, access.access_token, access.expires_in ?? 3600);
    return integrationRedirect();
  } catch { return integrationFailure("GitHub sign-in failed"); }
}
