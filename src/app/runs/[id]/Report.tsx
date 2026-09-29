import Image from "next/image";

import Link from "next/link";

import type { Run, Severity, TestCase } from "@/lib/db";
import { TRIAL_MINUTES } from "@/lib/plans";

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

  return (
    <div className="mt-8 space-y-16">
      <section aria-labelledby="summary-heading" className="grid gap-8 sm:grid-cols-[auto_1fr]">
        <div className="flex size-32 flex-col items-center justify-center rounded-full border-2 border-ink">
          <span className="text-5xl font-semibold tracking-tight">{report?.score ?? "–"}</span>
          <span className="font-mono text-xs text-graphite">of 100</span>
        </div>
        <div>
          <h2 id="summary-heading" className="text-2xl font-semibold">
            Shift report
          </h2>
          <p className="mt-2 font-mono text-sm text-graphite">
            {cases.length} tests · <span className="text-pass">{count("passed")} passed</span> ·{" "}
            <span className="text-fail">{count("failed")} failed</span> · {count("blocked")} blocked
            {notReached > 0 && ` · ${notReached} not reached`}
          </p>
          {report?.summary.split(/\n\s*\n/).map((p, i) => (
            <p key={i} className="mt-4 leading-relaxed">
              {p}
            </p>
          ))}
          <div className="mt-6 flex flex-wrap gap-3 print:hidden">
            <a
              href={`/runs/${run.id}/spec`}
              className="rounded-full bg-ink px-5 py-2.5 font-medium text-paper hover:bg-ink/85"
            >
              Download Playwright suite
            </a>
            <PrintButton />
          </div>
        </div>
      </section>

      {run.is_trial && (
        <section className="rounded-2xl bg-ink p-7 text-paper print:hidden">
          <h2 className="text-xl font-semibold">That was your free {TRIAL_MINUTES}-minute shift.</h2>
          <p className="mt-2 max-w-xl text-paper/70">
            A longer shift covers more pages, edge cases and mobile checks. Book hours and the tester picks up where it
            left off on {new URL(run.url).hostname}.
          </p>
          <Link
            href={`/hire?url=${encodeURIComponent(run.url)}&plan=${run.plan}&hours=2`}
            className="mt-5 inline-block rounded-full bg-marker px-5 py-2.5 font-medium text-ink hover:bg-marker/85"
          >
            Book more hours
          </Link>
        </section>
      )}

      <section aria-labelledby="bugs-heading">
        <h2 id="bugs-heading" className="text-2xl font-semibold">
          Bugs found <span className="font-mono text-base text-graphite">({bugs.length})</span>
        </h2>
        {bugs.length === 0 ? (
          <p className="mt-4 text-graphite">No bugs found in this shift. Every test that ran passed or was blocked.</p>
        ) : (
          <ol className="mt-6 space-y-4">
            {bugs.map((c) => (
              <li key={c.id} className="rounded-2xl border border-rule bg-card p-6">
                <p className="font-mono text-xs font-semibold tracking-wider text-fail uppercase">
                  {c.severity} · {c.category} · {c.viewport}
                </p>
                <h3 className="mt-2 text-lg font-semibold">
                  <span className="marker">{c.title}</span>
                </h3>
                <CaseDetails c={c} runId={run.id} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {report && (
        <section className="grid gap-10 sm:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold">What works well</h2>
            <ul className="mt-4 space-y-3">
              {report.strengths.map((s) => (
                <li key={s} className="flex gap-3 leading-relaxed">
                  <span aria-hidden className="font-mono text-pass">
                    ✓
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Fix first</h2>
            <ol className="mt-4 space-y-3">
              {report.recommendations.map((r, i) => (
                <li key={r} className="flex gap-3 leading-relaxed">
                  <span className="font-mono text-graphite">{i + 1}</span>
                  {r}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <section aria-labelledby="cases-heading">
        <h2 id="cases-heading" className="text-2xl font-semibold">
          All test cases
        </h2>
        <ul className="mt-6 divide-y divide-rule border-y border-rule">
          {cases.map((c) => {
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
      </section>
    </div>
  );
}
