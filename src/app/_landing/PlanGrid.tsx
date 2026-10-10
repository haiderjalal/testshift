"use client";

import Link from "next/link";
import { useState } from "react";

import { SpotlightCard } from "@/components/SpotlightCard";
import { money, type BetaPrices } from "@/lib/beta-pricing";
import { HOUR_OPTIONS, PLAN_IDS, PLANS } from "@/lib/plans";

const TIER_COLOR = ["var(--color-dev)", "var(--color-staging)", "var(--color-uat)", "var(--color-prod)"];
const DEFAULT_HOURS = 2;

/**
 * The four plan cards with an hours estimator. Totals are the hourly quote times the hours picked, the same
 * arithmetic the booking form uses, and the picked hours carry into the booking link.
 */
export function PlanGrid({ prices }: { prices: BetaPrices }) {
  const [hours, setHours] = useState<number>(DEFAULT_HOURS);

  return (
    <>
      <fieldset className="mt-12">
        <legend className="font-mono text-xs tracking-widest text-graphite uppercase">Estimate for</legend>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-wrap gap-2">
            {HOUR_OPTIONS.map((option) => (
              <label
                key={option}
                className="cursor-pointer rounded-full border border-rule bg-card/60 px-4 py-2 font-mono text-sm transition hover:border-graphite has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-dev"
              >
                <input
                  type="radio"
                  name="estimate-hours"
                  value={option}
                  checked={hours === option}
                  onChange={() => setHours(option)}
                  className="sr-only"
                />
                {option}h
              </label>
            ))}
          </div>
          <p className="text-sm text-graphite">Estimates only. Your quote is fixed when you book.</p>
        </div>
      </fieldset>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {PLAN_IDS.map((id, i) => {
          const plan = PLANS[id];
          const hourly = prices[id];
          return (
            <div key={id} className="reveal">
              <SpotlightCard tilt accent={TIER_COLOR[i]} className="glass flex h-full flex-col rounded-3xl p-7">
                <p className="font-mono text-[11px] tracking-widest uppercase" style={{ color: TIER_COLOR[i] }}>
                  {plan.name}
                </p>
                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-display text-3xl font-semibold tracking-tight">
                    {hourly === undefined ? "By quote" : money(hourly)}
                  </span>
                  <span className="text-graphite">/ hour</span>
                </p>
                <p className="mt-2 min-h-5 font-mono text-xs text-graphite tabular-nums">
                  {hourly === undefined ? "" : `≈ ${money(hourly * hours)} for ${hours} ${hours === 1 ? "hour" : "hours"}`}
                </p>
                <p className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-rule bg-paper/60 px-3 py-1 font-mono text-[11px] text-graphite">
                  <span className="size-1.5 rounded-full" style={{ background: TIER_COLOR[i] }} />
                  Personalized background agents
                </p>
                <p className="mt-5 text-ink">{plan.pitch}</p>
                <ul className="mt-5 flex-1 space-y-2.5 text-[15px]">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3 text-graphite">
                      <span aria-hidden className="text-pass">
                        ✓
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/hire?plan=${id}&hours=${hours}`}
                  className="mt-8 rounded-full border border-rule px-5 py-3 text-center font-medium transition hover:border-ink hover:bg-ink hover:text-paper"
                >
                  Book {plan.name}
                </Link>
              </SpotlightCard>
            </div>
          );
        })}
      </div>
    </>
  );
}
