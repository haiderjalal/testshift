import Link from "next/link";

import { PLAN_IDS, PLANS, TRIAL_MINUTES } from "@/lib/plans";
import { money, type BetaPrices } from "@/lib/beta-pricing";

const TIER_COLOR = ["var(--color-dev)", "var(--color-staging)", "var(--color-uat)", "var(--color-prod)"];

export function Pricing({ prices }: { prices: BetaPrices }) {
  return (
    <section id="pricing" data-stage="overview" aria-labelledby="pricing-heading" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-28 sm:px-8">
      <p className="reveal font-mono text-xs tracking-widest text-graphite uppercase">Pricing</p>
      <h2 id="pricing-heading" className="reveal mt-4 max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl">
        Pick the seniority. Pay by the hour.
      </h2>
      <p className="reveal mt-5 max-w-2xl text-lg text-graphite">
        Every plan runs all four agents. Higher plans use more advanced personalized agents and add automated audits.{" "}
        <span className="text-pass">Your first {TRIAL_MINUTES} minutes are free on any plan.</span>
        {" "}Beta pricing is 10× estimated AI token cost per hour. Prepay a fixed quote by Wise after email onboarding; no subscription. Prices are estimates, not metered token invoices.
      </p>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {PLAN_IDS.map((id, i) => {
          const plan = PLANS[id];
          return (
            <article
              key={id}
              className="glow-card tilt-in group flex flex-col bg-card/80 p-7 backdrop-blur transition duration-300 hover:-translate-y-1.5"
              style={{ animationRangeStart: `entry ${i * 6}%` }}
            >
              <p className="font-mono text-[11px] tracking-widest uppercase" style={{ color: TIER_COLOR[i] }}>
                {plan.name}
              </p>
              <p className="mt-5 flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-semibold tracking-tight">{prices[id] === undefined ? "By quote" : money(prices[id]!)}</span>
                <span className="text-graphite">/ hour</span>
              </p>
              <p className="mt-3 inline-flex w-fit items-center gap-2 rounded-full border border-rule bg-paper/60 px-3 py-1 font-mono text-[11px] text-graphite">
                <span className="size-1.5 rounded-full" style={{ background: TIER_COLOR[i] }} />
                Personalized background agents
              </p>
              <p className="mt-5 text-ink">{plan.pitch}</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-[15px]">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3 text-graphite">
                    <span aria-hidden className="text-pass">
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={`/hire?plan=${id}`}
                className="mt-8 rounded-full border border-rule px-5 py-3 text-center font-medium transition group-hover:border-ink hover:bg-ink hover:text-paper"
              >
                Book {plan.name}
              </Link>
            </article>
          );
        })}
      </div>

      <article className="glow-card tilt-in mt-5 flex flex-col gap-6 bg-card/80 p-8 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-mono text-[11px] tracking-widest text-marker uppercase">Custom</p>
          <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight">Volume, recurring shifts or a dedicated team</h3>
          <p className="mt-2 max-w-2xl text-graphite">
            Weekly regression runs, several sites, 100+ hours a month or a Principal agent before every release. Tell us
            what you need and we&apos;ll quote it.
          </p>
        </div>
        <Link href="/custom" className="btn-primary h-12 shrink-0">
          Request a quote
        </Link>
      </article>
    </section>
  );
}
