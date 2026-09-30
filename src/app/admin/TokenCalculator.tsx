"use client";

import { useState } from "react";

import { MODELS, PLANS, type PlanId } from "@/lib/plans";

import type { PlanAverage } from "./data";

/**
 * Starting estimates until real shifts exist: roughly 2M tokens per shift-hour, mostly cache reads.
 * ponytail: rough guesses; replaced per plan as soon as one shift on that plan completes.
 */
const ESTIMATES: Record<PlanId, Omit<PlanAverage, "plan" | "runs">> = {
  junior: { costPerHour: 4, tokensPerHour: 2_000_000 },
  senior: { costPerHour: 9, tokensPerHour: 2_000_000 },
  lead: { costPerHour: 14, tokensPerHour: 2_600_000 },
  principal: { costPerHour: 28, tokensPerHour: 2_200_000 },
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const tokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : `${Math.round(n / 1e3)}K`);
/** Number inputs: empty or invalid becomes the minimum, anything else is clamped to a sane range. */
const clamp = (raw: string, min: number, max: number) => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const input = "mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 font-mono outline-none focus:border-ink";

export function TokenCalculator({ averages }: { averages: Partial<Record<PlanId, PlanAverage>> }) {
  const [plan, setPlan] = useState<PlanId>("senior");
  const [hours, setHours] = useState(2);
  const [shifts, setShifts] = useState(20);

  const measured = averages[plan];
  const rate = measured ?? ESTIMATES[plan];
  const perShift = { tokens: rate.tokensPerHour * hours, cost: rate.costPerHour * hours, revenue: PLANS[plan].rate * hours };
  const margin = perShift.revenue > 0 ? (perShift.revenue - perShift.cost) / perShift.revenue : 0;

  return (
    <div className="rounded-2xl border border-rule bg-card p-6">
      <h2 className="font-display text-lg font-semibold">Token calculator</h2>
      <p className="mt-1 text-sm text-graphite">
        {measured
          ? `Based on ${measured.runs} completed ${PLANS[plan].name} shift${measured.runs === 1 ? "" : "s"}.`
          : `No completed ${PLANS[plan].name} shifts yet: using a starting estimate.`}{" "}
        Model: {MODELS[PLANS[plan].model].label}.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          Plan
          <select value={plan} onChange={(e) => setPlan(e.target.value as PlanId)} className={input}>
            {(Object.keys(PLANS) as PlanId[]).map((id) => (
              <option key={id} value={id}>
                {PLANS[id].name} · ${PLANS[id].rate}/h
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Hours per shift
          <input type="number" min={0.25} max={8} step={0.25} value={hours} onChange={(e) => setHours(clamp(e.target.value, 0, 8))} className={input} />
        </label>
        <label className="text-sm">
          Shifts per month
          <input type="number" min={0} max={10000} value={shifts} onChange={(e) => setShifts(clamp(e.target.value, 0, 10_000))} className={input} />
        </label>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4 font-mono text-sm sm:grid-cols-4">
        {[
          ["Tokens / shift", tokens(perShift.tokens)],
          ["Claude cost / shift", usd(perShift.cost)],
          ["Revenue / shift", usd(perShift.revenue)],
          ["Margin", `${Math.round(margin * 100)}%`],
          ["Tokens / month", tokens(perShift.tokens * shifts)],
          ["Claude cost / month", usd(perShift.cost * shifts)],
          ["Revenue / month", usd(perShift.revenue * shifts)],
          ["Profit / month", usd((perShift.revenue - perShift.cost) * shifts)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-rule bg-paper p-3">
            <dt className="text-[11px] tracking-wide text-graphite uppercase">{label}</dt>
            <dd className="mt-1 text-base text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
