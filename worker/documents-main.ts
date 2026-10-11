import { db } from "@/lib/db";
import { documentLimits } from "@/lib/documents/limits";
import { describeFailure, log } from "@/lib/log";

import { processDocumentRequest } from "./documents";
import { browserProblem } from "./engines";

const IDLE_POLL_MS = 5_000;
const MIGRATION = "supabase/migrations/20261023000000_test_documents.sql";

/** Why the worker cannot use the database, in words an operator can act on, or null when it can. */
async function databaseProblem(): Promise<string | null> {
  try {
    const [row] = await db()<{ table_name: string | null }[]>`select to_regclass('test_documents')::text as table_name`;
    return row?.table_name ? null : `the test_documents table is missing; apply ${MIGRATION} to this database`;
  } catch (e) {
    return describeFailure(e);
  }
}

/**
 * The test case document worker. It runs as its own process, so a long document never waits behind a paid shift and
 * a shift never waits behind a document. Start it with `npm run documents:worker`.
 */
async function main(): Promise<void> {
  // Fail fast: an invalid limit or missing model credentials would otherwise burn budget on every request.
  documentLimits();
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    log("error", "ANTHROPIC_API_KEY is not set; the document worker will not claim requests");
    process.exit(1);
  }
  // A wrong connection string, a missing migration or a missing browser would otherwise fail every document, with no reason given.
  const problem = (await databaseProblem()) ?? (await browserProblem());
  if (problem) {
    log("error", `The document worker cannot start: ${problem}`);
    process.exit(1);
  }
  log("info", "Test case document worker started");
  for (;;) {
    const handled = await processDocumentRequest().catch((e) => {
      log("error", `Document worker error: ${describeFailure(e)}`);
      return false;
    });
    if (!handled) await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
  }
}

void main();
