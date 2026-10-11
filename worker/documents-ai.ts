import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import { db } from "@/lib/db";
import { featureOf } from "@/lib/documents/rules";
import { acceptScenarioCases, MAX_AI_CASES_PER_BATCH, SCENARIO_SYSTEM, scenarioPrompt, ScenarioOutput } from "@/lib/documents/scenarios";
import type { DocumentCase } from "@/lib/documents/model";
import type { SitePage } from "@/lib/db";
import { describeFailure, log } from "@/lib/log";
import { type ModelId, tokenCost } from "@/lib/plans";

import type { AiBudget } from "./budget";
import { formatSiteMap } from "./browser";

/** Scenario drafting is bulk work, so it runs on the cheapest model at its lowest effort. */
export const DOCUMENT_MODEL: ModelId = "claude-sonnet-5-5";
const OUTPUT_TOKENS = 4_000;
const CALL_TIMEOUT_MS = 60_000;

const client = new Anthropic({ maxRetries: 0, timeout: CALL_TIMEOUT_MS });

/** Saves one call's tokens and cost against its document, for the admin dashboard. Never throws. */
async function recordUsage(documentId: string, usage: { input: number; output: number; cacheRead: number; cacheWrite: number }, cost: number, written: number): Promise<void> {
  try {
    await db()`
      insert into ai_usage (document_id, purpose, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
      values (${documentId}, 'document', ${DOCUMENT_MODEL}, ${usage.input}, ${usage.output}, ${usage.cacheRead}, ${written}, ${cost})`;
  } catch (e) {
    log("error", `Could not record document token usage: ${describeFailure(e)}`, { documentId });
  }
}

/**
 * Drafts scenario cases for one batch of crawled pages. The budget is reserved before the call and settled with the
 * real cost after it. Throws BudgetExceededError when the reservation would pass the document's limit.
 */
export async function draftScenarioBatch({
  documentId,
  pages,
  focus,
  budget,
  stopAt,
}: {
  documentId: string;
  pages: SitePage[];
  focus: string;
  budget: AiBudget;
  stopAt: number;
}): Promise<DocumentCase[]> {
  if (pages.length === 0) return [];
  const pageUrls = pages.map((page) => page.url);
  const input = {
    model: DOCUMENT_MODEL,
    max_tokens: OUTPUT_TOKENS,
    output_config: { effort: "low", format: betaZodOutputFormat(ScenarioOutput) },
    system: SCENARIO_SYSTEM,
    messages: [
      {
        role: "user",
        content: scenarioPrompt({ siteMap: formatSiteMap(pages), pageUrls, focus, maxCases: MAX_AI_CASES_PER_BATCH }),
      },
    ],
  } satisfies Anthropic.Beta.MessageCreateParamsNonStreaming;

  const settle = budget.reserve(DOCUMENT_MODEL, input, OUTPUT_TOKENS);
  const timeout = Math.max(1_000, Math.min(CALL_TIMEOUT_MS, stopAt - Date.now()));
  const response = await client.beta.messages.parse(input, { signal: AbortSignal.timeout(timeout), timeout, maxRetries: 0 });
  const writes1h = response.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const usage = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
    cacheWrite: Math.max(0, (response.usage.cache_creation_input_tokens ?? 0) - writes1h),
    cacheWrite1h: writes1h,
  };
  const cost = tokenCost(DOCUMENT_MODEL, usage);
  settle(cost);
  await recordUsage(documentId, usage, cost, response.usage.cache_creation_input_tokens ?? 0);

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    log("warn", "Scenario drafting returned no cases", { documentId, stopReason: response.stop_reason });
    return [];
  }
  return acceptScenarioCases(response.parsed_output.cases, pageUrls, featureOf(pages[0]));
}
