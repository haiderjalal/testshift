import Image from "next/image";
import Link from "next/link";

import { AGENTS, agentById } from "@/lib/agents";
import type { Run, Severity, TestCase } from "@/lib/db";
import { TRIAL_MINUTES } from "@/lib/plans";
import { assessResults } from "@/lib/qa";

import { AgentPipeline } from "./AgentPipeline";
import { PrintButton } from "./RunControls";

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
const STATUS_MARK: Record<TestCase["status"], { glyph: string; label: string; className: string }> = {
  passed: { glyph: "✓", label: "Passed", className: "text-pass" },
  failed: { glyph: "✗", label: "Failed", className: "text-fail" },
  blocked: { glyph: "‖", label: "Blocked", className: "text-hold" },
  pending: { glyph: "·", label: "Not reached", className: "text-graphite" },
  running: { glyph: "·", label: "Not reached", className: "text-graphite" },
};

function CaseDetails({ c, runId }: { c: TestCase; runId: string }) {
  return (
    <div className="mt-3 space-y-3 text-[15px] leading-relaxed">
      <ol className="list-decimal space-y-1 pl-5 text-graphite">
        {c.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <p>
        <span className="font-medium">Expected:</span> <span className="text-graphite">{c.expected}</span>
      </p>
      {c.actual && (
        <p>
          <span className="font-medium">Actual:</span> <span className="text-graphite">{c.actual}</span>
        </p>
      )}
      {c.has_screenshot && (
        <Image
          src={`/runs/${runId}/shots/${c.id}`}
          alt={`Screenshot when “${c.title}” failed`}
          width={1280}
          height={800}
          unoptimized
          className="w-full rounded-lg border border-rule"
        />
      )}
    </div>
  );
}

export function Report({ run, cases }: { run: Run; cases: TestCase[] }) {
  const report = run.report;
  const count = (status: TestCase["status"]) => cases.filter((c) => c.status === status).length;
  const bugs = cases
    .filter((c) => c.status === "failed")
    .sort((a, b) => SEVERITY_ORDER[a.severity ?? "minor"] - SEVERITY_ORDER[b.severity ?? "minor"]);
  const notReached = count("pending") + count("running");
  const assessment = assessResults(cases, run.strategy);
  const verdict = assessment.verdict;
  const features = run.strategy?.features ?? [];
  const covered = assessment.coverage.filter((f) => f.covered).length;
  const score = assessment.score ?? 0;

  return (
    <div className="mt-8 space-y-14">
      <section aria-labelledby="summary-heading" className="grid gap-8 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <div
            role="img"
            aria-label={assessment.score === null ? "Insufficient evidence to score" : `Completed-check score ${score} out of 100`}
            className="grid size-36 place-items-center rounded-full"
            style={{
              background: `radial-gradient(closest-side, var(--color-paper) 84%, transparent 85%), conic-gradient(var(--color-dev), var(--color-staging), var(--color-uat) ${score}%, var(--color-rule) 0)`,
            }}
          >
            <span className="text-center">
              <span className="block font-display text-5xl font-semibold tracking-tight">{assessment.score === null ? "–" : score}</span>
              <span className="font-mono text-xs text-graphite">of 100</span>
            </span>
          </div>
          <p className="rounded-full border px-3 py-1 font-mono text-xs tracking-wide uppercase" style={{ borderColor: verdict.color, color: verdict.color }}>
            {verdict.label}
          </p>
        </div>
        <div>
          <h2 id="summary-heading" className="font-display text-2xl font-semibold tracking-tight">
            Shift report
          </h2>
          <p className="mt-2 font-mono text-sm text-graphite">
            {cases.length} tests · <span className="text-pass">{count("passed")} passed</span> ·{" "}
            <span className="text-fail">{count("failed")} failed</span> · {count("blocked")} blocked
            {notReached > 0 && ` · ${notReached} not reached`}
          </p>
          <p className="mt-1 text-sm" style={{ color: verdict.color }}>
            Release: {verdict.note}
          </p>
          {features.length > 0 && (
            <p className="mt-1 font-mono text-xs text-graphite">
              Coverage: {covered} of {features.length} features have completed checks
            </p>
          )}
          <p className="mt-2 text-sm text-graphite">The score describes completed checks only. Blocked and untested behavior is not a pass.</p>
          {assessment.gaps.length > 0 && <details className="mt-3 text-sm text-graphite"><summary className="cursor-pointer">Coverage gaps ({assessment.gaps.length})</summary><ul className="mt-2 list-disc pl-5">{assessment.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></details>}
          {report?.summary.split(/\n\s*\n/).map((p, i) => (
            <p key={i} className="mt-4 leading-relaxed">
              {p}
            </p>
          ))}
          <div className="mt-6 flex flex-wrap gap-3 print:hidden">
            <a href={`/runs/${run.id}/spec`} className="btn-primary h-11">
              Download Playwright suite
            </a>
            <PrintButton />
          </div>
        </div>
      </section>

      <section aria-labelledby="agents-heading" className="space-y-4">
        <h2 id="agents-heading" className="font-display text-xl font-semibold tracking-tight">
          The four agents
        </h2>
        <AgentPipeline cases={cases} phase="after" />
        {report?.agentNotes && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {AGENTS.map((a) =>
              report.agentNotes?.[a.id] ? (
                <li key={a.id} className="glass rounded-2xl p-4 text-sm leading-relaxed">
                  <span className="font-mono text-[11px] tracking-widest uppercase" style={{ color: a.color }}>
                    {a.name}
                  </span>
                  <p className="mt-1 text-graphite">{report.agentNotes[a.id]}</p>
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>

      {run.is_trial && (
        <section className="glow-card relative overflow-hidden bg-card p-7 print:hidden">
          <h2 className="font-display text-xl font-semibold">That was your free {TRIAL_MINUTES}-minute shift.</h2>
          <p className="mt-2 max-w-xl text-graphite">
            A longer shift gives every agent more time: more pages, more edge cases, mobile checks. Book hours and the
            agents pick up on {new URL(run.url).hostname}.
          </p>
          <Link href={`/hire?url=${encodeURIComponent(run.url)}&plan=${run.plan}&hours=2`} className="btn-primary mt-5 h-11">
            Book more hours
          </Link>
        </section>
      )}

      <section aria-labelledby="bugs-heading">
        <h2 id="bugs-heading" className="font-display text-xl font-semibold tracking-tight">
          Bugs found <span className="font-mono text-base text-graphite">({bugs.length})</span>
        </h2>
        {bugs.length === 0 ? (
          <p className="mt-4 text-graphite">No confirmed bugs in the completed checks. Review coverage gaps before making a release decision.</p>
        ) : (
          <ol className="mt-6 space-y-4">
            {bugs.map((c) => {
              const agent = agentById(c.agent);
              return (
                <li key={c.id} className="glass rounded-2xl p-6" style={{ borderLeft: `3px solid ${agent.color}` }}>
                  <p className="flex flex-wrap gap-x-3 font-mono text-xs font-semibold tracking-wider uppercase">
                    <span className="text-fail">{c.severity}</span>
                    <span style={{ color: agent.color }}>{agent.name}</span>
                    <span className="text-graphite">
                      {agent.testType} · {c.viewport}
                    </span>
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">
                    <span className="marker">{c.title}</span>
                  </h3>
                  <CaseDetails c={c} runId={run.id} />
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {report && (
        <section className="grid gap-10 sm:grid-cols-2">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">What works well</h2>
            <ul className="mt-4 space-y-3">
              {report.strengths.map((s, i) => (
                <li key={i} className="flex gap-3 leading-relaxed">
                  <span aria-hidden className="font-mono text-pass">
                    ✓
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight">Fix first</h2>
            <ol className="mt-4 space-y-3">
              {report.recommendations.map((r, i) => (
                <li key={i} className="flex gap-3 leading-relaxed">
                  <span className="font-mono text-dev">{i + 1}</span>
                  {r}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section aria-labelledby="cases-heading" className="space-y-8">
        <h2 id="cases-heading" className="font-display text-xl font-semibold tracking-tight">
          All test cases
        </h2>
        {AGENTS.map((agent) => {
          const own = cases.filter((c) => c.agent === agent.id);
          if (own.length === 0) return null;
          return (
            <div key={agent.id}>
              <h3 className="flex items-center gap-3 font-mono text-xs tracking-widest uppercase">
                <span className="size-2 rounded-full" style={{ background: agent.color }} />
                <span style={{ color: agent.color }}>{agent.name}</span>
                <span className="text-graphite">
                  {agent.testType} · {own.length}
                </span>
              </h3>
              <ul className="mt-3 divide-y divide-rule border-y border-rule">
                {own.map((c) => {
                  const mark = STATUS_MARK[c.status];
                  return (
                    <li key={c.id}>
                      <details className="group py-3">
                        <summary className="flex cursor-pointer list-none items-baseline gap-3">
                          <span className={`w-3 shrink-0 font-mono font-semibold ${mark.className}`}>
                            <span aria-hidden>{mark.glyph}</span>
                            <span className="sr-only">{mark.label}:</span>
                          </span>
                          <span className="w-10 shrink-0 font-mono text-sm text-graphite">#{c.seq}</span>
                          <span className="flex-1">{c.title}</span>
                          <span className="hidden font-mono text-xs text-graphite sm:inline">
                            {c.category} · {c.viewport}
                          </span>
                        </summary>
                        <div className="pl-[4.75rem]">
                          <CaseDetails c={c} runId={run.id} />
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
