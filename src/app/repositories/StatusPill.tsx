import type { ReactElement, ReactNode } from "react";

export type StatusTone = "pass" | "fail" | "attention" | "active" | "neutral";

/** Text colour class per tone. Always pair it with visible text so status never depends on colour alone. */
export const TONE_TEXT: Record<StatusTone, string> = {
  pass: "text-pass",
  fail: "text-fail",
  attention: "text-marker",
  active: "text-dev",
  neutral: "text-hold",
};

const PASSED = new Set(["success"]);
const FAILED = new Set(["failure", "failed", "timed_out", "action_required", "retry-limit"]);
const ATTENTION = new Set(["access-or-workflow-unverified", "integration-unavailable", "paused"]);
const ACTIVE = new Set(["queued", "in_progress", "processing", "waiting", "requested", "pending"]);

/** Maps a GitHub run or worker status to a tone. A missing value means the result is still pending. */
export function toneForStatus(value: string | null | undefined): StatusTone {
  if (!value) return "active";
  if (PASSED.has(value)) return "pass";
  if (FAILED.has(value)) return "fail";
  if (ATTENTION.has(value)) return "attention";
  if (ACTIVE.has(value)) return "active";
  return "neutral";
}

/** Labelled status chip. The dot is decorative; the text carries the meaning. */
export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }): ReactElement {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-rule bg-raised/60 px-3 py-1 font-mono text-xs break-words">
      <span aria-hidden className={`size-2 shrink-0 rounded-full bg-current ${TONE_TEXT[tone]}`} />
      {children}
    </span>
  );
}
