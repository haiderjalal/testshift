import { z } from "zod";
import { github, githubId, repoName } from "./api";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const treeSchema = z.object({ truncated: z.boolean(), tree: z.array(z.object({ path: z.string().max(500), type: z.string(), mode: z.string(), sha, size: z.number().optional() })).max(15000) });
export class GenerationError extends Error {
  constructor(public code: string) { super("Repository generation unavailable"); }
}
export function readableSource(path: string) {
  return path.length <= 240 && !path.split("/").some((part) => part.startsWith(".") || ["node_modules","vendor","dist","build","coverage","fixtures","__fixtures__"].includes(part))
    && !/(secret|credential|password|private[-_]?key|service[-_]?account|\.min\.)/i.test(path)
    && /\.(tsx?|jsx?|json|md|sql)$/.test(path) && !/(lock|snapshot|\.snap)\b/i.test(path);
}
export function containsSecret(source: string) {
  return /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:ant-)?[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16})\b|(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:]+:[^\s@]+@|(?:api[_-]?key|secret|password|token)\s*[=:]\s*["'][^"'\r\n]{12,}["']/i.test(source);
}
export interface SourceSnapshot {
  repository: string; branch: string; sha: string; treeSha: string;
  files: { path: string; content: string }[];
  inventory: { totalFiles: number; eligibleFiles: number; analyzedFiles: number; omittedFiles: number; paths: string[]; exclusions: string };
  stack: "next" | "vite"; manager: "npm" | "pnpm"; pnpmVersion?: string;
}
/** Immutable blobs only; never clones, imports, installs or executes customer code. */
export async function readRepositorySource(token: string, fullName: string, repositoryId: number): Promise<SourceSnapshot> {
  repoName.parse(fullName); githubId.parse(repositoryId);
  const repo = z.object({ id: githubId, full_name: repoName, default_branch: z.string().min(1).max(200) }).parse(await github(`/repos/${fullName}`, token));
  if (repo.id !== repositoryId || repo.full_name !== fullName) throw new GenerationError("repository-mismatch");
  const commit = z.object({ sha, commit: z.object({ tree: z.object({ sha }) }) }).parse(await github(`/repos/${fullName}/commits/${encodeURIComponent(repo.default_branch)}`, token));
  const tree = treeSchema.parse(await github(`/repos/${fullName}/git/trees/${commit.commit.tree.sha}?recursive=1`, token));
  if (tree.truncated) throw new GenerationError("repository-inventory-too-large");
  if (tree.tree.some((file) => file.path.startsWith(".testshift/generated/") || file.path === ".github/workflows/testshift-generated.yml")) throw new GenerationError("generated-suite-already-exists");
  const blobs = tree.tree.filter((file) => file.type === "blob" && file.mode === "100644");
  const eligible = blobs.filter((file) => readableSource(file.path) && (file.size ?? 100001) <= 24000)
    .sort((a,b) => {
      const priority = (path: string) => path === 'package.json' ? 0 : /test|spec/i.test(path) ? 1 : 2;
      return priority(a.path) - priority(b.path) || a.path.localeCompare(b.path);
    });
  const files: SourceSnapshot["files"] = []; let bytes = 0; const deadline = Date.now() + 180000;
  for (const file of eligible) {
    if (files.length >= 60 || Date.now() > deadline) break;
    if (bytes + (file.size ?? 24000) > 140000) continue;
    const blob = z.object({ sha, encoding: z.literal("base64"), content: z.string().max(40000), size: z.number().int().max(24000) }).parse(await github(`/repos/${fullName}/git/blobs/${file.sha}`, token));
    if (blob.sha !== file.sha) throw new GenerationError("source-mismatch");
    const decoded = Buffer.from(blob.content.replace(/\s/g,""), "base64");
    if (decoded.length !== blob.size || decoded.includes(0)) continue;
    const content = decoded.toString("utf8");
    if (containsSecret(content)) continue;
    files.push({ path: file.path, content }); bytes += decoded.length;
  }
  const manifest = files.find((file) => file.path === "package.json");
  if (!manifest) throw new GenerationError("package-manifest-unavailable");
  const pkg = z.object({ scripts: z.record(z.string(), z.string()).default({}), dependencies: z.record(z.string(), z.string()).default({}), devDependencies: z.record(z.string(), z.string()).default({}), workspaces: z.unknown().optional(), packageManager: z.string().optional() }).parse(JSON.parse(manifest.content));
  if (pkg.workspaces || tree.tree.some((file) => file.path === "pnpm-workspace.yaml")) throw new GenerationError("monorepo-needs-assisted-setup");
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const stack = deps.next ? "next" : deps.vite ? "vite" : null;
  if (!stack || !pkg.scripts.dev) throw new GenerationError("stack-needs-assisted-setup");
  const pnpm = pkg.packageManager?.match(/^pnpm@(\d+\.\d+\.\d+)$/)?.[1];
  const manager = pnpm && tree.tree.some((file) => file.path === "pnpm-lock.yaml") ? "pnpm" : tree.tree.some((file) => file.path === "package-lock.json") ? "npm" : null;
  if (!manager) throw new GenerationError("lockfile-needs-assisted-setup");
  return { repository: fullName, branch: repo.default_branch, sha: commit.sha, treeSha: commit.commit.tree.sha, files, stack, manager, pnpmVersion: pnpm,
    inventory: { totalFiles: blobs.length, eligibleFiles: eligible.length, analyzedFiles: files.length, omittedFiles: blobs.length-files.length, paths: files.map((file) => file.path), exclusions: "Hidden files, secrets, binary/vendor/build files, fixtures, lockfiles and files over 24 KB excluded; maximum 60 files / 140 KB. Secret detection is best effort. Submodules and symlinks are not read." } };
}
