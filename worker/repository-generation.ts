import { db } from "../src/lib/db";
import { log } from "../src/lib/log";
import { github, GitHubError, withInstallation, withGenerationInstallation } from "../src/lib/github/api";
import { claimGeneration, generationWorkerConfigured } from "../src/lib/github/generation-store";
import { GenerationError, readRepositorySource, type SourceSnapshot } from "../src/lib/github/source";
import { validateGeneratedSuite } from "../src/lib/github/generated-suite";
import { publishSuite } from "../src/lib/github/publish-suite";
import { generateRepositorySuite } from "./repository-ai";

export async function processRepositoryGeneration(generate = generateRepositorySuite) {
  if (!generationWorkerConfigured()) return false;
  const sql = db(), job = await claimGeneration(sql);
  if (!job) return false;
  const assertLive = async () => {
    const rows = await sql`select g.id from github_generations g join github_connections c on c.id = g.connection_id
      where g.id = ${job.id} and g.lease_id = ${job.lease_id} and g.status = 'processing' and g.lease_until > now() and c.active`;
    if (!rows.length) throw new GenerationError("generation-access-revoked");
  };
  let hasArtifact = Boolean(job.artifact), modelStarted = Boolean(job.model_started_at);
  try {
    const [connection] = await sql`select c.*,u.login from github_connections c join github_users u on u.id = c.user_id where c.id = ${job.connection_id} and c.active`;
    if (!connection) throw new GenerationError("generation-access-revoked");
    const installation = Number(connection.installation_id), repositoryId = Number(connection.repository_id);
    let source: SourceSnapshot, suite;
    if (job.artifact) {
      source = job.artifact.source as SourceSnapshot;
      suite = validateGeneratedSuite(job.artifact.suite, { ...source, files: source.inventory.paths.map(path=>({path,content:""})) });
    } else {
      source = await withInstallation(installation, repositoryId, false, async (token) => {
        const access = await github<{ permission: string }>(`/repos/${connection.full_name}/collaborators/${encodeURIComponent(connection.login)}/permission`, token);
        if (access.permission !== "admin") throw new GenerationError("repository-admin-required");
        return readRepositorySource(token, connection.full_name, repositoryId);
      });
      await assertLive();
      const started = await sql`update github_generations set model_started_at = now(), stage = 'generating', base_sha = ${source.sha}, inventory = ${sql.json(source.inventory)}
        where id = ${job.id} and lease_id = ${job.lease_id} and status = 'processing' and model_started_at is null returning id`;
      if (!started.length) throw new GenerationError("generation-interrupted");
      modelStarted = true;
      const result = await generate(source); suite = validateGeneratedSuite(result.suite, source);
      await assertLive();
      // Store generated code for crash recovery; never persist or log customer source contents.
      const metadata = { ...source, files: [] };
      const saved = await sql`update github_generations set artifact = ${sql.json({ source: metadata, suite } as unknown as import("postgres").JSONValue)},
        input_tokens = ${result.usage.input}, output_tokens = ${result.usage.output}, cost_usd = ${result.usage.cost}, stage = 'publishing'
        where id = ${job.id} and lease_id = ${job.lease_id} and status = 'processing' returning id`;
      if (!saved.length) throw new GenerationError("generation-access-revoked");
      hasArtifact = true;
    }
    const number = await withGenerationInstallation(installation, repositoryId, async (token) => {
      const permission = await github<{ permission: string }>(`/repos/${connection.full_name}/collaborators/${encodeURIComponent(connection.login)}/permission`, token);
      if (permission.permission !== "admin") throw new GenerationError("repository-admin-required");
      return publishSuite(token, job.id, source, suite, assertLive);
    });
    await sql`update github_generations set status = 'review_ready', stage = 'review', pull_number = ${number}, completed_at = now(), lease_id = null, lease_until = null
      where id = ${job.id} and lease_id = ${job.lease_id} and status = 'processing' and exists (select 1 from github_connections where id = ${job.connection_id} and active)`;
  } catch (error) {
    const blocked = error instanceof GenerationError || error instanceof GitHubError && [401,403,404,422].includes(error.status);
    const retry = !blocked && job.attempts < 5 && (!modelStarted || hasArtifact);
    const code = error instanceof GenerationError ? error.code : blocked ? "app-permissions-or-access-required" : "generation-unavailable";
    await sql`update github_generations set status = ${retry ? 'queued' : blocked ? 'blocked' : 'failed'}, failure_code = ${code},
      completed_at = ${retry ? null : new Date()}, lease_id = null, lease_until = null, next_attempt_at = now() + interval '60 seconds'
      where id = ${job.id} and lease_id = ${job.lease_id} and status = 'processing'`;
    log("warn", "Repository generation deferred or blocked", { requestId: job.id });
  }
  return true;
}
