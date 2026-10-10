import type { ReactElement, ReactNode } from "react";

import { SpotlightCard } from "@/components/SpotlightCard";

interface ShiftSummaryProps {
  /** Agent colour of the chosen plan. Undefined keeps the card's default accent until a plan is picked. */
  accent?: string;
  planName: string | null;
  hoursLabel: string;
  totalLabel: string;
  /** The submit control goes here so it stays beside the summary on large screens and sits under it on phones. */
  children: ReactNode;
}

/** Focal panel that restates the booking in plain terms before the customer submits. */
export function ShiftSummary({ accent, planName, hoursLabel, totalLabel, children }: ShiftSummaryProps): ReactElement {
  return (
    <SpotlightCard accent={accent} className="glass glass-strong rounded-3xl p-6">
      <p className="font-mono text-xs tracking-widest text-graphite uppercase">Your shift</p>
      <dl className="mt-5 space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-graphite">Plan</dt>
          <dd className="text-right font-semibold" style={accent ? { color: accent } : undefined}>
            {planName ?? "Not chosen"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-graphite">Length</dt>
          <dd className="text-right">{hoursLabel}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-t border-rule pt-4">
          <dt className="text-graphite">Total</dt>
          <dd className="text-right font-display text-2xl font-semibold tracking-tight tabular-nums">{totalLabel}</dd>
        </div>
      </dl>
      <div className="mt-6 border-t border-rule pt-6">{children}</div>
    </SpotlightCard>
  );
}
