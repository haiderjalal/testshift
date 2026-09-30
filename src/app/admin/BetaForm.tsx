"use client";

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import { betaAdminAction } from "./beta-actions";

export function BetaForm({ operation, id, plan, label, children }: {
  operation: "price" | "quote" | "confirm" | "start"; id?: string; plan?: string; label: string; children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(betaAdminAction, {});
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }
  return <form onSubmit={submit} className="mt-4 space-y-3">
    <input type="hidden" name="operation" value={operation} />
    <input type="hidden" name="id" value={id ?? ""} />
    <input type="hidden" name="plan" value={plan ?? ""} />
    {children}
    <button disabled={pending} className="rounded-xl border border-rule bg-paper px-4 py-2 text-sm hover:border-ink disabled:opacity-50">{pending ? "Saving…" : label}</button>
    {state.error && <p role="alert" className="text-sm text-fail">{state.error}</p>}
    {state.message && <p role="status" className="text-sm text-pass">{state.message}</p>}
  </form>;
}
