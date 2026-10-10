import type { ReactElement } from "react";

import { SpotlightCard } from "@/components/SpotlightCard";
import type { Run, TestCase } from "@/lib/db";
import { assessResults } from "@/lib/qa";

import { PrintButton } from "./RunControls";

/** The customer-facing verdict: score ring, verdict label, outcome bar and the summary with its actions. */
export function VerdictHero({ run, cases }: { run: Run; cases: TestCase[] }): ReactElement {
  const assessment = assessResults(cases, run.strategy);
  const verdict = assessment.verdict;
  const features = run.strategy?.features ?? [];
  const covered = assessment.coverage.filter((f) => f.covered).length;
  const score = assessment.score ?? 0;
  const count = (status: TestCase["status"]) => cases.filter((c) => c.status === status).length;
  const notReached = count("pending") + count("running");
  const segments = [
    { count: count("passed"), className: "bg-pass" },
    { count: count("failed"), className: "bg-fail" },
    { count: count("blocked"), className: "bg-hold" },
    { count: notReached, className: "bg-graphite/40" },
  ];

  return (
    <SpotlightCard accent={verdict.color} className="glass glass-strong rounded-3xl p-6 sm:p-10">
      <section aria-labelledby="summary-heading" className="grid gap-8 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex flex-col items-center gap-4">
          <div
            role="img"
            aria-label={assessment.score === null ? "Insufficient evidence to score" : `Completed-check score ${score} out of 100`}
            className="grid size-40 place-items-center rounded-full"
            style={{
              background: `radial-gradient(closest-side, var(--color-card) 84%, transparent 85%), conic-gradient(var(--color-dev), var(--color-staging), var(--color-uat) ${score}%, var(--color-rule) 0)`,
            }}
          >
            <span className="text-center">
              <span className="block font-display text-5xl font-semibold tracking-tight">
                {assessment.score === null ? "–" : <span className="count-up" style={{ ["--to" as string]: score }} aria-hidden />}
              </span>
              <span className="font-mono text-xs text-graphite">of 100</span>
            </span>
          </div>
          <p className="rounded-full border px-4 py-1.5 font-mono text-xs tracking-wide uppercase" style={{ borderColor: verdict.color, color: verdict.color }}>
            {verdict.label}
          </p>
        </div>

        <div className="min-w-0">
          <h2 id="summary-heading" className="font-display text-3xl font-semibold tracking-tight">
            Shift report
          </h2>
          <p className="mt-3 font-mono text-sm text-graphite">
            {cases.length} tests · <span className="text-pass">{count("passed")} passed</span> ·{" "}
            <span className="text-fail">{count("failed")} failed</span> · {count("blocked")} blocked
            {notReached > 0 && ` · ${notReached} not reached`}
          </p>
          {cases.length > 0 && (
            <div aria-hidden className="mt-3 flex h-2 overflow-hidden rounded-full bg-rule">
              {segments.map((s) =>
                s.count > 0 ? (
                  <span key={s.className} className={`h-full ${s.className}`} style={{ width: `${(s.count / cases.length) * 100}%` }} />
                ) : null,
              )}
            </div>
          )}
          <p className="mt-3 text-sm" style={{ color: verdict.color }}>
            Release: {verdict.note}
          </p>
          {features.length > 0 && (
            <p className="mt-1 font-mono text-xs text-graphite">
              Coverage: {covered} of {features.length} features have completed checks
            </p>
          )}
          <p className="mt-2 text-sm text-graphite">The score describes completed checks only. Blocked and untested behavior is not a pass.</p>
          {assessment.gaps.length > 0 && (
            <details className="mt-4 rounded-2xl border border-rule p-4 text-sm text-graphite">
              <summary className="cursor-pointer text-ink">Coverage gaps ({assessment.gaps.length})</summary>
              <ul className="mt-3 list-disc space-y-1 pl-5">
                {assessment.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </details>
          )}
          {run.report?.summary.split(/\n\s*\n/).map((p, i) => (
            <p key={i} className="mt-5 leading-relaxed">
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
    </SpotlightCard>
  );
}
