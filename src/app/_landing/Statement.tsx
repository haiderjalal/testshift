import { Fragment } from "react";

import { ScrubScene } from "@/components/motion/ScrubScene";
import { AGENTS } from "@/lib/agents";

/** How many screens of scrolling the statement lasts. */
const PIN_HEIGHT = "280vh";

/** Pipeline trace geometry: a line with one node per agent, in a 600 by 36 box. */
const TRACE = { width: 600, height: 36, inset: 18 };
const NODE_STEP = (TRACE.width - TRACE.inset * 2) / (AGENTS.length - 1);

/** "Checks every part on its own." becomes "checks every part on its own." so it can follow the agent's name. */
function followOn(tagline: string): string {
  return tagline.charAt(0).toLowerCase() + tagline.slice(1);
}

/**
 * The four agents in one sentence, built from each agent's own tagline. It is pinned while you scroll: words light
 * up in reading order, each agent's colour arrives with its name, a trace draws across the screen, and the 3D scene
 * lights each agent in turn (see the "statement" chapter). Without motion it is simply the finished sentence.
 */
export function Statement() {
  return (
    <section data-chapter="statement" aria-label="What each agent does" className="relative">
      <div data-pin style={{ ["--pin-height" as string]: PIN_HEIGHT }}>
        <div data-pin-stage data-fill className="flex items-center py-20">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
            <p data-reveal="" className="eyebrow">
              One shift
            </p>
            <ScrubScene progressKey="statement" className="mt-8">
              <p className="max-w-5xl font-display text-[clamp(1.9rem,4.7vw,3.7rem)] leading-[1.12] font-semibold tracking-[-0.03em]">
                {AGENTS.map((agent) => (
                  <Fragment key={agent.id}>
                    <span className="scrub-word scrub-name" style={{ color: agent.color }}>
                      {agent.name.replace(" agent", "")}
                    </span>{" "}
                    {followOn(agent.tagline)
                      .split(" ")
                      .map((word, i) => (
                        <Fragment key={i}>
                          <span className="scrub-word">{word}</span>{" "}
                        </Fragment>
                      ))}
                  </Fragment>
                ))}
              </p>
              <svg viewBox={`0 0 ${TRACE.width} ${TRACE.height}`} aria-hidden className="mt-10 h-9 w-full max-w-xl overflow-visible">
                <defs>
                  <linearGradient id="statement-trace" x1="0" x2="1" y1="0" y2="0">
                    {AGENTS.map((agent, i) => (
                      <stop key={agent.id} offset={i / (AGENTS.length - 1)} stopColor={agent.color} />
                    ))}
                  </linearGradient>
                </defs>
                <path
                  className="scrub-draw"
                  pathLength={1}
                  d={`M${TRACE.inset} ${TRACE.height / 2} H${TRACE.width - TRACE.inset}`}
                  fill="none"
                  stroke="url(#statement-trace)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                {AGENTS.map((agent, i) => (
                  <circle
                    key={agent.id}
                    className="scrub-node"
                    cx={TRACE.inset + i * NODE_STEP}
                    cy={TRACE.height / 2}
                    r={7}
                    fill={agent.color}
                  />
                ))}
              </svg>
            </ScrubScene>
          </div>
        </div>
      </div>
    </section>
  );
}
