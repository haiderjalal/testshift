"use client";

import { useRef } from "react";

import { useInView } from "@/hooks/useInView";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useRotatingIndex } from "@/hooks/useRotatingIndex";

import { LAYERS, ReportStack } from "./ReportStack";

const DELIVERABLES = [
  { label: "Test plan", body: "Every unit, integration, end-to-end and smoke test the agents wrote for your real pages." },
  { label: "Real-browser runs", body: "Each test clicked through in Chrome, on desktop and, on Senior and up, mobile." },
  { label: "Bug report", body: "Failures ranked by severity, with steps to reproduce, expected vs actual, and a screenshot." },
  { label: "Playwright suite", body: "Replayable browser checks with assertions, grouped by agent for your CI. Automated audits and coverage gaps stay in the report." },
];

const CYCLE_MS = 3_500;

/**
 * What lands in the inbox. Hovering or selecting a deliverable lights its layer in the exploded report
 * stack. While on screen, the list steps through the deliverables by itself until a visitor picks one.
 */
export function Deliverables() {
  const rootRef = useRef<HTMLElement>(null);
  const inView = useInView(rootRef);
  const reduced = usePrefersReducedMotion();
  const { index, select } = useRotatingIndex(DELIVERABLES.length, { enabled: inView && !reduced, intervalMs: CYCLE_MS });
  const active = DELIVERABLES[index];

  return (
    <section
      ref={rootRef}
      data-stage="overview"
      aria-labelledby="deliver-heading"
      className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-28 sm:px-8 lg:grid-cols-2"
    >
      <div>
        <p className="reveal font-mono text-xs tracking-widest text-graphite uppercase">When the shift ends</p>
        <h2 id="deliver-heading" className="reveal mt-4 font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl">
          What lands in your inbox.
        </h2>
        <div className="reveal mt-8 flex items-center gap-5">
          <div
            className="count-up grid size-24 shrink-0 place-items-center rounded-full font-display text-3xl font-semibold"
            style={{
              ["--to" as string]: 82,
              background:
                "radial-gradient(closest-side, var(--color-paper) 82%, transparent 83%), conic-gradient(var(--color-dev) calc(var(--num) * 1%), var(--color-rule) 0)",
            }}
            aria-label="Sample quality score: 82 out of 100"
            role="img"
          />
          <p className="text-graphite">
            A quality score, a go / no-go from the Prod agent, and a verdict from each agent.{" "}
            <span className="text-ink/70">(Sample score.)</span>
          </p>
        </div>

        <ol className="mt-10 space-y-2">
          {DELIVERABLES.map((d, i) => {
            const selected = i === index;
            const accent = LAYERS.find((layer) => layer.label === d.label)?.accent;
            return (
              <li key={d.label} className="reveal">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => select(i)}
                  onPointerEnter={() => select(i)}
                  onFocus={() => select(i)}
                  className={`group flex w-full gap-4 rounded-2xl border p-4 text-left transition duration-300 sm:p-5 ${
                    selected ? "border-rule bg-card" : "border-transparent hover:bg-card/50"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-2 size-2.5 shrink-0 rounded-full transition-transform duration-300 ${selected ? "scale-125" : ""}`}
                    style={{ background: accent, boxShadow: selected ? `0 0 16px ${accent}` : undefined }}
                  />
                  <span>
                    <span className="block font-semibold">{d.label}</span>
                    <span className="mt-1 block max-w-md leading-relaxed text-graphite">{d.body}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <ReportStack activeLabel={active.label} />
    </section>
  );
}
