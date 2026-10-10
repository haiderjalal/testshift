"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactElement } from "react";

import Link from "next/link";

import { money, type BetaPrices } from "@/lib/beta-pricing";
import { formatDuration, PLANS, TRIAL_MINUTES, type PlanId } from "@/lib/plans";

import { bookShift, type BookingState } from "./actions";
import { FieldError } from "./FieldError";
import { PLAN_COLOR, PlanPicker } from "./PlanPicker";
import { ShiftPicker } from "./ShiftPicker";
import { ShiftSummary } from "./ShiftSummary";

const fieldClass = "field-input mt-2";

interface Props {
  prices: BetaPrices;
  defaultUrl: string;
  defaultPlan: PlanId | null;
  defaultShift: "trial" | number;
}

export function HireForm({ defaultUrl, defaultPlan, defaultShift, prices }: Props): ReactElement {
  const [state, formAction, pending] = useActionState<BookingState, FormData>(bookShift, {});
  const [plan, setPlan] = useState<PlanId | null>(defaultPlan);
  const [shift, setShift] = useState<"trial" | number>(defaultShift);
  const errors = state.errors ?? {};
  const trial = shift === "trial";
  const hourly = plan ? prices[plan] : undefined;
  const total = trial || hourly === undefined ? null : hourly * shift;
  const accent = plan ? PLAN_COLOR[plan] : undefined;
  const planName = plan ? PLANS[plan].name : null;
  const hoursLabel = formatDuration(trial ? TRIAL_MINUTES : shift * 60);
  const totalLabel = trial ? "Free" : !plan ? "Pick a plan" : total === null ? "By quote" : money(total);

  // Submitting through onSubmit (not the form's action prop) stops React resetting the form,
  // so every field keeps its value when the server returns validation errors.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  return (
    // On large screens the fields sit beside a sticky summary; on phones the summary stacks above the submit button.
    <form
      onSubmit={handleSubmit}
      className="mt-12 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-12"
      noValidate
    >
      <input type="hidden" name="hourlyQuote" value={hourly ?? ""} />

      <div className="min-w-0 space-y-10">
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
            className={fieldClass}
          />
          <FieldError id="url-error" message={errors.url} />
        </div>

        <PlanPicker plan={plan} prices={prices} error={errors.plan} onSelect={setPlan} />
        <ShiftPicker shift={shift} error={errors.hours} onSelect={setShift} />

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
            className={fieldClass}
          />
          <FieldError id="email-error" message={errors.email} />
        </div>

        <div>
          <label htmlFor="company" className="font-medium">
            Company or product name <span className="font-normal text-graphite">(optional)</span>
          </label>
          <input
            id="company"
            name="company"
            type="text"
            maxLength={80}
            autoComplete="organization"
            placeholder="Acme Checkout"
            aria-invalid={Boolean(errors.company)}
            aria-describedby={errors.company ? "company-error" : undefined}
            className={fieldClass}
          />
          <FieldError id="company-error" message={errors.company} />
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
            className={fieldClass}
          />
          <p id="notes-hint" className="mt-2 text-sm text-graphite">
            Don&apos;t include passwords. Pages behind a login aren&apos;t supported yet.
          </p>
          <FieldError id="notes-error" message={errors.notes} />
        </div>

        <div>
          <label htmlFor="requirements" className="font-medium">
            Requirements to test <span className="font-normal text-graphite">(optional)</span>
          </label>
          <textarea
            id="requirements"
            name="requirements"
            rows={4}
            maxLength={8000}
            placeholder={"e.g. Customers can apply a promo code at checkout.\nAn invalid promo code shows an error."}
            aria-describedby="requirements-hint"
            className={fieldClass}
          />
          <p id="requirements-hint" className="mt-2 text-sm text-graphite">
            Plain text: user stories or acceptance criteria. We review the generated tests before any of them run.
          </p>
        </div>

        <div>
          <label htmlFor="postman" className="font-medium">
            API collection <span className="font-normal text-graphite">(optional, Postman JSON)</span>
          </label>
          <textarea
            id="postman"
            name="postman"
            rows={3}
            maxLength={500000}
            placeholder="Paste a Postman collection exported as JSON (v2.1)"
            aria-invalid={Boolean(errors.postman)}
            aria-describedby={errors.postman ? "postman-hint postman-error" : "postman-hint"}
            className={fieldClass}
          />
          <p id="postman-hint" className="mt-2 text-sm text-graphite">
            We keep only each request&apos;s method and path. Headers, auth, variables, bodies and query strings are dropped, so secrets are not stored. Write requests are listed but not sent yet.
          </p>
          <FieldError id="postman-error" message={errors.postman} />
        </div>

        <div>
          <label className="flex gap-3">
            <input type="checkbox" name="leaderboard" className="mt-1 size-4 accent-ink" />
            <span className="text-graphite">
              List my site on the public{" "}
              <Link href="/leaderboard" className="text-ink underline underline-offset-4 hover:text-dev">
                leaderboard
              </Link>
              . Only the name, address, score and bug count are shown, never bug details.
            </span>
          </label>
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
      </div>

      <div className="mt-10 lg:sticky lg:top-24 lg:mt-0">
        <ShiftSummary accent={accent} planName={planName} hoursLabel={hoursLabel} totalLabel={totalLabel}>
          {state.message && (
            <p role="alert" className="mb-4 rounded-xl bg-fail/10 px-4 py-3 text-sm text-fail">
              {state.message}
            </p>
          )}
          <button disabled={pending} className="btn-primary h-13 w-full text-base disabled:opacity-60">
            {pending
              ? "Booking…"
              : trial
                ? `Start free ${TRIAL_MINUTES}-minute shift`
                : `Request ${shift}-hour shift${total !== null ? ` · ${money(total)}` : " quote"}`}
          </button>
          <p className="mt-3 text-center text-sm text-graphite">
            {trial
              ? "No card needed. One free shift per email address and website."
              : hourly !== undefined
                ? `${shift} × ${money(hourly)}. Fixed prepaid quote. Email us for a Wise payment link; we confirm payment and start your time manually.`
                : "Request an hourly quote. We confirm the price before you pay by Wise. Your timer does not start when you submit this form."}
          </p>
        </ShiftSummary>
      </div>
    </form>
  );
}
