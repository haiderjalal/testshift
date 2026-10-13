"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";

import { SpotlightCard } from "@/components/SpotlightCard";
import { useInView } from "@/hooks/useInView";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useRotatingIndex } from "@/hooks/useRotatingIndex";
import { AGENTS } from "@/lib/agents";
import { setAgentOverride } from "@/lib/story/sceneState";
import { PIN_LARGE_QUERY } from "@/lib/story/pin";
import { scrollToTourStop } from "@/lib/story/tour";
import { useStoryStore } from "@/store/storyStore";

import { SAMPLES } from "./samples";

const CYCLE_MS = 6_000;
const LAST = AGENTS.length - 1;
/** How many screens of scrolling the pinned tour lasts. Each agent gets an equal share. */
const PIN_HEIGHT = "420vh";
/** Keeps the pinned stage clear of the floating header. */
const PIN_TOP = "5.5rem";
/** How long a requested stop counts as "where the visitor is going" while the scroll to it is still easing. */
const PENDING_STOP_MS = 2_000;

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
 * The four agents as an interactive tablist, and the scene the 3D camera follows. On large screens the stage is
 * pinned and scrolling steps through the pipeline, Dev to Prod, while the camera flies to each agent; picking
 * a tab scrolls to that stop. Elsewhere (phones, short windows, reduced motion) nothing is pinned: it steps
 * through the pipeline by itself while on screen, until a visitor picks an agent, and the camera follows the tab.
 */
export function AgentExplorer() {
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const inView = useInView(rootRef);
  const reduced = usePrefersReducedMotion();
  const pinned = useMediaQuery(PIN_LARGE_QUERY);
  const scrolledIndex = useStoryStore((state) => state.tourIndex);
  const rotating = useRotatingIndex(AGENTS.length, { enabled: inView && !reduced && !pinned, intervalMs: CYCLE_MS });
  // The stop a visitor just asked for. While pinned the index follows the scroll, which takes a moment to arrive,
  // so a second key press in that time must continue from here rather than from the stale index.
  const requestedStop = useRef<number | null>(null);

  const index = pinned ? scrolledIndex : rotating.index;

  function select(next: number) {
    if (pinned && scrollToTourStop("agents", next, AGENTS.length)) {
      requestedStop.current = next;
      window.setTimeout(() => {
        if (requestedStop.current === next) requestedStop.current = null;
      }, PENDING_STOP_MS);
      return;
    }
    rotating.select(next);
  }

  // When not pinned the camera cannot follow scroll, so it follows the selected tab instead.
  useEffect(() => {
    setAgentOverride(!pinned && inView ? rotating.index : null);
    return () => setAgentOverride(null);
  }, [pinned, inView, rotating.index]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = nextTabIndex(event.key, requestedStop.current ?? index);
    if (target === null) return;
    event.preventDefault();
    select(target);
    tabRefs.current[target]?.focus();
  }

  return (
    <div
      ref={rootRef}
      data-pin="lg"
      style={{ ["--pin-height" as string]: PIN_HEIGHT, ["--pin-top" as string]: PIN_TOP }}
      className="mt-14"
    >
      <div data-pin-stage>
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
    </div>
  );
}
