import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/SiteHeader";
import { db, isUuid, type Run, type TestCase } from "@/lib/db";
import { confirmCheckout } from "@/lib/payments";
import { formatDuration, PLANS } from "@/lib/plans";

import { LiveShift } from "./LiveShift";
import { Report } from "./Report";

export const metadata: Metadata = {
  title: "Your QA shift",
  robots: { index: false, follow: false },
};

type RunView = Run & { elapsed_ms: number | null };

async function getRun(id: string): Promise<RunView | undefined> {
  // Elapsed time comes from the database clock, the same one that set the deadline.
  const [run] = await db()<RunView[]>`
    select id, url, email, plan, minutes, is_trial, notes, status, activity, report, error,
      started_at, deadline_at, completed_at, created_at,
      (extract(epoch from least(now(), deadline_at) - started_at) * 1000)::float8 as elapsed_ms
    from runs where id = ${id}`;
  return run;
}

export default async function RunPage({ params, searchParams }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  const { session_id: sessionId } = await searchParams;
  if (!isUuid(id)) notFound();

  let run = await getRun(id);
  if (!run) notFound();
  if (run.status === "pending_payment" && typeof sessionId === "string") {
    await confirmCheckout(run.id, sessionId);
    run = (await getRun(id)) ?? run;
  }

  const cases = await db()<TestCase[]>`
    select id, seq, title, category, priority, viewport, start_url, steps, expected, status, actual, severity,
      actions, screenshot is not null as has_screenshot, finished_at
    from test_cases where run_id = ${id} order by seq`;
  const plan = PLANS[run.plan];

  return (
    <>
      <SiteHeader showNav={false} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 pt-4 pb-24 sm:px-8">
        <p className="font-mono text-xs text-graphite">
          {plan.name} · {formatDuration(run.minutes)}
          {run.is_trial && " · free trial"} · booked{" "}
          {run.created_at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight break-words">{new URL(run.url).hostname}</h1>

        {run.status === "completed" ? (
          <Report run={run} cases={cases} />
        ) : run.status === "failed" ? (
          <div role="alert" className="mt-10 rounded-2xl border border-fail/30 bg-card p-6">
            <p className="text-lg font-semibold">This shift stopped early.</p>
            <p className="mt-2 text-graphite">{run.error}</p>
          </div>
        ) : (
          <LiveShift run={run} elapsed={run.elapsed_ms ?? 0} cases={cases} emailConfigured={Boolean(process.env.RESEND_API_KEY)} />
        )}
      </main>
    </>
  );
}
