import { db } from "@/lib/db";
import { PLAN_IDS, PLANS, type PlanId } from "@/lib/plans";

export const PERIODS = { "7": "Last 7 days", "30": "Last 30 days", all: "All time" } as const;
export type Period = keyof typeof PERIODS;

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  calls: number;
}

export interface UsageRow extends TokenTotals {
  key: string;
}

export interface RunRow {
  id: string;
  url: string;
  plan: PlanId;
  minutes: number;
  is_trial: boolean;
  status: string;
  created_at: Date;
  tokens: number;
  cost: number;
}

export interface PlanAverage {
  plan: PlanId;
  runs: number;
  costPerHour: number;
  tokensPerHour: number;
}

export interface CustomRequest {
  id: string;
  name: string;
  email: string;
  company: string;
  website: string;
  message: string;
  created_at: Date;
}

const since = (period: Period): Date => (period === "all" ? new Date(0) : new Date(Date.now() - Number(period) * 86_400_000));

// Sums are cast to float8 so postgres.js returns numbers rather than bigint strings.
const TOTALS = `
  coalesce(sum(input_tokens), 0)::float8 as input,
  coalesce(sum(output_tokens), 0)::float8 as output,
  coalesce(sum(cache_read_tokens), 0)::float8 as "cacheRead",
  coalesce(sum(cache_write_tokens), 0)::float8 as "cacheWrite",
  coalesce(sum(cost_usd), 0)::float8 as cost,
  count(*)::int as calls`;

export async function loadDashboard(period: Period) {
  const sql = db();
  const from = since(period);
  const totals = () => sql.unsafe(TOTALS);

  const [[total], byModel, byAgent, byDay, runs, revenueRows, averages, requests] = await Promise.all([
    sql<TokenTotals[]>`select ${totals()} from ai_usage where created_at >= ${from}`,
    sql<UsageRow[]>`select model as key, ${totals()} from ai_usage where created_at >= ${from} group by model order by cost desc`,
    sql<UsageRow[]>`
      select coalesce(agent, 'report') as key, ${totals()} from ai_usage where created_at >= ${from}
      group by 1 order by cost desc`,
    sql<UsageRow[]>`
      select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as key, ${totals()} from ai_usage
      where created_at >= ${from} group by 1 order by 1 desc limit 31`,
    sql<RunRow[]>`
      select r.id, r.url, r.plan, r.minutes, r.is_trial, r.status, r.created_at,
        coalesce(u.tokens, 0)::float8 as tokens, coalesce(u.cost, 0)::float8 as cost
      from runs r
      left join lateral (
        select sum(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) as tokens, sum(cost_usd) as cost
        from ai_usage where run_id = r.id
      ) u on true
      where r.created_at >= ${from}
      order by r.created_at desc limit 50`,
    // Paid shifts only: trials are free and pending_payment was never paid.
    sql<{ plan: PlanId; minutes: number }[]>`
      select plan, coalesce(sum(minutes), 0)::float8 as minutes from runs
      where not is_trial and status <> 'pending_payment' and created_at >= ${from} group by plan`,
    // Averages come from all completed shifts, whatever the period, so the calculator has the most data.
    sql<{ plan: PlanId; runs: number; cost: number; tokens: number; minutes: number }[]>`
      select r.plan, count(*)::int as runs, sum(u.cost)::float8 as cost, sum(u.tokens)::float8 as tokens,
        sum(r.minutes)::float8 as minutes
      from runs r
      join (
        select run_id, sum(cost_usd) as cost, sum(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) as tokens
        from ai_usage group by run_id
      ) u on u.run_id = r.id
      where r.status = 'completed'
      group by r.plan`,
    sql<CustomRequest[]>`
      select id, name, email, company, website, message, created_at from custom_requests
      order by created_at desc limit 50`,
  ]);

  const revenue = revenueRows.reduce((sum, r) => sum + (r.minutes / 60) * PLANS[r.plan].rate, 0);
  const planAverages: Partial<Record<PlanId, PlanAverage>> = {};
  for (const row of averages) {
    const hours = row.minutes / 60;
    if (hours > 0) {
      planAverages[row.plan] = { plan: row.plan, runs: row.runs, costPerHour: row.cost / hours, tokensPerHour: row.tokens / hours };
    }
  }

  return { total, byModel, byAgent, byDay, runs, revenue, planAverages, requests, planIds: PLAN_IDS };
}
