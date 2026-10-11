import { expect, test } from "@playwright/test";

import { COMPLETED_DOCUMENT, QUEUED_DOCUMENT } from "../documents.fixture";

const CONSENT = "I'm allowed to have this site crawled and described.";

test("the form explains a rejected link and keeps what was typed", async ({ page }) => {
  await page.goto("/test-cases");
  await page.getByLabel("Website link").fill("not a link");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel(CONSENT).check();
  await page.getByRole("button", { name: "Create test cases" }).click();
  await expect(page.getByText("Enter the full link, like https://your-site.com")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("owner@example.com");
});

test("a request opens a private page that says the document is queued, with no files yet", async ({ page, request }) => {
  await page.goto("/test-cases");
  await page.getByLabel("Website link").fill("https://1.1.1.1/");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Focus notes").fill("Checkout and sign-up.");
  await page.getByLabel(CONSENT).check();
  await page.getByRole("button", { name: "Create test cases" }).click();
  await expect(page).toHaveURL(/\/test-cases\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "1.1.1.1" })).toBeVisible();
  await expect(page.getByText("Your request is in the queue.")).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").pop() ?? "";
  const pdf = await request.get(`/test-cases/${id}/pdf`);
  expect(pdf.status()).toBe(404);
});

test("a queued document from the fixture shows its place in the queue and offers no downloads", async ({ page }) => {
  await page.goto(`/test-cases/${QUEUED_DOCUMENT}`);
  await expect(page.getByText("Your request is in the queue.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(0);
});

test("a finished document offers its PDF and Word files, with the file types and private headers", async ({ page, request }) => {
  await page.goto(`/test-cases/${COMPLETED_DOCUMENT}`);
  await expect(page.getByText("3 test cases from 2 pages")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", `/test-cases/${COMPLETED_DOCUMENT}/pdf`);
  await expect(page.getByRole("cell", { name: "TC-001" })).toBeVisible();

  const pdf = await request.get(`/test-cases/${COMPLETED_DOCUMENT}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["content-disposition"]).toBe('attachment; filename="8.8.8.8-test-cases.pdf"');
  expect(pdf.headers()["cache-control"]).toBe("private, no-store");
  expect((await pdf.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

  const docx = await request.get(`/test-cases/${COMPLETED_DOCUMENT}/docx`);
  expect(docx.status()).toBe(200);
  expect(docx.headers()["content-type"]).toContain("wordprocessingml");
  expect((await docx.body()).subarray(0, 2).toString("latin1")).toBe("PK");
});

test("unknown and malformed document ids are not found", async ({ page }) => {
  const unknown = await page.goto("/test-cases/00000000-0000-4000-8000-0000000000aa");
  expect(unknown?.status()).toBe(404);
  const malformed = await page.goto("/test-cases/not-a-uuid");
  expect(malformed?.status()).toBe(404);
});

test("the test case page is linked from the site navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href="/test-cases"]').first()).toBeAttached();
});
