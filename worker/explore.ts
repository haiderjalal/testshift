import type { Browser } from "playwright";

import type { BrowserAction, Run, SitePage, Strategy, TestCase } from "@/lib/db";
import { errorMessage, log } from "@/lib/log";

import { exploreTurn, validateDrafts, type CaseDraft, type ExplorerSuspect } from "./ai";
import { BrowserPolicyError, describePage, openContext, perform, PrivateNetworkError, watchPage } from "./browser";
import { BudgetExceededError, DeadlineError } from "./budget";

const MAX_TURNS = 10;
const MAX_SUSPECTS = 6;
const HISTORY_TURNS = 8;
const STEPS_PER_TURN = 3;
const CLIP_PAGE_CHARS = 8_000;

/**
 * Steps that could change real data or reach real people. The explorer may observe these controls, but it is
 * never allowed to use them. Typing is allowed; only keys that submit forms are refused.
 */
const RISKY_WORDS = /\b(delete|remove|destroy|cancel|unsubscribe|pay|payment|purchase|checkout|buy|order|send|submit|confirm|transfer|close account)\b/i;
const SAFE_KEYS = new Set(["Tab", "Shift+Tab", "Escape", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"]);

export function isRiskyStep(step: BrowserAction): boolean {
  if (step.action === "press") return !SAFE_KEYS.has(step.value ?? "");
  if (step.action === "goto" || step.action === "back" || step.action === "reload") return false;
  if (step.action.startsWith("expect_")) return false;
  return RISKY_WORDS.test(`${step.selector ?? ""} ${step.value ?? ""}`);
}

function describeStep(step: BrowserAction): string {
  return [step.action, step.selector, step.value].filter((part) => part !== undefined && part !== "").join(" ");
}

export interface ExplorationSummary {
  turns: number;
  proposed: number;
  accepted: number;
  skippedRisky: number;
}

export interface ExplorationOutcome {
  summary: ExplorationSummary;
  drafts: CaseDraft[];
}

function toDraft(s: ExplorerSuspect): Parameters<typeof validateDrafts>[0][number] {
  return {
    feature: "",
    title: s.title,
    category: "exploratory",
    priority: s.priority,
    viewport: s.viewport,
    start_url: s.start_url,
    steps: s.steps,
    expected: s.expected,
    script: s.script,
  };
}

/**
 * Explores the live site step by step. The model proposes what to try, the worker performs it under the same
 * network policy as every other test, and only behaviour the explorer actually observed can become a suspect.
 * Suspects go through the usual validation (assertions required, duplicates removed) and then the normal
 * executor, which replays each script and reproduces any failure before it is reported as a bug.
 */
export async function exploreSite(input: {
  run: Run;
  browser: Browser;
  pages: SitePage[];
  strategy: Strategy | null;
  existing: TestCase[];
  until: number;
  stopAt: number;
  maxTurns?: number;
}): Promise<ExplorationOutcome> {
  const { run } = input;
  const context = await openContext(input.browser, "desktop", run.url);
  const timer = setTimeout(() => { void context.close().catch(() => undefined); }, Math.max(1, input.until - Date.now()));
  const suspects: ExplorerSuspect[] = [];
  const history: string[] = [];
  let turns = 0;
  let skippedRisky = 0;
  try {
    const page = await context.newPage();
    const { drain } = watchPage(page, run.url);
    await perform(page, { action: "goto", value: run.url });
    for (; turns < (input.maxTurns ?? MAX_TURNS) && Date.now() < input.until; turns++) {
      const events = drain();
      let snapshot: string;
      try {
        snapshot = await describePage(page, events);
      } catch (e) {
        if (e instanceof PrivateNetworkError || e instanceof BrowserPolicyError) break;
        snapshot = `Could not read the page: ${errorMessage(e)}`;
      }
      const turn = await exploreTurn({
        run,
        pages: input.pages,
        strategy: input.strategy,
        snapshot: snapshot.slice(0, CLIP_PAGE_CHARS),
        history: history.slice(-HISTORY_TURNS),
        stopAt: input.stopAt,
      }).catch((e: unknown) => {
        if (e instanceof BudgetExceededError || e instanceof DeadlineError) return null;
        log("error", "Exploration turn failed", { runId: run.id, error: errorMessage(e) });
        return null;
      });
      if (!turn) break;
      if (turn.suspect && suspects.length < MAX_SUSPECTS) suspects.push(turn.suspect);

      const tried: string[] = [];
      let stop = false;
      for (const step of turn.next.slice(0, STEPS_PER_TURN)) {
        if (isRiskyStep(step)) {
          skippedRisky++;
          tried.push(`skipped ${describeStep(step)} (it could change real data)`);
          continue;
        }
        try {
          await perform(page, step);
          tried.push(describeStep(step));
        } catch (e) {
          tried.push(`${describeStep(step)} did not complete`);
          if (e instanceof PrivateNetworkError || e instanceof BrowserPolicyError) stop = true;
          break;
        }
      }
      history.push(`Observed: ${turn.observation}\nDid: ${tried.join("; ") || "nothing"}`);
      if (stop || turn.done) break;
    }
  } finally {
    clearTimeout(timer);
    await context.close().catch(() => undefined);
  }

  const accepted = validateDrafts(suspects.map(toDraft), run, input.strategy, input.existing);
  return {
    summary: { turns, proposed: suspects.length, accepted: accepted.length, skippedRisky },
    drafts: accepted,
  };
}
