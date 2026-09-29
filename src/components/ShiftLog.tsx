export type LogStatus = "pass" | "fail" | "blocked" | "info" | "running";

export interface LogEntry {
  id: string;
  time: string;
  status: LogStatus;
  text: string;
  tag?: string;
}

const MARKS: Record<LogStatus, { glyph: string; label: string; className: string }> = {
  pass: { glyph: "✓", label: "Passed", className: "text-pass" },
  fail: { glyph: "✗", label: "Failed", className: "text-fail" },
  blocked: { glyph: "‖", label: "Blocked", className: "text-hold" },
  info: { glyph: "→", label: "Note", className: "text-graphite" },
  running: { glyph: "…", label: "In progress", className: "text-ink animate-pulse" },
};

/** The running record of a shift: one line per test, failures highlighted like a marked-up test plan. */
export function ShiftLog({ entries, animate = false }: { entries: LogEntry[]; animate?: boolean }) {
  return (
    <ol className="divide-y divide-rule/70 font-mono text-[13px] leading-5">
      {entries.map((e) => {
        const mark = MARKS[e.status];
        return (
          <li key={e.id} className={`flex gap-3 py-2 ${animate ? "log-in" : ""}`}>
            <span className="w-[4.5rem] shrink-0 tabular-nums text-graphite">{e.time}</span>
            <span className={`w-3 shrink-0 font-semibold ${mark.className}`}>
              <span aria-hidden>{mark.glyph}</span>
              <span className="sr-only">{mark.label}:</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className={e.status === "fail" ? "marker" : ""}>{e.text}</span>
              {e.tag && (
                <span className="ml-2 text-[11px] font-semibold uppercase tracking-wider text-fail">{e.tag}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
