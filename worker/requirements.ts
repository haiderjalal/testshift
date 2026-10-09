import { db, json, type Run } from "@/lib/db";
import { errorMessage, log } from "@/lib/log";
import { caseKeys } from "@/lib/qa";
import { MAX_GENERATED_TESTS } from "@/lib/requirements";

import { generateRequirementTests, validateDrafts, type CaseDraft, type RequirementCaseResult } from "./ai";
import { AiBudget, budgetLimit, endBudget, startBudget } from "./budget";

const GENERATION_WINDOW_MS = 120_000;

export interface Proposal {
  requirement: string;
  draft: CaseDraft;
}

/**
 * Keeps only proposals the existing rules accept: a final assertion for scripted tests, in-scope URLs, and no
 * scenario twice. Each accepted proposal keeps the requirement it traces to.
 */
export function acceptProposals(run: Run, cases: RequirementCaseResult[]): Proposal[] {
  const seen = new Set<string>();
  const accepted: Proposal[] = [];
  for (const c of cases) {
    const [draft] = validateDrafts(
      [{ feature: "", title: c.title, category: "functional", priority: c.priority, viewport: c.viewport, start_url: c.start_url, steps: c.steps, expected: c.expected, script: c.script }],
      run,
      null,
      [],
    );
    if (!draft) continue;
    const keys = caseKeys(draft);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    accepted.push({ requirement: c.requirement.slice(0, 500), draft });
  }
  return accepted;
}

/**
 * Handles one run's requirement request: the model drafts tests from the customer's text, and the proposals are
 * stored for the operator to approve or reject. Nothing generated here runs against the site.
 * Returns false when no request was waiting.
 */
export async function processRequirementRequest(): Promise<boolean> {
  // The claim clears the request in the same statement, so two workers never generate for the same run.
  const [run] = await db()<Run[]>`
    update runs set requirements_requested_at = null
    where id = (
      select id from runs where requirements_requested_at is not null
      order by requirements_requested_at limit 1 for update skip locked)
    returning *`;
  if (!run) return false;
  if (!run.requirements) return true;

  const [{ spent }] = await db()<{ spent: number }[]>`select coalesce(sum(cost_usd), 0)::float8 as spent from ai_usage where run_id = ${run.id}`;
  startBudget(run.id, new AiBudget(budgetLimit(run.plan, run.minutes, run.is_trial, run.quoted_total_cents), spent));
  try {
    const cases = await generateRequirementTests({
      run,
      requirements: run.requirements,
      stopAt: Date.now() + GENERATION_WINDOW_MS,
      maxTests: MAX_GENERATED_TESTS,
    });
    const proposals = acceptProposals(run, cases);
    for (const p of proposals) {
      await db()`
        insert into requirement_tests (run_id, requirement, title, priority, viewport, start_url, steps, expected, script)
        values (${run.id}, ${p.requirement}, ${p.draft.title}, ${p.draft.priority}, ${p.draft.viewport}, ${p.draft.start_url},
          ${json(p.draft.steps as unknown as object)}, ${p.draft.expected}, ${json(p.draft.script as unknown as object)})`;
    }
    log("info", "Requirement tests proposed", { runId: run.id, drafted: cases.length, kept: proposals.length });
  } catch (e) {
    log("error", "Requirement test generation failed", { runId: run.id, error: errorMessage(e) });
  } finally {
    endBudget(run.id);
  }
  return true;
}
