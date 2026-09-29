"use client";

import { useActionState } from "react";

import { logIn } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(logIn, {});
  return (
    <form action={action} className="mt-8 space-y-4">
      <label htmlFor="password" className="block font-medium">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.error ? "password-error" : undefined}
        className="w-full rounded-xl border border-rule bg-card px-4 py-3 outline-none focus:border-ink"
      />
      {state.error && (
        <p id="password-error" role="alert" className="text-sm text-fail">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-full bg-ink px-5 py-3 font-medium text-paper hover:bg-ink/85 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
