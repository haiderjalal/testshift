import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/SiteHeader";
import { db, isUuid, type Run, type TestCase } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { formatDuration, PLANS } from "@/lib/plans";

import { LiveShift } from "./LiveShift";
import { Report } from "./Report";
import { BetaOrderNotice } from "./BetaOrderNotice";
import { BETA_CONTACT } from "@/lib/beta-pricing";

export const metadata: Metadata = {
  title: "Your QA shift",
  robots: { index: false, follow: false },
};

type RunView = Run & { elapsed_ms: number | null; stripe_session_id: string | null };

async function getRun(id: string): Promise<RunView | undefined> {
  // Elapsed time comes from the database clock, the same one that set the deadline.
  const [run] = await db()<RunView[]>`
    select id, url, email, plan, minutes, is_trial, notes, status, activity, agent, report, strategy, error, stripe_session_id,
      started_at, deadline_at, completed_at, created_at, payment_method, quoted_hourly_cents, quoted_total_cents, payment_confirmed_at, start_authorized_at,
      (extract(epoch from least(now(), deadline_at) - started_at) * 1000)::float8 as elapsed_ms
    from runs where id = ${id}`;
  return run;
}

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const run = await getRun(id);
  if (!run) notFound();

  const cases = await db()<TestCase[]>`
    select id, seq, agent, feature, title, category, priority, viewport, start_url, steps, expected, status, actual, severity,
      actions, screenshot is not null as has_screenshot, finished_at
    from test_cases where run_id = ${id} order by seq`;
  const plan = PLANS[run.plan];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-10 pb-24 sm:px-8">
        <p className="font-mono text-xs text-graphite">
          {plan.name} · {formatDuration(run.minutes)}
          {run.is_trial && " · free trial"} · booked{" "}
          {run.created_at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.03em] break-words sm:text-5xl">{new URL(run.url).hostname}</h1>

        {run.payment_method === "wise" && <BetaOrderNotice run={run} />}

        {run.status === "completed" ? (
          <Report run={run} cases={cases} />
        ) : run.status === "failed" ? (
          <div role="alert" className="glass mt-10 rounded-2xl border-fail/40 p-6">
            <p className="font-display text-lg font-semibold">This shift stopped early.</p>
            <p className="mt-2 text-graphite">{run.error}</p>
          </div>
        ) : run.status === "pending_payment" || run.status === "paid" ? (
          run.payment_method !== "wise" && <p className="mt-6">This legacy order is on hold. Email {BETA_CONTACT.email} with your order reference for beta onboarding.</p>
        ) : (
          <LiveShift run={run} elapsed={run.elapsed_ms ?? 0} cases={cases} emailConfigured={emailConfigured()} />
        )}
      </main>
    </>
  );
}
