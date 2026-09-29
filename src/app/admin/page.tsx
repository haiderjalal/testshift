import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo } from "@/components/Logo";
import { isAdmin } from "@/lib/admin";
import { agentById, AGENT_IDS, type AgentId } from "@/lib/agents";
import { formatDuration, MODELS, PLANS, type ModelId } from "@/lib/plans";

import { logOut } from "./actions";
import { loadDashboard, PERIODS, type Period, type UsageRow } from "./data";
import { TokenCalculator } from "./TokenCalculator";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number) => Math.round(n).toLocaleString("en-US");
const label = (key: string) =>
  key in MODELS ? MODELS[key as ModelId].label : (AGENT_IDS as string[]).includes(key) ? agentById(key as AgentId).name : key === "report" ? "Report writer" : key;

function UsageTable({ title, rows, keyHeading }: { title: string; rows: UsageRow[]; keyHeading: string }) {
  return (
    <section className="rounded-2xl border border-rule bg-card p-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-graphite">No Claude calls in this period yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full font-mono text-sm">
            <thead className="text-left text-[11px] tracking-wide text-graphite uppercase">
              <tr>
                <th className="py-2 pr-4 font-normal">{keyHeading}</th>
                <th className="py-2 pr-4 text-right font-normal">Calls</th>
                <th className="py-2 pr-4 text-right font-normal">Input</th>
                <th className="py-2 pr-4 text-right font-normal">Output</th>
                <th className="py-2 pr-4 text-right font-normal">Cache read</th>
                <th className="py-2 pr-4 text-right font-normal">Cache write</th>
                <th className="py-2 text-right font-normal">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-2 pr-4 whitespace-nowrap text-ink">{label(r.key)}</td>
                  <td className="py-2 pr-4 text-right">{num(r.calls)}</td>
                  <td className="py-2 pr-4 text-right">{num(r.input)}</td>
                  <td className="py-2 pr-4 text-right">{num(r.output)}</td>
                  <td className="py-2 pr-4 text-right">{num(r.cacheRead)}</td>
                  <td className="py-2 pr-4 text-right">{num(r.cacheWrite)}</td>
                  <td className="py-2 text-right text-ink">{usd(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { period: raw } = await searchParams;
  const period: Period = typeof raw === "string" && raw in PERIODS ? (raw as Period) : "30";
  const data = await loadDashboard(period);
  const { total } = data;
  const allTokens = total.input + total.output + total.cacheRead + total.cacheWrite;
  const profit = data.revenue - total.cost;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6 pb-24 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Logo />
        <form action={logOut}>
          <button className="rounded-full border border-rule px-4 py-2 text-sm text-graphite hover:text-ink">Sign out</button>
        </form>
      </header>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-widest text-graphite uppercase">Owner only</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">Claude usage &amp; margin</h1>
        </div>
        <nav aria-label="Period" className="flex gap-1 rounded-full border border-rule bg-card p-1 text-sm">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Link
              key={p}
              href={`/admin?period=${p}`}
              aria-current={p === period ? "page" : undefined}
              className="rounded-full px-3 py-1.5 text-graphite aria-[current=page]:bg-ink aria-[current=page]:text-paper"
            >
              {PERIODS[p]}
            </Link>
          ))}
        </nav>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Tokens used", num(allTokens), `${num(total.input)} in · ${num(total.output)} out · ${num(total.cacheRead)} cached`],
          ["Claude cost", usd(total.cost), `${num(total.calls)} API calls`],
          ["Revenue (paid shifts)", usd(data.revenue), "Free trials excluded"],
          ["Profit", usd(profit), data.revenue > 0 ? `${Math.round((profit / data.revenue) * 100)}% margin` : "No paid shifts yet"],
        ].map(([title, value, note]) => (
          <div key={title} className="rounded-2xl border border-rule bg-card p-5">
            <dt className="text-xs tracking-wide text-graphite uppercase">{title}</dt>
            <dd className="mt-2 font-display text-2xl font-semibold">{value}</dd>
            <dd className="mt-1 font-mono text-xs text-graphite">{note}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <TokenCalculator averages={data.planAverages} />
      </div>

      <div className="mt-6 space-y-6">
        <UsageTable title="By model" rows={data.byModel} keyHeading="Model" />
        <UsageTable title="By agent" rows={data.byAgent} keyHeading="Agent" />
        <UsageTable title="By day" rows={data.byDay} keyHeading="Day (UTC)" />
      </div>

      <section className="mt-6 rounded-2xl border border-rule bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Shifts</h2>
        {data.runs.length === 0 ? (
          <p className="mt-3 text-sm text-graphite">No shifts in this period.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full font-mono text-sm">
              <thead className="text-left text-[11px] tracking-wide text-graphite uppercase">
                <tr>
                  <th className="py-2 pr-4 font-normal">Site</th>
                  <th className="py-2 pr-4 font-normal">Plan</th>
                  <th className="py-2 pr-4 font-normal">Length</th>
                  <th className="py-2 pr-4 font-normal">Status</th>
                  <th className="py-2 pr-4 text-right font-normal">Tokens</th>
                  <th className="py-2 pr-4 text-right font-normal">Cost</th>
                  <th className="py-2 text-right font-normal">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {data.runs.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <Link href={`/runs/${r.id}`} className="text-ink underline-offset-4 hover:underline">
                        {new URL(r.url).hostname}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{PLANS[r.plan].name}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {formatDuration(r.minutes)}
                      {r.is_trial && " · trial"}
                    </td>
                    <td className="py-2 pr-4">{r.status}</td>
                    <td className="py-2 pr-4 text-right">{num(r.tokens)}</td>
                    <td className="py-2 pr-4 text-right">{usd(r.cost)}</td>
                    <td className="py-2 text-right text-ink">
                      {r.is_trial || r.status === "pending_payment" ? usd(0) : usd((r.minutes / 60) * PLANS[r.plan].rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-rule bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Custom pricing requests</h2>
        {data.requests.length === 0 ? (
          <p className="mt-3 text-sm text-graphite">No requests yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-rule">
            {data.requests.map((r) => (
              <li key={r.id} className="py-4">
                <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">{r.name}</span>
                  <a href={`mailto:${r.email}`} className="font-mono text-sm text-dev underline-offset-4 hover:underline">
                    {r.email}
                  </a>
                  {r.company && <span className="text-sm text-graphite">{r.company}</span>}
                  {r.website && <span className="font-mono text-sm text-graphite">{r.website}</span>}
                  <span className="ml-auto font-mono text-xs text-graphite">{r.created_at.toISOString().slice(0, 10)}</span>
                </p>
                <p className="mt-2 text-sm whitespace-pre-line text-graphite">{r.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
