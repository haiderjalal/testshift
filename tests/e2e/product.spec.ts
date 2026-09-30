import { test, expect } from "@playwright/test";
import axe from "axe-core";

test("landing page loads, navigates to booking, and fits the viewport", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/"); await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Four AI agents. One QA shift.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole("link", { name: "Start free", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Book a QA shift" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("booking validation preserves input and requires plan, consent and valid email", async ({ page }) => {
  await page.goto("/hire");
  await page.getByLabel("Website to test").fill("https://8.8.8.8/");
  await page.getByLabel("Email for the report").fill("bad-email");
  await page.getByRole("button", { name: "Start free 20-minute shift" }).click();
  await expect(page.getByText("Choose a plan.", { exact: true })).toBeVisible();
  await expect(page.getByText("Confirm you're allowed to test this site.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email for the report")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Website to test")).toHaveValue("https://8.8.8.8/");
});

test("server refuses private URLs and embedded credentials", async ({ page }) => {
  await page.goto("/hire?plan=junior");
  await page.getByLabel("Email for the report").fill("qa@example.com");
  await page.getByRole("checkbox").check();
  for (const url of ["http://127.0.0.1/", "http://2130706433/", "http://[::1]/", "http://169.254.169.254/"]) {
    await page.getByLabel("Website to test").fill(url);
    await page.getByRole("button", { name: "Start free 20-minute shift" }).click();
    await expect(page.getByText("We can only test websites that are publicly reachable on the internet.")).toBeVisible();
  }
  await page.getByLabel("Website to test").fill("https://user:pass@8.8.8.8/");
  await page.getByRole("button", { name: "Start free 20-minute shift" }).click();
  await expect(page.getByText("Remove the username or password from the link.")).toBeVisible();
});

test("crafted plan and URL parameters neither crash nor execute HTML", async ({ page }) => {
  await page.goto('/hire?plan=constructor&hours=Infinity&url=%22%3E%3Cscript%3Ewindow.PWNED%3D1%3C%2Fscript%3E');
  await expect(page.getByRole("heading", { name: "Book a QA shift" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "20 min free", exact: true })).toBeChecked();
  expect(await page.evaluate(() => "PWNED" in window)).toBe(false);
  await page.getByText("Senior QA", { exact: true }).click();
  await page.getByText("2h", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Book 2-hour shift · $100" })).toBeVisible();
});

test("trial booking creates a queued run and duplicate site is rejected", async ({ page }, info) => {
  const target = info.project.name === "mobile" ? "https://1.1.1.1/" : "https://8.8.4.4/";
  await page.goto(`/hire?plan=junior&url=${encodeURIComponent(target)}`);
  await page.getByLabel("Email for the report").fill(`qa-${info.project.name}@example.com`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start free 20-minute shift" }).click();
  await expect(page).toHaveURL(/\/runs\/[\da-f-]+$/);
  await expect(page.getByText("Your agents are clocking in…")).toBeVisible();
  await page.goto(`/hire?plan=junior&url=${encodeURIComponent(target)}`);
  await page.getByLabel("Email for the report").fill(`another-${info.project.name}@example.com`);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Start free 20-minute shift" }).click();
  await expect(page.locator("#hours-error")).toContainText(/already/);
});

test("quote form rejects invalid input and stores a valid local request", async ({ page }, info) => {
  await page.goto("/custom");
  await page.getByRole("button", { name: "Request a quote" }).click();
  await expect(page.getByText("Tell us your name.")).toBeVisible();
  await page.getByLabel("Your name").fill("QA Fixture");
  await page.getByLabel("Work email").fill(`quote-${info.project.name}@example.com`);
  await page.getByLabel("What do you need?").fill("A disposable test request for regression testing.");
  await page.getByRole("button", { name: "Request a quote" }).click();
  await expect(page.getByRole("status")).toContainText("Request sent.");
});

test("admin requires authentication and accepts the isolated test password", async ({ page, context }) => {
  await page.goto("/admin"); await expect(page).toHaveURL(/\/admin\/login$/);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That password is not right.")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("test-only-password-12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Claude usage & margin" })).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === "ts_admin");
  expect(cookie?.httpOnly).toBe(true); expect(cookie?.sameSite).toBe("Strict"); expect(cookie?.secure).toBe(true);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("report with no evaluated checks shows Incomplete and no score", async ({ page, request }) => {
  const path = "/runs/11111111-1111-4111-8111-111111111111";
  const response = await page.goto(path);
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(page.getByText("Incomplete", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Insufficient evidence to score" })).toBeVisible();
  await expect(page.getByText("Coverage: 0 of 1 features have completed checks")).toBeVisible();
  const spec = await request.get(`${path}/spec`);
  expect(spec.headers()["cache-control"]).toBe("private, no-store");
  expect(await spec.text()).not.toContain('test("');
});

test("forged Unicode admin cookies fail closed instead of crashing", async ({ request }) => {
  const token = `${Date.now() + 60_000}.${"é".repeat(64)}`;
  const response = await request.get("/admin", { headers: { cookie: `ts_admin=${encodeURIComponent(token)}` }, maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/admin/login");
});

test("cross-origin admin actions cannot establish a session", async ({ page, context }) => {
  await page.goto("/admin/login");
  // Chromium rewrites the forbidden Origin header on route.continue. Replay the exact action
  // through the API client so the server actually receives the hostile origin being tested.
  await page.route("**/admin/login", async (route) => {
    const response = await context.request.fetch(route.request(), {
      headers: { ...await route.request().allHeaders(), origin: "https://attacker.invalid" }, maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
  await page.getByLabel("Password", { exact: true }).fill("test-only-password-12345");
  const response = page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/admin/login"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  expect((await response).status()).toBe(500);
  expect((await context.cookies()).some((c) => c.name === "ts_admin")).toBe(false);
  await page.unroute("**/admin/login");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("malformed run IDs and unsigned payment events fail safely", async ({ request }) => {
  for (const path of ["/runs/not-a-uuid", "/runs/not-a-uuid/spec", "/runs/not-a-uuid/shots/not-a-uuid"]) expect((await request.get(path)).status()).toBe(404);
  expect((await request.post("/api/stripe/webhook", { data: { type: "checkout.session.completed" } })).status()).toBe(400);
  const headers = (await request.get("/hire")).headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("booking and quote pages have no serious automated accessibility violations", async ({ page }) => {
  for (const path of ["/hire", "/custom"]) {
    await page.goto(path); await page.waitForLoadState("networkidle");
    await page.evaluate(axe.source);
    const violations = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } })).violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")).map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })));
    expect(violations, path).toEqual([]);
  }
});
