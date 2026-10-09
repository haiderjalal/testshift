"use client";
import { useActionState } from "react";
import { connectRepository, type RepositoryState } from "./actions";
export function ConnectForm({ installations }: { installations: { id: number; account: string }[] }) {
  const [state, action, pending] = useActionState<RepositoryState, FormData>(connectRepository, {});
  const field = "mt-2 block w-full rounded-xl border border-rule bg-paper p-3";
  return <form action={action} className="mt-6 space-y-5">
    <label className="block font-medium">GitHub installation<select name="installation" required className={field} defaultValue=""><option value="" disabled>Select account</option>{installations.map((item) => <option key={item.id} value={item.id}>{item.account}</option>)}</select></label>
    <label className="block font-medium">Repository URL<input name="repository" type="url" required maxLength={300} placeholder="https://github.com/owner/repo" className={field} /></label>
    <label className="block font-medium">Workflow path<input name="workflow" required maxLength={110} defaultValue=".github/workflows/testshift.yml" className={field} /></label>
    <label className="flex gap-3 text-sm"><input type="checkbox" name="consent" required className="mt-1 size-4 shrink-0" /><span>I administer this repository and authorize TestShift to read its code and CI metadata and publish test checks. Tests will use disposable resources.</span></label>
    {state.message && <p role={state.success ? "status" : "alert"} className="text-sm">{state.message}</p>}
    <button disabled={pending || !installations.length} className="btn-primary min-h-12 px-5 disabled:opacity-50">{pending ? "Verifying…" : "Connect repository"}</button>
  </form>;
}
