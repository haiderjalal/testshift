import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { db, isUuid } from "@/lib/db";
import { authorizedRepository, githubConfigured } from "@/lib/github/api";
import { customerSession, customerToken } from "@/lib/github/session";
import type { WorkflowReport } from "../../../../../worker/github";
export const metadata: Metadata = { title: "Repository test report", robots: { index: false, follow: false } };
export default async function GitHubReportPage({ params }: PageProps<"/repositories/jobs/[id]">) {
  if (!githubConfigured()) notFound();
  const customer = await customerSession(); if (!customer) redirect("/repositories?notice=sign-in");
  const { id } = await params; if (!isUuid(id)) notFound();
  const rows = await db()`select j.*,c.full_name,c.installation_id,c.repository_id from github_jobs j join github_connections c on c.id = j.connection_id
    where j.id = ${id} and c.user_id = ${customer.user_id}`;
  const job = rows[0]; if (!job) notFound();
  try { await authorizedRepository(customerToken(customer), Number(job.installation_id), Number(job.repository_id), customer.login); } catch { notFound(); }
  const report = job.report as WorkflowReport | null;
  return <><SiteHeader /><main className="mx-auto w-full max-w-4xl flex-1 px-5 py-12 sm:px-8"><Link href="/repositories" className="underline">Your repositories</Link>
    <h1 className="mt-6 break-words font-display text-3xl font-semibold">{job.full_name}</h1><p className="mt-4">Commit <code className="break-all">{job.head_sha}</code> · {job.status} · {job.conclusion ?? "Waiting for verification"}</p>
    <a className="mt-4 inline-block underline" rel="noreferrer" href={`https://github.com/${job.full_name}/actions/runs/${job.workflow_run_id}/attempts/${job.run_attempt}`}>View full evidence in GitHub Actions</a>
    {report && <><p className="mt-8 text-graphite">{report.scope}</p><ul className="mt-6 space-y-5">{report.jobs.map((entry) => <li key={entry.id} className="rounded-xl border border-rule p-5"><h2 className="font-display text-xl">{entry.name} · {entry.conclusion ?? entry.status}</h2><ul className="mt-3 space-y-2 text-sm">{entry.steps?.map((step) => <li key={step.number}>{step.name}: {step.conclusion ?? step.status}</li>)}</ul></li>)}</ul><h2 className="mt-8 font-display text-xl">Outside verified coverage</h2><ul className="mt-3 list-disc pl-5">{report.untested.map((gap) => <li key={gap}>{gap}</li>)}</ul></>}
  </main></>;
}
