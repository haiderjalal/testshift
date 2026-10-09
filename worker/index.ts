import type { Browser } from "playwright";

import { agentWindows, type Agent, type AgentId } from "@/lib/agents";
import { judgeCompatibility, type CompatibilityResult, type EngineId } from "@/lib/compat";
import { isSiteVerified } from "@/lib/ownership";
import { emailKey } from "@/lib/net";
import { db, json, type Run, type Severity, type SitePage, type Strategy, type TestCase } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { errorMessage, log } from "@/lib/log";
import { PLANS } from "@/lib/plans";

import { executeCase, planTests, writeReport, writeStrategy, type CaseDraft } from "./ai";
import { accessibilityAudit, auditPages, compatibilityAudit, crawlSite, splitIssues, type AccessibilityResult, type PageAudit } from "./browser";
import { AiBudget, BudgetExceededError, DeadlineError, budgetLimit, endBudget, startBudget } from "./budget";
import { runApiChecks } from "./api";
import { startEgressProxy } from "./egress";
import { launchEngine, launchExtraEngines } from "./engines";
import { LeaseLostError, withRunLease } from "./lease";
import { securityChecks } from "./security";
import { runVisualChecks, type VisualCheck, type Viewport } from "./visual";
import { exploreSite } from "./explore";
import { processRequirementRequest } from "./requirements";
import { runLoadCheck, type LoadCheck } from "./load";
import { checkTestEnvironment } from "@/lib/test-environments";
import { configuredImageStore } from "@/lib/image-store";
import { BLOCKED_NEEDS_OWNERSHIP, type SecurityCheck } from "@/lib/security-checks";

// Dev knob: set to e.g. 2 so a booked hour lasts two minutes while you try things out.
const MINUTES_PER_HOUR = process.env.NODE_ENV === "production" ? 60 : Number(process.env.SHIFT_MINUTES_PER_HOUR ?? 60);
const IDLE_POLL_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const MAX_CRAWL_PAGES = 25;
const MAX_TRIAL_CRAWL_PAGES = 10;
const SLOW_PAGE_MS = 5_000;
// Core Web Vitals thresholds ("good" / "poor") from web.dev.
const LCP_GOOD_MS = 2_500;
const LCP_POOR_MS = 4_000;
const CLS_GOOD = 0.1;
const CLS_POOR = 0.25;
// How many tests to plan per minute an agent has left: scripted tests take seconds, investigations ~30-60s.
const CASES_PER_MINUTE = 1.5;
const MIN_BATCH = 5;
const MAX_BATCH = 12;
// Share of the time left after mapping that API checks may use. Agents get the rest.
const API_SHARE = 0.1;
// Pages each browser loads for the cross-browser comparison. Every extra page costs one load per engine.
const MAX_COMPAT_PAGES = 5;
// Share of the UAT window that exploratory testing may use. The planned UAT tests get the rest.
const EXPLORE_SHARE = 0.4;

type Draft = CaseDraft & Partial<Pick<TestCase, "status" | "actual" | "severity">>;

const caseColumns = () => db()`id, seq, agent, feature, title, category, priority, viewport, start_url, steps, expected,
  status, actual, severity, script, actions, failure_assertion, scripted, screenshot is not null as has_screenshot, finished_at`;

/**
 * This worker's claim on the shift it is running. A fresh token is written at claim time; if another worker
 * re-claims the shift (this one paused past the heartbeat timeout), our token no longer matches, `lost` flips,
 * and this worker stops instead of racing the new owner and sending a second report.
 */
const lease = { token: "", lost: false };

/** Claims the next run: paid Principal shifts first, then oldest first. Also re-claims runs whose worker went silent. */
async function claimRun(): Promise<Run | null> {
  const [run] = await db()<(Run & { claim_token: string })[]>`
    update runs set
      status = 'running',
      claim_token = gen_random_uuid(),
      started_at = coalesce(started_at, now()),
      deadline_at = coalesce(deadline_at, now() + make_interval(secs => minutes * ${MINUTES_PER_HOUR})),
      heartbeat_at = now()
    where id = (
      select id from runs
      where (status = 'queued' or (status = 'running' and heartbeat_at < now() - interval '2 minutes'))
        and (payment_method <> 'wise' or (payment_confirmed_at is not null and start_authorized_at is not null))
      order by (plan = 'principal' and not is_trial) desc, created_at
      limit 1
      for update skip locked
    )
    returning *`;
  if (run) Object.assign(lease, { token: run.claim_token, lost: false });
  return run ?? null;
}

/** Updates the live status and doubles as an ownership check: throws once another worker owns the shift. */
async function setActivity(runId: string, agent: AgentId, activity: string): Promise<void> {
  const rows = await db()`
    update runs set agent = ${agent}, activity = ${activity}, heartbeat_at = now()
    where id = ${runId} and claim_token = ${lease.token} returning id`;
  if (rows.length === 0) lease.lost = true;
  if (lease.lost) throw new LeaseLostError();
}

/** Plans with a retry: a transient API failure shouldn't end an agent's phase early. */
async function planWithRetry(input: Parameters<typeof planTests>[0]): Promise<CaseDraft[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await planTests(input);
    } catch (e) {
      if (e instanceof BudgetExceededError || e instanceof DeadlineError || Date.now() >= (input.stopAt ?? Infinity)) return [];
      log("warn", "Planning failed", { runId: input.run.id, agent: input.agent.id, attempt, error: errorMessage(e) });
      if (attempt >= 2) return [];
      if (Date.now() + 3_000 >= (input.stopAt ?? Infinity)) return [];
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
}

const listCases = (runId: string) =>
  db()<TestCase[]>`select ${caseColumns()} from test_cases where run_id = ${runId} order by seq`;

async function insertCases(runId: string, agent: AgentId, drafts: Draft[]): Promise<void> {
  if (drafts.length === 0) return;
  await withRunLease(runId, lease.token, async (sql) => {
  const [{ next }] = await sql<{ next: number }[]>`
    select coalesce(max(seq), 0) + 1 as next from test_cases where run_id = ${runId}`;
  const rows = drafts.map((d, i) => ({
    run_id: runId,
    seq: next + i,
    agent,
    feature: d.feature,
    title: d.title,
    category: d.category,
    priority: d.priority,
    viewport: d.viewport,
    start_url: d.start_url,
    steps: json(d.steps),
    expected: d.expected,
    script: json(d.script),
    status: d.status ?? "pending",
    actual: d.actual ?? null,
    severity: d.severity ?? null,
    actions: json(d.status ? [{ action: "goto", value: d.start_url }] : []),
    finished_at: d.status ? new Date() : null,
  }));
  await sql`insert into test_cases ${sql(rows)}`;
  });
}

const SEVERITY_RANK: Record<Severity, number> = { minor: 1, major: 2, critical: 3 };
const worst = (a: Severity | null, b: Severity | null): Severity | null =>
  !a ? b : !b ? a : SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
const pathOf = (url: string) => new URL(url).pathname;

/**
 * Prod smoke test per page: it loads without HTTP errors, console errors, failed first-party requests or a slow
 * load. Pages that ask for a login are "blocked", not broken; third-party failures are noted, never a bug.
 */
function smokeCase(page: Pick<SitePage, "url" | "status" | "loadMs" | "issues">): Draft {
  const { own, thirdParty } = splitIssues(page.issues);
  if (page.status === 401 || page.status === 403 || page.status === 429) {
    return {
      feature: null,
      script: [],
      title: `${pathOf(page.url)} loads without errors`,
      category: "smoke",
      priority: "high",
      viewport: "desktop",
      start_url: page.url,
      steps: [`Open ${page.url}`],
      expected: "The page returns HTTP 2xx within 5 seconds with no console errors or failed requests.",
      status: "blocked",
      actual: `HTTP ${page.status}: access or rate limiting prevented testing this page.`,
      severity: null,
    };
  }
  const problems = [
    ...(page.status === 0 || page.status >= 400 ? [`HTTP ${page.status || "no response"}`] : []),
    ...(page.loadMs > SLOW_PAGE_MS ? [`slow load (${(page.loadMs / 1000).toFixed(1)}s)`] : []),
    ...own.filter((issue) => issue !== `HTTP ${page.status} ${page.url}`),
  ];
  const note = thirdParty.length ? ` Third-party services failed ${thirdParty.length} request(s), not counted.` : "";
  const severity: Severity | null =
    page.status === 0 || page.status >= 500 ? "critical" : page.status >= 400 ? "major" : problems.length ? "minor" : null;
  return {
    feature: null,
    script: [],
    title: `${pathOf(page.url)} loads without errors`,
    category: "smoke",
    priority: "high",
    viewport: "desktop",
    start_url: page.url,
    steps: [`Open ${page.url}`],
    expected: "The page returns HTTP 2xx within 5 seconds with no console errors or failed requests.",
    status: problems.length ? "failed" : "passed",
    actual: (problems.length ? problems.slice(0, 8).join("; ") : `Loaded in ${(page.loadMs / 1000).toFixed(1)}s.`) + note,
    severity,
  };
}

/** Prod performance check per page against Core Web Vitals thresholds (Lead and Principal plans). */
function performanceCase(a: PageAudit): Draft | null {
  if (a.status < 200 || a.status >= 400) return null;
  if (a.lcpMs === null && a.cls === null) return null;
  let severity: Severity | null = null;
  const problems: string[] = [];
  if (a.lcpMs !== null && a.lcpMs > LCP_GOOD_MS) {
    severity = worst(severity, a.lcpMs > LCP_POOR_MS ? "major" : "minor");
    problems.push(`main content took ${(a.lcpMs / 1000).toFixed(1)}s to appear`);
  }
  if (a.cls !== null && a.cls > CLS_GOOD) {
    severity = worst(severity, a.cls > CLS_POOR ? "major" : "minor");
    problems.push(`layout shifted by ${a.cls.toFixed(2)}`);
  }
  const measured = `LCP ${a.lcpMs === null ? "n/a" : `${(a.lcpMs / 1000).toFixed(1)}s`}, CLS ${a.cls?.toFixed(2) ?? "n/a"}`;
  return {
    feature: null,
    script: [],
    title: `${pathOf(a.url)} loads fast and stays stable`,
    category: "performance",
    priority: "medium",
    viewport: "desktop",
    start_url: a.url,
    steps: [`Open ${a.url}`, "Measure Largest Contentful Paint (LCP) and Cumulative Layout Shift (CLS)"],
    expected: "LCP under 2.5s and CLS under 0.1 (Core Web Vitals \"good\").",
    status: problems.length ? "failed" : "passed",
    actual: problems.length ? `${measured}: ${problems.join("; ")}.` : `${measured}.`,
    severity,
  };
}

const SECURITY_HEADERS: [header: string, label: string][] = [
  ["content-security-policy", "Content-Security-Policy"],
  ["x-content-type-options", "X-Content-Type-Options"],
  ["referrer-policy", "Referrer-Policy"],
];

/** Prod security-header review of the start page (Principal plan). Passive: reads response headers only. */
function securityCase(a: PageAudit): Draft {
  const h = a.headers;
  const missing = SECURITY_HEADERS.filter(([name]) => !h[name]).map(([, label]) => label);
  if (a.url.startsWith("https:") && !h["strict-transport-security"]) missing.unshift("Strict-Transport-Security");
  if (!h["x-frame-options"] && !/frame-ancestors/i.test(h["content-security-policy"] ?? "")) {
    missing.push("X-Frame-Options or CSP frame-ancestors (clickjacking)");
  }
  return {
    feature: null,
    script: [],
    title: "Security headers are set on the site",
    category: "security",
    priority: "medium",
    viewport: "desktop",
    start_url: a.url,
    steps: [`Open ${a.url}`, "Inspect the response headers of the page"],
    expected: "HSTS, Content-Security-Policy, X-Content-Type-Options, Referrer-Policy and clickjacking protection are present.",
    status: missing.length ? "failed" : "passed",
    actual: missing.length ? `Missing: ${missing.join(", ")}.` : "All recommended security headers are present.",
    severity: missing.length >= 3 ? "major" : missing.length ? "minor" : null,
  };
}

/** Explores the site once per shift. Proposed scenarios become pending exploratory tests, run by the normal executor. */
async function runExploration(run: Run, browser: Browser, pages: SitePage[], strategy: Strategy | null, until: number): Promise<void> {
  const [{ done }] = await db()<{ done: boolean }[]>`select exists (select 1 from runs where id = ${run.id} and exploration is not null) as done`;
  if (done) return;
  await setActivity(run.id, "uat", "UAT agent · Exploring the site");
  const explorationUntil = Date.now() + Math.max(0, until - Date.now()) * EXPLORE_SHARE;
  const outcome = await exploreSite({
    run,
    browser,
    pages,
    strategy,
    existing: await listCases(run.id),
    until: explorationUntil,
    stopAt: until,
  });
  await insertCases(run.id, "uat", outcome.drafts);
  await withRunLease(run.id, lease.token, async (sql) => {
    await sql`update runs set exploration = ${json(outcome.summary)} where id = ${run.id}`;
  });
  log("info", "Exploration finished", { runId: run.id, ...outcome.summary });
}

/** The load test's result as a performance test case. Blocked means it did not run, and says why. */
function loadCheckCase(c: LoadCheck): Draft {
  return {
    feature: null,
    script: [],
    title: c.title,
    category: "performance",
    priority: "medium",
    viewport: "desktop",
    start_url: c.url,
    steps: c.steps,
    expected: c.expected,
    status: c.passed === null ? "blocked" : c.passed ? "passed" : "failed",
    actual: c.actual,
    severity: c.severity,
  };
}

/** Maps one visual comparison to a UI test case. Blocked means not compared yet, never passed. */
function visualCheckCase(c: VisualCheck): Draft {
  return {
    feature: null,
    script: [],
    title: c.title,
    category: "ui",
    priority: "medium",
    viewport: c.viewport,
    start_url: c.url,
    steps: c.steps,
    expected: c.expected,
    status: c.passed === null ? "blocked" : c.passed ? "passed" : "failed",
    actual: c.actual,
    severity: c.severity,
  };
}

/** Maps one passive or active security check to a test case. A null result is blocked, not passed. */
function securityCheckCase(c: SecurityCheck, url: string): Draft {
  return {
    feature: null,
    script: [],
    title: c.title,
    category: "security",
    priority: "medium",
    viewport: "desktop",
    start_url: url,
    steps: c.steps,
    expected: c.expected,
    status: c.passed === null ? "blocked" : c.passed ? "passed" : "failed",
    actual: c.actual,
    severity: c.severity,
  };
}

/** UAT accessibility check per page from axe-core's WCAG 2 A/AA rules (Lead and Principal plans). */
function accessibilityCase(r: AccessibilityResult): Draft {
  const serious = r.violations.some((v) => v.impact === "critical" || v.impact === "serious");
  return {
    feature: null,
    script: [],
    title: `${pathOf(r.url)} passes automated accessibility checks`,
    category: "accessibility",
    priority: "medium",
    viewport: "desktop",
    start_url: r.url,
    steps: [
      `Open ${r.url}`,
      "Run the WCAG 2.2 A and AA automated rules",
      "Tab through the first keyboard stops and check focus is visible",
      "Automated checks cover only part of WCAG; alt-text meaning, reading order and captions still need manual review",
    ],
    expected: "No WCAG 2.2 A/AA violations and visible keyboard focus.",
    status: r.blocked ? "blocked" : r.violations.length ? "failed" : "passed",
    actual: r.blocked ?? (r.violations.length
      ? r.violations
          .slice(0, 6)
          .map((v) => `${v.help} (${v.count}×, ${v.impact ?? "unknown"})`)
          .join("; ")
      : "No violations found by the automated audit."),
    severity: serious ? "major" : r.violations.length ? "minor" : null,
  };
}

/** One cross-browser case per page. Pages that no browser loads, or that every browser fails the same way, are not browser differences. */
function compatibilityCase(r: CompatibilityResult): Draft | null {
  const judged = judgeCompatibility(r);
  if (judged.outcome === "not-comparable") return null;
  return {
    feature: null,
    script: [],
    title: `${pathOf(r.url)} works the same in every browser`,
    category: "compatibility",
    priority: "medium",
    viewport: "desktop",
    start_url: r.url,
    steps: [`Open ${r.url} in each browser`, "Compare the HTTP status and the browser errors"],
    expected: "Every browser loads the page and reports the same errors.",
    status: judged.outcome,
    actual: judged.detail,
    severity: judged.severity,
  };
}

/** Automated checks an agent runs before its AI-planned tests. Runs once per shift, even after a worker restart. */
async function seedAutomatedChecks(run: Run, browser: Browser, agent: Agent, pages: SitePage[], until: number, engines: Map<EngineId, Browser>) {
  const checks = PLANS[run.plan].checks;
  const urls = pages.map((p) => p.url);
  const categories = agent.id === "prod" ? ["smoke", "performance", "security", "compatibility"] : ["accessibility"];
  if (agent.id !== "prod" && !(agent.id === "uat" && checks.accessibility)) return;
  const [{ done }] = await db()<{ done: boolean }[]>`
    select exists (select 1 from test_cases where run_id = ${run.id} and agent = ${agent.id}
      and category in ${db()(categories)}) as done`;
  if (done || urls.length === 0) return;

  if (agent.id === "uat") {
    await setActivity(run.id, agent.id, `${agent.name} · Accessibility audit`);
    const results = await accessibilityAudit(browser, run.url, urls, until);
    await insertCases(run.id, agent.id, results.map(accessibilityCase));
    return;
  }
  await setActivity(run.id, agent.id, `${agent.name} · Release checks on every page`);
  const audits = await auditPages(browser, run.url, urls, { vitals: checks.performance, until });
  const drafts: Draft[] = audits.map(smokeCase);
  if (checks.performance) drafts.push(...audits.map(performanceCase).filter((d): d is Draft => d !== null));
  if (checks.visual) {
    await setActivity(run.id, agent.id, `${agent.name} · Visual comparison`);
    try {
      const viewports: Viewport[] = checks.mobile ? ["desktop", "mobile"] : ["desktop"];
      const visual = await runVisualChecks({
        runId: run.id,
        browser,
        siteUrl: run.url,
        urls,
        viewports,
        until,
        emailKey: emailKey(run.email),
        store: configuredImageStore(),
        withLease: (write) => withRunLease(run.id, lease.token, write),
      });
      // Checks that do not apply (no approved screenshot yet, no storage) are not test cases: a blocked case would
      // mark the shift Incomplete. The visual section of the report shows them, with the approve button.
      drafts.push(...visual.filter((c) => c.passed !== null).map(visualCheckCase));
    } catch (e) {
      if (e instanceof LeaseLostError) throw e;
      log("error", "Visual comparison failed", { runId: run.id, error: errorMessage(e) });
    }
  }
  if (checks.performance) {
    await setActivity(run.id, agent.id, `${agent.name} · Light load test`);
    try {
      const load = await runLoadCheck(run.url, until, emailKey(run.email));
      // Without an approved, verified environment the load test does not apply, so it is not a coverage gap.
      if (load.passed !== null) drafts.push(loadCheckCase(load));
      await withRunLease(run.id, lease.token, async (sql) => {
        await sql`update runs set load_summary = ${load.summary ? json(load.summary) : null} where id = ${run.id}`;
      });
    } catch (e) {
      if (e instanceof LeaseLostError) throw e;
      log("error", "Load test failed", { runId: run.id, error: errorMessage(e) });
    }
  }
  if (checks.securityHeaders && audits[0]) {
    drafts.push(securityCase(audits[0]));
    // Isolated: a failure in the extended checks must not cost the release checks above.
    try {
      const verified = await isSiteVerified(new URL(run.url).hostname, emailKey(run.email));
      const checked = await securityChecks({ siteUrl: run.url, pageHeaders: audits[0].headers, verified, until });
      // Active probes waiting on domain verification are shown on the report's ownership panel, not as gaps.
      drafts.push(...checked.filter((c) => c.actual !== BLOCKED_NEEDS_OWNERSHIP).map((c) => securityCheckCase(c, run.url)));
    } catch (e) {
      log("error", "Security checks failed", { runId: run.id, error: errorMessage(e) });
    }
  }
  if (engines.size > 1) {
    await setActivity(run.id, agent.id, `${agent.name} · Comparing browsers`);
    const compared = await compatibilityAudit(engines, run.url, urls.slice(0, MAX_COMPAT_PAGES), until);
    drafts.push(...compared.map(compatibilityCase).filter((d): d is Draft => d !== null));
  }
  await insertCases(run.id, agent.id, drafts);
}

/** One agent's phase: automated checks, then AI-planned tests of its type until its window closes. */
async function runPhase(
  run: Run,
  browser: Browser,
  pages: SitePage[],
  strategy: Strategy | null,
  window: { agent: Agent; to: number },
  stopAt: number,
  engines: Map<EngineId, Browser>,
) {
  const { agent } = window;
  await seedAutomatedChecks(run, browser, agent, pages, Math.min(window.to, stopAt), engines);
  if (agent.id === "uat" && PLANS[run.plan].checks.exploratory) {
    try {
      await runExploration(run, browser, pages, strategy, Math.min(window.to, stopAt));
    } catch (e) {
      if (e instanceof LeaseLostError) throw e;
      log("error", "Exploratory testing failed", { runId: run.id, error: errorMessage(e) });
    }
  }

  while (Date.now() < Math.min(window.to, stopAt) && !lease.lost) {
    const [next] = await db()<TestCase[]>`
      select ${caseColumns()} from test_cases
      where run_id = ${run.id} and agent = ${agent.id} and status = 'pending'
      order by case priority when 'high' then 0 when 'medium' then 1 else 2 end, seq
      limit 1`;

    if (!next) {
      await setActivity(run.id, agent.id, `${agent.name} · Designing ${agent.testType.toLowerCase()}`);
      const minutesLeft = (window.to - Date.now()) / 60_000;
      if (minutesLeft < 0.5) return; // too little time to run a new batch; don't pay to plan tests nobody runs
      const count = Math.round(Math.min(MAX_BATCH, Math.max(MIN_BATCH, minutesLeft * CASES_PER_MINUTE)));
      const drafts = await planWithRetry({ run, agent, pages, strategy, existing: await listCases(run.id), count, stopAt: Math.min(window.to, stopAt) });
      if (drafts.length === 0) return; // nothing left to test: the next agent starts early
      await insertCases(run.id, agent.id, drafts);
      continue;
    }

    await setActivity(run.id, agent.id, `${agent.name} · Testing: ${next.title}`);
    await withRunLease(run.id, lease.token, async (sql) => { await sql`update test_cases set status = 'running' where id = ${next.id}`; });
    const r = await executeCase({ browser, run, testCase: next, stopAt: Math.min(window.to, stopAt, Date.now() + 120_000) });
    if (!r) {
      // The shift ended mid-test: leave it as "not reached" rather than a false result.
      await withRunLease(run.id, lease.token, async (sql) => { await sql`update test_cases set status = 'pending' where id = ${next.id}`; });
      return;
    }
    await withRunLease(run.id, lease.token, async (sql) => { await sql`
      update test_cases set
        status = ${r.status},
        actual = ${r.actual},
        severity = ${r.severity},
        actions = ${json(r.actions)},
        failure_assertion = ${r.failedAssertion ? json(r.failedAssertion) : null},
        scripted = ${r.scripted},
        screenshot = ${r.screenshot},
        finished_at = now()
      where id = ${next.id}`; });
  }
}

/** The whole pipeline: map the site, then Dev → Staging → UAT → Prod, each in its share of the shift. */
/** Tests the site's documented read-only API. Stored once per shift; a resumed shift skips it. */
async function runApiPhase(run: Run, stopAt: number): Promise<void> {
  const [{ done }] = await db()<{ done: boolean }[]>`select exists (select 1 from api_checks where run_id = ${run.id}) as done`;
  if (done) return;
  await setActivity(run.id, "staging", "Staging agent · API checks");
  const until = Date.now() + Math.max(0, stopAt - Date.now()) * API_SHARE;
  // Writes need an approved test environment and a verified domain. The gate is checked here, not assumed.
  const writeGate = await checkTestEnvironment(run.url, "writes", emailKey(run.email));
  const { specUrl, rows, latency } = await runApiChecks(new URL(run.url), until, run.api_collection ?? [], { writesEnabled: writeGate.ok });
  await withRunLease(run.id, lease.token, async (sql) => {
    await sql`update runs set api_spec_url = ${specUrl}, api_latency = ${latency ? json(latency) : null} where id = ${run.id}`;
    for (const row of rows) {
      await sql`insert into api_checks (run_id, method, path, status_code, latency_ms, latency_p95_ms, skipped_reason, passed, severity, checks, chained_from)
        values (${run.id}, ${row.method}, ${row.path}, ${row.statusCode}, ${row.latencyMs}, ${row.latencyP95Ms}, ${row.skippedReason}, ${row.passed}, ${row.severity}, ${json(row.checks as unknown as object)}, ${row.chainedFrom})`;
    }
  });
  log("info", "API checks stored", { runId: run.id, operations: rows.length, spec: Boolean(specUrl) });
}

async function runShift(run: Run, browser: Browser, stopAt: number, engines: Map<EngineId, Browser>): Promise<void> {
  const start = run.started_at?.getTime() ?? Date.now();

  let pages = run.site_map;
  if (!pages) {
    await setActivity(run.id, "dev", "Dev agent · Mapping your site");
    pages = await crawlSite(browser, run.url, {
      maxPages: run.is_trial ? MAX_TRIAL_CRAWL_PAGES : MAX_CRAWL_PAGES,
      until: Date.now() + (stopAt - start) * 0.12,
    });
    await withRunLease(run.id, lease.token, async (sql) => { await sql`update runs set site_map = ${json(pages!)} where id = ${run.id}`; });
  }
  let strategy = run.strategy;
  if (!strategy) {
    await setActivity(run.id, "dev", "Dev agent · Writing the test strategy");
    try {
      strategy = await writeStrategy(run, pages, stopAt);
      await withRunLease(run.id, lease.token, async (sql) => { await sql`update runs set strategy = ${json(strategy!)} where id = ${run.id}`; });
    } catch (e) {
      // Planning still works without a strategy, just with less coverage tracking.
      log("error", "Strategy failed", { runId: run.id, error: errorMessage(e) });
    }
  }
  // API checks run before the browser agents, so their time comes out of the agents' share, not on top of it.
  try {
    await runApiPhase(run, stopAt);
  } catch (e) {
    if (e instanceof LeaseLostError) throw e;
    log("error", "API phase failed", { runId: run.id, error: errorMessage(e) });
  }
  // A crashed worker may have left a case half-run.
  await withRunLease(run.id, lease.token, async (sql) => { await sql`update test_cases set status = 'pending' where run_id = ${run.id} and status = 'running'`; });

  // Agents share the time left after mapping and strategy, so setup never eats one agent's slot.
  // A resumed shift keeps its original windows (measured from the shift start).
  const testingStart = await withRunLease(run.id, lease.token, async (sql) => {
    const [saved] = await sql<{ testing_started_at: Date }[]>`update runs set testing_started_at = coalesce(testing_started_at, now()) where id = ${run.id} returning testing_started_at`;
    return saved.testing_started_at.getTime();
  });
  const windows = agentWindows(testingStart, stopAt);
  for (const window of windows) {
    if (Date.now() >= window.to) continue; // phase already over (resumed run); Prod's window ends at stopAt
    try {
      await runPhase(run, browser, pages, strategy, window, stopAt, engines);
    } catch (e) {
      if (e instanceof LeaseLostError) throw e;
      // One agent failing (an API outage, a browser crash) must not cost the customer the other agents.
      log("error", "Agent phase failed", { runId: run.id, agent: window.agent.id, error: errorMessage(e) });
    }
  }
}

async function processRun(run: Run): Promise<void> {
  const deadline = run.deadline_at?.getTime() ?? Date.now();
  const shiftMs = run.minutes * MINUTES_PER_HOUR * 1_000;
  const stopAt = deadline - Math.min(2 * 60_000, shiftMs * 0.1); // leave time to write the report
  const heartbeat = setInterval(() => {
    db()`update runs set heartbeat_at = now() where id = ${run.id} and claim_token = ${lease.token} returning id`
      .then((rows) => {
        if (rows.length === 0) {
          lease.lost = true;
          void browser?.close().catch(() => undefined);
        }
      })
      .catch((e) => log("warn", "Heartbeat failed", { runId: run.id, error: errorMessage(e) }));
  }, HEARTBEAT_MS);
  let browser: Browser | null = null;
  let engines = new Map<EngineId, Browser>();
  let proxy: Awaited<ReturnType<typeof startEgressProxy>> | null = null;
  log("info", "Shift started", { runId: run.id, plan: run.plan, minutes: run.minutes, trial: run.is_trial });

  try {
    const [{ spent }] = await db()<{ spent: number }[]>`select coalesce(sum(cost_usd), 0)::float8 as spent from ai_usage where run_id = ${run.id}`;
    startBudget(run.id, new AiBudget(budgetLimit(run.plan, run.minutes, run.is_trial, run.quoted_total_cents), spent));
    proxy = await startEgressProxy();
    browser = await launchEngine("chromium", proxy.server);
    engines = new Map<EngineId, Browser>([["chromium", browser], ...(await launchExtraEngines(proxy.server))]);
    try {
      await runShift(run, browser, stopAt, engines);
    } catch (e) {
      if (e instanceof LeaseLostError) throw e;
      // Keep what was tested so far and still deliver a report.
      log("error", "Testing stopped early", { runId: run.id, error: errorMessage(e) });
    }
    await setActivity(run.id, "prod", "Writing your report");
    const cases = await listCases(run.id);
    const [latest] = await db()<Pick<Run, "strategy">[]>`select strategy from runs where id = ${run.id}`;
    const report = await writeReport({ run, cases, strategy: latest?.strategy ?? null, stopAt: deadline });
    const done = await db()`
      update runs set status = 'completed', report = ${json(report)}, activity = null, agent = null, completed_at = now()
      where id = ${run.id} and claim_token = ${lease.token} returning id`;
    if (done.length === 0) throw new LeaseLostError();
    log("info", "Shift completed", { runId: run.id, score: report.score, tests: cases.length });
    await emailReport(run);
  } catch (e) {
    if (e instanceof LeaseLostError) {
      // The new owner finishes the shift and sends the report; this worker just stops.
      log("warn", "Lost the claim on a shift; stopping", { runId: run.id });
      return;
    }
    log("error", "Shift failed", { runId: run.id, error: errorMessage(e) });
    await db()`
      update runs set status = 'failed', activity = null, agent = null,
        error = 'The tester hit an internal error and stopped. Contact support with the link to this page.'
      where id = ${run.id} and claim_token = ${lease.token}`.catch((err) =>
      log("error", "Could not mark shift failed", { runId: run.id, error: errorMessage(err) }),
    );
  } finally {
    clearInterval(heartbeat);
    await browser?.close().catch(() => undefined);
    for (const extra of engines.values()) await extra.close().catch(() => undefined);
    await proxy?.close().catch(() => undefined);
    endBudget(run.id);
  }
}

async function emailReport(run: Run): Promise<void> {
  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/runs/${run.id}`;
  const host = new URL(run.url).hostname;
  await sendEmail({
    to: run.email,
    subject: `Your QA report for ${host} is ready`,
    text: `Your TestShift QA shift on ${host} has finished.\n\nRead the report and download the test suite:\n${link}`,
  });
}

async function main(): Promise<void> {
  if (!Number.isFinite(MINUTES_PER_HOUR) || MINUTES_PER_HOUR <= 0 || MINUTES_PER_HOUR > 60) throw new Error("Invalid SHIFT_MINUTES_PER_HOUR");
  budgetLimit("junior", 60, true);
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
    // processRun handles its own errors; this catch only guards the loop against the unexpected.
    if (run) {
      await processRun(run).catch((e) => log("error", "Unexpected worker error", { runId: run.id, error: errorMessage(e) }));
      continue;
    }
    // Idle: generate requirement tests for operators to review, then wait for the next shift.
    const handled = await processRequirementRequest().catch((e) => {
      log("error", "Requirement request failed", { error: errorMessage(e) });
      return false;
    });
    if (!handled) await new Promise((resolve) => setTimeout(resolve, IDLE_POLL_MS));
  }
}

void main();
