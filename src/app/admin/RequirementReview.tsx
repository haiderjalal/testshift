import { loadRequirementRuns, type RequirementProposal, type RequirementRun } from "./requirements-data";
import { decideRequirementTest, requestRequirementTests } from "./requirements-actions";

const STATUS_LABEL: Record<RequirementProposal["status"], string> = {
  proposed: "Awaiting your review",
  approved: "Approved, will run in the shift",
  rejected: "Rejected",
};

export async function RequirementReview() {
  const runs = await loadRequirementRuns();
  return (
    <section aria-labelledby="requirements-heading" className="mt-6 space-y-5 rounded-2xl border border-rule bg-card p-6">
      <div className="space-y-2">
        <h2 id="requirements-heading" className="font-display text-lg font-semibold">
          Requirement tests to review
        </h2>
        <p className="text-sm text-graphite">
          Customers can paste requirements at booking. Generate tests from them, then approve only the ones you trust. Approved tests join the shift as pending tests, and each one shows the requirement it checks.
        </p>
      </div>
      {runs.length === 0 ? (
        <p className="text-sm text-graphite">No requirements have been submitted yet.</p>
      ) : (
        runs.map((run) => <RunReview key={run.id} run={run} />)
      )}
    </section>
  );
}

function RunReview({ run }: { run: RequirementRun }) {
  const finished = run.status === "completed" || run.status === "failed";
  return (
    <article aria-label={`Requirements for ${run.url}`} className="space-y-4 rounded-xl border border-rule p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-mono text-sm break-all">{run.url}</p>
        <p className="font-mono text-xs text-graphite">
          {run.plan} · {run.status}
        </p>
      </div>
      <pre className="max-h-48 overflow-auto rounded-lg bg-paper/60 p-3 text-sm whitespace-pre-wrap">{run.requirements}</pre>

      {run.proposals.length === 0 ? (
        finished ? (
          <p className="text-sm text-graphite">This shift has finished, so new tests cannot be added.</p>
        ) : run.requested ? (
          <p className="text-sm text-graphite">Generating tests. This usually takes under a minute once the worker is idle.</p>
        ) : (
          <form action={requestRequirementTests}>
            <input type="hidden" name="runId" value={run.id} />
            <button className="btn-primary h-10">Generate tests from these requirements</button>
          </form>
        )
      ) : (
        <ol className="space-y-3">
          {run.proposals.map((p) => (
            <li key={p.id} className="space-y-2 rounded-lg border border-rule p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-medium">{p.title}</p>
                <p className="font-mono text-xs text-graphite">
                  {p.priority} · {p.viewport}
                </p>
              </div>
              <p className="text-sm text-graphite">
                <span className="font-medium text-ink">Requirement:</span> {p.requirement}
              </p>
              <p className="text-sm text-graphite">
                <span className="font-medium text-ink">Expected:</span> {p.expected}
              </p>
              <p className="font-mono text-xs break-all text-graphite">{p.start_url}</p>
              <p className="text-xs text-graphite">{STATUS_LABEL[p.status]}</p>
              {p.status === "proposed" && !finished && (
                <div className="flex flex-wrap gap-3">
                  <form action={decideRequirementTest}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <button className="btn-primary h-9 px-4 text-sm">Approve</button>
                  </form>
                  <form action={decideRequirementTest}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <button className="h-9 rounded-full border border-rule px-4 text-sm text-graphite hover:text-ink">Reject</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
