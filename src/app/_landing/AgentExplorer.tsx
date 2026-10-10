"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { SpotlightCard } from "@/components/SpotlightCard";
import { useInView } from "@/hooks/useInView";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useRotatingIndex } from "@/hooks/useRotatingIndex";
import { AGENTS } from "@/lib/agents";

import { SAMPLES } from "./samples";

const CYCLE_MS = 6_000;
const LAST = AGENTS.length - 1;

/** The tab the arrow, Home and End keys move to, or null for keys this tablist ignores. */
function nextTabIndex(key: string, current: number): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return current === LAST ? 0 : current + 1;
    case "ArrowLeft":
    case "ArrowUp":
      return current === 0 ? LAST : current - 1;
    case "Home":
      return 0;
    case "End":
      return LAST;
    default:
      return null;
  }
}

/**
 * The four agents as an interactive tablist. While the section is on screen it steps through the
 * pipeline by itself, until a visitor picks an agent. The 3D camera flies to the agent in focus.
 */
export function AgentExplorer() {
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const inView = useInView(rootRef);
  const reduced = usePrefersReducedMotion();
  const { index, select } = useRotatingIndex(AGENTS.length, { enabled: inView && !reduced, intervalMs: CYCLE_MS });

  const agent = AGENTS[index];

  useEffect(() => {
    if (inView) document.documentElement.dataset.stage = agent.id;
  }, [agent.id, inView]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = nextTabIndex(event.key, index);
    if (target === null) return;
    event.preventDefault();
    select(target);
    tabRefs.current[target]?.focus();
  }

  return (
    <div ref={rootRef} data-stage={agent.id} className="mt-14">
      {/* The shift as one bar: each segment is that agent's share of the time. The active one lights up. */}
      <div aria-hidden className="flex gap-1.5">
        {AGENTS.map((a, i) => (
          <span
            key={a.id}
            className="h-1.5 rounded-full transition-opacity duration-500"
            style={{ flex: a.share, background: a.color, opacity: i === index ? 1 : 0.25 }}
          />
        ))}
      </div>

      <div
        role="tablist"
        aria-label="Agents, in pipeline order"
        onKeyDown={handleKeyDown}
        className="-mx-5 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden"
      >
        {AGENTS.map((a, i) => {
          const selected = i === index;
          return (
            <button
              key={a.id}
              ref={(node) => {
                tabRefs.current[i] = node;
              }}
              type="button"
              role="tab"
              id={`agent-${a.id}`}
              aria-selected={selected}
              aria-controls={`agent-panel-${a.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(i)}
              className="group flex w-[70vw] max-w-72 shrink-0 snap-start flex-col gap-5 rounded-2xl border border-rule bg-card/95 p-5 text-left transition duration-300 hover:-translate-y-0.5 hover:bg-raised sm:w-auto sm:max-w-none"
              style={{
                borderColor: selected ? a.color : undefined,
                boxShadow: selected ? `0 0 44px -16px ${a.color}` : undefined,
              }}
            >
              <span className="flex items-center justify-between font-mono text-[11px] tracking-widest uppercase">
                <span style={{ color: a.color }}>0{i + 1}</span>
                <span className="text-graphite">{a.env}</span>
              </span>
              <span className="font-display text-xl font-semibold tracking-tight">{a.name}</span>
              <span className="mt-auto font-mono text-[11px] text-graphite">
                {a.testType} · ≈{Math.round(a.share * 100)}% of shift
              </span>
            </button>
          );
        })}
      </div>

      {AGENTS.map((a, i) => {
        // Every agent keeps its panel in the DOM so each tab's aria-controls resolves; only the selected one shows.
        // Un-hiding restarts the `.rise` animations, so the content replays on each selection.
        const panelLines = SAMPLES[a.id];
        const panelPasses = panelLines.filter((line) => line.status === "pass").length;
        const handoff =
          i < LAST ? `Hands off to ${AGENTS[i + 1].name}.` : "Closes the shift with a go / no-go verdict.";
        return (
          <div
            key={a.id}
            role="tabpanel"
            id={`agent-panel-${a.id}`}
            aria-labelledby={`agent-${a.id}`}
            hidden={i !== index}
            tabIndex={0}
            className="mt-5 grid gap-5 rounded-3xl lg:grid-cols-2 lg:items-start"
          >
            <SpotlightCard accent={a.color} className="glass glass-strong rounded-3xl p-7 sm:p-9">
              <p className="font-mono text-xs tracking-widest uppercase" style={{ color: a.color }}>
                {a.testType}
              </p>
              <p className="rise mt-4 font-display text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
                {a.tagline}
              </p>
              <ul className="mt-8 space-y-3.5">
                {a.checks.map((check, c) => (
                  <li key={check} className="rise flex gap-3 text-graphite" style={{ ["--d" as string]: c + 1 }}>
                    <span aria-hidden className="mt-0.5" style={{ color: a.color }}>
                      ◆
                    </span>
                    {check}
                  </li>
                ))}
              </ul>
              <p className="mt-8 border-t border-rule pt-5 text-sm text-graphite">{handoff}</p>
            </SpotlightCard>

            <div className="overflow-hidden rounded-3xl border border-rule bg-paper/85 shadow-2xl shadow-black/40">
              <div className="flex items-center gap-2 border-b border-rule px-5 py-3 font-mono text-[11px]">
                <span className="size-2 rounded-full" style={{ background: a.color }} />
                <span className="text-ink">{a.id}-agent@testshift</span>
                <span className="ml-auto text-graphite">sample output</span>
              </div>
              <ul className="space-y-3 p-5 font-mono text-[13px]" aria-label={`${a.name} sample output`}>
                {panelLines.map((line, n) => (
                  <li key={line.text} className="rise flex gap-2.5" style={{ ["--d" as string]: n + 1 }}>
                    <span className="text-graphite">$</span>
                    <span className={line.status === "pass" ? "text-pass" : "text-fail"}>
                      {line.status === "pass" ? "✓" : "✗"}
                    </span>
                    <span className={line.status === "fail" ? "marker" : "text-graphite"}>{line.text}</span>
                    {line.severity && <span className="ml-auto self-start text-[10px] text-fail uppercase">{line.severity}</span>}
                  </li>
                ))}
              </ul>
              <div className="flex gap-5 border-t border-rule px-5 py-3 font-mono text-[11px]">
                <span className="text-pass">{panelPasses} passed</span>
                <span className="text-fail">{panelLines.length - panelPasses} failed</span>
                <span className="ml-auto text-graphite">sample run</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
