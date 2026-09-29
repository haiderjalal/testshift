import { chromium, type Browser } from "playwright";

import { db, json, type Run, type Severity, type SitePage, type TestCase } from "@/lib/db";
import { errorMessage, log } from "@/lib/log";

import { executeCase, planTests, writeReport, type CaseDraft } from "./ai";
import { crawlSite } from "./browser";

// Dev knob: set to e.g. 2 so a booked hour lasts two minutes while you try things out.
const MINUTES_PER_HOUR = Number(process.env.SHIFT_MINUTES_PER_HOUR ?? 60);
const IDLE_POLL_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const MAX_CRAWL_PAGES = 25;
const SLOW_PAGE_MS = 5_000;

const caseColumns = () => db()`id, seq, title, category, priority, viewport, start_url, steps, expected, status, actual,
  severity, actions, screenshot is not null as has_screenshot, finished_at`;

/** Claims the oldest queued run, or a running one whose worker stopped sending heartbeats. */
async function claimRun(): Promise<Run | null> {
  const [run] = await db()<Run[]>`
    update runs set
      status = 'running',
      started_at = coalesce(started_at, now()),
      deadline_at = coalesce(deadline_at, now() + make_interval(secs => hours * ${MINUTES_PER_HOUR * 60})),
      heartbeat_at = now()
    where id = (
      select id from runs
      where status = 'queued' or (status = 'running' and heartbeat_at < now() - interval '2 minutes')
      order by created_at
      limit 1
      for update skip locked
    )
    returning *`;
  return run ?? null;
}

const setActivity = (runId: string, activity: string) =>
  db()`update runs set activity = ${activity}, heartbeat_at = now() where id = ${runId}`;

const listCases = (runId: string) =>
  db()<TestCase[]>`select ${caseColumns()} from test_cases where run_id = ${runId} order by seq`;

async function insertCases(runId: string, drafts: (CaseDraft & Partial<Pick<TestCase, "status" | "actual" | "severity">>)[]) {
  if (drafts.length === 0) return;
  const [{ next }] = await db()<{ next: number }[]>`
    select coalesce(max(seq), 0) + 1 as next from test_cases where run_id = ${runId}`;
  const rows = drafts.map((d, i) => ({
    run_id: runId,
    seq: next + i,
    title: d.title,
    category: d.category,
    priority: d.priority,
    viewport: d.viewport,
    start_url: d.start_url,
    steps: json(d.steps),
    expected: d.expected,
    status: d.status ?? "pending",
    actual: d.actual ?? null,
    severity: d.severity ?? null,
    actions: json(d.status ? [{ action: "goto", value: d.start_url }] : []),
    finished_at: d.status ? new Date() : null,
  }));
  await db()`insert into test_cases ${db()(rows)}`;
}

/** One smoke test per crawled page: it loads, without HTTP errors, console errors or a slow load. */
function smokeCase(page: SitePage): CaseDraft & Pick<TestCase, "status" | "actual" | "severity"> {
  const problems = [
    ...(page.status === 0 || page.status >= 400 ? [`HTTP ${page.status || "no response"}`] : []),
    ...(page.loadMs > SLOW_PAGE_MS ? [`slow load (${(page.loadMs / 1000).toFixed(1)}s)`] : []),
    ...page.issues,
  ];
  const severity: Severity | null =
    page.status === 0 || page.status >= 500 ? "critical" : page.status >= 400 ? "major" : problems.length ? "minor" : null;
  return {
    title: `${new URL(page.url).pathname} loads without errors`,
    category: "smoke",
    priority: "high",
    viewport: "desktop",
    start_url: page.url,
    steps: [`Open ${page.url}`],
    expected: "The page returns HTTP 2xx within 5 seconds with no console errors or failed requests.",
    status: problems.length ? "failed" : "passed",
    actual: problems.length ? problems.slice(0, 8).join("; ") : `Loaded in ${(page.loadMs / 1000).toFixed(1)}s.`,
    severity,
  };
}

async function testUntil(run: Run, browser: Browser, stopAt: number): Promise<void> {
  let pages = run.site_map;
  if (!pages) {
    await setActivity(run.id, "Exploring your site");
    const shiftMs = stopAt - Date.now();
    pages = await crawlSite(browser, run.url, { maxPages: MAX_CRAWL_PAGES, until: Date.now() + shiftMs * 0.15 });
    await db()`update runs set site_map = ${json(pages)} where id = ${run.id}`;
    await insertCases(run.id, pages.map(smokeCase));
  }
  // A crashed worker may have left a case half-run.
  await db()`update test_cases set status = 'pending' where run_id = ${run.id} and status = 'running'`;

  while (Date.now() < stopAt) {
    const [next] = await db()<TestCase[]>`
      select ${caseColumns()} from test_cases
      where run_id = ${run.id} and status = 'pending'
      order by case priority when 'high' then 0 when 'medium' then 1 else 2 end, seq
      limit 1`;

    if (!next) {
      await setActivity(run.id, "Designing new test cases");
      const drafts = await planTests({ run, pages, existing: await listCases(run.id) });
      if (drafts.length === 0) return;
      await insertCases(run.id, drafts);
      continue;
    }

    await setActivity(run.id, `Testing: ${next.title}`);
    await db()`update test_cases set status = 'running' where id = ${next.id}`;
    const r = await executeCase({ browser, run, testCase: next, stopAt });
    if (!r) {
      // The shift ended mid-test: leave it as "not reached" rather than a false result.
      await db()`update test_cases set status = 'pending' where id = ${next.id}`;
      return;
    }
    await db()`
      update test_cases set
        status = ${r.status},
        actual = ${r.actual},
        severity = ${r.severity},
        actions = ${json(r.actions)},
        screenshot = ${r.screenshot},
        finished_at = now()
      where id = ${next.id}`;
  }
}

async function processRun(run: Run): Promise<void> {
  const deadline = run.deadline_at?.getTime() ?? Date.now();
  const shiftMs = run.hours * MINUTES_PER_HOUR * 60_000;
  const stopAt = deadline - Math.min(2 * 60_000, shiftMs * 0.1); // leave time to write the report
  const heartbeat = setInterval(() => {
    db()`update runs set heartbeat_at = now() where id = ${run.id}`.catch((e) =>
      log("warn", "Heartbeat failed", { runId: run.id, error: errorMessage(e) }),
    );
  }, HEARTBEAT_MS);
  const browser = await chromium.launch();
  log("info", "Shift started", { runId: run.id, plan: run.plan, hours: run.hours });

  try {
    try {
      await testUntil(run, browser, stopAt);
    } catch (e) {
      // Keep what was tested so far and still deliver a report.
      log("error", "Testing stopped early", { runId: run.id, error: errorMessage(e) });
    }
    await setActivity(run.id, "Writing your report");
    const report = await writeReport({ run, cases: await listCases(run.id) });
    await db()`
      update runs set status = 'completed', report = ${json(report)}, activity = null, completed_at = now()
      where id = ${run.id}`;
    log("info", "Shift completed", { runId: run.id, score: report.score });
    await emailReport(run);
  } catch (e) {
    log("error", "Shift failed", { runId: run.id, error: errorMessage(e) });
    await db()`
      update runs set status = 'failed', activity = null, error = 'The tester hit an internal error and stopped. Contact support with the link to this page.'
      where id = ${run.id}`;
  } finally {
    clearInterval(heartbeat);
    await browser.close();
  }
}

async function emailReport(run: Run): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !process.env.EMAIL_FROM) {
    log("warn", "Email not configured; skipping report email", { runId: run.id });
    return;
  }
  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/runs/${run.id}`;
  const host = new URL(run.url).hostname;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: run.email,
        subject: `Your QA report for ${host} is ready`,
        text: `Your TestShift QA shift on ${host} has finished.\n\nRead the report and download the test suite:\n${link}`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) log("error", "Report email failed", { runId: run.id, status: res.status });
  } catch (e) {
    log("error", "Report email failed", { runId: run.id, error: errorMessage(e) });
  }
}

async function main(): Promise<void> {
  // Fail fast: claiming a paid run without model credentials would burn the customer's shift.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    log("error", "ANTHROPIC_API_KEY is not set; the worker will not claim runs");
    process.exit(1);
  }
  log("info", "Worker started", { minutesPerHour: MINUTES_PER_HOUR });
  for (;;) {
    const run = await claimRun().catch((e) => {
      log("error", "Could not claim a run", { error: errorMessage(e) });
      return null;
    });
    if (run) await processRun(run);
    else await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
  }
}

void main();
