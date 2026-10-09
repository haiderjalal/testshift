import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
const session = (id: number) => ({ name: "ts_github", value: String(id).padEnd(43, "x"), url: "http://127.0.0.1:3107" });
test("GitHub integration protects anonymous reports and offers a working starter download", async ({ page, request }) => {
  await page.goto("/repositories"); await expect(page.getByRole("link", { name: "Sign in with GitHub", exact: true })).toBeVisible();
  await page.goto("/repositories/jobs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); await expect(page).toHaveURL(/\/repositories\?notice=sign-in$/);
  const archive = await request.get("/api/github/workflow"); expect(archive.status()).toBe(200); expect(archive.headers()["content-type"]).toBe("application/zip");
  const bytes = await archive.body(); expect(bytes.readUInt32LE(0)).toBe(0x04034b50); expect(bytes.toString()).toContain(".github/actions/testshift/runner.mjs"); expect(bytes.toString()).toContain("testshift.config.json");
  const invalid = await request.get("/api/github/callback?code=fixture&state=forged", { maxRedirects: 0 }); expect(invalid.status()).toBe(303); expect(invalid.headers().location).toContain("invalid-state");
});
test("private repository reports require the matching customer and current GitHub authority", async ({ page, context }) => {
  await context.addCookies([session(901)]); await page.goto("/repositories");
  await expect(page.getByText("fixture-owner/project", { exact: true })).toBeVisible();
  await page.goto("/repositories/jobs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); await expect(page.getByText("Synthetic rollback check: failure", { exact: true })).toBeVisible();
  expect((await page.request.get("/repositories")).headers()["cache-control"]).toContain("no-store");
  await context.clearCookies(); await context.addCookies([session(902)]);
  const denied = await page.goto("/repositories/jobs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); expect(denied?.status()).toBe(404);
  await page.goto("/repositories"); await expect(page.getByText("fixture-owner/project", { exact: true })).toHaveCount(0);
});
test("connection cannot bind another installation or a repository without administration", async ({ page, context }) => {
  await context.addCookies([session(902)]); await page.goto("/repositories");
  await page.getByText("Use an existing test workflow instead", {exact:true}).click();
  await page.getByLabel("GitHub installation").selectOption("906");
  await page.getByLabel("Repository URL").fill("https://github.com/fixture-owner/project");
  await page.getByRole("button", { name: "Find workflows", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not verify" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect repository", exact: true })).toHaveCount(0);
});
test("repository administrator can connect and sign out without exposing the user token", async ({ page, context }, info) => {
  await context.addCookies([session(info.project.name === "mobile" ? 904 : 903)]); await page.goto("/repositories");
  await page.getByText("Use an existing test workflow instead", {exact:true}).click();
  await page.getByLabel("GitHub installation").selectOption("905"); await page.getByLabel("Repository URL").fill("https://github.com/fixture-owner/project");
  await expect(page.getByLabel("Workflow path")).toHaveCount(0);
  await page.getByRole("button", { name: "Find workflows", exact: true }).click();
  await expect(page.getByLabel("Test workflow")).toHaveValue("911");
  await expect(page.getByLabel("Test workflow").getByRole("option", { name: "Project quality checks" })).toHaveCount(1);
  await page.locator("section").filter({ has: page.getByRole("heading", { name: "Connect a selected repository", exact: true }) }).screenshot({ path: info.outputPath("workflow-picker.png") });
  await page.getByRole("checkbox", { name: /I administer this repository/ }).check();
  await page.getByRole("button", { name: "Connect repository", exact: true }).click();
  await expect(page.locator("form").getByRole("status")).toContainText("Repository connected");
  expect(await page.content()).not.toContain("fixture-customer-token-901");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign in with GitHub", exact: true })).toBeVisible();
});

test("repositories without workflows offer setup guidance and changing repositories invalidates discovery", async ({ page, context }) => {
  await context.addCookies([session(901)]); await page.goto("/repositories");
  await page.getByText("Use an existing test workflow instead", {exact:true}).click();
  await page.getByLabel("Repository URL").fill("https://github.com/fixture-owner/empty-project");
  await page.getByRole("button", { name: "Find workflows", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("No active workflows");
  await expect(page.getByRole("link", { name: "Download test workflow starter", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect repository", exact: true })).toHaveCount(0);
  await page.getByLabel("Repository URL").fill("https://github.com/fixture-owner/multiple-workflows");
  await page.getByRole("button", { name: "Find workflows", exact: true }).click();
  await expect(page.getByLabel("Test workflow")).toHaveValue("");
  await page.getByLabel("Test workflow").selectOption("913");
  await page.getByLabel("Repository URL").fill("https://github.com/fixture-owner/project");
  await expect(page.getByLabel("Test workflow")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Connect repository", exact: true })).toHaveCount(0);
});

test("forged workflow choices are rejected when connecting a repository", async ({ page, context }) => {
  await context.addCookies([session(901)]); await page.goto("/repositories");
  await page.getByText("Use an existing test workflow instead", {exact:true}).click();
  await page.getByLabel("Repository URL").fill("https://github.com/fixture-owner/project");
  await page.getByRole("button", { name: "Find workflows", exact: true }).click();
  await expect(page.getByLabel("Test workflow")).toHaveValue("911");
  await page.getByLabel("Test workflow").evaluate((element) => { (element as HTMLSelectElement).add(new Option("Forged choice", "999")); });
  await page.getByLabel("Test workflow").selectOption("999");
  await page.getByRole("checkbox", { name: /I administer this repository/ }).check();
  await page.getByRole("button", { name: "Connect repository", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Could not verify");
});
test("administrator can queue AI testing without knowing a workflow path", async ({page,context},info) => {
  await context.addCookies([session(901)]);await page.goto('/repositories');
  await expect(page.getByLabel('Workflow path')).toHaveCount(0);
  await page.getByLabel('Repository to analyze').fill('https://github.com/fixture-owner/empty-project');
  await page.locator('input[name="sourceConsent"]').evaluate(element=>element.removeAttribute('required'));
  await page.getByRole('button',{name:'Connect and generate tests',exact:true}).click();
  await expect(page.locator('input[name="sourceConsent"]')).not.toBeChecked();
  await expect(page.locator('form').getByRole('alert')).toContainText('approve source analysis');
  await page.getByRole('checkbox',{name:/I authorize AI source analysis/}).check();
  await page.getByRole('button',{name:'Connect and generate tests',exact:true}).click();
  await expect(page.locator('form').getByRole('status')).toContainText('generation queued');
  await page.reload();await expect(page.getByText('Test generation: queued',{exact:false})).toBeVisible();
  expect(await page.content()).not.toContain('fixture-scoped-generation-token');
  await page.locator('section').filter({has:page.getByRole('heading',{name:'Connect a selected repository',exact:true})}).screenshot({path:info.outputPath('generate-tests.png')});
});
test("AI generation refuses a repository outside the customer's installation", async ({page,context}) => {
  await context.addCookies([session(902)]);await page.goto('/repositories');
  await page.getByLabel('Repository to analyze').fill('https://github.com/fixture-owner/empty-project');
  await page.getByRole('checkbox',{name:/I authorize AI source analysis/}).check();
  await page.getByRole('button',{name:'Connect and generate tests',exact:true}).click();
  await expect(page.locator('form').getByRole('alert')).toContainText('Could not queue generation');
  await expect(page.getByText('fixture-owner/empty-project',{exact:true})).toHaveCount(0);
});
test("GitHub webhook rejects forgery and accepts a signed idempotent delivery", async ({ request }) => {
  const body = JSON.stringify({ zen: "Disposable fixture" }); const delivery = randomUUID();
  const common = { "content-type": "application/json", "x-github-delivery": delivery, "x-github-event": "ping" };
  const invalid = await request.post("/api/github/webhook", { data: body, headers: { ...common, "x-hub-signature-256": `sha256=${"0".repeat(64)}` } }); expect(invalid.status()).toBe(401);
  const signature = `sha256=${createHmac("sha256", "fixture-webhook-secret-with-32-characters").update(body).digest("hex")}`;
  const first = await request.post("/api/github/webhook", { data: body, headers: { ...common, "x-hub-signature-256": signature } }); expect(first.status()).toBe(200); expect((await first.json()).message).toBe("accepted");
  const duplicate = await request.post("/api/github/webhook", { data: body, headers: { ...common, "x-hub-signature-256": signature } }); expect(duplicate.status()).toBe(200); expect((await duplicate.json()).message).toBe("duplicate");
});
