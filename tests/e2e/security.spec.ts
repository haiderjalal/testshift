import { test, expect } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

test("production CSP has fresh nonces, hydrates pages and blocks injected scripts", async ({ page, request }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    Object.assign(window, { securityViolations: [] });
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { securityViolations: string[] }).securityViolations.push(e.violatedDirective);
    });
  });
  page.on("pageerror", (e) => violations.push(e.name));
  let previous = "";
  for (const path of ["/", "/hire", "/custom", "/admin/login", "/leaderboard", "/runs/11111111-1111-4111-8111-111111111111"]) {
    const response = await page.goto(path); await page.waitForLoadState("networkidle");
    const policy = response?.headers()["content-security-policy"] ?? "";
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy(); expect(nonce).not.toBe(previous); previous = nonce ?? "";
    expect(policy).not.toContain("'unsafe-eval'");
    expect(response?.headers()["x-powered-by"]).toBeUndefined();
    for (const [name, value] of Object.entries({ "x-content-type-options": "nosniff", "x-frame-options": "DENY", "cross-origin-opener-policy": "same-origin", "cross-origin-resource-policy": "same-origin", "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()", "strict-transport-security": "max-age=63072000; includeSubDomains; preload" })) expect(response?.headers()[name]).toBe(value);
  }
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { securityViolations: string[] }).securityViolations)).toEqual([]);
  // Simulate reflected HTML at the parser boundary. Playwright evaluation itself is trusted
  // browser automation and is not a realistic untrusted HTML injection under strict-dynamic.
  await page.route("http://127.0.0.1:3107/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("<head>", "<head><script>window.INJECTED=1</script>") });
  });
  await page.goto("/"); await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => "INJECTED" in window)).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { securityViolations: string[] }).securityViolations)).toContain("script-src-elem");
  await page.unroute("http://127.0.0.1:3107/");
  const report = await request.get("/runs/11111111-1111-4111-8111-111111111111");
  expect(report.headers()["cache-control"]).toContain("no-store");
});

test("forms reject cross-origin, missing origin, bad media types and oversized bodies", async ({ request }) => {
  for (const origin of ["https://attacker.invalid", "null", "http://127.0.0.1:9999", ""]) {
    const response = await request.post("/custom", { headers: { origin, "content-type": "text/plain" }, data: "[]" });
    expect(response.status()).toBe(403); expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  }
  const headers = { origin: "http://127.0.0.1:3107", "content-type": "application/json" };
  expect((await request.post("/custom", { headers, data: "{}" })).status()).toBe(415);
  expect((await request.post("/custom", { headers: { ...headers, "content-type": "text/plain" }, data: "x".repeat(32769) })).status()).toBe(413);
});

test("webhook validates content type, byte limit, origin and signed JSON", async ({ request }) => {
  const path = "/api/stripe/webhook";
  expect((await request.post(path, { headers: { "content-type": "text/plain" }, data: "{}" })).status()).toBe(415);
  const headers = { "content-type": "application/json" };
  expect((await request.post(path, { headers, data: "x".repeat(262145) })).status()).toBe(413);
  for (const data of ["{bad", "{}", '{"type":"checkout.session.completed"}']) {
    const response = await request.post(path, { headers, data });
    expect(response.status()).toBe(400); expect(response.headers()["cache-control"]).toBe("no-store");
    expect(await response.text()).not.toContain("signature");
  }
  expect((await request.post(path, { headers: { ...headers, origin: "https://attacker.invalid" }, data: "{}" })).status()).toBe(403);
});

test("server rejects a forged booking plan instead of trusting client controls", async ({ page }) => {
  await page.goto("/hire?plan=junior");
  await page.getByLabel("Website to test").fill("https://8.8.8.8/");
  await page.getByLabel("Email for the report").fill("allowlist@example.com");
  await page.getByRole("checkbox", { name: /I own this website/ }).check();
  await page.locator('input[name="plan"]:checked').evaluate((field) => { (field as HTMLInputElement).value = "constructor"; });
  await page.getByRole("button", { name: "Start free 20-minute shift" }).click();
  await expect(page.getByText("Choose a plan.", { exact: true })).toBeVisible();
});

test("malformed serialized actions return a generic failure with a request ID", async ({ page, context }) => {
  await page.goto("/custom");
  let responseBody: string | undefined;
  await page.route("**/custom", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const headers = { ...await route.request().allHeaders(), "content-type": "text/plain" };
    delete (headers as Record<string, string>)["content-length"];
    const response = await context.request.fetch(route.request(), { headers, data: "{malformed-security-fixture", maxRedirects: 0 });
    // Buffer the API response before the browser receives it and may navigate away.
    responseBody = await response.text();
    await route.fulfill({ response, body: responseBody });
  });
  const waiting = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/custom"));
  await page.getByRole("button", { name: "Request a quote" }).click();
  const response = await waiting;
  expect(response.status()).toBe(500);
  expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  expect(responseBody).toBeDefined();
  expect(responseBody).not.toContain("malformed-security-fixture");
});

test("stored customer markup renders as text in the authenticated dashboard", async ({ page, context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": info.project.name === "mobile" ? "198.51.100.21" : "198.51.100.20" });
  const name = `Security ${info.project.name} <img src=x onerror=window.STORED_XSS=1>`;
  await page.goto("/custom");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(`security-${info.project.name}@example.com`);
  await page.getByLabel("What do you need?").fill("<script>window.STORED_XSS=1</script> audit fixture");
  await page.getByRole("button", { name: "Request a quote" }).click();
  await expect(page.getByRole("status")).toContainText("Request sent.");
  await page.goto("/admin/login");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password-12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => "STORED_XSS" in window)).toBe(false);
});

test("sensitive files and nonexistent admin and private report paths return 404", async ({ request }) => {
  for (const path of ["/.env", "/.env.local", "/.env.example", "/.git/config", "/package.json", "/package-lock.json", "/AGENTS.md", "/docs/QA_AUDIT.md", "/next.config.ts", "/backup.sql", "/.next/BUILD_ID", "/admin/users", "/admin/settings", "/api/admin", "/runs/22222222-2222-4222-8222-222222222222", "/runs/22222222-2222-4222-8222-222222222222/spec", "/runs/11111111-1111-4111-8111-111111111111/shots/22222222-2222-4222-8222-222222222222"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  const caseId = "44444444-4444-4444-8444-444444444444";
  const own = await request.get(`/runs/33333333-3333-4333-8333-333333333333/shots/${caseId}`);
  expect(own.status()).toBe(200); expect(own.headers()["cache-control"]).toBe("private, no-store");
  expect((await request.get(`/runs/11111111-1111-4111-8111-111111111111/shots/${caseId}`)).status()).toBe(404);
});

test("HTTP abuse limit returns 429 and Retry-After with bounded durable counters", async ({ request }, info) => {
  const headers = { origin: "http://127.0.0.1:3107", "content-type": "text/plain", "x-forwarded-for": info.project.name === "mobile" ? "198.51.100.11" : "198.51.100.10" };
  let limited = false;
  for (let n = 0; n < 61; n++) {
    const response = await request.post("/security-probe", { headers, data: "[]" });
    if (response.status() === 429) { expect(response.headers()["retry-after"]).toBe("60"); expect(response.headers()["cache-control"]).toContain("no-store"); limited = true; break; }
  }
  expect(limited).toBe(true);
});

test("public JS bundles contain no configured secret values or browser source maps", async ({ request }) => {
  const secretValues: string[] = [];
  try {
    const env = await readFile(".env.local", "utf8");
    for (const line of env.split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && /(KEY|TOKEN|PASSWORD|SECRET|DATABASE_URL)$/.test(match[1])) {
        const value = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
        if (value.length >= 12) secretValues.push(value);
      }
    }
  } catch { /* isolated CI has no local credentials */ }
  async function walk(path: string): Promise<void> {
    for (const file of await readdir(path, { withFileTypes: true })) {
      const target = join(path, file.name);
      if (file.isDirectory()) await walk(target);
      else {
        expect(file.name.endsWith(".map"), "Browser source map must not be emitted").toBe(false);
        const text = await readFile(target, "utf8");
        // Assert a boolean, so assertion failures never print the actual secret or bundle.
        expect(secretValues.some((value) => text.includes(value)), "Configured secret found in browser bundle").toBe(false);
        if (file.name.endsWith(".js")) expect((await request.get(`/\u005fnext/static/${target.replaceAll("\\", "/").split(".next/static/")[1]}.map`)).status()).toBe(404);
      }
    }
  }
  await walk(".next/static");
});
