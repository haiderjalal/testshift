"use client";
import { useActionState, useState } from "react";
import { connectRepository, discoverRepositoryWorkflows, type RepositoryState, type WorkflowDiscoveryState } from "./actions";

const field = "mt-2 block w-full rounded-xl border border-rule bg-paper p-3";

function WorkflowConnectionForm({ discovery }: { discovery: WorkflowDiscoveryState }) {
  const [state, action, pending] = useActionState<RepositoryState, FormData>(connectRepository, {});
  const workflows = discovery.workflows ?? [];
  return <form action={action} className="mt-6 space-y-5">
    <input type="hidden" name="installation" value={discovery.installation} />
    <input type="hidden" name="repository" value={discovery.repository} />
    <label className="block font-medium">Test workflow<select name="workflowId" required className={field} defaultValue={workflows.length === 1 ? String(workflows[0].id) : ""}>
      <option value="" disabled>Choose the workflow that runs your tests</option>
      {workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
    </select></label>
    <p className="text-sm text-graphite">GitHub runs the commands already defined in this workflow. Connecting does not create additional tests.</p>
    <label className="flex gap-3 text-sm"><input type="checkbox" name="consent" required className="mt-1 size-4 shrink-0" /><span>I administer this repository and authorize TestShift to read its code and CI metadata and publish test checks. Tests will use disposable resources.</span></label>
    {state.message && <p role={state.success ? "status" : "alert"} className="text-sm">{state.message}</p>}
    <button disabled={pending} className="btn-primary min-h-12 px-5 disabled:opacity-50">{pending ? "Verifying…" : "Connect repository"}</button>
  </form>;
}

export function ConnectForm({ installations }: { installations: { id: number; account: string }[] }) {
  const [installation, setInstallation] = useState(installations.length === 1 ? String(installations[0].id) : "");
  const [repository, setRepository] = useState("");
  const [discovery, action, pending] = useActionState<WorkflowDiscoveryState, FormData>(discoverRepositoryWorkflows, {});
  const matches = discovery.installation === installation && discovery.repository === repository.trim();
  return <div className="mt-6">
    <form action={action} className="space-y-5">
      <label className="block font-medium">GitHub installation<select name="installation" required className={field} value={installation} onChange={(event) => setInstallation(event.target.value)}>
        <option value="" disabled>Select account</option>{installations.map((item) => <option key={item.id} value={item.id}>{item.account}</option>)}
      </select></label>
      <label className="block font-medium">Repository URL<input name="repository" type="url" required maxLength={300} placeholder="https://github.com/owner/repo" className={field} value={repository} onChange={(event) => setRepository(event.target.value)} /></label>
      <p className="text-sm text-graphite">Paste your repository link. We will find its available workflows so you can choose by name.</p>
      <button disabled={pending || !installations.length} className="btn-primary min-h-12 px-5 disabled:opacity-50">{pending ? "Finding workflows…" : "Find workflows"}</button>
    </form>
    {!installations.length && <p className="mt-4 text-sm text-graphite">Use Install GitHub App above to grant access to selected repositories first.</p>}
    {discovery.message && (!discovery.success || matches) && <p role={discovery.success ? "status" : "alert"} className="mt-4 text-sm">{discovery.message}</p>}
    {matches && !pending && discovery.workflows && (discovery.workflows.length
      ? <WorkflowConnectionForm key={`${installation}:${repository.trim()}:${discovery.workflows.map((workflow) => workflow.id).join(",")}`} discovery={discovery} />
      : <div className="mt-4 rounded-xl border border-rule p-4"><p className="text-sm text-graphite">Download the starter, add your project&apos;s test commands and commit it to the repository. Then click Find workflows again. The starter needs your test suite before it can run.</p><a href="/api/github/workflow" className="mt-3 inline-block underline">Download test workflow starter</a></div>)}
  </div>;
}
