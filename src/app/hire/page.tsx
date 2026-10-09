import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/SiteHeader";
import { loadBetaPrices } from "@/lib/beta-orders";
import { HOUR_OPTIONS, PLANS, TRIAL_MINUTES, type PlanId } from "@/lib/plans";

import { HireForm } from "./HireForm";

// Rates must be read at request time; never contact the order database during prerendering.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a QA shift",
  description: `Start with a free ${TRIAL_MINUTES}-minute QA shift, then book hours as you need them.`,
  alternates: { canonical: "/hire" },
};

export default async function HirePage({ searchParams }: PageProps<"/hire">) {
  const prices = await loadBetaPrices();
  const { url, plan, hours } = await searchParams;
  // No plan is preselected unless a pricing link asked for one; customers choose it themselves.
  const defaultPlan = typeof plan === "string" && Object.hasOwn(PLANS, plan) ? (plan as PlanId) : null;
  // ?hours=2 preselects a paid shift (used by the trial report's upsell); otherwise start on the free trial.
  const paidHours = HOUR_OPTIONS.find((h) => String(h) === hours);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-10 pb-24 sm:px-8">
        <h1 className="font-display text-4xl font-semibold tracking-[-0.03em]">Book a QA shift</h1>
        <p className="mt-3 text-graphite">
          Your first {TRIAL_MINUTES} minutes are free. Paid beta shifts are prepaid through Wise after email onboarding. No subscription or automatic card charges.
        </p>
        <p className="mt-4 text-sm text-graphite">Have source code or need checks on every push? <Link href="/github-agent" className="text-ink underline underline-offset-4">Explore GitHub testing and CI</Link>.</p>
        <HireForm
          prices={prices}
          defaultUrl={typeof url === "string" ? url : ""}
          defaultPlan={defaultPlan}
          defaultShift={paidHours ?? "trial"}
        />
      </main>
    </>
  );
}
