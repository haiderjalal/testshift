import type { ReactElement } from "react";

import Link from "next/link";

import { money, type BetaPrices } from "@/lib/beta-pricing";
import { PLAN_IDS, PLANS, type PlanId } from "@/lib/plans";

import { FieldError } from "./FieldError";

/** Each tier borrows one agent's colour, so the plans read as a path through Dev, Staging, UAT and Prod. */
export const PLAN_COLOR: Record<PlanId, string> = {
  junior: "var(--color-dev)",
  senior: "var(--color-staging)",
  lead: "var(--color-uat)",
  principal: "var(--color-prod)",
};

interface PlanPickerProps {
  plan: PlanId | null;
  prices: BetaPrices;
  error?: string;
  onSelect: (plan: PlanId) => void;
}

/** Plan tiles as a radio group. The chosen tile lights up in its agent colour. */
export function PlanPicker({ plan, prices, error, onSelect }: PlanPickerProps): ReactElement {
  return (
    <fieldset aria-invalid={Boolean(error)} aria-describedby={error ? "plan-error" : undefined}>
      <legend className="font-medium">Plan</legend>
      <FieldError id="plan-error" message={error} />
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {PLAN_IDS.map((id) => {
          const tier = PLANS[id];
          const price = prices[id];
          return (
            <label
              key={id}
              className="relative flex cursor-pointer flex-col rounded-2xl border border-rule bg-card p-5 transition hover:-translate-y-0.5 has-checked:border-[color:var(--accent)] has-checked:shadow-[0_0_0_1px_var(--accent),0_18px_40px_-24px_var(--accent)] has-focus-visible:outline-2 has-focus-visible:outline-ink"
              style={{ ["--accent" as string]: PLAN_COLOR[id] }}
            >
              <input
                type="radio"
                name="plan"
                value={id}
                checked={plan === id}
                onChange={() => onSelect(id)}
                className="peer sr-only"
              />
              {/* Visual radio mark. It sits after the input so `peer-checked` can style it. */}
              <span
                aria-hidden
                className="absolute top-5 right-5 size-4 rounded-full border border-graphite transition peer-checked:border-[color:var(--accent)] peer-checked:bg-[color:var(--accent)]"
              />
              <span className="pr-8 font-semibold text-[color:var(--accent)]">{tier.name}</span>
              <span className="mt-2 font-mono text-sm">{price === undefined ? "By quote" : `${money(price)}/h`}</span>
              <span className="mt-2 block text-sm text-graphite">{tier.pitch}</span>
              <span className="mt-3 block font-mono text-xs text-[color:var(--accent)]">Personalized background agents</span>
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-graphite">
        Every plan runs all four agents: Dev, Staging, UAT and Prod.{" "}
        <Link href="/custom" className="text-ink underline underline-offset-4 hover:text-dev">
          Need custom pricing?
        </Link>
      </p>
    </fieldset>
  );
}
