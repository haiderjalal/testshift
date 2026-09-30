"use client";

import { useState } from "react";
import { PLANS, PLAN_IDS, type PlanId } from "@/lib/plans";
import { TOKEN_MARKUP, type BetaPrices } from "@/lib/beta-pricing";
import type { PlanAverage } from "./data";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const bounded = (raw: string, max: number) => Number.isFinite(Number(raw)) ? Math.max(0, Math.min(max, Number(raw))) : 0;
const input = "mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2 font-mono";

export function TokenCalculator({ averages, prices }: { averages: Partial<Record<PlanId, PlanAverage>>; prices: BetaPrices }) {
  const [plan, setPlan] = useState<PlanId>("junior");
  const [customCost, setCustomCost] = useState<string | null>(null);
  const [hours, setHours] = useState(1);
  const [shifts, setShifts] = useState(20);
  const measured = averages[plan];
  const estimate = customCost === null ? (prices[plan] === undefined ? measured?.costPerHour ?? 0 : prices[plan]! / 100 / TOKEN_MARKUP) : bounded(customCost, 1000);
  const revenue = estimate * TOKEN_MARKUP * hours;
  const cost = estimate * hours;
  return <div className="rounded-2xl border border-rule bg-card p-6">
    <h2 className="font-display text-lg font-semibold">10× hourly quote calculator</h2>
    <p className="mt-2 text-sm text-graphite">What-if estimate only; changing this calculator does not publish prices. {measured ? `${measured.runs} qualifying long-run sample(s): ${usd(measured.costPerHour)} estimated token cost per observed hour.` : "No qualifying hourly samples for this plan. Enter your estimate; a short synthetic run is not an hourly benchmark."}</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">Plan<select value={plan} onChange={(e) => { setPlan(e.target.value as PlanId); setCustomCost(null); }} className={input}>{PLAN_IDS.map((id) => <option key={id} value={id}>{PLANS[id].name}</option>)}</select></label>
      <label className="text-sm">Estimated AI cost / hour (USD)<input type="number" min="0" max="1000" step="0.01" value={customCost ?? (estimate || "")} onChange={(e) => setCustomCost(e.target.value)} className={input} /></label>
      <label className="text-sm">Hours per shift<input type="number" min="1" max="8" step="1" value={hours} onChange={(e) => setHours(Math.max(1, Math.floor(bounded(e.target.value, 8))))} className={input} /></label>
      <label className="text-sm">Shifts per month<input type="number" min="0" max="10000" step="1" value={shifts} onChange={(e) => setShifts(Math.floor(bounded(e.target.value, 10000)))} className={input} /></label>
    </div>
    <dl className="mt-5 grid grid-cols-2 gap-3 font-mono text-sm sm:grid-cols-4">{[
      ["Customer hourly quote", usd(estimate * TOKEN_MARKUP)], ["AI cost / shift", usd(cost)], ["Customer total / shift", usd(revenue)],
      ["Token-only gross margin", estimate > 0 ? "90%" : "—"], ["AI cost / month", usd(cost * shifts)], ["Revenue / month", usd(revenue * shifts)],
      ["Before other costs / month", usd((revenue - cost) * shifts)],
    ].map(([label, value]) => <div key={label} className="rounded-xl border border-rule bg-paper p-3"><dt className="text-xs text-graphite">{label}</dt><dd className="mt-1">{value}</dd></div>)}</dl>
    <p className="mt-3 text-xs text-graphite">10× is a price multiplier, not net profit. Actual token usage, hosting, Wise fees, refunds and support affect margin.</p>
  </div>;
}
