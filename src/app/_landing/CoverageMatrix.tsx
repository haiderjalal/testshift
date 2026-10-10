"use client";

import { useState } from "react";

import { PLAN_IDS, PLANS, type PlanId } from "@/lib/plans";

type PlanCheck = keyof (typeof PLANS)[PlanId]["checks"];

export interface CoverageRow {
  title: string;
  body: string;
  /** The plan flag the worker reads for this test. Null means every plan runs it. */
  check: PlanCheck | null;
  /** Availability label shown when the plan does not include the test, e.g. "Lead QA and up". */
  label: string;
  condition?: string;
}

function includedOn(planId: PlanId, check: PlanCheck | null): boolean {
  return check === null || PLANS[planId].checks[check];
}

/**
 * The test matrix. Pick a plan to see which tests it runs. Inclusion reads the same plan flags the
 * worker uses, so the matrix cannot promise a test a plan does not run.
 */
export function CoverageMatrix({ rows }: { rows: CoverageRow[] }) {
  const [planId, setPlanId] = useState<PlanId>("junior");
  const includedCount = rows.filter((row) => includedOn(planId, row.check)).length;

  return (
    <div className="mt-14 grid gap-8 lg:grid-cols-[17rem_1fr] lg:gap-12">
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <fieldset>
          <legend className="font-mono text-xs tracking-widest text-graphite uppercase">Your plan</legend>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {PLAN_IDS.map((id) => (
              <label
                key={id}
                className="cursor-pointer rounded-xl border border-rule bg-card/60 px-3 py-3 text-center text-sm transition hover:border-graphite has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-dev"
              >
                <input
                  type="radio"
                  name="coverage-plan"
                  value={id}
                  checked={planId === id}
                  onChange={() => setPlanId(id)}
                  className="sr-only"
                />
                {PLANS[id].name}
              </label>
            ))}
          </div>
        </fieldset>

        <div aria-live="polite" className="glass mt-6 rounded-2xl p-5">
          <p className="font-display text-3xl font-semibold tracking-tight tabular-nums">
            {includedCount}
            <span className="text-graphite"> / {rows.length}</span>
          </p>
          <p className="mt-1 text-sm text-graphite">checks included on {PLANS[planId].name}</p>
          <div aria-hidden className="mt-4 h-1.5 overflow-hidden rounded-full bg-rule">
            <div
              className="h-full rounded-full bg-dev transition-[width] duration-500 ease-out"
              style={{ width: `${(includedCount / rows.length) * 100}%` }}
            />
          </div>
        </div>
      </aside>

      <ol className="divide-y divide-rule overflow-hidden rounded-3xl border border-rule bg-card/90">
        {rows.map((row, i) => {
          const included = includedOn(planId, row.check);
          return (
            <li
              key={row.title}
              className="grid gap-3 p-5 transition-colors duration-300 hover:bg-card sm:grid-cols-[4rem_1fr_auto] sm:gap-6 sm:p-6"
            >
              <span className="font-mono text-xs text-graphite">TC-{String(i + 1).padStart(2, "0")}</span>
              <div className={`transition-opacity duration-300 ${included ? "" : "opacity-45"}`}>
                <h3 className="font-display text-lg font-semibold">{row.title}</h3>
                <p className="mt-1.5 leading-relaxed text-graphite">{row.body}</p>
                {row.condition && <p className="mt-2 font-mono text-[11px] tracking-wide text-graphite uppercase">{row.condition}</p>}
              </div>
              <span
                className={`inline-flex h-fit items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] whitespace-nowrap transition-colors duration-300 ${
                  included ? "border-pass/40 text-pass" : "border-rule text-graphite"
                }`}
              >
                {included ? "✓ Included" : `Needs ${row.label}`}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
