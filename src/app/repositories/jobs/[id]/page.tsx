import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageIntro } from "@/components/PageIntro";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusPill, TONE_TEXT, toneForStatus, type StatusTone } from "@/app/repositories/StatusPill";
import { db, isUuid } from "@/lib/db";
import { authorizedRepository, githubConfigured } from "@/lib/github/api";
import { customerSession, customerToken } from "@/lib/github/session";
import type { WorkflowReport } from "../../../../../worker/github";

export const metadata: Metadata = { title: "Repository test report", robots: { index: false, follow: false } };

interface TimelineStepProps {
  label: string;
  tone: StatusTone;
  children: ReactNode;
}

/** One stop on the run timeline. The dot is decorative; the label and content carry the status. */
function TimelineStep({ label, tone, children }: TimelineStepProps): ReactElement {
  return (
    <li className="relative pb-10 pl-8 last:pb-0">
      <span aria-hidden className={`absolute top-1.5 -left-1.5 size-3 rounded-full bg-current ring-4 ring-card ${TONE_TEXT[tone]}`} />
      <p className="font-mono text-xs tracking-widest text-graphite uppercase">{label}</p>
      <div className="mt-3 min-w-0">{children}</div>
    </li>
  );
}

export default async function GitHubReportPage({ params }: PageProps<"/repositories/jobs/[id]">) {
  if (!githubConfigured()) notFound();
  const customer = await customerSession(); if (!customer) redirect("/repositories?notice=sign-in");
  const { id } = await params; if (!isUuid(id)) notFound();
  const rows = await db()`select j.*,c.full_name,c.installation_id,c.repository_id from github_jobs j join github_connections c on c.id = j.connection_id
    where j.id = ${id} and c.user_id = ${customer.user_id}`;
  const job = rows[0]; if (!job) notFound();
  try { await authorizedRepository(customerToken(customer), Number(job.installation_id), Number(job.repository_id), customer.login); } catch { notFound(); }
  const report = job.report as WorkflowReport | null;
  return <><SiteHeader /><main className="mx-auto w-full max-w-4xl flex-1 px-5 py-12 sm:px-8">
    <Link href="/repositories" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Your repositories</Link>
    <div className="mt-6">
      <PageIntro
        eyebrow="Repository test report"
        title={<span className="break-words">{job.full_name}</span>}
        description={<>Commit <code className="break-all">{job.head_sha}</code> · {job.status} · {job.conclusion ?? "Waiting for verification"}</>}
      />
    </div>
    <a className="btn-primary mt-8 min-h-12 px-5" rel="noreferrer" href={`https://github.com/${job.full_name}/actions/runs/${job.workflow_run_id}/attempts/${job.run_attempt}`}>View full evidence in GitHub Actions</a>

    <div className="glass glass-strong mt-10 rounded-3xl p-6 sm:p-8">
      <ol aria-label="Verification timeline" className="ml-1.5 border-l border-rule">
        <TimelineStep label="Step 1 · Workflow run" tone={toneForStatus(job.status)}>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone={toneForStatus(job.status)}>{job.status}</StatusPill>
            <span className="text-sm text-graphite">attempt {job.run_attempt}</span>
          </div>
        </TimelineStep>
        <TimelineStep label="Step 2 · Verification" tone={toneForStatus(job.conclusion)}>
          <StatusPill tone={toneForStatus(job.conclusion)}>{job.conclusion ?? "Waiting for verification"}</StatusPill>
        </TimelineStep>
        <TimelineStep label="Step 3 · Report" tone={report ? "neutral" : "active"}>
          {report ? <>
            <p className="text-graphite">{report.scope}</p>
            <ul className="mt-5 space-y-4">{report.jobs.map((entry) => <li key={entry.id} className="rounded-2xl border border-rule bg-raised/40 p-5">
              <h2 className="flex items-center gap-2 font-display text-lg"><span aria-hidden className={`size-2 shrink-0 rounded-full bg-current ${TONE_TEXT[toneForStatus(entry.conclusion ?? entry.status)]}`} />{entry.name} · {entry.conclusion ?? entry.status}</h2>
              <ul className="mt-4 space-y-2 text-sm">{entry.steps?.map((step) => <li key={step.number} className="flex items-start gap-3">
                <span aria-hidden className={`mt-1.5 size-1.5 shrink-0 rounded-full bg-current ${TONE_TEXT[toneForStatus(step.conclusion ?? step.status)]}`} />
                <span className="min-w-0 break-words">{step.name}: {step.conclusion ?? step.status}</span>
              </li>)}</ul>
            </li>)}</ul>
          </> : <p className="text-graphite">No verified report yet.</p>}
        </TimelineStep>
        {report && <TimelineStep label="Step 4 · Coverage" tone="attention">
          <h2 className="font-display text-xl">Outside verified coverage</h2>
          <ul className="mt-3 space-y-2 text-graphite">{report.untested.map((gap) => <li key={gap} className="flex gap-3"><span aria-hidden className="text-marker">◆</span><span>{gap}</span></li>)}</ul>
        </TimelineStep>}
      </ol>
    </div>
  </main></>;
}
