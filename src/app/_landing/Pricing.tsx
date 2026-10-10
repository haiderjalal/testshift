import Link from "next/link";

import { SpotlightCard } from "@/components/SpotlightCard";
import type { BetaPrices } from "@/lib/beta-pricing";
import { TRIAL_MINUTES } from "@/lib/plans";

import { PlanGrid } from "./PlanGrid";

export function Pricing({ prices, unavailable = false }: { prices: BetaPrices; unavailable?: boolean }) {
  return (
    <section id="pricing" data-stage="overview" aria-labelledby="pricing-heading" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-28 sm:px-8">
      <p className="reveal font-mono text-xs tracking-widest text-graphite uppercase">Pricing</p>
      <h2 id="pricing-heading" className="reveal mt-4 max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl">
        Pick the seniority. Pay by the hour.
      </h2>
      <p className="reveal mt-5 max-w-2xl text-lg text-graphite">
        Every plan runs all four agents. Higher plans use more advanced personalized agents and add automated audits.{" "}
        <span className="text-pass">Your first {TRIAL_MINUTES} minutes are free on any plan.</span>
        {" "}Prepay a fixed quote by Wise after email onboarding; no subscription.
      </p>

      {unavailable && <p role="status" className="mt-6 text-graphite">Live pricing is temporarily unavailable. Please try again shortly or contact us for a quote.</p>}

      <PlanGrid prices={prices} />

      <div className="reveal mt-5">
        <SpotlightCard accent="var(--color-marker)" className="glass flex flex-col gap-6 rounded-3xl p-8 md:flex-row md:items-center md:justify-between">
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
        </SpotlightCard>
      </div>

      <div className="reveal mt-5">
        <div className="flex flex-col gap-5 rounded-3xl border border-dashed border-rule p-8 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-display text-2xl font-semibold">Have a GitHub repository?</h3>
            <p className="mt-2 max-w-2xl text-graphite">Request repository testing or CI setup, including a plan for destructive checks in a disposable environment.</p>
          </div>
          <Link href="/github-agent" className="btn-primary min-h-12 shrink-0 px-5">Explore GitHub & CI</Link>
        </div>
      </div>
    </section>
  );
}
