import type { PGlite } from "@electric-sql/pglite";
import { chromium } from "playwright";

import { buildModel, summarize, type DocumentCase } from "../src/lib/documents/model";
import { renderDocx } from "../src/lib/documents/render-docx";
import { renderDocumentHtml } from "../src/lib/documents/render-html";
import { renderPdf } from "../worker/document-pdf";

/** A finished document whose files are real: the same renderers the worker uses write them. */
export const COMPLETED_DOCUMENT = "55555555-5555-4555-8555-555555555555";
/** A document still waiting for a worker, so its files do not exist yet. */
export const QUEUED_DOCUMENT = "66666666-6666-4666-8666-666666666666";

const CASES: DocumentCase[] = [
  {
    feature: "Home (/)",
    title: "Open / and confirm it loads",
    type: "smoke",
    priority: "high",
    source: "crawl",
    pageUrl: "https://8.8.8.8/",
    preconditions: "",
    testData: "",
    steps: ["Enter https://8.8.8.8/ in the browser address bar.", "Press Enter and wait until the page finishes loading."],
    expected: "The page loads without an error page.",
    observed: "HTTP 200 during the scan.",
  },
  {
    feature: "Home (/)",
    title: "Submit / with \"Work email\" empty",
    type: "negative",
    priority: "high",
    source: "crawl",
    pageUrl: "https://8.8.8.8/",
    preconditions: "",
    testData: "\"Work email\" empty; the other required fields hold valid test data.",
    steps: ["Open https://8.8.8.8/.", "Leave \"Work email\" empty.", "Press the form's submit button."],
    expected: "The form is not submitted, and \"Work email\" is marked as required.",
    observed: "Required attribute present (email field).",
  },
  {
    feature: "Contact form",
    title: "Send a message with every field filled in",
    type: "functional",
    priority: "medium",
    source: "ai",
    pageUrl: "https://8.8.8.8/contact",
    preconditions: "",
    testData: "Name: Test User.",
    steps: ["Open the contact page.", "Fill in the name with test data.", "Press Send."],
    expected: "A confirmation message appears.",
    observed: "",
  },
];

export async function seedDocumentFixtures(db: PGlite): Promise<void> {
  const model = buildModel({
    siteUrl: "https://8.8.8.8/",
    generatedAt: new Date("2026-10-11T12:00:00Z"),
    pages: [
      { url: "https://8.8.8.8/", title: "Home", status: 200 },
      { url: "https://8.8.8.8/contact", title: "Contact", status: 200 },
    ],
    cases: CASES,
    observations: [],
    notes: ["Crawled 2 page(s) of 8.8.8.8, following links within the site, up to 25 pages."],
  });
  const summary = summarize(model.cases);
  await db.query(
    `insert into test_documents (id, url, host, site_key, email, notes, visitor, status, created_at, completed_at, page_count, case_count, ai_case_count, summary)
     values ($1, 'https://8.8.8.8/', '8.8.8.8', '8.8.8.8', 'fixture@example.com', '', 'fixture-visitor', 'completed', now(), now(), 2, $2, 1, $3)`,
    [COMPLETED_DOCUMENT, model.cases.length, JSON.stringify(summary)],
  );
  for (const c of model.cases) {
    await db.query(
      `insert into test_document_cases (document_id, seq, code, feature, title, type, priority, source, page_url, preconditions, test_data, steps, expected, observed)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [COMPLETED_DOCUMENT, Number(c.code.slice(3)), c.code, c.feature, c.title, c.type, c.priority, c.source, c.pageUrl, c.preconditions, c.testData, JSON.stringify(c.steps), c.expected, c.observed],
    );
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const pdf = await renderPdf(browser, renderDocumentHtml(model));
    await db.query("insert into test_document_files (document_id, format, content, bytes) values ($1, 'pdf', $2, $3)", [COMPLETED_DOCUMENT, pdf, pdf.byteLength]);
  } finally {
    await browser.close();
  }
  const docx = await renderDocx(model);
  await db.query("insert into test_document_files (document_id, format, content, bytes) values ($1, 'docx', $2, $3)", [COMPLETED_DOCUMENT, docx, docx.byteLength]);

  await db.query(
    `insert into test_documents (id, url, host, site_key, email, notes, visitor, status, created_at)
     values ($1, 'https://8.8.8.8/', '8.8.8.8', '8.8.8.8', 'fixture@example.com', '', 'fixture-queued', 'queued', now())`,
    [QUEUED_DOCUMENT],
  );
}
