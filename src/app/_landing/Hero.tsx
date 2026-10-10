import Link from "next/link";

import { SplitText } from "@/components/SplitText";
import { UrlForm } from "@/components/UrlForm";
import { AGENTS } from "@/lib/agents";
import { TRIAL_MINUTES } from "@/lib/plans";

import { ShiftHud } from "./ShiftHud";

export function Hero() {
  return (
    <section data-stage="hero" className="relative flex min-h-[calc(100dvh-4rem)] items-center">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-5 pt-14 pb-20 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <ul className="rise flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-wider uppercase" aria-label="The four agents">
            {AGENTS.map((a, i) => (
              <li key={a.id}>
                <Link
                  href={`#agent-${a.id}`}
                  className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-graphite transition hover:text-ink"
                >
                  <span
                    className="pulse-dot size-1.5 rounded-full"
                    style={{ background: a.color, color: a.color, ["--i" as string]: i }}
                  />
                  {a.name.replace(" agent", "")}
                </Link>
              </li>
            ))}
            <li className="pl-1 text-pass">online</li>
          </ul>

          <h1 className="mt-7 font-display text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.04em] sm:text-6xl lg:text-[5.2rem]">
            <SplitText text="Four AI agents." />
            <br />
            <SplitText text="One QA shift." color="var(--color-dev)" offset={16} />
          </h1>

          <p className="rise mt-7 max-w-xl text-lg leading-relaxed text-graphite" style={{ ["--d" as string]: 5 }}>
            Rent an AI QA team by the hour. Dev, Staging, UAT and Prod agents run{" "}
            <span className="text-ink">unit, integration, end-to-end and smoke tests</span> on your site in a real
            browser, then hand you the bug report.
          </p>

          <div className="rise mt-9" style={{ ["--d" as string]: 6 }}>
            <UrlForm id="hero-url" />
          </div>
          <p className="rise mt-4 pl-2 text-sm text-graphite" style={{ ["--d" as string]: 7 }}>
            <span className="text-pass">First {TRIAL_MINUTES} minutes free.</span> No card needed. Then from $30 an hour.
          </p>
        </div>

        <div className="rise w-full max-w-md justify-self-start lg:mt-14 lg:justify-self-end lg:self-start" style={{ ["--d" as string]: 9 }}>
          <ShiftHud />
        </div>
      </div>

      <a
        href="#agents"
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 font-mono text-[11px] tracking-widest text-graphite uppercase hover:text-ink sm:flex"
      >
        Meet the agents
        <span aria-hidden className="float block h-8 w-px bg-gradient-to-b from-dev to-transparent" />
      </a>
    </section>
  );
}
