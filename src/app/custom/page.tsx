import type { Metadata } from "next";
import type { ReactElement } from "react";

import { PageIntro } from "@/components/PageIntro";
import { SiteHeader } from "@/components/SiteHeader";
import { testingMode } from "@/lib/repository-testing";

import { CustomForm } from "./CustomForm";

export const metadata: Metadata = {
  title: "Custom pricing",
  description: "Volume hours, recurring regression shifts or dedicated agents. Tell us what you need and get a quote.",
  alternates: { canonical: "/custom" },
};

export default async function CustomPage({ searchParams }: PageProps<"/custom">): Promise<ReactElement> {
  const mode = testingMode((await searchParams).mode);
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-10 pb-24 sm:px-8">
        <PageIntro
          eyebrow="Custom pricing"
          title="Tell us what your release needs."
          description="Volume hours, recurring regression shifts, several sites or a dedicated agent team. Describe it and we'll reply with a quote."
        />
        <CustomForm defaultMode={mode} />
      </main>
    </>
  );
}
