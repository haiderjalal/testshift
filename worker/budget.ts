import { PLANS, tokenCost, type PlanId, type ModelId } from "@/lib/plans";

export class BudgetExceededError extends Error {
  constructor() { super("The AI cost limit for this shift was reached. Completed checks are preserved."); }
}
export class DeadlineError extends Error {
  constructor() { super("The testing time window ended."); }
}

export function budgetLimit(plan: PlanId, minutes: number, trial: boolean): number {
  const trialLimit = Number(process.env.QA_MAX_TRIAL_USD ?? 2);
  const fraction = Number(process.env.QA_AI_REVENUE_FRACTION ?? 0.25);
  if (!Number.isFinite(trialLimit) || trialLimit <= 0 || !Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
    throw new Error("Invalid AI budget configuration");
  }
  return trial ? trialLimit : PLANS[plan].rate * minutes / 60 * fraction;
}

/** Reserve a conservative upper estimate before a call. Failed calls retain their reservation. */
export class AiBudget {
  private reserved = 0;
  constructor(readonly limit: number, public spent = 0) {}
  reserve(model: ModelId, input: unknown, maxOutput: number): (actual: number) => void {
    const inputBound = Buffer.byteLength(JSON.stringify(input), "utf8") + 4_096;
    const bound = tokenCost(model, { input: 0, output: maxOutput, cacheRead: 0, cacheWrite: 0, cacheWrite1h: inputBound });
    if (this.spent + this.reserved + bound > this.limit) throw new BudgetExceededError();
    this.reserved += bound;
    let settled = false;
    return (actual) => {
      if (settled) return;
      settled = true;
      this.reserved -= bound;
      this.spent += Math.max(0, actual);
    };
  }
}

const budgets = new Map<string, AiBudget>();
export function startBudget(id: string, budget: AiBudget): void { budgets.set(id, budget); }
export function endBudget(id: string): void { budgets.delete(id); }

export async function withinBudget<T extends { model: string; usage: {
  input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null; cache_creation?: { ephemeral_1h_input_tokens?: number } | null;
} }>(
  run: { id: string; plan: PlanId; minutes: number; is_trial: boolean },
  input: unknown,
  maxOutput: number,
  stopAt: number,
  request: (options: { signal: AbortSignal; maxRetries: number; timeout: number }) => Promise<T>,
): Promise<T> {
  if (Date.now() >= stopAt) throw new DeadlineError();
  let budget = budgets.get(run.id);
  if (!budget) { budget = new AiBudget(budgetLimit(run.plan, run.minutes, run.is_trial)); budgets.set(run.id, budget); }
  const model = PLANS[run.plan].model;
  const settle = budget.reserve(model, input, maxOutput);
  const timeout = Math.max(1, Math.min(45_000, stopAt - Date.now()));
  const response = await request({ signal: AbortSignal.timeout(timeout), timeout, maxRetries: 0 });
  const writes1h = response.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  settle(tokenCost(model, { input: response.usage.input_tokens, output: response.usage.output_tokens,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
    cacheWrite: Math.max(0, (response.usage.cache_creation_input_tokens ?? 0) - writes1h), cacheWrite1h: writes1h }));
  return response;
}
