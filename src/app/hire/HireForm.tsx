"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";

import { HOUR_OPTIONS, PLANS, TRIAL_MINUTES, type PlanId } from "@/lib/plans";

import { bookShift, type BookingState } from "./actions";

const input =
  "mt-2 w-full rounded-xl border border-rule bg-card px-4 py-3 outline-none placeholder:text-graphite/70 focus:border-ink aria-invalid:border-fail";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-sm text-fail">
      {message}
    </p>
  );
}

interface Props {
  defaultUrl: string;
  defaultPlan: PlanId;
  defaultShift: "trial" | number;
}

export function HireForm({ defaultUrl, defaultPlan, defaultShift }: Props) {
  const [state, formAction, pending] = useActionState<BookingState, FormData>(bookShift, {});
  const [plan, setPlan] = useState<PlanId>(defaultPlan);
  const [shift, setShift] = useState<"trial" | number>(defaultShift);
  const errors = state.errors ?? {};
  const trial = shift === "trial";
  const total = trial ? 0 : PLANS[plan].rate * shift;
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

      <fieldset>
        <legend className="font-medium">Plan</legend>
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
                <span className="font-mono text-sm">${p.rate}/h</span>
              </span>
              <span className="mt-1 block text-sm text-graphite">{p.pitch}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
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
          aria-describedby="notes-hint"
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
        <button
          disabled={pending}
          className="h-13 w-full rounded-full bg-ink px-6 text-lg font-medium text-paper hover:bg-ink/85 disabled:opacity-60"
        >
          {pending ? "Booking…" : trial ? `Start free ${TRIAL_MINUTES}-minute shift` : `Book ${shift}-hour shift · $${total}`}
        </button>
        <p className="mt-3 text-center text-sm text-graphite">
          {trial
            ? "No card needed. One free shift per email address and website."
            : `${PLANS[plan].name} · ${shift} × $${PLANS[plan].rate}. You'll pay securely with Stripe.`}
        </p>
      </div>
    </form>
  );
}
