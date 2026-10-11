/**
 * Database access for test case documents, used by the web pages and the download routes. The worker writes its own
 * progress and output (see worker/documents.ts), because only it holds the claim on a document.
 */
import { db } from "@/lib/db";

import { documentLimits } from "./limits";
import type { CaseSource, CaseType, DocumentSummary, Priority } from "./model";

export type DocumentStatus = "queued" | "running" | "completed" | "failed";

export interface DocumentRecord {
  id: string;
  url: string;
  host: string;
  status: DocumentStatus;
  activity: string | null;
  error: string | null;
  page_count: number | null;
  case_count: number | null;
  ai_case_count: number | null;
  summary: DocumentSummary | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface CasePreview {
  code: string;
  title: string;
  feature: string;
  type: CaseType;
  priority: Priority;
  source: CaseSource;
  page_url: string;
}

export type LimitReason = "visitor" | "site" | "day";
export type CreateResult = { id: string } | { limit: LimitReason };

/**
 * Records a request if the day's limits allow it. The transaction takes an advisory lock first, so two submissions
 * arriving together are counted one after the other and cannot both pass a limit that only one of them should.
 */
export async function createDocumentRequest(input: {
  url: string;
  host: string;
  siteKey: string;
  email: string;
  notes: string;
  visitor: string;
}): Promise<CreateResult> {
  const limits = documentLimits();
  return db().begin(async (sql): Promise<CreateResult> => {
    await sql`select pg_advisory_xact_lock(hashtext('test_documents'))`;
    const [counts] = await sql<{ day: number; site: number; visitor: number }[]>`
      select count(*)::int as day,
        count(*) filter (where site_key = ${input.siteKey})::int as site,
        count(*) filter (where visitor = ${input.visitor})::int as visitor
      from test_documents where created_at > now() - interval '1 day'`;
    if (counts.visitor >= limits.perVisitorPerDay) return { limit: "visitor" };
    if (counts.site >= limits.perSitePerDay) return { limit: "site" };
    if (counts.day >= limits.perDay) return { limit: "day" };
    const [row] = await sql<{ id: string }[]>`
      insert into test_documents (url, host, site_key, email, notes, visitor)
      values (${input.url}, ${input.host}, ${input.siteKey}, ${input.email}, ${input.notes}, ${input.visitor})
      returning id`;
    return { id: row.id };
  });
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  const [row] = await db()<DocumentRecord[]>`
    select id, url, host, status, activity, error, page_count, case_count, ai_case_count, summary,
      created_at, started_at, completed_at
    from test_documents where id = ${id}`;
  return row;
}

/** The first cases of a finished document, for the preview on its status page. */
export async function getCasePreview(id: string, limit: number): Promise<CasePreview[]> {
  return db()<CasePreview[]>`
    select code, title, feature, type, priority, source, page_url
    from test_document_cases where document_id = ${id} order by seq limit ${limit}`;
}

/** A finished document's file, with the host it was written for. Only completed documents have files. */
export async function getDocumentFile(id: string, format: "pdf" | "docx"): Promise<{ content: Buffer; host: string } | undefined> {
  const [row] = await db()<{ content: Buffer; host: string }[]>`
    select f.content, d.host from test_document_files f
    join test_documents d on d.id = f.document_id
    where f.document_id = ${id} and f.format = ${format} and d.status = 'completed'`;
  return row;
}
