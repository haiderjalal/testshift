import assert from "node:assert/strict";
import { test } from "node:test";
import { runSuite, summary, validateConfig, workspacePath } from "./runner.mjs";
const check = (name, category) => ({ name, category, command: ["node", "fixture.mjs"], timeoutSeconds: 5 });
const config = { version: 1, disposable: true, checks: [check("setup", "setup"), check("units", "unit"), check("delete fixtures", "destructive")] };
test("action refuses missing isolation declaration, invalid commands and implicit destructive consent", () => {
  assert.throws(() => validateConfig({ ...config, disposable: false }));
  assert.throws(() => validateConfig({ ...config, checks: [{ ...check("bad", "unit"), command: ["node", "bad\ncommand"] }] }));
  assert.throws(() => validateConfig(config, true));
  assert.throws(() => validateConfig({ ...config, checks: [check("same", "unit"), check("same", "unit")] }));
});
test("action records skipped destructive checks and coverage gaps instead of inventing passes", async () => {
  let calls = 0;
  const report = await runSuite(config, { executeCheck: async () => { calls++; return { status: "passed", reason: "Command exit 0" }; } });
  assert.equal(calls, 2); assert.equal(report.checks[2].status, "skipped"); assert.equal(report.conclusion, "success");
  assert.ok(report.unconfiguredCategories.includes("e2e")); assert.match(summary(report), /not a guarantee/);
});
test("failed fixture setup blocks subsequent commands", async () => {
  let calls = 0;
  const report = await runSuite(config, { executeCheck: async () => { calls++; return { status: "failed", reason: "Fixture failed" }; } });
  assert.equal(calls, 1); assert.equal(report.checks[1].status, "blocked"); assert.equal(report.conclusion, "failure");
});
test("explicit disposable destructive approval executes the configured command", async () => {
  let calls = 0;
  const report = await runSuite({ ...config, destructiveApproved: true }, { destructive: true, executeCheck: async () => { calls++; return { status: "passed" }; } });
  assert.equal(calls, 3); assert.equal(report.checks[2].status, "passed");
});
test("workflow config paths cannot escape the checked-out workspace", () => {
  assert.throws(() => workspacePath(process.cwd(), "../private/config.json"));
  assert.ok(workspacePath(process.cwd(), "testshift.config.json").endsWith("testshift.config.json"));
});
test("real command failures and timeouts produce failed results", async () => {
  const checks = [
    { ...check("nonzero", "unit"), command: [process.execPath, "-e", "process.exit(3)"] },
    { ...check("timeout", "e2e"), command: [process.execPath, "-e", "setInterval(() => {}, 1000)"], timeoutSeconds: 1 },
  ];
  const report = await runSuite({ version: 1, disposable: true, checks });
  assert.equal(report.conclusion, "failure"); assert.equal(report.checks[0].status, "failed"); assert.match(report.checks[1].reason, /timeout/);
});
