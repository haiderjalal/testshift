import type { Run } from "@/lib/db";
import { BETA_CONTACT, money } from "@/lib/beta-pricing";
import { formatDuration, PLANS } from "@/lib/plans";
import { AutoRefresh } from "./RunControls";

export function BetaOrderNotice({ run }: { run: Run }) {
  const pending = run.status === "pending_payment" || run.status === "paid";
  const quote = run.quoted_total_cents != null;
  const body = `Hello, I'd like to onboard for TestShift beta.\nOrder: ${run.id}\nWebsite: ${run.url}\nPlan: ${PLANS[run.plan].name}\nTime: ${formatDuration(run.minutes)}\n${quote ? `Fixed quote: ${money(run.quoted_total_cents!)} USD\n` : "Please confirm my fixed hourly quote.\n"}Please send my Wise payment link and onboarding instructions.`;
  const mailto = `mailto:${BETA_CONTACT.email}?subject=${encodeURIComponent(`TestShift beta order ${run.id}`)}&body=${encodeURIComponent(body)}`;
  return (
    <section className="glass glass-strong mt-8 space-y-4 rounded-3xl p-6 sm:p-8" aria-label="Beta order">
      {pending && <AutoRefresh />}
      <h2 className="font-display text-xl font-semibold sm:text-2xl">
        {run.status === "paid" ? "Payment confirmed — waiting for manual start" : run.status === "pending_payment" ? (quote ? "Awaiting Wise payment" : "Your order is waiting for a quote") : "Your prepaid beta order"}
      </h2>
      <p className="break-all font-mono text-sm text-graphite">Order reference: {run.id}</p>
      {quote && (
        <p className="rounded-2xl border border-dashed border-rule bg-paper/60 p-4 font-display text-base font-semibold sm:text-lg">
          {money(run.quoted_total_cents!)} USD total · {money(run.quoted_hourly_cents!)}/hour · {formatDuration(run.minutes)}
        </p>
      )}
      <p className="text-sm text-graphite">Fixed prepaid quote. No subscription, automatic top-ups or extra invoices.</p>
      {run.status === "pending_payment" && (
        <div className="space-y-4">
          <p>Email us with this order reference first. We&apos;ll confirm the quote and send you a Wise payment link. Wise tag: <strong>{BETA_CONTACT.wiseTag}</strong>.</p>
          <a
            href={mailto}
            className="inline-flex min-h-11 max-w-full items-center break-all rounded-full border border-dev/40 px-5 py-2 font-mono text-sm text-dev transition hover:border-dev"
          >
            {BETA_CONTACT.email}
          </a>
          <p className="text-sm text-graphite">Keep this private order link. After paying, reply with your Wise transaction reference. A receipt email does not automatically confirm payment or start testing.</p>
        </div>
      )}
      {pending && <p className="text-sm text-marker">Your purchased time has not started. We confirm payment, finish onboarding and authorize your shift manually; the timer begins only when a worker picks it up.</p>}
    </section>
  );
}
