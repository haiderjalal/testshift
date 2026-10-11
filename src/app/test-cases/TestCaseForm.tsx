"use client";

import { startTransition, useActionState, type FormEvent, type ReactElement } from "react";

import { FieldError } from "@/app/hire/FieldError";

import { requestTestCases, type TestCaseState } from "./actions";

const field = "field-input mt-2";

export function TestCaseForm(): ReactElement {
  const [state, action, pending] = useActionState<TestCaseState, FormData>(requestTestCases, {});
  const errors = state.errors ?? {};

  // Keeps typed values when the server returns field errors (a plain action prop would reset the form).
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 space-y-7" noValidate>
      <div>
        <label htmlFor="url" className="font-medium">
          Website link <span className="text-fail" aria-hidden>*</span>
        </label>
        <input
          id="url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          required
          aria-required="true"
          placeholder="https://your-site.com"
          aria-invalid={Boolean(errors.url)}
          aria-describedby={errors.url ? "url-hint url-error" : "url-hint"}
          className={field}
        />
        <p id="url-hint" className="mt-2 text-sm text-graphite">
          The public home page of the site. We follow its links within the site, up to 25 pages.
        </p>
        <FieldError id="url-error" message={errors.url} />
      </div>

      <div>
        <label htmlFor="email" className="font-medium">
          Email <span className="text-fail" aria-hidden>*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-required="true"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-hint email-error" : "email-hint"}
          className={field}
        />
        <p id="email-hint" className="mt-2 text-sm text-graphite">
          We email you the link when the PDF and Word files are ready.
        </p>
        <FieldError id="email-error" message={errors.email} />
      </div>

      <div>
        <label htmlFor="notes" className="font-medium">
          Focus notes <span className="font-normal text-graphite">(optional)</span>
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={500}
          placeholder="e.g. Focus on checkout and sign-up."
          aria-invalid={Boolean(errors.notes)}
          aria-describedby={errors.notes ? "notes-hint notes-error" : "notes-hint"}
          className={field}
        />
        <p id="notes-hint" className="mt-2 text-sm text-graphite">
          Areas to focus on. We use them to guide the scenario cases; they cannot change how we crawl.
        </p>
        <FieldError id="notes-error" message={errors.notes} />
      </div>

      <div>
        <label className="flex gap-3">
          <input
            type="checkbox"
            name="consent"
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={errors.consent ? "consent-error" : undefined}
            className="mt-1 size-4 accent-ink"
          />
          <span className="text-graphite">I&apos;m allowed to have this site crawled and described.</span>
        </label>
        <FieldError id="consent-error" message={errors.consent} />
      </div>

      {/* Hidden from people, so only bots fill it in. */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="fax">Fax</label>
        <input id="fax" name="fax" tabIndex={-1} autoComplete="off" />
      </div>

      {state.message && (
        <p role="alert" className="text-sm text-fail">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="btn-primary min-h-12 px-6 disabled:opacity-60">
          {pending ? "Requesting…" : "Create test cases"}
        </button>
        <p className="text-sm text-graphite">Takes a few minutes. The files stay on your private link.</p>
      </div>
    </form>
  );
}
