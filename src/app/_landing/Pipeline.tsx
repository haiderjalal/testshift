import { Fragment } from "react";

import { AGENTS } from "@/lib/agents";

import { SAMPLES } from "./samples";

/**
 * Four full-height agent panels. Each is a `data-stage` section, so the 3D camera flies to that agent
 * while you read it, and the sticky stepper lights the matching node.
 */
export function Pipeline() {
  return (
    <section id="agents" aria-labelledby="agents-heading" className="pipeline relative scroll-mt-16">
      <div className="mx-auto max-w-7xl px-5 pt-28 sm:px-8">
        <p className="reveal font-mono text-xs tracking-widest text-graphite uppercase">The pipeline</p>
        <h2
          id="agents-heading"
          className="reveal mt-4 max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl"
        >
          Tested the way real teams ship: dev, staging, UAT, then prod.
        </h2>
        <p className="reveal mt-5 max-w-xl text-lg text-graphite">
          Your shift is split between four agents. Each one owns an environment and a kind of test, and hands over to
          the next.
        </p>
      </div>

      {/* Sticky stepper: the node for the section on screen lights up (see .stage-node). */}
      <div className="sticky top-[4.1rem] z-20 mt-12">
        <ol className="glass mx-auto flex w-fit items-center gap-1 rounded-full px-2 py-2 font-mono text-[10px] tracking-wider uppercase sm:gap-3 sm:px-3 sm:text-[11px]">
          {AGENTS.map((a, i) => (
            <Fragment key={a.id}>
              {i > 0 && <li aria-hidden className="hidden h-px w-10 bg-rule sm:block" />}
              <li>
                <a
                  href={`#agent-${a.id}`}
                  data-agent={a.id}
                  style={{ ["--agent" as string]: a.color }}
                  className="stage-node flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 sm:gap-2 sm:px-3"
                >
                  <span className="size-1.5 rounded-full" style={{ background: a.color }} />
                  {a.name.replace(" agent", "")}
                </a>
              </li>
            </Fragment>
          ))}
        </ol>
      </div>

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        {/* Rail that fills top to bottom as you scroll through the pipeline. */}
        <div aria-hidden className="absolute top-0 bottom-0 left-5 w-px bg-rule sm:left-8">
          <div
            className="pipeline-rail h-full w-full origin-top"
            style={{
              background: "linear-gradient(var(--color-dev), var(--color-staging), var(--color-uat), var(--color-prod))",
            }}
          />
        </div>

        {AGENTS.map((a, i) => (
          <article
            key={a.id}
            id={`agent-${a.id}`}
            data-stage={a.id}
            aria-labelledby={`agent-${a.id}-name`}
            className="flex min-h-[92vh] scroll-mt-32 items-center py-16 pl-8 sm:pl-12"
          >
            <div
              className="glass reveal-side w-full max-w-xl rounded-3xl p-7 sm:p-9"
              style={{
                boxShadow: `0 30px 90px -40px ${a.color}`,
                // More opaque than .glass: earlier agents' cores drift behind this panel.
                background: "color-mix(in srgb, var(--color-card) 86%, transparent)",
              }}
            >
              <p className="flex items-center gap-3 font-mono text-xs tracking-widest text-graphite uppercase">
                <span style={{ color: a.color }}>0{i + 1}</span>
                <span className="h-px w-8 bg-rule" />
                {a.env} environment
              </p>
              <h3
                id={`agent-${a.id}-name`}
                className="mt-5 font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl"
                style={{ color: a.color }}
              >
                {a.name}
              </h3>
              <p className="mt-3 inline-flex rounded-full border px-3 py-1 font-mono text-xs" style={{ borderColor: a.color, color: a.color }}>
                {a.testType}
              </p>
              <p className="mt-5 text-xl text-ink">{a.tagline}</p>
              <ul className="mt-5 space-y-2.5">
                {a.checks.map((check) => (
                  <li key={check} className="flex gap-3 text-graphite">
                    <span aria-hidden style={{ color: a.color }}>
                      ◆
                    </span>
                    {check}
                  </li>
                ))}
              </ul>
              <div className="mt-7 rounded-2xl border border-rule bg-paper/70 p-4 font-mono text-[13px]">
                <p className="mb-2 text-[10px] tracking-widest text-graphite uppercase">Sample output</p>
                <ul className="space-y-1.5">
                  {SAMPLES[a.id].slice(0, 3).map((line) => (
                    <li key={line.text} className="flex gap-2.5">
                      <span className={line.status === "pass" ? "text-pass" : "text-fail"}>{line.status === "pass" ? "✓" : "✗"}</span>
                      <span className={line.status === "fail" ? "marker" : "text-graphite"}>{line.text}</span>
                      {line.severity && <span className="ml-auto text-[10px] text-fail uppercase">{line.severity}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
