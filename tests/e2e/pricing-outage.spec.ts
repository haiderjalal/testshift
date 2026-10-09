import { spawn, type ChildProcess } from "node:child_process";
import { test, expect } from "@playwright/test";

let app: ChildProcess;
const origin = "http://127.0.0.1:3108";
test.beforeAll(async () => {
  // A second production server points only at a closed loopback port. No real
  // database is touched, and the normal booking fixtures remain intact.
  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3108"], {
    stdio: "ignore", windowsHide: true,
    env: { ...process.env, DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:1/postgres", APP_URL: origin, NODE_ENV: "production" },
  });
  await expect.poll(async () => {
    try { return (await fetch(origin)).status; } catch { return 0; }
  }, { timeout: 45_000 }).toBe(200);
});
test.afterAll(async () => {
  if (app && app.exitCode === null) {
    await new Promise<void>((resolve) => { app.once("exit", () => resolve()); app.kill(); });
  }
});

test("homepage remains available during a pricing database outage", async ({ page }) => {
  const response = await page.goto(origin);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Four AI agents. One QA shift.");
  await expect(page.getByRole("status")).toContainText("Live pricing is temporarily unavailable");
  await expect(page.getByText("By quote", { exact: true })).toHaveCount(4);
  await expect(page.getByText("This page didn't load.")).toHaveCount(0);
});
