"use client";

import { useEffect, useState } from "react";

import { formatClock } from "@/components/ShiftLog";
import { AGENTS } from "@/lib/agents";

import { SAMPLE_SITE } from "./samples";

const START_SECONDS = 12 * 60 + 4;
const SECONDS_PER_AGENT = 4;

/** Floating readout in the hero: a sample shift clock with the active agent cycling through the pipeline. */
export function ShiftHud() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const active = AGENTS[Math.floor(seconds / SECONDS_PER_AGENT) % AGENTS.length];
  const tests = 37 + Math.floor(seconds / 3);

  return (
    <div className="glass float w-72 rounded-2xl p-4 font-mono text-xs" aria-hidden>
      <div className="flex items-center justify-between text-graphite">
        <span>sample shift · {SAMPLE_SITE}</span>
      </div>
      <p className="mt-3 text-2xl tracking-tight text-ink tabular-nums">{formatClock((START_SECONDS + seconds) * 1000)}</p>
      <div className="mt-3 flex gap-1.5">
        {AGENTS.map((a) => (
          <span
            key={a.id}
            className="h-1 flex-1 rounded-full transition-opacity duration-500"
            style={{ background: a.color, opacity: a.id === active.id ? 1 : 0.25 }}
          />
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2">
        <span className="pulse-dot size-2 rounded-full" style={{ background: active.color, color: active.color }} />
        <span style={{ color: active.color }}>{active.name}</span>
        <span className="text-graphite">· {active.testType.toLowerCase()}</span>
      </p>
      <p className="mt-2 text-graphite">
        <span className="text-ink tabular-nums">{tests}</span> tests · <span className="text-fail">4 bugs</span>
      </p>
    </div>
  );
}
