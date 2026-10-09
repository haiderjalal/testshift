import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
const findings: { location: string; kind: string }[] = [];
const known = new Set<string>();
let configured = 0;
for (const name of readdirSync(".").filter((name) => /^\.env/.test(name) && name !== ".env.example")) {
  for (const line of readFileSync(name, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!match || !/(KEY|TOKEN|PASSWORD|SECRET|DATABASE_URL)$/.test(match[1])) continue;
    const value = match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    if (value.length >= 12) { known.add(value); configured++; }
  }
}
const patterns: [string, RegExp][] = [
  ["provider-key", /\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|re_[A-Za-z0-9]{24,}|AKIA[A-Z0-9]{16})\b/],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["database-credential", /postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/],
];
function scan(location: string, text: string) {
  for (const [kind, pattern] of patterns) {
    // Documented placeholders and isolated disposable DB fixtures aren't production credentials.
    const safe = kind === "database-credential" ? text
      .replace(/postgresql:\/\/postgres\.your-project:your-password@[^\s"'`]+/g, "")
      .replace(/postgres:\/\/postgres:postgres@(?:\$\{socket\.getServerConn\(\)\}|127\.0\.0\.1(?::\d+)?|localhost(?::\d+)?)\/postgres/g, "") : text;
    if (pattern.test(safe)) findings.push({ location, kind });
  }
  if ([...known].some((value) => text.includes(value))) findings.push({ location, kind: "local-secret-match" });
}
const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
const untracked = git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
for (const file of [...tracked, ...untracked]) if (existsSync(file) && statSync(file).isFile()) scan(file, readFileSync(file, "utf8"));
let generated = 0;
function walk(path: string) {
  if (!existsSync(path)) return;
  for (const item of readdirSync(path, { withFileTypes: true })) {
    const file = join(path, item.name);
    if (item.isDirectory()) walk(file);
    else { generated++; scan(file, readFileSync(file, "utf8")); }
  }
}
walk("public"); walk(".next/static");
// Logs can contain customer/provider exception messages; don't print matching text.
for (const file of readdirSync(".").filter((f) => /\.log$/.test(f))) scan(file, readFileSync(file, "utf8"));
let historyBlobs = 0;
if (process.argv.includes("--history")) {
  const objects = git("rev-list", "--objects", "--all").split("\n").filter(Boolean);
  for (const object of objects) {
    const [id, ...path] = object.split(" ");
    if (git("cat-file", "-t", id).trim() !== "blob") continue;
    historyBlobs++;
    scan(`history:${id.slice(0, 12)}:${path.join(" ")}`, git("cat-file", "blob", id));
  }
}
console.log(JSON.stringify({ trackedFiles: tracked.length, untrackedFiles: untracked.length, generatedFiles: generated, historyBlobs,
  localSecretSettings: configured, findings }, null, 2));
if (findings.length) process.exitCode = 1;
