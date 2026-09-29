"use client";

import { useEffect, useState } from "react";

import { AGENTS } from "@/lib/agents";

import { SAMPLES } from "./samples";

const TICK_MS = 1_100;
// Extra ticks a finished console holds its output before replaying.
const HOLD_TICKS = 3;

/** Four agent terminals printing sample results on staggered loops, like the live shift page. */
export function Consoles() {
  const [tick, setTick] = useState(0);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Show every line at once, still.
      const id = requestAnimationFrame(() => setAnimate(false));
      return () => cancelAnimationFrame(id);
    }
    const timer = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mt-12 grid gap-4 md:grid-cols-2">
      {AGENTS.map((agent, a) => {
        const lines = SAMPLES[agent.id];
        const cycle = lines.length + HOLD_TICKS;
        const shown = animate ? Math.min(((tick + a * 2) % cycle) + 1, lines.length) : lines.length;
        return (
          <div
            key={agent.id}
            className="glass tilt-in relative overflow-hidden rounded-2xl"
            style={{ boxShadow: `inset 0 1px 0 0 ${agent.color}` }}
          >
            <div className="flex items-center gap-2 border-b border-rule/80 px-4 py-2.5 font-mono text-[11px]">
              <span className="size-2 rounded-full" style={{ background: agent.color }} />
              <span className="text-ink">{agent.id}-agent@testshift</span>
              <span className="ml-auto text-graphite">{agent.testType}</span>
            </div>
            <div aria-hidden className="scan-line pointer-events-none absolute inset-x-0 top-10 h-16 opacity-40" style={{ background: `linear-gradient(transparent, color-mix(in srgb, ${agent.color} 18%, transparent), transparent)` }} />
            <ul className="h-44 space-y-2 px-4 py-4 font-mono text-[13px]" aria-label={`${agent.name} sample output`}>
              {lines.slice(0, shown).map((line, i) => (
                <li key={line.text} className={`flex gap-2.5 ${animate && i === shown - 1 ? "rise" : ""}`}>
                  <span className="text-graphite">$</span>
                  <span className={line.status === "pass" ? "text-pass" : "text-fail"}>{line.status === "pass" ? "✓" : "✗"}</span>
                  <span className={line.status === "fail" ? "marker" : "text-graphite"}>{line.text}</span>
                </li>
              ))}
              {animate && shown < lines.length && (
                <li className="flex gap-2.5">
                  <span className="text-graphite">$</span>
                  <span className="cursor" style={{ color: agent.color }}>
                    ▍
                  </span>
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
