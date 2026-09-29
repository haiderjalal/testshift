import postgres from "postgres";

import type { PlanId } from "./plans";

const cache = globalThis as typeof globalThis & { sql?: postgres.Sql };

/** Shared Postgres client for the web app and the worker. `prepare: false` keeps it compatible with Supabase's pooler. */
export function db(): postgres.Sql {
  if (cache.sql) return cache.sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  cache.sql = postgres(url, { prepare: false });
  return cache.sql;
}

/** jsonb parameter. postgres.js's JSONValue type rejects interfaces (no index signature), hence the cast. */
export function json(value: object): postgres.Parameter {
  return db().json(value as postgres.JSONValue);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

export type RunStatus = "pending_payment" | "queued" | "running" | "completed" | "failed";

export interface SitePage {
  url: string;
  title: string;
  status: number;
  loadMs: number;
  outline: string;
  issues: string[];
}

export interface RunReport {
  score: number;
  summary: string;
  strengths: string[];
  recommendations: string[];
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
  site_map: SitePage[] | null;
  report: RunReport | null;
  error: string | null;
  started_at: Date | null;
  deadline_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

export const BROWSER_ACTIONS = [
  "goto",
  "click",
  "fill",
  "press",
  "select",
  "hover",
  "expect_visible",
  "expect_text",
  "expect_url",
] as const;

export interface BrowserAction {
  action: (typeof BROWSER_ACTIONS)[number];
  selector?: string;
  value?: string;
}

export const CATEGORIES = ["smoke", "functional", "e2e", "negative", "ui", "accessibility", "performance"] as const;

export type CaseStatus = "pending" | "running" | "passed" | "failed" | "blocked";
export type Severity = "critical" | "major" | "minor";

export interface TestCase {
  id: string;
  seq: number;
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
  actions: BrowserAction[];
  has_screenshot: boolean;
  finished_at: Date | null;
}
