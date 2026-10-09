"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionRequest } from "@/lib/action-security";
import { db, isUuid } from "@/lib/db";
import { githubRepository } from "@/lib/repository-testing";
import { github, githubConfigured, githubId, authorizedRepository, repositorySchema, workflowPath } from "@/lib/github/api";
import { CUSTOMER_COOKIE, customerSession, customerToken } from "@/lib/github/session";
import { allow } from "@/lib/rateLimit";
import { log } from "@/lib/log";

export interface RepositoryState { message?: string; success?: boolean }
export async function connectRepository(_previous: RepositoryState, data: FormData): Promise<RepositoryState> {
  const requestId = await actionRequest(data);
  if (!requestId || !githubConfigured()) return { message: "Connection unavailable. Refresh and try again." };
  const customer = await customerSession();
  if (!customer) return { message: "Sign in with GitHub first." };
  const installation = githubId.safeParse(data.get("installation"));
  const path = workflowPath.safeParse(data.get("workflow") ?? ".github/workflows/testshift.yml");
  const url = String(data.get("repository") ?? "").trim();
  if (!installation.success || !path.success || !githubRepository(url) || data.get("consent") !== "on") return { message: "Choose an installation, enter a GitHub repository link and confirm your authority to connect it." };
  try {
    if (!(await allow(`github-connect:${customer.user_id}`, 20, 3600))) return { message: "Too many connection requests. Try again later." };
    const token = customerToken(customer);
    const fullName = new URL(url).pathname.replace(/^\/|\/$/g, "");
    const repo = repositorySchema.parse(await github(`/repos/${fullName}`, token));
    await authorizedRepository(token, installation.data, repo.id, customer.login);
    await db().begin(async (sql) => {
      await sql`select id from github_users where id = ${customer.user_id} for update`;
      const existing = await sql`select id from github_connections where user_id = ${customer.user_id} and repository_id = ${repo.id}`;
      const count = await sql`select count(*)::int as count from github_connections where user_id = ${customer.user_id}`;
      if (!existing.length && count[0].count >= 20) throw new Error("Connection limit exceeded");
      await sql`insert into github_connections (user_id,installation_id,repository_id,full_name,workflow_path)
        values (${customer.user_id},${installation.data},${repo.id},${repo.full_name},${path.data})
        on conflict (user_id, repository_id) do update set installation_id = excluded.installation_id, full_name = excluded.full_name, workflow_path = excluded.workflow_path, active = true`;
    });
    revalidatePath("/repositories");
    return { success: true, message: "Repository connected. Add the workflow below to start automatic checks on pushes and pull requests." };
  } catch {
    log("warn", "Repository connection rejected", { requestId });
    return { message: "Could not verify repository administration and installation access. Check the selected repositories in GitHub or sign in again." };
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
