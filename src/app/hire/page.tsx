import type { Metadata } from "next";

import { SiteHeader } from "@/components/SiteHeader";
import { PLANS, type PlanId } from "@/lib/plans";

import { HireForm } from "./HireForm";

export const metadata: Metadata = {
  title: "Book a QA shift",
  description: "Choose a plan and the hours you need. The AI tester starts as soon as payment clears.",
  alternates: { canonical: "/hire" },
};

export default async function HirePage({ searchParams }: PageProps<"/hire">) {
  const { url, plan } = await searchParams;
  const defaultPlan: PlanId = typeof plan === "string" && plan in PLANS ? (plan as PlanId) : "junior";

  return (
    <>
      <SiteHeader showNav={false} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-6 pb-24 sm:px-8">
        <h1 className="text-4xl font-semibold tracking-tight">Book a QA shift</h1>
        <p className="mt-3 text-graphite">
          The tester starts as soon as payment clears and works until your hours run out.
        </p>
        <HireForm defaultUrl={typeof url === "string" ? url : ""} defaultPlan={defaultPlan} />
      </main>
    </>
  );
}
