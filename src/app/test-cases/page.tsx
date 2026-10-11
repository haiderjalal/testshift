import type { Metadata } from "next";
import type { ReactElement } from "react";

import { PageIntro } from "@/components/PageIntro";
import { SiteHeader } from "@/components/SiteHeader";
import { documentLimits } from "@/lib/documents/limits";

import { TestCaseForm } from "./TestCaseForm";

// The limits shown here come from configuration, so they are read at request time rather than frozen at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Test cases from any website",
  description: "Give us a link. We crawl the site, write test cases for its pages, forms and links, and send you a PDF and a Word file.",
  alternates: { canonical: "/test-cases" },
};

export default function TestCasesPage(): ReactElement {
  const limits = documentLimits();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-10 pb-24 sm:px-8">
        <PageIntro
          eyebrow="Test case documents"
          title="Turn a website into test cases."
          description={`Give us a link. We crawl up to ${limits.maxPages} pages, write up to ${limits.maxCases} test cases from their structure, forms, links and accessibility, add scenarios drafted by AI, and send you a PDF and a Word file.`}
        />
        <section aria-labelledby="included" className="mt-10 rounded-2xl border border-rule bg-card p-6">
          <h2 id="included" className="font-display text-lg font-semibold">
            What is in the document
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-graphite">
            <li>Each case has a reference, the page to start on, steps, test data, the expected result and what was observed.</li>
            <li>Forms get boundary and negative cases taken from the fields&apos; own constraints, such as required, length and range limits.</li>
            <li>Each case is labelled by source, so you know which are crawl rules, accessibility checks and AI-drafted scenarios.</li>
            <li>Scope and limits are listed, so nobody mistakes the document for complete coverage.</li>
          </ul>
        </section>
        <TestCaseForm />
      </main>
    </>
  );
}
