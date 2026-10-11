import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";

import { AutoRefresh } from "@/components/AutoRefresh";
import { SiteHeader } from "@/components/SiteHeader";
import { isUuid } from "@/lib/db";
import { SOURCE_LABEL } from "@/lib/documents/model";
import { getCasePreview, getDocument, type CasePreview, type DocumentRecord } from "@/lib/documents/store";

// The status changes while the document is built, so the page is never served from a cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your test cases",
  robots: { index: false, follow: false },
};

const PREVIEW_CASES = 20;

export default async function TestCaseDocumentPage({ params }: PageProps<"/test-cases/[id]">): Promise<ReactElement> {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const doc = await getDocument(id);
  if (!doc) notFound();
  const preview = doc.status === "completed" ? await getCasePreview(id, PREVIEW_CASES) : [];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pt-10 pb-24 sm:px-8">
        <p className="font-mono text-xs tracking-wide text-graphite">Test case document · requested {doc.created_at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.03em] break-words sm:text-5xl">{doc.host}</h1>
        {doc.status === "queued" || doc.status === "running" ? <InProgress doc={doc} /> : null}
        {doc.status === "failed" ? <Failed message={doc.error} /> : null}
        {doc.status === "completed" && doc.summary ? <Completed id={id} doc={doc} preview={preview} /> : null}
      </main>
    </>
  );
}

function InProgress({ doc }: { doc: DocumentRecord }): ReactElement {
  return (
    <section className="glass mt-10 rounded-3xl p-6 sm:p-8">
      <p className="font-display text-xl font-semibold">{doc.status === "queued" ? "Your request is in the queue." : "We are writing your test cases."}</p>
      <p role="status" className="mt-2 text-graphite">
        {doc.activity ?? "Waiting for a worker to pick up the request."}
      </p>
      <p className="mt-3 text-graphite">
        This takes a few minutes. We email the link when the files are ready, and this page updates by itself.
      </p>
      <AutoRefresh everyMs={5_000} />
    </section>
  );
}

function Failed({ message }: { message: string | null }): ReactElement {
  return (
    <div role="alert" className="mt-10 rounded-3xl border border-fail/40 bg-card p-6 sm:p-8">
      <p className="font-display text-lg font-semibold">We could not finish these test cases.</p>
      <p className="mt-2 text-graphite">{message ?? "Please request them again."}</p>
      <Link href="/test-cases" className="btn-primary mt-6 h-11 px-5">
        Request again
      </Link>
    </div>
  );
}

function Completed({ id, doc, preview }: { id: string; doc: DocumentRecord; preview: CasePreview[] }): ReactElement {
  const summary = doc.summary;
  if (!summary) return <></>;
  return (
    <section className="mt-10 space-y-8">
      <div className="glass rounded-3xl p-6 sm:p-8">
        <p className="font-display text-2xl font-semibold">
          {summary.total} test cases from {doc.page_count ?? 0} pages
        </p>
        <p className="mt-2 text-graphite">
          {summary.byPriority.high} high, {summary.byPriority.medium} medium and {summary.byPriority.low} low priority.{" "}
          {summary.bySource.crawl} from the crawl, {summary.bySource.scan} from the accessibility scan and {summary.bySource.ai} AI-drafted.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={`/test-cases/${id}/pdf`} className="btn-primary h-11 px-5">
            Download PDF
          </a>
          <a
            href={`/test-cases/${id}/docx`}
            className="inline-flex h-11 items-center justify-center rounded-full border border-rule px-5 font-medium text-ink transition hover:border-dev hover:text-dev"
          >
            Download Word (.docx)
          </a>
        </div>
        <p className="mt-4 text-sm text-graphite">
          Keep this page private: anyone with the link can download the files. We also emailed the link to you.
        </p>
      </div>

      <section aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="font-display text-xl font-semibold">
          The first {preview.length} cases
        </h2>
        <p className="mt-2 text-graphite">The PDF and Word files hold all {summary.total} cases, with their steps and expected results.</p>
        {/* Scrolls sideways inside its own box on phones, so the page itself never overflows. */}
        <div className="glass mt-4 overflow-x-auto rounded-2xl" tabIndex={0}>
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-rule font-mono text-xs tracking-widest text-graphite uppercase">
                <th scope="col" className="px-5 py-3 font-medium">Ref</th>
                <th scope="col" className="px-5 py-3 font-medium">Case</th>
                <th scope="col" className="px-5 py-3 font-medium">Priority</th>
                <th scope="col" className="px-5 py-3 font-medium">Type</th>
                <th scope="col" className="px-5 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {preview.map((c) => (
                <tr key={c.code} className="align-top">
                  <td className="px-5 py-3 font-mono text-xs">{c.code}</td>
                  <td className="px-5 py-3">{c.title}</td>
                  <td className="px-5 py-3">{c.priority}</td>
                  <td className="px-5 py-3">{c.type}</td>
                  <td className="px-5 py-3 text-graphite">{SOURCE_LABEL[c.source]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
