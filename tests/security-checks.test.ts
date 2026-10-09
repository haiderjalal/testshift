import assert from "node:assert/strict";
import { test } from "node:test";

import {
  certificateCheck,
  cookieCheck,
  corsCheck,
  disclosureCheck,
  EXPOSED_FILE_PROBES,
  exposedFilesCheck,
  redirectCheck,
} from "../src/lib/security-checks";

test("cookies: a Secure, HttpOnly, SameSite cookie passes and lists no names", () => {
  const check = cookieCheck(["session=abc; Path=/; Secure; HttpOnly; SameSite=Lax"], true);
  assert.equal(check.passed, true);
  assert.doesNotMatch(check.actual, /abc|session/);
});

test("cookies: a missing Secure flag on HTTPS is a major finding that names the cookie", () => {
  const check = cookieCheck(["cart=1; Path=/; HttpOnly; SameSite=Lax"], true);
  assert.equal(check.passed, false);
  assert.equal(check.severity, "major");
  assert.match(check.actual, /cart lacks Secure/);
});

test("cookies: missing HttpOnly or SameSite alone is minor", () => {
  const check = cookieCheck(["theme=dark; Path=/; Secure"], true);
  assert.equal(check.passed, false);
  assert.equal(check.severity, "minor");
  assert.match(check.actual, /lacks HttpOnly/);
  assert.match(check.actual, /lacks SameSite/);
});

test("server disclosure: versions and X-Powered-By are minor findings; a bare name is not", () => {
  assert.equal(disclosureCheck({ server: "nginx/1.18.0" }).passed, false);
  assert.equal(disclosureCheck({ "x-powered-by": "Express" }).passed, false);
  assert.equal(disclosureCheck({ server: "cloudflare" }).passed, true);
});

test("certificate: expired, expiring soon, and valid certificates are graded differently", () => {
  const at = (days: number) => ({ validTo: new Date(Date.now() + days * 86_400_000), daysLeft: days });
  assert.equal(certificateCheck(at(-1), true).severity, "critical");
  assert.equal(certificateCheck(at(10), true).severity, "major");
  assert.equal(certificateCheck(at(20), true).severity, "minor");
  assert.equal(certificateCheck(at(200), true).passed, true);
});

test("certificate: a trust failure reports the Node error code", () => {
  const check = certificateCheck({ error: "CERT_HAS_EXPIRED" }, true);
  assert.equal(check.severity, "critical");
  assert.match(check.actual, /CERT_HAS_EXPIRED/);
});

test("redirect: HTTP to HTTPS passes; a plain 200 on port 80 fails; a closed port passes", () => {
  assert.equal(redirectCheck({ status: 301, location: "https://site.example/" }).passed, true);
  assert.equal(redirectCheck({ status: 200, location: "" }).passed, false);
  assert.equal(redirectCheck({ status: 302, location: "http://site.example/other" }).passed, false);
  assert.equal(redirectCheck(null).passed, true);
});

test("CORS: reflecting the probe origin with credentials is critical; without credentials, major", () => {
  const probe = "https://testshift-cors-probe.invalid";
  const withCredentials = corsCheck(probe, { "access-control-allow-origin": probe, "access-control-allow-credentials": "true" });
  assert.equal(withCredentials.severity, "critical");
  assert.equal(corsCheck(probe, { "access-control-allow-origin": probe }).severity, "major");
  assert.equal(corsCheck(probe, { "access-control-allow-origin": "https://app.example" }).passed, true);
  assert.equal(corsCheck(probe, {}).passed, true);
});

test("exposed files: each probe only matches its own signature, not a generic page", () => {
  const probe = (path: string) => EXPOSED_FILE_PROBES.find((p) => p.path === path)!;
  assert.equal(probe("/.git/HEAD").matches("ref: refs/heads/main\n", "text/plain"), true);
  assert.equal(probe("/.git/HEAD").matches("<html>Not found</html>", "text/html"), false);
  assert.equal(probe("/.env").matches("DATABASE_URL=postgres://x\nAPI_KEY=1", "text/plain"), true);
  assert.equal(probe("/.env").matches("<!doctype html><title>App</title>", "text/html"), false);
  assert.equal(probe("/phpinfo.php").matches("<h1>PHP Version 8.2</h1>", "text/html"), true);
  assert.equal(probe("/server-status").matches("<h1>Apache Server Status</h1>", "text/html"), true);
});

test("exposed files: any critical finding makes the whole check critical, and nothing found passes", () => {
  assert.equal(exposedFilesCheck([]).passed, true);
  const mixed = exposedFilesCheck([
    { path: "/.DS_Store", label: "macOS folder metadata", severity: "major" },
    { path: "/.env", label: "environment file", severity: "critical" },
  ]);
  assert.equal(mixed.passed, false);
  assert.equal(mixed.severity, "critical");
  assert.match(mixed.actual, /\/\.env is public/);
});
