import type postgres from "postgres";
import { db } from "../db";

export function generationEnabled() {
  return process.env.GITHUB_GENERATION_ENABLED === "1";
}
export function generationWorkerConfigured() {
  return generationEnabled() && Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Global row lock bounds paid model requests across all workers and customers. */
export async function enqueueGeneration(sql: postgres.TransactionSql, connectionId: string, userId: string) {
  await sql`insert into github_generation_daily (day) values (current_date) on conflict do nothing`;
  const [budget] = await sql`select requests from github_generation_daily where day = current_date for update`;
  const pending = await sql`select id from github_generations where connection_id = ${connectionId} and status in ('queued','processing')`;
  if (pending.length) return pending[0].id as string;
  const recent = await sql`select id from github_generation_reservations where user_id = ${userId} and created_at > now() - interval '24 hours'`;
  if (budget.requests >= 10 || recent.length >= 3) throw new Error("Generation request limit");
  const [job] = await sql`insert into github_generations (connection_id,consent_version) values (${connectionId},'source-ai-pr-v1') returning id`;
  await sql`insert into github_generation_reservations (user_id) values (${userId})`;
  await sql`update github_generation_daily set requests = requests + 1 where day = current_date`;
  return job.id as string;
}
export async function claimGeneration(sql = db()) {
  // A crashed model request is never repeated automatically: its cost/result is uncertain.
  await sql`update github_generations set status = 'failed', failure_code = 'generation-interrupted', completed_at = now(), lease_id = null, lease_until = null
    where status = 'processing' and lease_until < now() and model_started_at is not null and artifact is null`;
  const [job] = await sql`with candidate as (
    select g.id from github_generations g join github_connections c on c.id = g.connection_id
    where c.active and g.attempts < 5 and g.next_attempt_at <= now() and (g.status = 'queued' or (g.status = 'processing' and g.lease_until < now() and (g.model_started_at is null or g.artifact is not null)))
    order by g.created_at for update of g skip locked limit 1
  ) update github_generations g set status = 'processing', attempts = attempts + 1, lease_id = gen_random_uuid(), lease_until = now() + interval '10 minutes'
    from candidate where g.id = candidate.id returning g.*`;
  return job ?? null;
}
