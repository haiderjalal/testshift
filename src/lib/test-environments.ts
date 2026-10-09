/**
 * Approved test environments. Load and write tests run only where the operator has approved a host for that kind of
 * test AND the customer has verified the domain. Both checks happen here, so no caller can skip one.
 */
import { db } from "./db";
import { isSiteVerified } from "./ownership";

export type EnvironmentCapability = "load" | "writes";

export type EnvironmentCheck =
  | { ok: true; maxRequests: number; maxRps: number; maxConcurrency: number }
  | { ok: false; reason: string };

export async function checkTestEnvironment(siteUrl: string, capability: EnvironmentCapability): Promise<EnvironmentCheck> {
  const host = new URL(siteUrl).hostname;
  const [environment] = await db()<{
    load_allowed: boolean;
    writes_allowed: boolean;
    max_requests: number;
    max_rps: number;
    max_concurrency: number;
  }[]>`
    select load_allowed, writes_allowed, max_requests, max_rps, max_concurrency
    from test_environments where host = ${host} and expires_at > now()`;
  if (!environment) {
    return { ok: false, reason: capability === "load" ? "Load tests run only on approved test environments. This site does not have one." : "Changes data. Write tests run only on approved test environments." };
  }
  const allowed = capability === "load" ? environment.load_allowed : environment.writes_allowed;
  if (!allowed) {
    return { ok: false, reason: capability === "load" ? "This site's test environment is not approved for load tests." : "Changes data. This site's test environment is not approved for write tests." };
  }
  if (!(await isSiteVerified(host))) {
    return { ok: false, reason: "Verify domain ownership before this test can run." };
  }
  return { ok: true, maxRequests: environment.max_requests, maxRps: environment.max_rps, maxConcurrency: environment.max_concurrency };
}
