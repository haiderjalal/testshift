import type { CSSProperties } from "react";

import { AGENTS, type AgentId } from "@/lib/agents";
import type { TestCase } from "@/lib/db";

/** Where the shift is: not started, an agent on duty, or finished. */
export type PipelinePhase = "before" | AgentId | "after";

type StageState = "done" | "active" | "waiting";

/**
 * Dev → Staging → UAT → Prod as stage cards. The agent on duty glows, agents before it are done, and
 * each card's bar shows the share of its own results. The report reuses this with phase "after".
 */
export function AgentPipeline({ cases, phase }: { cases: TestCase[]; phase: PipelinePhase }) {
  const activeIndex = phase === "before" ? -1 : phase === "after" ? AGENTS.length : AGENTS.findIndex((a) => a.id === phase);

  return (
    <ol className="grid gap-3 sm:grid-cols-4" aria-label="Agent pipeline">
      {AGENTS.map((agent, i) => {
        const own = cases.filter((c) => c.agent === agent.id);
        const count = (status: TestCase["status"]) => own.filter((c) => c.status === status).length;
        const state: StageState = i < activeIndex ? "done" : i === activeIndex ? "active" : "waiting";
        const share = (n: number) => (own.length > 0 ? `${(n / own.length) * 100}%` : "0%");
        return (
          <li
            key={agent.id}
            aria-current={state === "active" ? "step" : undefined}
            className="glass relative overflow-hidden rounded-2xl p-4 transition-[box-shadow] duration-500"
            style={stageStyle(agent.color, state)}
          >
            <p className="flex items-center gap-2 font-mono text-[11px] tracking-widest uppercase">
              <span
                className={`size-2 rounded-full ${state === "active" ? "pulse-dot" : ""}`}
                style={{ background: agent.color, color: agent.color }}
              />
              <span style={{ color: agent.color }}>{agent.name}</span>
              <span className="ml-auto text-graphite">{stateLabel(state, own.some((c) => c.status === "passed" || c.status === "failed"))}</span>
            </p>
            <p className="mt-2 text-sm text-graphite">{agent.testType}</p>
            <p className="mt-3 font-mono text-sm">
              <span className="text-pass">{count("passed")}✓</span> <span className="text-fail">{count("failed")}✗</span>{" "}
              <span className="text-hold">{count("blocked")}‖</span>
              {count("pending") > 0 && <span className="text-graphite"> · {count("pending")} {phase === "after" ? "not reached" : "queued"}</span>}
            </p>
            {own.length > 0 && (
              <div aria-hidden className="mt-3 flex h-1 overflow-hidden rounded-full bg-rule">
                <span className="h-full bg-pass transition-[width] duration-700" style={{ width: share(count("passed")) }} />
                <span className="h-full bg-fail transition-[width] duration-700" style={{ width: share(count("failed")) }} />
                <span className="h-full bg-hold transition-[width] duration-700" style={{ width: share(count("blocked")) }} />
              </div>
            )}
            {state === "active" && (
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse" style={{ background: agent.color }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function stageStyle(color: string, state: StageState): CSSProperties | undefined {
  if (state !== "active") return undefined;
  return {
    borderColor: color,
    boxShadow: `0 0 0 1px ${color}, 0 20px 60px -30px ${color}`,
    // Layered over the glass surface, so the card keeps its panel colour and only picks up the agent's glow.
    backgroundImage: `radial-gradient(24rem 12rem at 50% 0%, color-mix(in srgb, ${color} 18%, transparent), transparent 70%)`,
  };
}

function stateLabel(state: StageState, hasResults: boolean): string {
  if (state === "done") return hasResults ? "done" : "unverified";
  return state === "active" ? "on duty" : "waiting";
}
