import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { db } from "@/lib/db";
import { authorizedRepository, githubConfigured, userInstallations } from "@/lib/github/api";
import { customerSession, customerToken } from "@/lib/github/session";
import { generationEnabled } from "@/lib/github/generation-store";
import { ConnectForm } from "./ConnectForm";
import { disconnectRepository, signOutRepository } from "./actions";

export const metadata: Metadata = { title: "Your GitHub repositories", robots: { index: false, follow: false } };
const notices: Record<string, string> = {
  "not-configured": "GitHub connections are awaiting the owner's App configuration.", "github-unavailable": "GitHub could not be reached. Try signing in again.",
  "invalid-state": "The GitHub request expired or could not be verified. Start again from this page.", "installed": "Installation verified. Choose a repository to connect below.",
  "access-denied": "GitHub did not confirm installation access.", "sign-in": "Sign in with GitHub first.", "rate-limit": "Please wait before starting another GitHub request.",
};
interface Connection { id: string; installation_id: string; repository_id: string; full_name: string; workflow_path: string; active: boolean }
export default async function RepositoriesPage({ searchParams }: PageProps<"/repositories">) {
  const notice = (await searchParams).notice;
  const configured = githubConfigured();
  const generation = generationEnabled();
  const customer = configured ? await customerSession() : null;
  let installations: { id: number; account: string }[] = []; const connections: Connection[] = []; let unavailable = false;
  if (customer) {
    try {
      const token = customerToken(customer);
      installations = (await userInstallations(token)).map((item) => ({ id: item.id, account: item.account.login }));
      const candidates = await db()<Connection[]>`select id,installation_id::text,repository_id::text,full_name,workflow_path,active from github_connections where user_id = ${customer.user_id} order by created_at desc limit 20`;
      // Re-check current GitHub authority before showing private metadata/reports.
      for (const connection of candidates) {
        try {
          await authorizedRepository(token, Number(connection.installation_id), Number(connection.repository_id), customer.login);
          connections.push(connection);
        } catch { unavailable = true; }
      }
    } catch { unavailable = true; }
  }
  return <><SiteHeader /><main className="mx-auto w-full max-w-4xl flex-1 px-5 py-12 sm:px-8">
    <h1 className="font-display text-4xl font-semibold">Your GitHub repositories</h1>
    <p className="mt-4 text-graphite">Connect repositories you administer. GitHub Actions runs your approved tests; TestShift collects verified CI results and publishes a check on the tested commit.</p>
    <section className="mt-6 rounded-2xl border border-rule p-6"><h2 className="font-display text-xl">How testing and payment work</h2>
      <p className="mt-3 text-sm text-graphite">{generation ? "Connect and approve source analysis to generate a test pull request. Review its assertions and CI results, then merge it to run the suite on future pushes and pull requests. New pushes run the tests; they do not automatically regenerate them." : "Choose an existing test workflow by name. When it runs in GitHub, TestShift verifies the result and shows a report here. AI test generation requires the owner to enable it first."}</p>
      <p className="mt-3 text-sm text-graphite">No TestShift payment is collected when connecting a repository or reporting its CI results. GitHub Actions usage follows <a href="https://docs.github.com/en/billing/concepts/product-billing/github-actions" className="underline">GitHub&apos;s billing</a>. Paid AI website-testing shifts are booked separately through <Link href="/hire" className="underline">Book website testing</Link>.</p>
    </section>
    {typeof notice === "string" && notices[notice] && <p role="status" className="mt-5 rounded-xl border border-rule p-4">{notices[notice]}</p>}
    {!configured ? <div className="mt-8 rounded-2xl border border-rule p-7"><h2 className="font-display text-2xl">GitHub App setup is pending</h2><p className="mt-3 text-graphite">The integration is implemented, but the owner must register the App and configure its credentials before connections are available.</p><Link href="/custom?mode=ci" className="mt-5 inline-block underline">Request assisted CI setup</Link></div>
      : !customer ? <a href="/api/github/auth" className="btn-primary mt-8 inline-flex min-h-12 px-6">Sign in with GitHub</a>
        : <><div className="mt-6 flex flex-wrap items-center gap-5"><p>Signed in as <strong>{customer.login}</strong></p><form action={signOutRepository}><button className="underline">Sign out</button></form><a href="/api/github/install" className="btn-primary min-h-12 px-5">Install GitHub App</a></div>
          {unavailable && <p role="alert" className="mt-5">Some GitHub access could not be verified. Private results are hidden. Reauthorize GitHub to refresh access.</p>}
          <section className="mt-8 rounded-2xl border border-rule bg-card p-7"><h2 className="font-display text-2xl">Connect a selected repository</h2><p className="mt-3 text-sm text-graphite">Install the App first. Only repositories available to your GitHub account and installation can be connected, and GitHub must confirm that you are a repository administrator.</p><ConnectForm installations={installations} generation={generation} /></section>
          <section className="mt-10 space-y-5"><h2 className="font-display text-2xl">Connected repositories</h2>{!connections.length && <p className="text-graphite">No verified repositories connected yet.</p>}
            {await Promise.all(connections.map(async (connection) => {
              const jobs = await db()`select id,workflow_run_id::text,run_attempt,head_sha,status,conclusion,created_at from github_jobs where connection_id = ${connection.id} order by created_at desc limit 10`;
              const generationResult = generation ? await db()`select id,status,stage,pull_number::text,failure_code,inventory from github_generations where connection_id = ${connection.id} order by created_at desc limit 3`.catch(()=>null) : [];
              const generations = generationResult ?? [];
              return <article key={connection.id} className="rounded-2xl border border-rule bg-card p-6"><h3 className="break-words font-display text-xl">{connection.full_name}</h3><p className="mt-2 text-sm break-words">{connection.active ? "Connected" : "Paused — reconnect to resume"} · {connection.workflow_path}</p>
                {generationResult === null && <p className="mt-4 text-sm" role="alert">Test generation is unavailable. The owner should check the generation migration and worker setup. Existing CI reports remain available below.</p>}
                {generations.map((item) => <div key={item.id} className="mt-4 rounded-xl border border-rule p-4"><p>Test generation: {item.status} · {item.stage}</p>
                  {item.inventory && <p className="mt-2 text-sm text-graphite">Analyzed {item.inventory.analyzedFiles} of {item.inventory.totalFiles} files. See the PR for scope and coverage gaps.</p>}
                  {item.pull_number && <a className="mt-2 inline-block underline" href={`https://github.com/${connection.full_name}/pull/${item.pull_number}`}>Review generated tests in GitHub</a>}
                  {item.failure_code && <p className="mt-2 text-sm">Setup needs attention: {item.failure_code}. Check the App permissions and worker configuration, or request assisted setup for unsupported stacks.</p>}
                  {['queued','processing'].includes(item.status) && <p className="mt-2 text-sm text-graphite">Refresh this page to see progress.</p>}
                </div>)}
                <ul className="mt-4 space-y-3">{jobs.map((job) => <li key={`${job.workflow_run_id}-${job.run_attempt}`} className="text-sm"><Link className="underline" href={`/repositories/jobs/${job.id}`}>Commit {job.head_sha.slice(0, 8)} · attempt {job.run_attempt}</Link><span> · {job.status}{job.conclusion ? ` · ${job.conclusion}` : ""}</span></li>)}</ul>
                {!jobs.length && <p className="mt-4 text-sm text-graphite">Waiting for a new completed run of your selected workflow. Start it in GitHub Actions, or push a commit if it runs on pushes.</p>}
                <form action={disconnectRepository} className="mt-5"><input type="hidden" name="id" value={connection.id} /><button className="text-sm underline">Disconnect and delete TestShift reports</button></form></article>;
            }))}</section></>}
    <section className="mt-10 rounded-2xl border border-rule p-7"><h2 className="font-display text-2xl">Add the test workflow</h2><p className="mt-3 text-graphite">Download and extract the Node.js starter into your repository. Review its action, test commands and fixtures, then commit <code>.github/workflows/testshift.yml</code> and the included files. It runs on pushes and pull requests without TestShift secrets. For other stacks, supply your own reviewed commands.</p><a href="/api/github/workflow" className="btn-primary mt-5 inline-flex min-h-12 px-5">Download GitHub workflow</a><p className="mt-4 text-sm text-graphite">Deletion and recovery tests must use disposable databases and synthetic accounts. Installation alone does not supply missing tests or authorize production changes.</p></section>
  </main></>;
}
