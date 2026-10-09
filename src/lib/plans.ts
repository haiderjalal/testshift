export const SITE = {
  name: "TestShift",
  description:
    "Rent a team of four AI QA agents by the hour. Dev, Staging, UAT and Prod agents run unit, integration, end-to-end and smoke tests in a real browser and hand you the bug report.",
};

/** Claude models the tester can run on, with list prices in USD per million tokens (cache writes are 5-minute, 1.25× input). */
export const MODELS = {
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { label: "Claude Opus 5.5", input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-fable-5-1": { label: "Claude Fable 5.1", input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
} as const;

export type ModelId = keyof typeof MODELS;

interface Plan {
  name: string;
  rate: number;
  model: ModelId;
  effort: "low" | "medium" | "high";
  pitch: string;
  features: readonly string[];
  /** Deterministic checks and viewports the worker enables for this plan. */
  checks: { mobile: boolean; accessibility: boolean; performance: boolean; securityHeaders: boolean; visual: boolean };
  /** Principal shifts are claimed before everything else in the queue. */
  priority: boolean;
  focus: string;
}

/** Capabilities by tier. `rate` is a LEGACY budget fallback only. New beta prices live in beta_plan_prices;
 * customer quotes are snapshotted per order at exactly 10x the owner-published estimated token cost. */
export const PLANS = {
  junior: {
    name: "Junior QA",
    rate: 30,
    model: "claude-sonnet-5-5",
    effort: "low",
    pitch: "All four agents on your core flows.",
    features: [
      "Dev, Staging, UAT and Prod agents",
      "Unit, integration, end-to-end and smoke tests",
      "Desktop browser testing",
      "Bug report and Playwright suite",
    ],
    checks: { mobile: false, accessibility: false, performance: false, securityHeaders: false, visual: false },
    priority: false,
    focus: "Stick to the core user journeys: navigation, forms, sign-up, search, cart and checkout if present.",
  },
  senior: {
    name: "Senior QA",
    rate: 50,
    model: "claude-opus-5-5",
    effort: "medium",
    pitch: "Edge cases, bad inputs and mobile.",
    features: [
      "Everything in Junior QA",
      "Mobile screen testing",
      "Negative and edge-case inputs",
      "Stronger reasoning on every test",
    ],
    checks: { mobile: true, accessibility: false, performance: false, securityHeaders: false, visual: false },
    priority: false,
    focus:
      "Cover the core journeys, then go deeper: invalid and edge-case inputs, validation messages, mobile behaviour, empty and error states.",
  },
  lead: {
    name: "Lead QA",
    rate: 100,
    model: "claude-opus-5-5",
    effort: "high",
    pitch: "Adds accessibility and performance audits.",
    features: [
      "Everything in Senior QA",
      "Accessibility audit (WCAG 2 AA) on every page",
      "Performance audit: load speed and layout shift",
      "High-effort reasoning, more thorough plans",
    ],
    checks: { mobile: true, accessibility: true, performance: true, securityHeaders: false, visual: true },
    priority: false,
    focus:
      "Be thorough: core journeys, edge cases and bad inputs, mobile behaviour, keyboard access and accessible names, loading and error states, and consistency across pages.",
  },
  principal: {
    name: "Principal QA",
    rate: 150,
    model: "claude-fable-5-1",
    effort: "medium",
    pitch: "Our most capable agents on your release.",
    features: [
      "Everything in Lead QA",
      "Our most advanced personalized agents",
      "Security-header review",
      "Priority queue: your shift starts first",
    ],
    checks: { mobile: true, accessibility: true, performance: true, securityHeaders: true, visual: true },
    priority: true,
    focus:
      "Test like a principal engineer signing off a release: every core journey, the riskiest edge cases, state that persists across pages and reloads, mobile and keyboard use, and anything that could embarrass the team in production.",
  },
} as const satisfies Record<string, Plan>;

export type PlanId = keyof typeof PLANS;
export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export const HOUR_OPTIONS = [1, 2, 3, 4, 6, 8] as const;

/** Every new customer's first shift is free: once per email address and once per website. */
export const TRIAL_MINUTES = 20;

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/**
 * Cost in USD of one Claude response. `cacheWrite` is 5-minute cache writes (1.25× input);
 * `cacheWrite1h` is 1-hour cache writes, billed at 2× input.
 */
export function tokenCost(
  model: ModelId,
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h?: number },
): number {
  const p = MODELS[model];
  return (
    (usage.input * p.input +
      usage.output * p.output +
      usage.cacheRead * p.cacheRead +
      usage.cacheWrite * p.cacheWrite +
      (usage.cacheWrite1h ?? 0) * p.input * 2) /
    1_000_000
  );
}
