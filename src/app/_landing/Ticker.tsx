import { AGENTS } from "@/lib/agents";

import { SAMPLES } from "./samples";

const ITEMS = AGENTS.flatMap((agent) => SAMPLES[agent.id].map((line) => ({ agent, line })));

/** Endless strip of sample checks, one colour per agent. */
export function Ticker() {
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 gap-10 pr-10" aria-hidden={hidden || undefined}>
      {ITEMS.map(({ agent, line }, i) => (
        <li key={i} className="flex items-center gap-3 whitespace-nowrap">
          <span className="text-[10px] font-semibold tracking-widest" style={{ color: agent.color }}>
            {agent.id.toUpperCase()}
          </span>
          <span className={line.status === "pass" ? "text-pass" : "text-fail"}>{line.status === "pass" ? "✓" : "✗"}</span>
          <span className={line.status === "fail" ? "marker" : "text-graphite"}>{line.text}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-label="Sample checks" className="marquee-wrap relative overflow-hidden border-y border-rule/70 bg-card/40 py-4 font-mono text-sm backdrop-blur">
      <div className="marquee flex w-max">
        {row(false)}
        {row(true)}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-paper to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-paper to-transparent" />
    </section>
  );
}
