import { db } from "@/lib/db";
import { PLAN_IDS, type PlanId } from "@/lib/plans";
import { loadBetaPrices } from "@/lib/beta-orders";

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
  revenue: number;
}

export interface BetaOrder {
  id: string; url: string; email: string; plan: PlanId; minutes: number; notes: string;
  status: "pending_payment" | "paid"; quoted_hourly_cents: number | null; quoted_total_cents: number | null;
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

  const [[total], byModel, byAgent, byDay, runs, revenueRows, averages, requests, betaOrders, betaPrices] = await Promise.all([
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
        (case when r.payment_confirmed_at is not null then coalesce(r.amount_received_cents, 0) / 100.0 else 0 end)::float8 as revenue,
        coalesce(u.tokens, 0)::float8 as tokens, coalesce(u.cost, 0)::float8 as cost
      from runs r
      left join lateral (
        select sum(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) as tokens, sum(cost_usd) as cost
        from ai_usage where run_id = r.id
      ) u on true
      where r.created_at >= ${from}
      order by r.created_at desc limit 50`,
    // Only confirmed money, never infer revenue from booked time/status/current prices.
    sql<{ revenue: number }[]>`select coalesce(sum(amount_received_cents),0)::float8 / 100 as revenue from runs
      where not is_trial and payment_confirmed_at >= ${from}`,
    // Exclude short trials/development speedups. Use observed test time, not purchased minutes.
    sql<{ plan: PlanId; runs: number; cost: number; tokens: number; minutes: number }[]>`
      select r.plan, count(*)::int as runs, sum(u.cost)::float8 as cost, sum(u.tokens)::float8 as tokens,
        sum(extract(epoch from r.completed_at - r.testing_started_at) / 60)::float8 as minutes
      from runs r
      join (
        select run_id, sum(cost_usd) as cost, sum(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) as tokens
        from ai_usage group by run_id
      ) u on u.run_id = r.id
      where r.status = 'completed' and not r.is_trial and r.minutes >= 60
        and r.completed_at >= r.testing_started_at + interval '50 minutes'
        and r.completed_at <= r.testing_started_at + interval '10 hours'
      group by r.plan`,
    sql<CustomRequest[]>`
      select id, name, email, company, website, message, created_at from custom_requests
      order by created_at desc limit 50`,
    sql<BetaOrder[]>`select id,url,email,plan,minutes,notes,status,quoted_hourly_cents,quoted_total_cents
      from runs where payment_method = 'wise' and status in ('pending_payment','paid') order by created_at limit 100`,
    loadBetaPrices(),
  ]);

  const revenue = revenueRows[0]?.revenue ?? 0;
  const planAverages: Partial<Record<PlanId, PlanAverage>> = {};
  for (const row of averages) {
    const hours = row.minutes / 60;
    if (hours > 0) {
      planAverages[row.plan] = { plan: row.plan, runs: row.runs, costPerHour: row.cost / hours, tokensPerHour: row.tokens / hours };
    }
  }

  return { total, byModel, byAgent, byDay, runs, revenue, planAverages, requests, planIds: PLAN_IDS, betaOrders, betaPrices };
}
