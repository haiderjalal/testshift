/** Security rules for the Principal review. Pure: the requests are made in worker/security.ts. */

import type { CertificateStatus } from "./outbound";

export type SecuritySeverity = "critical" | "major" | "minor";

export interface SecurityCheck {
  title: string;
  /** null means blocked: the check did not run, and `actual` says why. */
  passed: boolean | null;
  severity: SecuritySeverity | null;
  steps: string[];
  expected: string;
  actual: string;
}

const MAX_LISTED = 5;
const list = (items: string[]): string => items.slice(0, MAX_LISTED).join("; ") + (items.length > MAX_LISTED ? `; and ${items.length - MAX_LISTED} more` : "");

/** Cookie names only: values can be session secrets, so they never reach the report. */
export function cookieCheck(setCookies: string[], https: boolean): SecurityCheck {
  const title = "Cookies set by the homepage use Secure, HttpOnly and SameSite";
  const steps = ["Open the homepage", "Read the Set-Cookie headers of the response"];
  const expected = "Every cookie has the attributes its purpose needs.";
  if (setCookies.length === 0) {
    return { title, passed: true, severity: null, steps, expected, actual: "The homepage set no cookies." };
  }
  const problems: string[] = [];
  let insecure = false;
  for (const raw of setCookies) {
    const name = raw.split("=")[0]?.trim() || "(unnamed)";
    const attributes = raw.toLowerCase();
    if (https && !/;\s*secure\b/.test(attributes)) {
      problems.push(`${name} lacks Secure`);
      insecure = true;
    }
    if (!/;\s*httponly\b/.test(attributes)) problems.push(`${name} lacks HttpOnly`);
    if (!/;\s*samesite=/.test(attributes)) problems.push(`${name} lacks SameSite`);
  }
  if (problems.length === 0) {
    return { title, passed: true, severity: null, steps, expected, actual: `${setCookies.length} cookie(s) use all three attributes.` };
  }
  return { title, passed: false, severity: insecure ? "major" : "minor", steps, expected, actual: list(problems) };
}

/** Version numbers in the Server header and X-Powered-By tell attackers which exploits to try. */
export function disclosureCheck(headers: Record<string, string>): SecurityCheck {
  const problems: string[] = [];
  const server = headers["server"] ?? "";
  if (/\d+\.\d+/.test(server)) problems.push(`Server header shows a version (${server})`);
  if (headers["x-powered-by"]) problems.push(`X-Powered-By is set (${headers["x-powered-by"]})`);
  return {
    title: "Server does not reveal software versions",
    passed: problems.length === 0,
    severity: problems.length ? "minor" : null,
    steps: ["Open the homepage", "Read the Server and X-Powered-By headers"],
    expected: "No software name or version is shown to visitors.",
    actual: problems.length ? list(problems) : "No version information in the response headers.",
  };
}

/** Certificate trust and expiry. Node already verified the chain; the error code says what failed. */
export function certificateCheck(result: CertificateStatus | { error: string }, https: boolean): SecurityCheck {
  const title = "The site uses HTTPS with a trusted, unexpired certificate";
  const steps = ["Open the site over HTTPS", "Read the TLS certificate and its expiry date"];
  const expected = "A trusted certificate that is valid for at least 30 more days.";
  if (!https) {
    return { title, passed: false, severity: "major", steps, expected, actual: "The site is served over plain HTTP." };
  }
  if ("error" in result) {
    return { title, passed: false, severity: "critical", steps, expected, actual: `The certificate could not be verified (${result.error}).` };
  }
  const left = result.daysLeft;
  const until = result.validTo.toISOString().slice(0, 10);
  if (left < 0) return { title, passed: false, severity: "critical", steps, expected, actual: `The certificate expired on ${until}.` };
  if (left < 14) return { title, passed: false, severity: "major", steps, expected, actual: `The certificate expires on ${until} (${left} days).` };
  if (left < 30) return { title, passed: false, severity: "minor", steps, expected, actual: `The certificate expires on ${until} (${left} days).` };
  return { title, passed: true, severity: null, steps, expected, actual: `Trusted, valid until ${until} (${left} days).` };
}

/** Plain HTTP should send visitors to HTTPS, not serve the site. A closed port 80 is also fine. */
export function redirectCheck(response: { status: number; location: string } | null): SecurityCheck {
  const title = "Plain HTTP redirects to HTTPS";
  const steps = ["Request the site over http://", "Read the status code and Location header"];
  const expected = "A permanent or temporary redirect to an https:// address.";
  if (response === null) {
    return { title, passed: true, severity: null, steps, expected, actual: "Port 80 does not accept connections." };
  }
  const redirects = [301, 302, 307, 308].includes(response.status) && response.location.startsWith("https://");
  return {
    title,
    passed: redirects,
    severity: redirects ? null : "major",
    steps,
    expected,
    actual: redirects ? "Redirects to HTTPS." : `Answered HTTP ${response.status} without redirecting to HTTPS.`,
  };
}

/** A site that echoes any requesting origin, with credentials allowed, lets other sites read logged-in data. */
export function corsCheck(probeOrigin: string, headers: Record<string, string>): SecurityCheck {
  const title = "Other sites cannot read responses from the site";
  const steps = ["Request the homepage with an Origin header from an unrelated site", "Read Access-Control-Allow-Origin"];
  const expected = "The site does not echo arbitrary origins back.";
  const reflected = headers["access-control-allow-origin"] === probeOrigin;
  const credentials = headers["access-control-allow-credentials"] === "true";
  if (!reflected) {
    return { title, passed: true, severity: null, steps, expected, actual: "Arbitrary origins are not reflected." };
  }
  return {
    title,
    passed: false,
    severity: credentials ? "critical" : "major",
    steps,
    expected,
    actual: credentials
      ? "Reflects any origin and allows credentials, so other sites can read signed-in responses."
      : "Reflects any origin in Access-Control-Allow-Origin.",
  };
}

export interface ExposedFileProbe {
  path: string;
  label: string;
  severity: "critical" | "major";
  /** Only a 200 response is considered; `matches` confirms it is the file and not a generic page. */
  matches: (body: string, contentType: string) => boolean;
}

export const EXPOSED_FILE_PROBES: readonly ExposedFileProbe[] = [
  { path: "/.git/HEAD", label: "Git repository metadata", severity: "critical", matches: (body) => /^ref: refs\//m.test(body) },
  {
    path: "/.env",
    label: "environment file, which usually holds secrets",
    severity: "critical",
    matches: (body, type) => !/html/i.test(type) && /^[A-Z][A-Z0-9_]{2,}=/m.test(body),
  },
  { path: "/.DS_Store", label: "macOS folder metadata", severity: "major", matches: (body) => body.includes("Bud1") },
  { path: "/phpinfo.php", label: "PHP configuration page", severity: "major", matches: (body) => /phpinfo\(\)|PHP Version/.test(body) },
  { path: "/server-status", label: "Apache server status page", severity: "major", matches: (body) => body.includes("Apache Server Status") },
];

export function exposedFilesCheck(found: { path: string; label: string; severity: "critical" | "major" }[]): SecurityCheck {
  const title = "Sensitive files are not publicly available";
  const steps = [`Request each of ${EXPOSED_FILE_PROBES.length} well-known sensitive paths`, "Confirm the response is that file"];
  const expected = "None of these files can be downloaded.";
  if (found.length === 0) {
    return { title, passed: true, severity: null, steps, expected, actual: "None of the checked files is publicly available." };
  }
  const severity = found.some((f) => f.severity === "critical") ? "critical" : "major";
  return {
    title,
    passed: false,
    severity,
    steps,
    expected,
    actual: list(found.map((f) => `${f.path} is public (${f.label})`)),
  };
}

export const BLOCKED_NEEDS_OWNERSHIP = "Needs domain ownership. Verify your domain on the report page to run this check.";

export function blockedCheck(title: string, steps: string[], expected: string): SecurityCheck {
  return { title, passed: null, severity: null, steps, expected, actual: BLOCKED_NEEDS_OWNERSHIP };
}
