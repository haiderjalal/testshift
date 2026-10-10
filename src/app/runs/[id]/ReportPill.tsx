import type { ReactElement, ReactNode } from "react";

export type ReportTone = "pass" | "fail" | "marker" | "hold" | "neutral";

const TONE_CLASS: Record<ReportTone, string> = {
  pass: "border-pass/40 bg-pass/10 text-pass",
  fail: "border-fail/40 bg-fail/10 text-fail",
  marker: "border-marker/40 bg-marker/10 text-marker",
  hold: "border-hold/40 bg-hold/10 text-hold",
  neutral: "border-rule text-graphite",
};

/** Status label for the shift report. The text carries the meaning; the tint only reinforces it. */
export function ReportPill({ tone, children, className = "" }: { tone: ReportTone; children: ReactNode; className?: string }): ReactElement {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs tracking-wide uppercase ${TONE_CLASS[tone]} ${className}`}>
      {children}
    </span>
  );
}
