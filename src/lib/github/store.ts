import { z } from "zod";
import type postgres from "postgres";
import { db, isUuid } from "../db";
import { githubId, repoName } from "./api";

const baseEvent = z.object({ action: z.string().max(80).optional(), installation: z.object({ id: githubId }).optional() });
const workflowEvent = baseEvent.extend({ repository: z.object({ id: githubId, full_name: repoName }), workflow_run: z.object({
  id: githubId, run_attempt: z.number().int().min(1).max(10000), head_sha: z.string().regex(/^[a-f0-9]{40}$/), path: z.string().max(300), status: z.string(),
}) });
/** Deduplication and all state changes commit together. A failed transaction can be redelivered. */
export async function recordWebhook(sql: postgres.Sql, delivery: string, event: string, payload: unknown) {
  if (!isUuid(delivery)) throw new Error("Invalid delivery ID");
  return sql.begin(async (tx) => {
    const base = baseEvent.parse(payload);
    const inserted = await tx`insert into github_deliveries (id,event) values (${delivery},${event}) on conflict do nothing returning id`;
    if (!inserted.length) return "duplicate";
    if (event === "installation" && ["deleted", "suspend"].includes(base.action ?? "") && base.installation) {
      await tx`update github_connections set active = false where installation_id = ${base.installation.id}`;
      await tx`update github_jobs set status = 'blocked', conclusion = 'installation-unavailable', lease_id = null, lease_until = null, completed_at = now()
        where connection_id in (select id from github_connections where installation_id = ${base.installation.id}) and status in ('queued','processing')`;
    } else if (event === "installation_repositories" && base.action === "removed" && base.installation) {
      const removed = z.object({ repositories_removed: z.array(z.object({ id: githubId })).max(2000) }).parse(payload).repositories_removed;
      for (const repo of removed) {
        await tx`update github_connections set active = false where installation_id = ${base.installation.id} and repository_id = ${repo.id}`;
        await tx`update github_jobs set status = 'blocked', conclusion = 'repository-removed', lease_id = null, lease_until = null, completed_at = now()
          where connection_id in (select id from github_connections where installation_id = ${base.installation.id} and repository_id = ${repo.id}) and status in ('queued','processing')`;
      }
    } else if (event === "github_app_authorization" && base.action === "revoked") {
      const sender = z.object({ sender: z.object({ id: githubId }) }).parse(payload).sender;
      await tx`delete from github_sessions where user_id = ${sender.id}`;
      await tx`update github_connections set active = false where user_id = ${sender.id}`;
      await tx`update github_jobs set status = 'blocked', conclusion = 'authorization-revoked', lease_id = null, lease_until = null, completed_at = now()
        where connection_id in (select id from github_connections where user_id = ${sender.id}) and status in ('queued','processing')`;
    } else if (event === "workflow_run" && base.action === "completed") {
      const data = workflowEvent.parse(payload);
      if (!data.installation || data.workflow_run.status !== "completed") return "ignored";
      const connections = await tx`select id from github_connections where active and installation_id = ${data.installation.id}
        and repository_id = ${data.repository.id} and full_name = ${data.repository.full_name} and workflow_path = ${data.workflow_run.path}`;
      for (const connection of connections) await tx`insert into github_jobs (connection_id, workflow_run_id, run_attempt, head_sha)
        values (${connection.id},${data.workflow_run.id},${data.workflow_run.run_attempt},${data.workflow_run.head_sha}) on conflict do nothing`;
    }
    return "accepted";
  });
}
export async function claimGitHubJob(sql = db()) {
  const rows = await sql`with candidate as (
    select j.id from github_jobs j join github_connections c on c.id = j.connection_id
    where c.active and j.attempts < 5 and j.next_attempt_at <= now() and
      (j.status = 'queued' or (j.status = 'processing' and j.lease_until < now()))
    order by j.created_at for update of j skip locked limit 1
  ) update github_jobs j set status = 'processing', attempts = attempts + 1, lease_id = gen_random_uuid(), lease_until = now() + interval '5 minutes'
    from candidate where j.id = candidate.id returning j.*`;
  return rows[0] ?? null;
}
