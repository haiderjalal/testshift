import type { Browser } from "playwright";

import { db, json, type SitePage } from "@/lib/db";
import { documentLimits, type DocumentLimits } from "@/lib/documents/limits";
import { buildModel, selectCases, type DocumentCase, type DocumentModel, type NumberedCase, type PageLine } from "@/lib/documents/model";
import { observationsOf, ruleCases, scanCases } from "@/lib/documents/rules";
import { renderDocx } from "@/lib/documents/render-docx";
import { renderDocumentHtml } from "@/lib/documents/render-html";
import { appUrl, sendEmail } from "@/lib/email";
import { describeFailure, log } from "@/lib/log";

import { accessibilityAudit, crawlSite } from "./browser";
import { renderPdf } from "./document-pdf";
import { draftScenarioBatch } from "./documents-ai";
import { startEgressProxy } from "./egress";
import { launchEngine } from "./engines";
import { AiBudget, BudgetExceededError } from "./budget";
import { LeaseLostError } from "./lease";

const CRAWL_MS = 4 * 60_000;
const SCAN_MS = 2 * 60_000;
const AI_MS = 6 * 60_000;
/** Pages per scenario call: enough context to write cases that connect pages, small enough to stay cheap. */
const AI_BATCH_PAGES = 5;
const HEARTBEAT_MS = 30_000;
const MAX_URL_CHARS = 2_000;
const BLOCKED_STATUSES = [401, 403, 429];

/** A failure whose message is written for the person who asked, so it may be shown on their page. */
export class DocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentError";
  }
}

export interface DocumentJob {
  id: string;
  url: string;
  host: string;
  email: string;
  notes: string;
  claimToken: string;
}

export interface DocumentRunOptions {
  /** Replaces the model call. Tests use it; production always drafts with the model. */
  draft?: typeof draftScenarioBatch;
}

/** Claims the next queued document, or one whose worker went silent. Returns null when there is none. */
export async function claimDocument(): Promise<DocumentJob | null> {
  const [row] = await db()<{ id: string; url: string; host: string; email: string; notes: string; claim_token: string }[]>`
    update test_documents set
      status = 'running',
      claim_token = gen_random_uuid(),
      started_at = coalesce(started_at, now()),
      heartbeat_at = now(),
      activity = 'Starting'
    where id = (
      select id from test_documents
      where status = 'queued' or (status = 'running' and heartbeat_at < now() - interval '3 minutes')
      order by created_at
      limit 1
      for update skip locked
    )
    returning id, url, host, email, notes, claim_token`;
  if (!row) return null;
  return { id: row.id, url: row.url, host: row.host, email: row.email, notes: row.notes, claimToken: row.claim_token };
}

/** Shows the live status, and doubles as the ownership check: throws once another worker holds the document. */
async function setActivity(job: DocumentJob, activity: string): Promise<void> {
  const rows = await db()`
    update test_documents set activity = ${activity}, heartbeat_at = now()
    where id = ${job.id} and claim_token = ${job.claimToken} returning id`;
  if (rows.length === 0) throw new LeaseLostError();
}

/** A re-claimed document starts again from nothing, so no earlier cases or files survive into the new run. */
async function clearOutputs(job: DocumentJob): Promise<void> {
  await db()`delete from test_document_cases where document_id = ${job.id}`;
  await db()`delete from test_document_files where document_id = ${job.id}`;
}

const toPageLine = (page: SitePage): PageLine => ({ url: page.url, title: page.title, status: page.status });

/** Scope and limits, written from what actually happened, so no reader mistakes the document for full coverage. */
export function scopeNotes(input: {
  host: string;
  pages: SitePage[];
  limits: DocumentLimits;
  scanned: number;
  aiCases: number;
  aiBatches: number;
  aiStopped: boolean;
  dropped: number;
}): string[] {
  const blocked = input.pages.filter((page) => BLOCKED_STATUSES.includes(page.status)).length;
  const notes = [
    `Crawled ${input.pages.length} page(s) of ${input.host}, following links within the site, up to ${input.limits.maxPages} pages.`,
    `The accessibility scan covered ${input.scanned} page(s) against the WCAG 2.2 AA rules. Automated checks find only part of the accessibility problems on a page.`,
    `Scenario cases: ${input.aiCases} drafted from ${input.aiBatches} batch(es) of pages.`,
  ];
  if (blocked > 0) notes.push(`${blocked} page(s) refused automated visits or need a login, so they were not explored further.`);
  if (input.aiStopped) notes.push("Scenario drafting stopped at this document's AI cost limit. The other cases are complete.");
  if (input.dropped > 0) {
    notes.push(`The document holds the ${input.limits.maxCases} highest-priority cases. ${input.dropped} lower-priority case(s) were left out.`);
  }
  notes.push("Nothing in this document was run against the site. Each case describes what to check and what to expect.");
  notes.push("Expected results come from what the site showed during the scan, or from a standard the browser enforces. Confirm the intended behavior with the team before you file a defect.");
  return notes;
}

/** Drafts scenarios batch by batch within the document's budget. A batch that fails is skipped, not fatal. */
async function draftAll(input: {
  job: DocumentJob;
  pages: SitePage[];
  limits: DocumentLimits;
  draft: typeof draftScenarioBatch;
}): Promise<{ cases: DocumentCase[]; batches: number; stopped: boolean }> {
  const [{ spent }] = await db()<{ spent: number }[]>`
    select coalesce(sum(cost_usd), 0)::float8 as spent from ai_usage where document_id = ${input.job.id}`;
  const budget = new AiBudget(input.limits.maxAiUsd, spent);
  const stopAt = Date.now() + AI_MS;
  const cases: DocumentCase[] = [];
  let batches = 0;
  let stopped = false;
  for (let start = 0; start < input.pages.length && !stopped; start += AI_BATCH_PAGES) {
    if (Date.now() >= stopAt) break;
    try {
      const drafted = await input.draft({
        documentId: input.job.id,
        pages: input.pages.slice(start, start + AI_BATCH_PAGES),
        focus: input.job.notes,
        budget,
        stopAt,
      });
      cases.push(...drafted);
      batches++;
    } catch (e) {
      if (e instanceof BudgetExceededError) {
        stopped = true;
        break;
      }
      if (e instanceof LeaseLostError) throw e;
      log("error", `Scenario batch failed: ${describeFailure(e)}`, { documentId: input.job.id });
    }
  }
  return { cases, batches, stopped };
}

async function saveCases(job: DocumentJob, cases: NumberedCase[]): Promise<void> {
  // Columns are capped in the database; clipping here means one long string can never fail the whole document.
  const fit = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
  for (const [index, c] of cases.entries()) {
    await db()`
      insert into test_document_cases (document_id, seq, code, feature, title, type, priority, source, page_url,
        preconditions, test_data, steps, expected, observed)
      values (${job.id}, ${index + 1}, ${c.code}, ${fit(c.feature, 200)}, ${fit(c.title, 300)}, ${c.type}, ${c.priority},
        ${c.source}, ${c.pageUrl}, ${fit(c.preconditions, 500)}, ${fit(c.testData, 500)},
        ${json(c.steps as unknown as object)}, ${fit(c.expected, 600)}, ${fit(c.observed, 600)})`;
  }
}

async function saveFiles(job: DocumentJob, pdf: Buffer, docx: Buffer): Promise<void> {
  for (const [format, content] of [["pdf", pdf], ["docx", docx]] as const) {
    await db()`
      insert into test_document_files (document_id, format, content, bytes) values (${job.id}, ${format}, ${content}, ${content.byteLength})
      on conflict (document_id, format) do update set content = excluded.content, bytes = excluded.bytes, created_at = now()`;
  }
}

async function complete(job: DocumentJob, model: DocumentModel, pageCount: number, aiCases: number): Promise<void> {
  const rows = await db()`
    update test_documents set status = 'completed', activity = null, page_count = ${pageCount},
      case_count = ${model.summary.total}, ai_case_count = ${aiCases},
      summary = ${json(model.summary as unknown as object)}, completed_at = now(), heartbeat_at = now()
    where id = ${job.id} and claim_token = ${job.claimToken} returning id`;
  if (rows.length === 0) throw new LeaseLostError();
}

async function notify(job: DocumentJob, total: number): Promise<void> {
  try {
    await sendEmail({
      to: job.email,
      subject: `Your test cases for ${job.host} are ready`,
      text: `We wrote ${total} test cases for ${job.host}.\n\nDownload them as a PDF or a Word file:\n${appUrl()}/test-cases/${job.id}\n\nThe document lists its scope and limits. Review the AI-drafted scenarios before you rely on them.`,
    });
  } catch (e) {
    log("warn", `Document notification failed: ${describeFailure(e)}`, { documentId: job.id });
  }
}

/**
 * Turns one site into test cases: crawl, scan, draft, number and render. Takes a browser the caller has launched and
 * behind the egress proxy. Throws DocumentError for a message the person should see, and LeaseLostError when another
 * worker has taken the document over.
 */
export async function runDocumentJob(job: DocumentJob, browser: Browser, options: DocumentRunOptions = {}): Promise<void> {
  const limits = documentLimits();
  const origin = new URL(job.url);
  await clearOutputs(job);

  const unreadable = new DocumentError(
    `We could not load any page of ${job.host}, so no test cases were written. Check that the site is online and reachable from the public internet, then request again.`,
  );
  await setActivity(job, "Scanning pages");
  let pages: SitePage[];
  try {
    pages = await crawlSite(browser, job.url, { maxPages: limits.maxPages, until: Date.now() + CRAWL_MS });
  } catch (e) {
    // The crawler throws when the start address cannot be reached at all (for example, the name does not resolve).
    if (e instanceof LeaseLostError) throw e;
    log("warn", `The crawl could not start on the site: ${describeFailure(e)}`, { documentId: job.id });
    throw unreadable;
  }
  const loaded = pages.filter((page) => page.status >= 200 && page.status < 400);
  if (loaded.length === 0) throw unreadable;

  await setActivity(job, "Checking accessibility on each page");
  const scan = await accessibilityAudit(browser, job.url, loaded.map((page) => page.url), Date.now() + SCAN_MS);

  await setActivity(job, "Writing scenario test cases");
  const scenarios = await draftAll({ job, pages: loaded, limits, draft: options.draft ?? draftScenarioBatch });

  await setActivity(job, "Building the PDF and Word files");
  const everything = [...ruleCases(pages, origin), ...scanCases(scan, pages), ...scenarios.cases].filter((c) => c.pageUrl.length <= MAX_URL_CHARS);
  const chosen = selectCases(everything, limits.maxCases);
  const model = buildModel({
    siteUrl: job.url,
    generatedAt: new Date(),
    pages: pages.map(toPageLine),
    cases: chosen,
    observations: observationsOf(pages),
    notes: scopeNotes({
      host: job.host,
      pages,
      limits,
      scanned: scan.filter((result) => !result.blocked).length,
      aiCases: chosen.filter((c) => c.source === "ai").length,
      aiBatches: scenarios.batches,
      aiStopped: scenarios.stopped,
      dropped: everything.length - chosen.length,
    }),
  });

  await saveCases(job, model.cases);
  const pdf = await renderPdf(browser, renderDocumentHtml(model));
  const docx = await renderDocx(model);
  await saveFiles(job, pdf, docx);
  await complete(job, model, pages.length, model.summary.bySource.ai);
  await notify(job, model.summary.total);
}

/**
 * Claims one queued document and processes it. Returns false when none was waiting. Failures are written to the
 * document, so the person sees them on its page.
 */
export async function processDocumentRequest(): Promise<boolean> {
  const job = await claimDocument();
  if (!job) return false;
  log("info", "Test case document started", { documentId: job.id });

  let browser: Browser | null = null;
  let proxy: Awaited<ReturnType<typeof startEgressProxy>> | null = null;
  let lost = false;
  const heartbeat = setInterval(() => {
    db()`update test_documents set heartbeat_at = now() where id = ${job.id} and claim_token = ${job.claimToken} returning id`
      .then((rows) => {
        if (rows.length === 0) {
          lost = true;
          void browser?.close().catch(() => undefined);
        }
      })
      .catch((e) => log("warn", `Document heartbeat failed: ${describeFailure(e)}`, { documentId: job.id }));
  }, HEARTBEAT_MS);

  try {
    proxy = await startEgressProxy();
    browser = await launchEngine("chromium", proxy.server);
    await runDocumentJob(job, browser);
    log("info", "Test case document completed", { documentId: job.id });
  } catch (e) {
    if (lost || e instanceof LeaseLostError) {
      log("warn", "Lost the claim on a document; stopping", { documentId: job.id });
      return true;
    }
    const message = e instanceof DocumentError ? e.message : "We could not finish this document. Please request it again.";
    log("error", `Test case document failed: ${describeFailure(e)}`, { documentId: job.id });
    await db()`
      update test_documents set status = 'failed', activity = null, error = ${message}, completed_at = now()
      where id = ${job.id} and claim_token = ${job.claimToken}`.catch((err) =>
      log("error", `Could not mark document failed: ${describeFailure(err)}`, { documentId: job.id }),
    );
  } finally {
    clearInterval(heartbeat);
    await browser?.close().catch(() => undefined);
    await proxy?.close().catch(() => undefined);
  }
  return true;
}
