import { z } from "zod";
import { appUrl } from "../email";
import { readBoundedBody } from "../security";
import { appJwt } from "./crypto";

export const githubId = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const repoName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/);
export const workflowPath = z.string().regex(/^\.github\/workflows\/[A-Za-z0-9_-]{1,80}\.ya?ml$/);
const workflowSchema = z.object({ id: githubId, name: z.string().min(1).max(300), path: z.string().max(300), state: z.string().max(80) });
export interface WorkflowChoice { id: number; name: string }

/** Call only after verifying the customer's installation access and repository administration. */
export async function repositoryWorkflows(token: string, fullName: string): Promise<WorkflowChoice[]> {
  repoName.parse(fullName);
  const choices: WorkflowChoice[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await github<{ workflows: unknown[] }>(`/repos/${fullName}/actions/workflows?per_page=100&page=${page}`, token);
    const batch = z.array(workflowSchema).max(100).parse(data.workflows);
    for (const item of batch) {
      if (item.state === "active" && workflowPath.safeParse(item.path).success && !choices.some((choice) => choice.id === item.id)) {
        choices.push({ id: item.id, name: item.name });
      }
    }
    if (batch.length < 100) return choices;
  }
  throw new Error("Workflow listing limit exceeded");
}

/** Resolve the path from GitHub again at connection time; never trust a submitted path. */
export async function activeRepositoryWorkflow(token: string, fullName: string, workflowId: number) {
  repoName.parse(fullName); githubId.parse(workflowId);
  const workflow = workflowSchema.parse(await github(`/repos/${fullName}/actions/workflows/${workflowId}`, token));
  if (workflow.id !== workflowId || workflow.state !== "active" || !workflowPath.safeParse(workflow.path).success) throw new GitHubError(422);
  return workflow;
}
export class GitHubError extends Error {
  constructor(public status: number) { super("GitHub request failed"); }
}
export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_ID && /^[a-z0-9-]+$/.test(process.env.GITHUB_APP_SLUG ?? "") && process.env.GITHUB_CLIENT_ID
    && process.env.GITHUB_CLIENT_SECRET && process.env.GITHUB_APP_PRIVATE_KEY && (process.env.GITHUB_WEBHOOK_SECRET?.length ?? 0) >= 32
    && Buffer.from(process.env.GITHUB_TOKEN_ENCRYPTION_KEY ?? "", "base64").length === 32);
}
export function githubOrigin(): string {
  const url = new URL(appUrl());
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password || (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("GitHub requires an exact HTTPS APP_URL origin");
  return url.origin;
}
export async function github<T>(path: string, token: string, method = "GET", body?: object): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || new URL(path, "https://api.github.com").origin !== "https://api.github.com") throw new Error("Invalid GitHub API path");
  const response = await fetch(`https://api.github.com${path}`, { method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "TestShift", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) { await response.body?.cancel(); throw new GitHubError(response.status); }
  if (response.status === 204) return undefined as T;
  return JSON.parse(await readBoundedBody(new Request("https://api.github.com", { method: "POST", body: response.body, duplex: "half" } as RequestInit), 2 * 1024 * 1024)) as T;
}
export async function installationToken(installationId: number, repositoryId: number, publish = false): Promise<string> {
  githubId.parse(installationId); githubId.parse(repositoryId);
  const result = await github<{ token: string }>(`/app/installations/${installationId}/access_tokens`, appJwt(), "POST", {
    repository_ids: [repositoryId], permissions: { contents: "read", actions: "read", ...(publish ? { checks: "write" } : {}) },
  });
  return z.string().min(10).max(1000).parse(result.token);
}
export async function withInstallation<T>(installationId: number, repositoryId: number, publish: boolean, work: (token: string) => Promise<T>): Promise<T> {
  const token = await installationToken(installationId, repositoryId, publish);
  try { return await work(token); }
  finally { await github("/installation/token", token, "DELETE").catch(() => undefined); }
}
/** Separate write token, scoped to one explicitly approved repository, only for test PR publication. */
export async function withGenerationInstallation<T>(installationId: number, repositoryId: number, work: (token: string) => Promise<T>): Promise<T> {
  githubId.parse(installationId); githubId.parse(repositoryId);
  const result = await github<{ token: string }>(`/app/installations/${installationId}/access_tokens`, appJwt(), "POST", {
    repository_ids: [repositoryId], permissions: { contents: "write", pull_requests: "write", workflows: "write" },
  });
  const token = z.string().min(10).max(1000).parse(result.token);
  try { return await work(token); }
  finally { await github("/installation/token", token, "DELETE").catch(() => undefined); }
}
export const repositorySchema = z.object({ id: githubId, full_name: repoName, permissions: z.object({ admin: z.boolean() }).optional() });
export const installationSchema = z.object({ id: githubId, app_id: githubId, suspended_at: z.string().nullable(), account: z.object({ login: z.string().max(100) }) });
export async function userInstallations(token: string) {
  const result: z.infer<typeof installationSchema>[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await github<{ installations: unknown[] }>(`/user/installations?per_page=100&page=${page}`, token);
    const installations = z.array(installationSchema).max(100).parse(data.installations);
    result.push(...installations.filter((item) => String(item.app_id) === process.env.GITHUB_APP_ID && !item.suspended_at));
    if (installations.length < 100) return result;
  }
  throw new Error("Installation listing limit exceeded");
}
export async function authorizedRepository(token: string, installationId: number, repositoryId: number, login: string) {
  const installation = (await userInstallations(token)).find((item) => item.id === githubId.parse(installationId));
  if (!installation) throw new GitHubError(403);
  // Search the user/installation intersection, never the app's broader repository list.
  for (let page = 1; page <= 20; page++) {
    const data = await github<{ repositories: unknown[] }>(`/user/installations/${installationId}/repositories?per_page=100&page=${page}`, token);
    const repos = z.array(repositorySchema).max(100).parse(data.repositories);
    const repo = repos.find((entry) => entry.id === repositoryId);
    if (repo) {
      // Explicitly verify repository administration, rather than trusting installation membership.
      const permission = await github<{ permission: string }>(`/repos/${repo.full_name}/collaborators/${encodeURIComponent(login)}/permission`, token);
      if (permission.permission !== "admin") throw new GitHubError(403);
      return repo;
    }
    if (repos.length < 100) break;
  }
  throw new GitHubError(403);
}
