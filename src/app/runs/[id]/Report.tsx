import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";

import { AGENTS, agentById } from "@/lib/agents";
import type { Run, Severity, TestCase } from "@/lib/db";
import { TRIAL_MINUTES } from "@/lib/plans";

import { AgentPipeline } from "./AgentPipeline";
import { ReportPill, type ReportTone } from "./ReportPill";
import { VerdictHero } from "./VerdictHero";

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };
const SEVERITY_TONE: Record<Severity, ReportTone> = { critical: "fail", major: "marker", minor: "hold" };
const STATUS_MARK: Record<TestCase["status"], { glyph: string; label: string; tone: ReportTone }> = {
  passed: { glyph: "✓", label: "Passed", tone: "pass" },
  failed: { glyph: "✗", label: "Failed", tone: "fail" },
  blocked: { glyph: "‖", label: "Blocked", tone: "hold" },
  pending: { glyph: "·", label: "Not reached", tone: "neutral" },
  running: { glyph: "·", label: "Not reached", tone: "neutral" },
};

function CaseDetails({ c, runId }: { c: TestCase; runId: string }) {
  return (
    <div className="mt-4 space-y-4 text-[15px] leading-relaxed">
      {c.requirement && (
        <p>
          <span className="font-medium">Requirement:</span> <span className="text-graphite">{c.requirement}</span>
        </p>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-graphite">
        {c.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <div className="grid gap-3 sm:grid-cols-2">
        <p className="rounded-xl border border-rule p-3">
          <span className="font-medium">Expected:</span> <span className="text-graphite">{c.expected}</span>
        </p>
        {c.actual && (
          <p className="rounded-xl border border-fail/30 bg-fail/5 p-3">
            <span className="font-medium">Actual:</span> <span className="text-graphite">{c.actual}</span>
          </p>
        )}
      </div>
      {c.has_screenshot && (
        <Image
          src={`/runs/${runId}/shots/${c.id}`}
          alt={`Screenshot when “${c.title}” failed`}
          width={1280}
          height={800}
          unoptimized
          className="w-full rounded-xl border border-rule"
        />
      )}
    </div>
  );
}

export function Report({ run, cases }: { run: Run; cases: TestCase[] }): ReactElement {
  const report = run.report;
  const bugs = cases
    .filter((c) => c.status === "failed")
    .sort((a, b) => SEVERITY_ORDER[a.severity ?? "minor"] - SEVERITY_ORDER[b.severity ?? "minor"]);

  return (
    <div className="mt-8 space-y-14">
      <VerdictHero run={run} cases={cases} />

      <section aria-labelledby="agents-heading" className="space-y-4">
        <h2 id="agents-heading" className="font-display text-xl font-semibold tracking-tight">
          The four agents
        </h2>
        <AgentPipeline cases={cases} phase="after" />
        {report?.agentNotes && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {AGENTS.map((a) =>
              report.agentNotes?.[a.id] ? (
                <li key={a.id} className="glass rounded-2xl p-5 text-sm leading-relaxed">
                  <span className="font-mono text-[11px] tracking-widest uppercase" style={{ color: a.color }}>
                    {a.name}
                  </span>
                  <p className="mt-2 text-graphite">{report.agentNotes[a.id]}</p>
                </li>
              ) : null,
            )}
          </ul>
        )}
      </section>

      {run.is_trial && (
        <section className="glass glass-strong glow-card relative overflow-hidden p-7 sm:p-9 print:hidden">
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

      <section aria-labelledby="bugs-heading" className="space-y-6">
        <h2 id="bugs-heading" className="font-display text-xl font-semibold tracking-tight">
          Bugs found <span className="font-mono text-base text-graphite">({bugs.length})</span>
        </h2>
        {bugs.length === 0 ? (
          <p className="glass rounded-2xl p-6 text-graphite">No confirmed bugs in the completed checks. Review coverage gaps before making a release decision.</p>
        ) : (
          <ol className="space-y-4">
            {bugs.map((c, i) => {
              const agent = agentById(c.agent);
              const status = STATUS_MARK[c.status];
              return (
                <li key={c.id} className="glass rounded-3xl p-6 sm:p-7" style={{ borderLeft: `3px solid ${agent.color}` }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-graphite">{String(i + 1).padStart(2, "0")}</span>
                    {c.severity && <ReportPill tone={SEVERITY_TONE[c.severity]}>{c.severity}</ReportPill>}
                    <ReportPill tone={status.tone}>
                      <span aria-hidden>{status.glyph}</span>
                      {status.label}
                    </ReportPill>
                    <span className="font-mono text-xs font-semibold tracking-wider uppercase" style={{ color: agent.color }}>
                      {agent.name}
                    </span>
                    <span className="font-mono text-xs tracking-wider text-graphite uppercase">
                      {agent.testType} · {c.viewport}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">
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
        <section className="grid gap-6 sm:grid-cols-2">
          <div className="glass rounded-3xl p-6 sm:p-7">
            <h2 className="font-display text-xl font-semibold tracking-tight">What works well</h2>
            <ul className="mt-5 space-y-3">
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
          <div className="glass rounded-3xl p-6 sm:p-7">
            <h2 className="font-display text-xl font-semibold tracking-tight">Fix first</h2>
            <ol className="mt-5 space-y-3">
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

      <section aria-labelledby="cases-heading" className="space-y-6">
        <h2 id="cases-heading" className="font-display text-xl font-semibold tracking-tight">
          All test cases
        </h2>
        {AGENTS.map((agent) => {
          const own = cases.filter((c) => c.agent === agent.id);
          if (own.length === 0) return null;
          return (
            <div key={agent.id} className="glass rounded-3xl p-5 sm:p-6">
              <h3 className="flex flex-wrap items-center gap-3 font-mono text-xs tracking-widest uppercase">
                <span className="size-2 rounded-full" style={{ background: agent.color }} />
                <span style={{ color: agent.color }}>{agent.name}</span>
                <span className="text-graphite">
                  {agent.testType} · {own.length}
                </span>
              </h3>
              <ul className="mt-3 divide-y divide-rule">
                {own.map((c) => {
                  const mark = STATUS_MARK[c.status];
                  return (
                    <li key={c.id}>
                      <details className="group">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-2">
                          <ReportPill tone={mark.tone} className="shrink-0">
                            <span aria-hidden>{mark.glyph}</span>
                            <span aria-hidden>{mark.label}</span>
                            <span className="sr-only">{mark.label}:</span>
                          </ReportPill>
                          <span className="w-10 shrink-0 font-mono text-sm text-graphite">#{c.seq}</span>
                          <span className="min-w-0 flex-1 break-words">{c.title}</span>
                          <span className="hidden font-mono text-xs text-graphite sm:inline">
                            {c.category} · {c.viewport}
                          </span>
                          <span aria-hidden className="font-mono text-graphite transition-transform group-open:rotate-90">
                            ›
                          </span>
                        </summary>
                        <div className="pb-4 pl-1">
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
