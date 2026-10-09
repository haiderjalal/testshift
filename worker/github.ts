import { z } from "zod";
import { db } from "../src/lib/db";
import { appUrl } from "../src/lib/email";
import { log } from "../src/lib/log";
import { github, githubConfigured, GitHubError, githubId, repoName, withInstallation } from "../src/lib/github/api";
import { claimGitHubJob } from "../src/lib/github/store";

const runSchema = z.object({ id: githubId, run_attempt: z.number().int().positive(), head_sha: z.string().regex(/^[a-f0-9]{40}$/),
  path: z.string().max(300), status: z.string(), conclusion: z.string().nullable(), event: z.string(),
  repository: z.object({ id: githubId, full_name: repoName }), head_repository: z.object({ id: githubId }).nullable(),
});
const jobSchema = z.object({ id: githubId, name: z.string().max(300), status: z.string(), conclusion: z.string().nullable(),
  steps: z.array(z.object({ name: z.string().max(300), status: z.string(), conclusion: z.string().nullable(), number: z.number().int() })).max(1000).optional(),
});
export interface WorkflowReport {
  scope: string; runId: number; attempt: number; commit: string; workflow: string; conclusion: string;
  jobs: z.infer<typeof jobSchema>[]; untested: string[];
}
export function verifiedReport(run: z.infer<typeof runSchema>, jobs: z.infer<typeof jobSchema>[], expected: { repositoryId: number; runId: number; attempt: number; sha: string; workflow: string }): WorkflowReport {
  if (run.id !== expected.runId || run.repository.id !== expected.repositoryId || run.run_attempt !== expected.attempt || run.head_sha !== expected.sha || run.path !== expected.workflow || run.status !== "completed")
    throw new GitHubError(422);
  if (!run.head_repository || run.head_repository.id !== expected.repositoryId || !["push", "pull_request", "workflow_dispatch", "schedule"].includes(run.event)) throw new GitHubError(422);
  if (!jobs.length || jobs.some((job) => job.status !== "completed")) throw new GitHubError(422);
  const hasExecuted = jobs.some((job) => job.steps?.some((step) => step.conclusion === "success"));
  const conclusion = run.conclusion === "success" && hasExecuted ? "success" : run.conclusion === "cancelled" ? "cancelled"
    : ["failure", "timed_out", "action_required"].includes(run.conclusion ?? "") ? "failure" : "neutral";
  return { scope: "Verified GitHub workflow job and step outcomes; individual assertion coverage is not inferred", runId: run.id, attempt: run.run_attempt,
    commit: run.head_sha, workflow: run.path, conclusion, jobs,
    untested: ["Coverage outside the configured workflow", "Individual test assertions not supplied by GitHub job metadata", "Production destructive operations (not authorized)"] };
}
const safe = (value: string) => value.replace(/[\r\n<>`|\[\]]/g, " ").slice(0, 160);
export function reportMarkdown(report: WorkflowReport) {
  return [report.scope, "", `Commit: ${report.commit}`, `Workflow: ${safe(report.workflow)}`, `Attempt: ${report.attempt}`, "",
    ...report.jobs.flatMap((job) => [`- ${safe(job.name)}: ${safe(job.conclusion ?? job.status)}`,
      ...(job.steps ?? []).map((step) => `  - ${safe(step.name)}: ${safe(step.conclusion ?? step.status)}`)]), "",
    "Unverified / outside scope:", ...report.untested.map((gap) => `- ${gap}`)].join("\n").slice(0, 60_000);
}
export async function processGitHubJob() {
  const sql = db(); const job = await claimGitHubJob(sql);
  if (!job) return false;
  try {
    const rows = await sql`select c.*,u.login from github_connections c join github_users u on u.id = c.user_id where c.id = ${job.connection_id} and c.active`;
    const connection = rows[0]; if (!connection) throw new GitHubError(403);
    repoName.parse(connection.full_name);
    await withInstallation(Number(connection.installation_id), Number(connection.repository_id), true, async (token) => {
      const permission = await github<{ permission: string }>(`/repos/${connection.full_name}/collaborators/${encodeURIComponent(connection.login)}/permission`, token);
      if (permission.permission !== "admin") throw new GitHubError(403);
      const run = runSchema.parse(await github(`/repos/${connection.full_name}/actions/runs/${job.workflow_run_id}/attempts/${job.run_attempt}`, token));
      const jobs: z.infer<typeof jobSchema>[] = [];
      for (let page = 1; page <= 10; page++) {
        const data = await github<{ jobs: unknown[] }>(`/repos/${connection.full_name}/actions/runs/${job.workflow_run_id}/attempts/${job.run_attempt}/jobs?per_page=100&page=${page}`, token);
        const batch = z.array(jobSchema).max(100).parse(data.jobs); jobs.push(...batch);
        if (batch.length < 100) break;
        if (page === 10) throw new GitHubError(422);
      }
      const report = verifiedReport(run, jobs, { repositoryId: Number(connection.repository_id), runId: Number(job.workflow_run_id), attempt: job.run_attempt, sha: job.head_sha, workflow: connection.workflow_path });
      // Re-check the lease and connection after network reads. Removal/revocation blocks publication.
      const live = await sql`select j.id from github_jobs j join github_connections c on c.id = j.connection_id
        where j.id = ${job.id} and j.lease_id = ${job.lease_id} and j.status = 'processing' and j.lease_until > now() and c.active`;
      if (!live.length) throw new GitHubError(403);
      const externalId = `testshift:${job.id}`;
      let checkId = job.check_id;
      if (!checkId) {
        // Recover a check created before a crash; only this App's check and exact external ID qualify.
        for (let page = 1; page <= 10 && !checkId; page++) {
          const list = await github<{ check_runs: { id: number; external_id: string | null; app: { id: number } }[] }>(`/repos/${connection.full_name}/commits/${job.head_sha}/check-runs?check_name=TestShift%20QA&filter=all&per_page=100&page=${page}`, token);
          checkId = list.check_runs.find((entry) => entry.external_id === externalId && String(entry.app.id) === process.env.GITHUB_APP_ID)?.id;
          if (list.check_runs.length < 100) break;
        }
      }
      const body = { name: "TestShift QA", external_id: externalId, status: "completed", conclusion: report.conclusion,
        completed_at: new Date().toISOString(), details_url: new URL(`/repositories/jobs/${job.id}`, appUrl()).href,
        output: { title: `TestShift: ${report.conclusion}`, summary: reportMarkdown(report) } };
      const check = await github<{ id: number }>(checkId ? `/repos/${connection.full_name}/check-runs/${checkId}` : `/repos/${connection.full_name}/check-runs`, token, checkId ? "PATCH" : "POST", checkId ? body : { ...body, head_sha: job.head_sha });
      githubId.parse(check.id);
      await sql`update github_jobs set status = 'completed', conclusion = ${report.conclusion}, report = ${sql.json(report as unknown as postgresJson)}, check_id = ${check.id},
        completed_at = now(), lease_id = null, lease_until = null where id = ${job.id} and lease_id = ${job.lease_id} and status = 'processing'
        and exists (select 1 from github_connections where id = ${job.connection_id} and active)`;
    });
  } catch (error) {
    const blocked = error instanceof GitHubError && [401, 403, 404, 422].includes(error.status);
    const exhausted = job.attempts >= 5;
    await sql`update github_jobs set status = ${blocked ? "blocked" : exhausted ? "failed" : "queued"},
      conclusion = ${blocked ? "access-or-workflow-unverified" : exhausted ? "integration-unavailable" : null},
      lease_id = null, lease_until = null, next_attempt_at = now() + ${Math.min(600, 15 * 2 ** job.attempts)} * interval '1 second',
      completed_at = ${blocked || exhausted ? new Date() : null} where id = ${job.id} and lease_id = ${job.lease_id} and status = 'processing'`;
    log("warn", "GitHub report job deferred or blocked", { requestId: job.id });
  }
  return true;
}
type postgresJson = import("postgres").JSONValue;
export async function sweepGitHubJobs() {
  // Retention and abandoned final leases are bounded even if the process crashed on its last attempt.
  await db()`update github_jobs set status = 'failed', conclusion = 'retry-limit', lease_id = null, lease_until = null, completed_at = now()
    where status = 'processing' and lease_until < now() and attempts >= 5`;
  await db()`delete from github_jobs where created_at < now() - interval '30 days'`;
  await db()`delete from github_deliveries where received_at < now() - interval '30 days'`;
  await db()`delete from github_sessions where expires_at < now()`;
  await db()`delete from github_states where expires_at < now()`;
  const { generationEnabled } = await import("../src/lib/github/generation-store");
  if (generationEnabled()) {
    try {
      await db()`update github_generations set status = 'blocked', failure_code = 'generation-access-revoked', lease_id = null, lease_until = null, completed_at = now()
        where status in ('queued','processing') and connection_id in (select id from github_connections where not active)`;
      await db()`update github_generations set status = 'failed', failure_code = 'retry-limit', lease_id = null, lease_until = null, completed_at = now()
        where status = 'processing' and lease_until < now() and attempts >= 5`;
      await db()`update github_generations set artifact = null where status in ('review_ready','failed','blocked') and completed_at < now() - interval '7 days'`;
      await db()`delete from github_generations where created_at < now() - interval '30 days'`;
      await db()`delete from github_generation_daily where day < current_date - 30`;
      await db()`delete from github_generation_reservations where created_at < now() - interval '30 days'`;
    } catch { log("error", "Repository generation maintenance unavailable; check migration"); }
  }
}
export async function runGitHubWorker() {
  if (!githubConfigured()) throw new Error("GitHub integration is not configured");
  const { generationEnabled, generationWorkerConfigured } = await import("../src/lib/github/generation-store");
  if (generationEnabled() && !generationWorkerConfigured()) log("error", "Repository generation requires ANTHROPIC_API_KEY in the GitHub worker");
  let stopping = false; process.once("SIGTERM", () => { stopping = true; }); process.once("SIGINT", () => { stopping = true; });
  let lastSweep = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastSweep > 60_000) { await sweepGitHubJobs(); lastSweep = Date.now(); }
      const reporting = await processGitHubJob();
      const { processRepositoryGeneration } = await import("./repository-generation");
      let generating = false;
      try { generating = await processRepositoryGeneration(); }
      catch { log("error", "Repository generation unavailable; check migration and worker configuration"); }
      if (!reporting && !generating) await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch { log("error", "GitHub worker unavailable"); await new Promise((resolve) => setTimeout(resolve, 5000)); }
  }
  await db().end();
}
