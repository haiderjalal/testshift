import postgres from "postgres";

import type { AgentId } from "./agents";
import type { PlanId } from "./plans";

const cache = globalThis as typeof globalThis & { sql?: postgres.Sql };

/** Shared Postgres client for the web app and the worker. `prepare: false` keeps it compatible with Supabase's pooler. */
export function db(): postgres.Sql {
  if (cache.sql) return cache.sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const max = Number(process.env.DATABASE_POOL_SIZE ?? 5);
  if (!Number.isInteger(max) || max < 1 || max > 20) throw new Error("Invalid DATABASE_POOL_SIZE");
  try {
    cache.sql = postgres(url, { prepare: false, max, connect_timeout: 10, idle_timeout: 20, connection: { statement_timeout: 15_000 } });
  } catch (e) {
    // postgres.js decodes the password; a raw "%" or similar in it throws an opaque URIError.
    if (e instanceof URIError) throw new Error("DATABASE_URL is malformed: URL-encode special characters in the password (% → %25).");
    throw e;
  }
  return cache.sql;
}

/** jsonb parameter. postgres.js's JSONValue type rejects interfaces (no index signature), hence the cast. */
export function json(value: object): postgres.Parameter {
  return db().json(value as postgres.JSONValue);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

export type RunStatus = "pending_payment" | "paid" | "queued" | "running" | "completed" | "failed";

export interface SitePage {
  url: string;
  title: string;
  status: number;
  loadMs: number;
  outline: string;
  issues: string[];
}

/** The shift's test strategy: the site's features ranked by risk, written once and shared by all four agents. */
export interface Strategy {
  summary: string;
  features: { id: string; name: string; url: string; risk: "high" | "medium" | "low"; what_to_test: string }[];
}

export interface RunReport {
  score: number;
  summary: string;
  strengths: string[];
  recommendations: string[];
  /** One-line verdict per agent. Missing on reports written before the four-agent pipeline. */
  agentNotes?: Partial<Record<AgentId, string>>;
}

export interface Run {
  id: string;
  url: string;
  email: string;
  plan: PlanId;
  minutes: number;
  is_trial: boolean;
  notes: string;
  status: RunStatus;
  activity: string | null;
  agent: AgentId | null;
  site_map: SitePage[] | null;
  strategy: Strategy | null;
  report: RunReport | null;
  error: string | null;
  started_at: Date | null;
  testing_started_at?: Date | null;
  deadline_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  payment_method?: string;
  quoted_hourly_cents?: number | null;
  quoted_total_cents?: number | null;
  payment_confirmed_at?: Date | null;
  start_authorized_at?: Date | null;
}

export const BROWSER_ACTIONS = [
  "goto",
  "click",
  "dblclick",
  "fill",
  "press",
  "select",
  "hover",
  "back",
  "reload",
  "expect_visible",
  "expect_text",
  "expect_url",
  "expect_hidden",
  "expect_value",
  "expect_valid",
  "expect_enabled",
  "expect_checked",
  "expect_count",
] as const;

/** Actions that check something rather than do something; a script must contain at least one to count as a test. */
export const ASSERTIONS: readonly BrowserAction["action"][] = [
  "expect_visible",
  "expect_text",
  "expect_url",
  "expect_hidden",
  "expect_value",
  "expect_valid",
  "expect_enabled",
  "expect_checked",
  "expect_count",
];

export interface BrowserAction {
  action: (typeof BROWSER_ACTIONS)[number];
  selector?: string;
  value?: string;
}

export const CATEGORIES = [
  "smoke",
  "functional",
  "e2e",
  "negative",
  "ui",
  "accessibility",
  "performance",
  "security",
] as const;

export type CaseStatus = "pending" | "running" | "passed" | "failed" | "blocked";
export type Severity = "critical" | "major" | "minor";

export interface TestCase {
  id: string;
  seq: number;
  agent: AgentId;
  /** Feature id from the strategy (e.g. "F3"); null for automated checks. */
  feature: string | null;
  title: string;
  category: (typeof CATEGORIES)[number];
  priority: "high" | "medium" | "low";
  viewport: "desktop" | "mobile";
  start_url: string;
  steps: string[];
  expected: string;
  status: CaseStatus;
  actual: string | null;
  severity: Severity | null;
  /** Browser steps the planner scripted; run without the model when they all pass. */
  script: BrowserAction[];
  /** Browser steps actually performed; exported as Playwright code. */
  actions: BrowserAction[];
  failure_assertion?: BrowserAction | null;
  scripted?: boolean;
  has_screenshot: boolean;
  finished_at: Date | null;
}
