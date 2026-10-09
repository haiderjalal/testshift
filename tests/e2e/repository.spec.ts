import { test, expect } from "@playwright/test";

test("GitHub options explain authorization and navigate to repository setup", async ({ page }) => {
  await page.goto("/hire");
  await page.getByRole("link", { name: "Explore GitHub testing and CI" }).click();
  await expect(page.getByRole("heading", { name: "Take QA from a website to your code." })).toBeVisible();
  await expect(page.getByText(/Submitting a link in an onboarding request does not connect your account/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole("link", { name: "Set up GitHub CI", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your GitHub repositories", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download GitHub workflow" })).toBeVisible();
});

test("repository request rejects credentials and preserves scope in the owner inbox", async ({ page, context }, info) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": info.project.name === "mobile" ? "198.51.100.31" : "198.51.100.30" });
  await page.goto("/custom?mode=repository");
  const name = `Repository fixture ${info.project.name}`;
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(`repository-${info.project.name}@example.com`);
  await page.getByLabel("What do you need?").fill("Run existing tests against synthetic data in a disposable application.");
  await page.getByLabel("GitHub repository", { exact: true }).fill("https://fixture-token@github.com/example/project");
  await page.getByRole("button", { name: "Request a quote" }).click();
  await expect(page.locator("#repository-error")).toContainText("Do not include access tokens");
  await page.getByLabel("GitHub repository", { exact: true }).fill("https://github.com/example/project");
  await page.getByRole("checkbox", { name: /Include a plan for destructive tests/ }).check();
  await page.getByRole("button", { name: "Request a quote" }).click();
  await expect(page.getByRole("status")).toContainText("Request sent.");
  await page.goto("/admin/login");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password-12345");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const request = page.getByRole("listitem").filter({ has: page.getByText(name, { exact: true }) });
  await expect(request).toContainText("Testing request: GitHub repository audit");
  await expect(request).toContainText("Disposable destructive-test environment requested: yes");
  await expect(request).toContainText("grants no repository or production permissions");
});
