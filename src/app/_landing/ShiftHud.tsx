"use client";

import { useEffect, useState } from "react";

import { formatClock } from "@/components/ShiftLog";
import { SpotlightCard } from "@/components/SpotlightCard";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { AGENTS } from "@/lib/agents";

import { SAMPLE_SITE, SAMPLES } from "./samples";

const START_SECONDS = 12 * 60 + 4;
const TICK_MS = 1_100;
const SECONDS_PER_RESULT = 3;
const BASE_TESTS = 37;
// Ticks a finished run stays on screen before the feed replays.
const HOLD_TICKS = 4;

// Results in pipeline order, so the lanes fill the way a real shift does.
const FEED = AGENTS.flatMap((agent) => SAMPLES[agent.id].map((line) => ({ agent, line })));
const CYCLE = FEED.length + HOLD_TICKS;

/**
 * Hero readout: a sample test run that streams results agent by agent, with a tilt toward the pointer.
 * Illustrative only: the figures come from the sample data, not from a real run, and it is labelled so.
 */
export function ShiftHud() {
  const reduced = usePrefersReducedMotion();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [reduced]);

  // Reduced motion shows the finished run; otherwise results stream in and the feed replays.
  const revealed = reduced ? FEED.length : Math.min((tick % CYCLE) + 1, FEED.length);
  const shown = FEED.slice(0, revealed);
  const recent = shown
    .map((item, n) => ({ ...item, n }))
    .slice(-3)
    .reverse();
  const failed = shown.filter((item) => item.line.status === "fail").length;
  const passed = shown.length - failed;
  const active = shown.at(-1)?.agent ?? AGENTS[0];
  const clock = formatClock((START_SECONDS + revealed * SECONDS_PER_RESULT) * 1000);

  return (
    <div aria-hidden className="float w-full max-w-md">
      <SpotlightCard tilt accent={active.color} className="glass glass-strong rounded-3xl p-5 font-mono text-xs">
        <div className="flex items-center gap-2 border-b border-rule pb-3">
          <span className="size-2.5 rounded-full bg-fail/80" />
          <span className="size-2.5 rounded-full bg-marker/80" />
          <span className="size-2.5 rounded-full bg-pass/80" />
          <span className="ml-2 min-w-0 truncate rounded-md bg-paper/70 px-2.5 py-1 text-graphite">{SAMPLE_SITE}</span>
          <span className="ml-auto flex items-center gap-1.5 text-pass">
            <span className="pulse-dot size-1.5 rounded-full bg-pass" style={{ color: "var(--color-pass)" }} />
            live
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] tracking-widest text-graphite uppercase">Shift clock</p>
            <p className="mt-1 text-2xl tracking-tight text-ink tabular-nums">{clock}</p>
          </div>
          <dl className="flex gap-4 text-right">
            <Stat label="tests" value={BASE_TESTS + revealed} />
            <Stat label="passed" value={passed} tone="text-pass" />
            <Stat label="failed" value={failed} tone="text-fail" />
          </dl>
        </div>

        <ul className="mt-5 space-y-2.5">
          {AGENTS.map((agent) => {
            const total = SAMPLES[agent.id].length;
            const done = shown.filter((item) => item.agent.id === agent.id).length;
            const state = done === 0 ? "queued" : done === total ? "done" : "running";
            return (
              <li key={agent.id} className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center gap-3">
                <span style={{ color: agent.color }}>{agent.name.replace(" agent", "")}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-rule">
                  <span
                    className="block h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${(done / total) * 100}%`, background: agent.color }}
                  />
                </span>
                <span
                  className="text-right"
                  style={{ color: state === "done" ? "var(--color-pass)" : state === "running" ? agent.color : "var(--color-graphite)" }}
                >
                  {state}
                </span>
              </li>
            );
          })}
        </ul>

        <ul className="mt-5 space-y-2 border-t border-rule pt-4">
          {recent.map(({ line, n }) => (
            <li key={n} className="rise flex gap-2.5">
              <span className={line.status === "pass" ? "text-pass" : "text-fail"}>{line.status === "pass" ? "✓" : "✗"}</span>
              <span className={`min-w-0 truncate ${line.status === "fail" ? "marker" : "text-graphite"}`}>{line.text}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[10px] text-graphite">Sample shift · illustrative results</p>
      </SpotlightCard>
    </div>
  );
}

function Stat({ label, value, tone = "text-ink" }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <dt className="text-[10px] tracking-widest text-graphite uppercase">{label}</dt>
      <dd className={`mt-1 text-lg tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}
