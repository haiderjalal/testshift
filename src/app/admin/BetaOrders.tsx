import Link from "next/link";
import { BETA_CONTACT, money, type BetaPrices } from "@/lib/beta-pricing";
import { PLAN_IDS, PLANS, formatDuration } from "@/lib/plans";
import type { BetaOrder, PlanAverage } from "./data";
import { BetaForm } from "./BetaForm";

const input = "mt-1 block w-full rounded-lg border border-rule bg-paper px-3 py-2 font-mono";

export function BetaOrders({ orders, prices, averages }: { orders: BetaOrder[]; prices: BetaPrices; averages: Partial<Record<string, PlanAverage>> }) {
  return <section className="mt-8 space-y-6" aria-label="Beta orders and pricing">
    <div className="rounded-2xl border border-rule bg-card p-6">
      <h2 className="font-display text-xl font-semibold">Beta hourly pricing · 10× token cost</h2>
      <p className="mt-2 text-sm text-graphite">Wise: {BETA_CONTACT.wiseTag} · Onboarding: {BETA_CONTACT.email}. Customers email first for your payment link. Stripe is off.</p>
      <p className="mt-2 text-sm text-graphite">Publish an estimated AI cost per hour for each plan. The customer rate is exactly 10× that estimate. $1.00 estimated cost → $10.00/hour. Estimates are not verified provider bills; infrastructure, fees and support reduce your margin. Existing quotes never change.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {PLAN_IDS.map((plan) => <article key={plan} className="rounded-xl border border-rule p-4" aria-label={`${PLANS[plan].name} beta pricing`}>
          <h3 className="font-semibold">{PLANS[plan].name}</h3>
          <p className="mt-1 text-sm">{prices[plan] === undefined ? "Not published — customers request a quote" : `Published: ${money(prices[plan]!)}/hour`}</p>
          <p className="mt-1 text-xs text-graphite">{averages[plan] ? `${averages[plan]!.runs} long-run sample(s): estimated token spend $${averages[plan]!.costPerHour.toFixed(2)}/observed hour. Review before publishing.` : "No qualifying long-run samples yet. Short synthetic tests are not hourly benchmarks."}</p>
          <BetaForm operation="price" plan={plan} label={`Publish ${PLANS[plan].name} rate`}>
            <label className="text-sm">Estimated token cost per hour (USD)
              <input name="amount" type="number" min="0.01" max="1000" step="0.01" required defaultValue={prices[plan] === undefined ? "" : (prices[plan]! / 1000).toFixed(2)} className={input} />
            </label>
          </BetaForm>
        </article>)}
      </div>
    </div>
    <div className="rounded-2xl border border-rule bg-card p-6">
      <h2 className="font-display text-xl font-semibold">Beta orders awaiting action</h2>
      <p className="mt-2 text-sm text-graphite">1. Send the fixed quote/payment link. 2. Verify the transfer in Wise and record it. 3. Finish onboarding and start the shift. Payment confirmation alone never starts the timer.</p>
      {!orders.length && <p className="mt-4 text-graphite">No beta orders waiting.</p>}
      <div className="mt-4 space-y-4">{orders.map((order) => <article key={order.id} aria-label={`Order ${order.id}`} className="rounded-xl border border-rule p-4">
        <Link href={`/runs/${order.id}`} className="break-all font-mono text-sm text-dev underline">{order.id}</Link>
        <p className="mt-2 break-words">{order.url}</p>
        <a href={`mailto:${order.email}?subject=${encodeURIComponent(`TestShift beta order ${order.id}`)}`} className="text-sm underline">{order.email}</a>
        <p className="mt-2 text-sm">{PLANS[order.plan].name} · {formatDuration(order.minutes)} · {order.status === "paid" ? "Payment confirmed — not started" : "Awaiting payment"}</p>
        {order.notes && <p className="mt-2 whitespace-pre-line text-sm text-graphite">{order.notes}</p>}
        {order.quoted_total_cents !== null && <p className="mt-2 font-mono">Fixed quote: {money(order.quoted_total_cents)} ({money(order.quoted_hourly_cents!)}/hour)</p>}
        {order.quoted_total_cents === null ? <BetaForm operation="quote" id={order.id} label="Save fixed quote">
          <label className="text-sm">Estimated token cost per hour (USD)<input name="amount" type="number" min="0.01" max="1000" step="0.01" required className={input} /></label>
        </BetaForm> : order.status === "pending_payment" ? <BetaForm operation="confirm" id={order.id} label="Confirm Wise payment">
          <label className="text-sm">Received amount (USD)<input name="amount" type="number" min="0.01" step="0.01" required defaultValue={(order.quoted_total_cents / 100).toFixed(2)} className={input} /></label>
          <label className="text-sm">Wise transaction reference<input name="reference" minLength={3} maxLength={120} required className={input} /></label>
          <label className="flex gap-2 text-sm"><input name="verified" type="checkbox" required />I verified this payment in Wise and the USD amount matches the quote.</label>
        </BetaForm> : <BetaForm operation="start" id={order.id} label="Start shift" />}
      </article>)}</div>
      {orders.length === 100 && <p className="mt-3 text-sm text-graphite">Showing the oldest 100 pending beta orders. Process these to show the next orders.</p>}
    </div>
  </section>;
}
