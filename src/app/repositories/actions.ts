"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionRequest } from "@/lib/action-security";
import { db, isUuid } from "@/lib/db";
import { githubRepository } from "@/lib/repository-testing";
import { github, githubConfigured, githubId, authorizedRepository, repositorySchema, repositoryWorkflows, activeRepositoryWorkflow, withGenerationInstallation, type WorkflowChoice } from "@/lib/github/api";
import { enqueueGeneration, generationEnabled } from "@/lib/github/generation-store";
import { CUSTOMER_COOKIE, customerSession, customerToken } from "@/lib/github/session";
import { allow } from "@/lib/rateLimit";
import { log } from "@/lib/log";

export interface RepositoryState { message?: string; success?: boolean }
export interface WorkflowDiscoveryState extends RepositoryState { workflows?: WorkflowChoice[]; installation?: string; repository?: string }
export async function connectAndGenerateTests(_previous: RepositoryState, data: FormData): Promise<RepositoryState> {
  const requestId = await actionRequest(data);
  if (!requestId || !githubConfigured() || !generationEnabled()) return { message: "AI test generation is not enabled by the owner yet." };
  const customer = await customerSession();
  if (!customer) return { message: "Sign in with GitHub first." };
  const installation = githubId.safeParse(data.get("installation"));
  const url = String(data.get("repository") ?? "").trim();
  if (!installation.success || url.length > 300 || !githubRepository(url) || data.get("sourceConsent") !== "on") return { message: "Select your installation, paste the repository URL and approve source analysis and a test pull request." };
  try {
    if (!(await allow(`github-generate:${customer.user_id}`, 6, 3600))) return { message: "Generation request limit reached. Try again later." };
    const token = customerToken(customer), name = new URL(url).pathname.replace(/^\/|\/$/g, "");
    const repo = repositorySchema.parse(await github(`/repos/${name}`, token));
    await authorizedRepository(token, installation.data, repo.id, customer.login);
    // Fail before incurring AI costs if the installed App cannot create the proposed workflow PR.
    await withGenerationInstallation(installation.data, repo.id, async () => undefined);
    await db().begin(async (sql) => {
      await sql`select id from github_users where id = ${customer.user_id} for update`;
      const existing = await sql`select id from github_connections where user_id = ${customer.user_id} and repository_id = ${repo.id}`;
      const [count] = await sql`select count(*)::int as count from github_connections where user_id = ${customer.user_id}`;
      if (!existing.length && count.count >= 20) throw new Error("Connection limit");
      const [connection] = await sql`insert into github_connections (user_id,installation_id,repository_id,full_name,workflow_path)
        values (${customer.user_id},${installation.data},${repo.id},${repo.full_name},'.github/workflows/testshift-generated.yml')
        on conflict (user_id,repository_id) do update set installation_id = excluded.installation_id, full_name = excluded.full_name,
          workflow_path = excluded.workflow_path, active = true returning id`;
      await enqueueGeneration(sql, connection.id, customer.user_id);
    });
    revalidatePath("/repositories");
    return { success: true, message: "Repository connected and test generation queued. Refresh this page for the review PR. Review its tests and GitHub Actions results before merging." };
  } catch {
    log("warn", "Repository generation request rejected", { requestId });
    return { message: "Could not queue generation. Check App permissions (Contents, Pull requests and Workflows write), approve the installation update, and confirm the owner enabled generation and its database migration. Limits: three requests per customer per day, ten globally." };
  }
}
export async function discoverRepositoryWorkflows(_previous: WorkflowDiscoveryState, data: FormData): Promise<WorkflowDiscoveryState> {
  const requestId = await actionRequest(data);
  if (!requestId || !githubConfigured()) return { message: "Workflow discovery unavailable. Refresh and try again." };
  const customer = await customerSession();
  if (!customer) return { message: "Sign in with GitHub first." };
  const installation = githubId.safeParse(data.get("installation"));
  const url = String(data.get("repository") ?? "").trim();
  if (!installation.success || url.length > 300 || !githubRepository(url)) return { message: "Choose an installation and enter a GitHub repository link." };
  try {
    if (!(await allow(`github-discover:${customer.user_id}`, 30, 3600))) return { message: "Too many workflow requests. Try again later." };
    const token = customerToken(customer);
    const fullName = new URL(url).pathname.replace(/^\/|\/$/g, "");
    const repo = repositorySchema.parse(await github(`/repos/${fullName}`, token));
    await authorizedRepository(token, installation.data, repo.id, customer.login);
    const workflows = await repositoryWorkflows(token, repo.full_name);
    return { success: true, installation: String(installation.data), repository: url, workflows,
      message: workflows.length ? "Choose the workflow that runs your tests. We found its location automatically."
        : "No active workflows are available. Add or enable a test workflow in GitHub, then find workflows again." };
  } catch {
    log("warn", "Repository workflow discovery rejected", { requestId });
    return { message: "Could not verify repository administration and installation access, or read its workflows. Check the App's selected repositories and Actions read permission, or sign in again." };
  }
}
export async function connectRepository(_previous: RepositoryState, data: FormData): Promise<RepositoryState> {
  const requestId = await actionRequest(data);
  if (!requestId || !githubConfigured()) return { message: "Connection unavailable. Refresh and try again." };
  const customer = await customerSession();
  if (!customer) return { message: "Sign in with GitHub first." };
  const installation = githubId.safeParse(data.get("installation"));
  const workflowId = githubId.safeParse(data.get("workflowId"));
  const url = String(data.get("repository") ?? "").trim();
  if (!installation.success || !workflowId.success || url.length > 300 || !githubRepository(url) || data.get("consent") !== "on") return { message: "Find and choose a test workflow, then confirm your authority to connect this repository." };
  try {
    if (!(await allow(`github-connect:${customer.user_id}`, 20, 3600))) return { message: "Too many connection requests. Try again later." };
    const token = customerToken(customer);
    const fullName = new URL(url).pathname.replace(/^\/|\/$/g, "");
    const repo = repositorySchema.parse(await github(`/repos/${fullName}`, token));
    await authorizedRepository(token, installation.data, repo.id, customer.login);
    const workflow = await activeRepositoryWorkflow(token, repo.full_name, workflowId.data);
    await db().begin(async (sql) => {
      await sql`select id from github_users where id = ${customer.user_id} for update`;
      const existing = await sql`select id from github_connections where user_id = ${customer.user_id} and repository_id = ${repo.id}`;
      const count = await sql`select count(*)::int as count from github_connections where user_id = ${customer.user_id}`;
      if (!existing.length && count[0].count >= 20) throw new Error("Connection limit exceeded");
      await sql`insert into github_connections (user_id,installation_id,repository_id,full_name,workflow_path)
        values (${customer.user_id},${installation.data},${repo.id},${repo.full_name},${workflow.path})
        on conflict (user_id, repository_id) do update set installation_id = excluded.installation_id, full_name = excluded.full_name, workflow_path = excluded.workflow_path, active = true`;
    });
    revalidatePath("/repositories");
    return { success: true, message: "Repository connected. Results will appear after the selected workflow finishes a new run in GitHub." };
  } catch {
    log("warn", "Repository connection rejected", { requestId });
    return { message: "Could not verify repository administration, installation access or the selected active workflow. Find workflows again, check the App's selected repositories, or sign in again." };
  }
}
export async function disconnectRepository(data: FormData) {
  if (!(await actionRequest(data))) return;
  const customer = await customerSession(); const id = String(data.get("id") ?? "");
  if (!customer || !isUuid(id)) return;
  // Delete private reports and pending jobs too; the customer's GitHub workflow is independent.
  await db()`delete from github_connections where id = ${id} and user_id = ${customer.user_id}`;
  revalidatePath("/repositories");
}
export async function signOutRepository(data: FormData) {
  if (!(await actionRequest(data))) return;
  const customer = await customerSession();
  if (customer) await db()`delete from github_sessions where token_hash = ${customer.token_hash}`;
  (await cookies()).delete({ name: CUSTOMER_COOKIE, path: "/" });
  redirect("/repositories");
}
