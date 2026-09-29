import { StageSync } from "@/components/scene/PipelineScene";
import { formatClock, ShiftLog, type LogEntry } from "@/components/ShiftLog";
import type { Run, TestCase } from "@/lib/db";

import { AgentPipeline } from "./AgentPipeline";
import { AutoRefresh } from "./RunControls";

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

export function LiveShift({ run, elapsed, cases, emailConfigured }: Props) {
  const started = run.started_at?.getTime();
  const total = (run.deadline_at?.getTime() ?? 0) - (started ?? 0);
  const progress = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
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

  return (
    <section className="mt-8 space-y-6" aria-labelledby="live-heading">
      <AutoRefresh />
      <StageSync stage={active} />
      <p id="live-heading" aria-live="polite" className="font-display text-2xl font-semibold tracking-tight">
        {headline(run)}
      </p>

      {started && (
        <div>
          <div className="flex justify-between font-mono text-xs text-graphite tabular-nums">
            <span>
              <span className="text-ink">{formatClock(elapsed)}</span> elapsed
            </span>
            <span>{formatClock(total)} booked</span>
          </div>
          <div
            role="progressbar"
            aria-label="Shift progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, var(--color-dev), var(--color-staging), var(--color-uat), var(--color-prod))",
              }}
            />
          </div>
        </div>
      )}

      <AgentPipeline cases={cases} phase={active ?? "before"} />

      <div className="glass rounded-2xl px-5 py-1">
        {entries.length ? (
          <ShiftLog entries={entries} />
        ) : (
          <p className="py-6 text-graphite">Results appear here as soon as the Dev agent checks its first part.</p>
        )}
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
