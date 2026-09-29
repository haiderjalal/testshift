import { formatClock, ShiftLog, type LogEntry } from "@/components/ShiftLog";
import type { Run, TestCase } from "@/lib/db";

import { AutoRefresh } from "./RunControls";

const LOG_STATUS = { passed: "pass", failed: "fail", blocked: "blocked" } as const;

function headline(run: Run): string {
  if (run.status === "pending_payment") return "Confirming your payment…";
  if (run.status === "queued") return "Your tester is clocking in…";
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
  const count = (status: TestCase["status"]) => cases.filter((c) => c.status === status).length;

  const done: LogEntry[] = cases
    .filter((c): c is TestCase & { status: keyof typeof LOG_STATUS } => c.status in LOG_STATUS && c.finished_at !== null)
    .sort((a, b) => (b.finished_at?.getTime() ?? 0) - (a.finished_at?.getTime() ?? 0))
    .map((c) => ({
      id: c.id,
      time: formatClock((c.finished_at?.getTime() ?? 0) - (started ?? 0)),
      status: LOG_STATUS[c.status],
      text: c.title,
      tag: c.status === "failed" ? (c.severity ?? undefined) : undefined,
    }));
  const entries: LogEntry[] =
    run.status === "running" ? [{ id: "now", time: formatClock(elapsed), status: "running", text: headline(run) }, ...done] : done;

  return (
    <section className="mt-8" aria-labelledby="live-heading">
      <AutoRefresh />
      <p id="live-heading" aria-live="polite" className="text-2xl font-semibold">
        {headline(run)}
      </p>

      {started && (
        <div className="mt-5">
          <div className="flex justify-between font-mono text-xs tabular-nums text-graphite">
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
            aria-valuenow={Math.round((elapsed / total) * 100)}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule"
          >
            <div className="h-full rounded-full bg-ink" style={{ width: `${(elapsed / total) * 100}%` }} />
          </div>
        </div>
      )}

      <p className="mt-6 font-mono text-sm text-graphite">
        <span className="text-pass">{count("passed")} passed</span> · <span className="text-fail">{count("failed")} failed</span>{" "}
        · {count("blocked")} blocked · {count("pending")} queued
      </p>

      <div className="mt-4 rounded-2xl border border-rule bg-card px-5 py-1">
        {entries.length ? (
          <ShiftLog entries={entries} />
        ) : (
          <p className="py-6 text-graphite">Test results appear here as soon as the first page is checked.</p>
        )}
      </div>

      <p className="mt-6 text-sm text-graphite">
        This page updates on its own. You can close it: the report will be here when the shift ends
        {emailConfigured ? ", and we'll email a link to " : "."}
        {emailConfigured && <span className="text-ink">{run.email}</span>}
        {emailConfigured && "."}
      </p>
    </section>
  );
}
