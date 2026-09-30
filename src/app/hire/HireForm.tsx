"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";

import Link from "next/link";

import { HOUR_OPTIONS, MODELS, PLANS, TRIAL_MINUTES, type PlanId } from "@/lib/plans";
import { money, type BetaPrices } from "@/lib/beta-pricing";

import { bookShift, type BookingState } from "./actions";

const input =
  "mt-2 w-full rounded-xl border border-rule bg-card px-4 py-3 outline-none placeholder:text-graphite/70 focus:border-ink aria-invalid:border-fail";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-2 text-sm text-fail">
      {message}
    </p>
  );
}

interface Props {
  prices: BetaPrices;
  defaultUrl: string;
  defaultPlan: PlanId | null;
  defaultShift: "trial" | number;
}

export function HireForm({ defaultUrl, defaultPlan, defaultShift, prices }: Props) {
  const [state, formAction, pending] = useActionState<BookingState, FormData>(bookShift, {});
  const [plan, setPlan] = useState<PlanId | null>(defaultPlan);
  const [shift, setShift] = useState<"trial" | number>(defaultShift);
  const errors = state.errors ?? {};
  const trial = shift === "trial";
  const hourly = plan ? prices[plan] : undefined;
  const total = trial || hourly === undefined ? null : hourly * shift;
  const chip =
    "cursor-pointer rounded-xl border border-rule bg-card py-3 text-center font-mono has-checked:border-ink has-checked:bg-ink has-checked:text-paper has-focus-visible:outline-2 has-focus-visible:outline-ink";

  // Submitting through onSubmit (not the form's action prop) stops React resetting the form,
  // so every field keeps its value when the server returns validation errors.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-9" noValidate>
      <input type="hidden" name="hourlyQuote" value={hourly ?? ""} />
      <div>
        <label htmlFor="url" className="font-medium">
          Website to test
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://your-site.com"
          defaultValue={defaultUrl}
          aria-invalid={Boolean(errors.url)}
          aria-describedby={errors.url ? "url-error" : undefined}
          className={input}
        />
        <FieldError id="url-error" message={errors.url} />
      </div>

      <fieldset aria-invalid={Boolean(errors.plan)} aria-describedby={errors.plan ? "plan-error" : undefined}>
        <legend className="font-medium">Plan</legend>
        <FieldError id="plan-error" message={errors.plan} />
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]).map(([id, p]) => (
            <label
              key={id}
              className="cursor-pointer rounded-xl border border-rule bg-card p-4 has-checked:border-ink has-checked:ring-1 has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-ink"
            >
              <input
                type="radio"
                name="plan"
                value={id}
                checked={plan === id}
                onChange={() => setPlan(id)}
                className="sr-only"
              />
              <span className="flex items-baseline justify-between">
                <span className="font-semibold">{p.name}</span>
                <span className="font-mono text-sm">{prices[id] === undefined ? "By quote" : `${money(prices[id]!)}/h`}</span>
              </span>
              <span className="mt-1 block text-sm text-graphite">{p.pitch}</span>
              <span className="mt-2 block font-mono text-[11px] text-dev">{MODELS[p.model].label}</span>
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm text-graphite">
          Every plan runs all four agents: Dev, Staging, UAT and Prod.{" "}
          <Link href="/custom" className="text-ink underline underline-offset-4 hover:text-dev">
            Need custom pricing?
          </Link>
        </p>
      </fieldset>

      <fieldset aria-invalid={Boolean(errors.hours)} aria-describedby={errors.hours ? "hours-error" : undefined}>
        <legend className="font-medium">Shift length</legend>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-[auto_repeat(6,minmax(0,1fr))]">
          <label className={`${chip} col-span-3 px-4 whitespace-nowrap sm:col-span-1 has-[:not(:checked)]:border-pass/50 has-[:not(:checked)]:text-pass`}>
            <input
              type="radio"
              name="hours"
              value="trial"
              checked={trial}
              onChange={() => setShift("trial")}
              className="sr-only"
            />
            {TRIAL_MINUTES} min free
          </label>
          {HOUR_OPTIONS.map((h) => (
            <label key={h} className={chip}>
              <input
                type="radio"
                name="hours"
                value={h}
                checked={shift === h}
                onChange={() => setShift(h)}
                className="sr-only"
              />
              {h}h
            </label>
          ))}
        </div>
        <FieldError id="hours-error" message={errors.hours} />
      </fieldset>

      <div>
        <label htmlFor="email" className="font-medium">
          Email for the report
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          className={input}
        />
        <FieldError id="email-error" message={errors.email} />
      </div>

      <div>
        <label htmlFor="notes" className="font-medium">
          Anything to focus on? <span className="font-normal text-graphite">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={2000}
          placeholder="e.g. We just redesigned checkout. Don't submit the contact form, it emails our CEO."
          aria-invalid={Boolean(errors.notes)}
          aria-describedby={errors.notes ? "notes-hint notes-error" : "notes-hint"}
          className={input}
        />
        <p id="notes-hint" className="mt-2 text-sm text-graphite">
          Don&apos;t include passwords. Pages behind a login aren&apos;t supported yet.
        </p>
        <FieldError id="notes-error" message={errors.notes} />
      </div>

      <div>
        <label className="flex gap-3">
          <input
            type="checkbox"
            name="consent"
            className="mt-1 size-4 accent-ink"
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={errors.consent ? "consent-error" : undefined}
          />
          <span className="text-graphite">
            I own this website or have permission to test it. The tester will fill forms with test data.
          </span>
        </label>
        <FieldError id="consent-error" message={errors.consent} />
      </div>

      <div className="border-t border-rule pt-6">
        {state.message && (
          <p role="alert" className="mb-4 rounded-xl bg-fail/10 px-4 py-3 text-sm text-fail">
            {state.message}
          </p>
        )}
        <button disabled={pending} className="btn-primary h-13 w-full text-lg disabled:opacity-60">
          {pending ? "Booking…" : trial ? `Start free ${TRIAL_MINUTES}-minute shift` : `Request ${shift}-hour shift${total !== null ? ` · ${money(total)}` : " quote"}`}
        </button>
        <p className="mt-3 text-center text-sm text-graphite">
          {trial
            ? "No card needed. One free shift per email address and website."
            : hourly !== undefined
              ? `${shift} × ${money(hourly)}. Fixed prepaid quote based on 10× estimated AI token cost. Email us for a Wise payment link; we confirm payment and start your time manually.`
              : "Request an hourly quote based on 10× estimated AI token cost. We confirm the price before you pay by Wise. Your timer does not start when you submit this form."}
        </p>
      </div>
    </form>
  );
}
