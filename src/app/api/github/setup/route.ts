import { githubConfigured, githubId, userInstallations } from "@/lib/github/api";
import { integrationFailure, integrationRedirect } from "@/lib/github/http";
import { consumeState, customerSession, customerToken } from "@/lib/github/session";
export async function GET(request: Request) {
  if (!githubConfigured()) return integrationRedirect("not-configured");
  try {
    const query = new URL(request.url).searchParams;
    const state = await consumeState(query.get("state"), "install");
    const customer = await customerSession();
    const id = githubId.safeParse(query.get("installation_id"));
    if (!state || !customer || state.user_id !== customer.user_id || !id.success) return integrationRedirect("invalid-state");
    const installation = (await userInstallations(customerToken(customer))).find((item) => item.id === id.data);
    if (!installation) return integrationRedirect("access-denied");
    // No installation is bound to a tenant by an unverified query parameter.
    return integrationRedirect("installed");
  } catch { return integrationFailure("GitHub installation verification failed"); }
}
