import { spawn } from "node:child_process";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const categories = ["setup", "lint", "types", "unit", "integration", "build", "e2e", "destructive"];
const clean = (value) => String(value).replace(/[\r\n|<>`]/g, " ").slice(0, 160);
export function validateConfig(value, destructive = false) {
  if (!value || value.version !== 1 || value.disposable !== true || !Array.isArray(value.checks) || !value.checks.length || value.checks.length > 24)
    throw new Error("Config must declare version 1, disposable: true and 1–24 reviewed checks.");
  const names = new Set();
  for (const check of value.checks) {
    if (!check || typeof check.name !== "string" || !/^[A-Za-z0-9 _.-]{1,80}$/.test(check.name) || names.has(check.name) || !categories.includes(check.category)
      || !Array.isArray(check.command) || !check.command.length || check.command.length > 40
      || check.command.some((part) => typeof part !== "string" || !part || part.length > 1000 || /[\x00-\x1f]/.test(part))
      || !Number.isInteger(check.timeoutSeconds) || check.timeoutSeconds < 1 || check.timeoutSeconds > 600) throw new Error("Invalid or duplicate reviewed check.");
    names.add(check.name);
  }
  if (destructive && value.destructiveApproved !== true) throw new Error("Destructive tests require destructiveApproved: true in the reviewed configuration.");
  return value;
}
export function workspacePath(root, path) {
  const target = resolve(root, path); const inside = relative(root, target);
  if (inside.startsWith("..") || isAbsolute(inside)) throw new Error("Path must be inside the checked-out workspace.");
  return target;
}
function execute(command, timeoutSeconds) {
  return new Promise((done) => {
    // No shell interpolation. Only run this utility in a disposable runner; it is not a sandbox itself.
    const child = spawn(command[0], command.slice(1), { stdio: "inherit", shell: false, detached: process.platform !== "win32", windowsHide: true,
      env: { ...process.env, GITHUB_TOKEN: "", GH_TOKEN: "", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "", ACTIONS_ID_TOKEN_REQUEST_URL: "" } });
    let timedOut = false; let killTimer;
    const killGroup = (signal) => {
      try { if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Already exited. */ }
    };
    const timer = setTimeout(() => { timedOut = true; killGroup("SIGTERM"); killTimer = setTimeout(() => killGroup("SIGKILL"), 2000); }, timeoutSeconds * 1000);
    child.once("error", () => { clearTimeout(timer); clearTimeout(killTimer); done({ status: "failed", reason: "Command could not start" }); });
    child.once("exit", (code) => { clearTimeout(timer); if (!timedOut) clearTimeout(killTimer);
      done({ status: timedOut ? "failed" : code === 0 ? "passed" : "failed", reason: timedOut ? "Command exceeded its timeout" : `Command exit ${code}` }); });
  });
}
export async function runSuite(config, { destructive = false, executeCheck = execute } = {}) {
  validateConfig(config, destructive);
  const results = []; let setupFailed = false;
  for (const check of config.checks) {
    const started = Date.now();
    if (setupFailed) results.push({ name: check.name, category: check.category, status: "blocked", reason: "Setup failed" });
    else if (check.category === "destructive" && !destructive) results.push({ name: check.name, category: check.category, status: "skipped", reason: "Destructive profile was not enabled" });
    else {
      const outcome = await executeCheck(check.command, check.timeoutSeconds);
      results.push({ name: check.name, category: check.category, ...outcome, elapsedMs: Date.now() - started });
      if (check.category === "setup" && outcome.status !== "passed") setupFailed = true;
    }
  }
  const gaps = categories.filter((category) => !config.checks.some((check) => check.category === category));
  return { version: 1, scope: "Reviewed repository commands; command success does not prove complete behavior coverage", disposable: true, destructiveEnabled: destructive,
    conclusion: results.some((check) => ["failed", "blocked"].includes(check.status)) ? "failure" : "success", checks: results, unconfiguredCategories: gaps };
}
export function summary(report) {
  return ["## TestShift repository QA", "", report.scope, "", "| Check | Category | Result |", "| --- | --- | --- |",
    ...report.checks.map((check) => `| ${clean(check.name)} | ${check.category} | ${check.status} |`), "",
    `Unconfigured categories: ${report.unconfiguredCategories.join(", ") || "none"}.`,
    "Command success is not a guarantee that every feature was tested. Private evidence remains in GitHub Actions.", ""].join("\n");
}
async function main() {
  // Persistent self-hosted machines must not execute arbitrary customer repositories.
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted" || process.env.TESTSHIFT_DISPOSABLE !== "1")
    throw new Error("TestShift execution requires GitHub-hosted Actions and TESTSHIFT_DISPOSABLE=1.");
  const root = resolve(process.env.GITHUB_WORKSPACE || process.cwd());
  const configPath = workspacePath(root, process.env.TESTSHIFT_CONFIG || "testshift.config.json");
  const text = await readFile(configPath, "utf8");
  if (Buffer.byteLength(text) > 32_768) throw new Error("Configuration is too large.");
  const report = await runSuite(JSON.parse(text), { destructive: process.env.TESTSHIFT_DESTRUCTIVE === "true" });
  const output = workspacePath(root, ".testshift/report.json");
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary(report));
  if (report.conclusion !== "success") process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("TestShift could not execute the reviewed disposable configuration. Check configuration, runner and fixture setup."); process.exitCode = 1; });
}
