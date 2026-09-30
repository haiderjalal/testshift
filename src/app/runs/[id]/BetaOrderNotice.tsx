import type { Run } from "@/lib/db";
import { BETA_CONTACT, money } from "@/lib/beta-pricing";
import { formatDuration, PLANS } from "@/lib/plans";
import { AutoRefresh } from "./RunControls";

export function BetaOrderNotice({ run }: { run: Run }) {
  const pending = run.status === "pending_payment" || run.status === "paid";
  const quote = run.quoted_total_cents != null;
  const body = `Hello, I'd like to onboard for TestShift beta.\nOrder: ${run.id}\nWebsite: ${run.url}\nPlan: ${PLANS[run.plan].name}\nTime: ${formatDuration(run.minutes)}\n${quote ? `Fixed quote: ${money(run.quoted_total_cents!)} USD\n` : "Please confirm my fixed hourly quote.\n"}Please send my Wise payment link and onboarding instructions.`;
  const mailto = `mailto:${BETA_CONTACT.email}?subject=${encodeURIComponent(`TestShift beta order ${run.id}`)}&body=${encodeURIComponent(body)}`;
  return <section className="mt-8 rounded-2xl border border-rule bg-card p-6" aria-label="Beta order">
    {pending && <AutoRefresh />}
    <h2 className="font-display text-xl font-semibold">{run.status === "paid" ? "Payment confirmed — waiting for manual start" : run.status === "pending_payment" ? (quote ? "Awaiting Wise payment" : "Your order is waiting for a quote") : "Your prepaid beta order"}</h2>
    <p className="mt-3 break-all font-mono text-sm">Order reference: {run.id}</p>
    {quote && <p className="mt-3 text-lg">{money(run.quoted_total_cents!)} USD total · {money(run.quoted_hourly_cents!)}/hour · {formatDuration(run.minutes)}</p>}
    <p className="mt-2 text-sm text-graphite">Fixed prepaid quote based on 10× estimated AI token cost. No subscription, automatic top-ups or extra token invoice.</p>
    {run.status === "pending_payment" && <>
      <p className="mt-4">Email us with this order reference first. We&apos;ll confirm the quote and send you a Wise payment link. Wise tag: <strong>{BETA_CONTACT.wiseTag}</strong>.</p>
      <a href={mailto} className="mt-4 inline-block break-all text-dev underline">{BETA_CONTACT.email}</a>
      <p className="mt-3 text-sm text-graphite">Keep this private order link. After paying, reply with your Wise transaction reference. A receipt email does not automatically confirm payment or start testing.</p>
    </>}
    {pending && <p className="mt-4 text-sm text-marker">Your purchased time has not started. We confirm payment, finish onboarding and authorize your shift manually; the timer begins only when a worker picks it up.</p>}
  </section>;
}
