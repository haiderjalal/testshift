import { certificateStatus, sendGet, type HttpResponse } from "@/lib/outbound";
import {
  blockedCheck,
  certificateCheck,
  cookieCheck,
  corsCheck,
  disclosureCheck,
  EXPOSED_FILE_PROBES,
  exposedFilesCheck,
  redirectCheck,
  type SecurityCheck,
} from "@/lib/security-checks";

/** Origin no real site uses. A server that echoes it back is reflecting whatever origin asks. */
const CORS_PROBE_ORIGIN = "https://testshift-cors-probe.invalid";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_FOR_CHECKS = 200_000;

export interface SecurityInput {
  siteUrl: string;
  /** Headers of the homepage response the browser already loaded. */
  pageHeaders: Record<string, string>;
  /** Whether the customer has proved control of this host (see src/lib/ownership.ts). */
  verified: boolean;
  until: number;
}

const remaining = (until: number): number => Math.max(1, Math.min(REQUEST_TIMEOUT_MS, until - Date.now()));

/**
 * Passive checks run on any public site: they read what the browser already received, plus one certificate
 * read and one plain-HTTP request. Active checks (sensitive file probes and the cross-origin test) send extra
 * requests, so they run only once the customer has verified the domain.
 */
export async function securityChecks(input: SecurityInput): Promise<SecurityCheck[]> {
  const site = new URL(input.siteUrl);
  const https = site.protocol === "https:";
  const setCookies = (input.pageHeaders["set-cookie"] ?? "").split("\n").map((c) => c.trim()).filter(Boolean);

  const checks: SecurityCheck[] = [
    cookieCheck(setCookies, https),
    disclosureCheck(input.pageHeaders),
    await tlsCheck(site, https),
    await httpRedirectCheck(site),
  ];

  if (!input.verified) {
    checks.push(
      blockedCheck(
        "Sensitive files are not publicly available",
        [`Request well-known sensitive paths on ${site.hostname}`],
        "None of these files can be downloaded.",
      ),
      blockedCheck(
        "Other sites cannot read responses from the site",
        [`Request ${site.hostname} with an Origin header from an unrelated site`],
        "The site does not echo arbitrary origins back.",
      ),
    );
    return checks;
  }

  checks.push(await exposedFiles(site, input.until), await crossOriginCheck(site, input.until));
  return checks;
}

async function tlsCheck(site: URL, https: boolean): Promise<SecurityCheck> {
  if (!https) return certificateCheck({ error: "not HTTPS" }, false);
  try {
    return certificateCheck(await certificateStatus(site.hostname, { timeoutMs: REQUEST_TIMEOUT_MS }), true);
  } catch (e) {
    // The error is a Node certificate code such as CERT_HAS_EXPIRED: safe to show, and it says what failed.
    return certificateCheck({ error: (e as Error).message }, true);
  }
}

async function httpRedirectCheck(site: URL): Promise<SecurityCheck> {
  if (site.protocol !== "https:") return redirectCheck({ status: 200, location: "" });
  const plain = new URL(`http://${site.host}/`);
  try {
    const response = await sendGet(plain, { timeoutMs: REQUEST_TIMEOUT_MS });
    return redirectCheck({ status: response.status, location: response.headers["location"] ?? "" });
  } catch {
    return redirectCheck(null);
  }
}

async function exposedFiles(site: URL, until: number): Promise<SecurityCheck> {
  const found: { path: string; label: string; severity: "critical" | "major" }[] = [];
  let answered = 0;
  for (const probe of EXPOSED_FILE_PROBES) {
    if (Date.now() >= until) break;
    const response = await sendGet(new URL(probe.path, site), { timeoutMs: remaining(until) }).catch(() => null);
    if (!response) continue;
    answered++;
    if (isProbeHit(response, probe)) found.push({ path: probe.path, label: probe.label, severity: probe.severity });
  }
  // If nothing answered, "no files found" would be a false pass.
  if (answered === 0) return notTested("Sensitive files are not publicly available", "The site did not answer the file checks in time.");
  return exposedFilesCheck(found);
}

function notTested(title: string, reason: string): SecurityCheck {
  return { title, passed: null, severity: null, steps: [], expected: "", actual: reason };
}

function isProbeHit(response: HttpResponse, probe: (typeof EXPOSED_FILE_PROBES)[number]): boolean {
  if (response.status !== 200) return false;
  return probe.matches(response.body.slice(0, MAX_RESPONSE_FOR_CHECKS), response.contentType);
}

async function crossOriginCheck(site: URL, until: number): Promise<SecurityCheck> {
  const response = await sendGet(new URL("/", site), {
    timeoutMs: remaining(until),
    headers: { origin: CORS_PROBE_ORIGIN },
  }).catch(() => null);
  if (!response) {
    return notTested("Other sites cannot read responses from the site", "The site did not answer the cross-origin request in time.");
  }
  return corsCheck(CORS_PROBE_ORIGIN, response.headers);
}
