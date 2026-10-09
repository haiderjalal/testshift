"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { TESTING_MODES, type TestingMode } from "@/lib/repository-testing";

import { requestQuote, type CustomState } from "./actions";

const field =
  "mt-2 w-full rounded-xl border border-rule bg-card px-4 py-3 outline-none placeholder:text-graphite/70 focus:border-ink aria-invalid:border-fail";

export function CustomForm({ defaultMode = "website" }: { defaultMode?: TestingMode }) {
  const [mode, setMode] = useState<TestingMode>(defaultMode);
  const [state, action, pending] = useActionState<CustomState, FormData>(requestQuote, {});
  const errors = state.errors ?? {};

  // onSubmit keeps typed values when the server returns validation errors (the action prop would reset the form).
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  if (state.sent) {
    return (
      <div role="status" className="mt-10 rounded-2xl border border-pass/40 bg-card p-8">
        <p className="font-display text-xl font-semibold text-pass">Request sent.</p>
        <p className="mt-2 text-graphite">We&apos;ll reply by email with a quote that fits what you described.</p>
      </div>
    );
  }

  const input = (name: keyof NonNullable<CustomState["errors"]>, labelText: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div>
      <label htmlFor={name} className="font-medium">
        {labelText}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${name}-error` : undefined}
        className={field}
        {...props}
      />
      {errors[name] && (
        <p id={`${name}-error`} role="alert" className="mt-2 text-sm text-fail">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-7" noValidate>
      <div>
        <label htmlFor="mode" className="font-medium">Testing option</label>
        <select id="mode" name="mode" value={mode} onChange={(event) => setMode(event.target.value as TestingMode)} className={field} aria-invalid={Boolean(errors.mode)} aria-describedby={errors.mode ? "mode-error" : undefined}>
          {Object.entries(TESTING_MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {errors.mode && <p id="mode-error" role="alert" className="mt-2 text-sm text-fail">{errors.mode}</p>}
      </div>
      {mode !== "website" && <div className="space-y-4 rounded-xl border border-rule p-5">
        {input("repository", "GitHub repository", { type: "url", required: true, placeholder: "https://github.com/owner/repo", maxLength: 300 })}
        <p className="text-sm text-graphite">Public or private repository link only. Access is arranged during onboarding. Do not paste passwords, tokens or production credentials.</p>
        <label className="flex gap-3 text-sm"><input type="checkbox" name="destructive" className="mt-1 size-4 accent-ink" /><span>Include a plan for destructive tests in a disposable environment. This does not authorize a run or changes to production.</span></label>
      </div>}
      <div className="grid gap-7 sm:grid-cols-2">
        {input("name", "Your name", { required: true, autoComplete: "name" })}
        {input("email", "Work email", { type: "email", required: true, autoComplete: "email", placeholder: "you@company.com" })}
        {input("company", "Company (optional)", { autoComplete: "organization" })}
        {input("website", "Website (optional)", { placeholder: "https://your-site.com" })}
      </div>
      <div>
        <label htmlFor="details" className="font-medium">
          What do you need?
        </label>
        <textarea
          id="details"
          name="details"
          rows={5}
          required
          maxLength={mode === "website" ? 3000 : 2400}
          placeholder={mode === "website" ? "e.g. Weekly regression shifts on 3 sites, a dedicated Principal QA agent before each release, or 100+ hours a month." : "Describe your stack, existing test commands, key user journeys and disposable test environment. Do not include secrets."}
          aria-invalid={Boolean(errors.details)}
          aria-describedby={errors.details ? "details-error" : undefined}
          className={field}
        />
        {errors.details && (
          <p id="details-error" role="alert" className="mt-2 text-sm text-fail">
            {errors.details}
          </p>
        )}
      </div>
      {/* Honeypot for bots; hidden from people and assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="fax">Fax</label>
        <input id="fax" name="fax" tabIndex={-1} autoComplete="off" />
      </div>
      {state.message && (
        <p role="alert" className="rounded-xl bg-fail/10 px-4 py-3 text-sm text-fail">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="btn-primary h-13 w-full text-lg disabled:opacity-60">
        {pending ? "Sending…" : "Request a quote"}
      </button>
    </form>
  );
}
