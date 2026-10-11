import { documentLimits } from "@/lib/documents/limits";
import { errorMessage, log } from "@/lib/log";

import { processDocumentRequest } from "./documents";

const IDLE_POLL_MS = 5_000;

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
  log("info", "Test case document worker started");
  for (;;) {
    const handled = await processDocumentRequest().catch((e) => {
      log("error", "Document worker error", { error: errorMessage(e) });
      return false;
    });
    if (!handled) await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
  }
}

void main();
