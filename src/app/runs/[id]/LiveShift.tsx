import { StageSync } from "@/components/scene/PipelineScene";
import { formatClock, ShiftLog, type LogEntry } from "@/components/ShiftLog";
import { agentById } from "@/lib/agents";
import type { Run, TestCase } from "@/lib/db";

import { AgentPipeline } from "./AgentPipeline";
import { AutoRefresh } from "./RunControls";
import { ShiftClock } from "./ShiftClock";

const LOG_STATUS = { passed: "pass", failed: "fail", blocked: "blocked" } as const;

function headline(run: Run): string {
  if (run.status === "pending_payment") return "Confirming your payment…";
  if (run.status === "queued") return "Your agents are clocking in…";
  return run.activity ?? "Working…";
}

interface Props {
  run: Run;
  elapsed: number;
  cases: TestCase[];
  emailConfigured: boolean;
}

/** The shift as a live QA console: headline and clock, the four stage cards, then the terminal feed. */
export function LiveShift({ run, elapsed, cases, emailConfigured }: Props) {
  const started = run.started_at?.getTime();
  const total = (run.deadline_at?.getTime() ?? 0) - (started ?? 0);
  const active = run.status === "running" ? (run.agent ?? "dev") : null;

  const done: LogEntry[] = cases
    .filter((c): c is TestCase & { status: keyof typeof LOG_STATUS } => c.status in LOG_STATUS && c.finished_at !== null)
    .sort((a, b) => (b.finished_at?.getTime() ?? 0) - (a.finished_at?.getTime() ?? 0))
    .map((c) => ({
      id: c.id,
      time: formatClock((c.finished_at?.getTime() ?? 0) - (started ?? 0)),
      status: LOG_STATUS[c.status],
      text: c.title,
      agent: c.agent,
      tag: c.status === "failed" ? (c.severity ?? undefined) : undefined,
    }));
  const entries: LogEntry[] =
    active !== null
      ? [{ id: "now", time: formatClock(elapsed), status: "running", text: headline(run), agent: active }, ...done]
      : done;

  const host = new URL(run.url).hostname;
  const activeColor = active ? agentById(active).color : null;

  return (
    <section className="mt-8 space-y-6" aria-labelledby="live-heading">
      <AutoRefresh />
      <StageSync stage={active} />

      <div className="glass glass-strong rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full ${active ? "pulse-dot" : ""}`}
            style={{ background: active ? "var(--color-pass)" : "var(--color-graphite)", color: "var(--color-pass)" }}
          />
          <h2 id="live-heading" aria-live="polite" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            {headline(run)}
          </h2>
        </div>

        {started && (
          // Keyed on the server value: each refresh remounts the clock so it re-anchors to the database.
          <div className="mt-6">
            <ShiftClock key={elapsed} elapsed={elapsed} booked={total} />
          </div>
        )}
      </div>

      <AgentPipeline cases={cases} phase={active ?? "before"} />

      <div className="glass glass-strong relative overflow-hidden rounded-3xl">
        <div className="flex items-center gap-2 border-b border-rule px-5 py-3 font-mono text-xs text-graphite">
          <span aria-hidden className="size-2.5 rounded-full bg-fail/80" />
          <span aria-hidden className="size-2.5 rounded-full bg-marker/80" />
          <span aria-hidden className="size-2.5 rounded-full bg-pass/80" />
          <span className="ml-2 min-w-0 truncate">{host}</span>
        </div>
        {activeColor && (
          <span
            aria-hidden
            className="scan-line pointer-events-none absolute inset-x-0 top-12 h-16 opacity-40"
            style={{ background: `linear-gradient(transparent, color-mix(in srgb, ${activeColor} 18%, transparent), transparent)` }}
          />
        )}
        <div className="relative px-5 py-1 sm:px-6">
          {entries.length ? (
            <ShiftLog entries={entries} />
          ) : (
            <p className="py-8 text-graphite">Results appear here as soon as the Dev agent checks its first part.</p>
          )}
        </div>
      </div>

      <p className="text-sm text-graphite">
        This page updates on its own. You can close it: the report will be here when the shift ends
        {emailConfigured ? ", and we'll email a link to " : "."}
        {emailConfigured && <span className="text-ink">{run.email}</span>}
        {emailConfigured && "."}
      </p>
    </section>
  );
}
