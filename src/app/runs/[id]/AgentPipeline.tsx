import { AGENTS, type AgentId } from "@/lib/agents";
import type { TestCase } from "@/lib/db";

/** Where the shift is: not started, an agent on duty, or finished. */
export type PipelinePhase = "before" | AgentId | "after";

/** Dev → Staging → UAT → Prod with each agent's results; agents before the one on duty are done. */
export function AgentPipeline({ cases, phase }: { cases: TestCase[]; phase: PipelinePhase }) {
  const activeIndex = phase === "before" ? -1 : phase === "after" ? AGENTS.length : AGENTS.findIndex((a) => a.id === phase);

  return (
    <ol className="grid gap-3 sm:grid-cols-4" aria-label="Agent pipeline">
      {AGENTS.map((agent, i) => {
        const own = cases.filter((c) => c.agent === agent.id);
        const count = (status: TestCase["status"]) => own.filter((c) => c.status === status).length;
        const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "waiting";
        return (
          <li
            key={agent.id}
            className={`glass relative overflow-hidden rounded-2xl p-4 transition ${state === "waiting" ? "opacity-55" : ""}`}
            style={state === "active" ? { boxShadow: `0 0 0 1px ${agent.color}, 0 20px 60px -30px ${agent.color}` } : undefined}
          >
            <p className="flex items-center gap-2 font-mono text-[11px] tracking-widest uppercase">
              <span
                className={`size-2 rounded-full ${state === "active" ? "pulse-dot" : ""}`}
                style={{ background: agent.color, color: agent.color }}
              />
              <span style={{ color: agent.color }}>{agent.name}</span>
              <span className="ml-auto text-graphite">{state === "done" ? (own.some((c) => c.status === "passed" || c.status === "failed") ? "done" : "unverified") : state === "active" ? "on duty" : "waiting"}</span>
            </p>
            <p className="mt-2 text-sm text-graphite">{agent.testType}</p>
            <p className="mt-3 font-mono text-sm">
              <span className="text-pass">{count("passed")}✓</span> <span className="text-fail">{count("failed")}✗</span>{" "}
              <span className="text-hold">{count("blocked")}‖</span>
              {count("pending") > 0 && <span className="text-graphite"> · {count("pending")} {phase === "after" ? "not reached" : "queued"}</span>}
            </p>
            {state === "active" && (
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse" style={{ background: agent.color }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
