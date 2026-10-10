"use client";

import { useEffect, useState, type ReactElement } from "react";

import { formatClock } from "@/components/ShiftLog";

const TICK_MS = 1_000;

interface ShiftClockProps {
  /** Elapsed milliseconds as of the last server render. */
  elapsed: number;
  /** Booked shift length in milliseconds. */
  booked: number;
}

/**
 * Elapsed-versus-booked readout that ticks between server refreshes. The parent keys it on the server
 * value, so each refresh remounts it and the clock re-anchors to the database instead of drifting.
 */
export function ShiftClock({ elapsed, booked }: ShiftClockProps): ReactElement {
  const [sinceMount, setSinceMount] = useState(0);

  useEffect(() => {
    const anchor = Date.now();
    const timer = setInterval(() => setSinceMount(Date.now() - anchor), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Never show more time than was booked, even if the tick runs ahead of the final refresh.
  const shown = Math.min(booked, elapsed + sinceMount);
  const progress = booked > 0 ? Math.min(100, (shown / booked) * 100) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 font-mono text-xs text-graphite tabular-nums">
        <span className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{formatClock(shown)}</span>
          elapsed
        </span>
        <span>{formatClock(booked)} booked</span>
      </div>
      <div
        role="progressbar"
        aria-label="Shift progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-rule"
      >
        <div
          className="h-full rounded-full transition-[width] duration-1000 ease-linear"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, var(--color-dev), var(--color-staging), var(--color-uat), var(--color-prod))",
          }}
        />
      </div>
    </div>
  );
}
