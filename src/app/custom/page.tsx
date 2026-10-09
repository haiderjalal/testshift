import type { Metadata } from "next";

import { SiteHeader } from "@/components/SiteHeader";
import { testingMode } from "@/lib/repository-testing";

import { CustomForm } from "./CustomForm";

export const metadata: Metadata = {
  title: "Custom pricing",
  description: "Volume hours, recurring regression shifts or dedicated agents. Tell us what you need and get a quote.",
  alternates: { canonical: "/custom" },
};

export default async function CustomPage({ searchParams }: PageProps<"/custom">) {
  const mode = testingMode((await searchParams).mode);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-10 pb-24 sm:px-8">
        <p className="font-mono text-xs tracking-widest text-graphite uppercase">Custom pricing</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-balance">
          Tell us what your release needs.
        </h1>
        <p className="mt-4 text-graphite">
          Volume hours, recurring regression shifts, several sites or a dedicated agent team. Describe it and we&apos;ll
          reply with a quote.
        </p>
        <CustomForm defaultMode={mode} />
      </main>
    </>
  );
}
