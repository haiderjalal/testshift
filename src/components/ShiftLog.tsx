import { agentById, type AgentId } from "@/lib/agents";

export type LogStatus = "pass" | "fail" | "blocked" | "info" | "running";

export interface LogEntry {
  id: string;
  time: string;
  status: LogStatus;
  text: string;
  tag?: string;
  agent?: AgentId;
}

const MARKS: Record<LogStatus, { glyph: string; label: string; className: string }> = {
  pass: { glyph: "✓", label: "Passed", className: "text-pass" },
  fail: { glyph: "✗", label: "Failed", className: "text-fail" },
  blocked: { glyph: "‖", label: "Blocked", className: "text-hold" },
  info: { glyph: "→", label: "Note", className: "text-graphite" },
  running: { glyph: "…", label: "In progress", className: "text-ink animate-pulse" },
};

/**
 * The running record of a shift as a terminal feed. Entries render in the order given, so the caller
 * puts the newest first. Each row wraps on phones so the test title keeps the full width.
 */
export function ShiftLog({ entries }: { entries: LogEntry[] }) {
  return (
    <ol className="font-mono text-[13px] leading-6">
      {entries.map((e) => {
        const mark = MARKS[e.status];
        const agent = e.agent ? agentById(e.agent) : null;
        return (
          <li
            key={e.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule/60 py-2.5 last:border-b-0 sm:flex-nowrap"
          >
            <span className="w-[4.5rem] shrink-0 text-graphite tabular-nums">{e.time}</span>
            {agent && (
              <span className="w-14 shrink-0 text-[10px] font-semibold tracking-widest uppercase" style={{ color: agent.color }}>
                {agent.id}
              </span>
            )}
            <span className={`w-3 shrink-0 font-semibold ${mark.className}`}>
              <span aria-hidden>{mark.glyph}</span>
              <span className="sr-only">{mark.label}:</span>
            </span>
            <span className="min-w-0 basis-full break-words sm:flex-1 sm:basis-0">
              <span className={e.status === "fail" ? "marker" : "text-ink/90"}>{e.text}</span>
              {e.tag && <span className="ml-2 text-[11px] font-semibold tracking-wider text-fail uppercase">{e.tag}</span>}
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
