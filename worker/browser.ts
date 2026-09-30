import axe from "axe-core";
import { devices, type Browser, type BrowserContext, type Page } from "playwright";

import type { BrowserAction, SitePage } from "@/lib/db";
import { isPrivateIp, isPublicHost, siteKey } from "@/lib/net";

declare global {
  interface Window {
    axe: typeof axe;
    __vitals?: { lcp: number | null; cls: number };
  }
}

// Host lookups are cached briefly: long enough to avoid a DNS query per request, short enough that a host
// can't resolve public once and stay allowed forever (DNS rebinding).
const HOST_CHECK_TTL_MS = 30_000;
const hostChecks = new Map<string, { at: number; check: Promise<boolean> }>();

function hostAllowed(hostname: string): Promise<boolean> {
  const cached = hostChecks.get(hostname);
  if (cached && Date.now() - cached.at < HOST_CHECK_TTL_MS) return cached.check;
  const check = isPublicHost(hostname);
  hostChecks.set(hostname, { at: Date.now(), check });
  return check;
}

/** Thrown when a page is (or was redirected) on a private network; its content must never be read. */
export class PrivateNetworkError extends Error {
  constructor() {
    super("The site sent the browser to a private network address, so the tester stopped for safety.");
  }
}

// Per context: did any response come from a private IP? Checked against the address Chromium actually
// connected to, which covers redirects (not seen by route handlers) and DNS rebinding.
const guards = new WeakMap<BrowserContext, { tainted: boolean; pending: Promise<void>[] }>();

/** Throws PrivateNetworkError if anything in this page's context came from a private address. */
export async function assertReadable(page: Page): Promise<void> {
  const guard = guards.get(page.context());
  if (!guard) return;
  await Promise.all(guard.pending.splice(0));
  if (guard.tainted) throw new PrivateNetworkError();
}
const SKIP_LINK = /\.(pdf|zip|jpe?g|png|gif|svg|webp|mp4|mp3|dmg|exe)$/i;

export const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;

// Accessibility-tree lines worth showing the planner: things a test can act on or check.
const KEEP_LINE =
  /^\s*- (heading|link|button|textbox|searchbox|checkbox|radio|combobox|listbox|option|switch|slider|spinbutton|tab|menuitem|dialog|alert|status|img|form|paragraph|text|cell|columnheader|\/url)\b/;
const MAX_TEXT_LINE = 90;

/** Shrinks an accessibility snapshot to its testable lines: roughly a third of the tokens, nothing a test needs lost. */
export function compactOutline(tree: string, max = 3_000): string {
  const lines = tree
    .split("\n")
    .filter((line) => KEEP_LINE.test(line))
    .map((line) => {
      const depth = Math.floor((line.length - line.trimStart().length) / 2);
      const body = line.trim();
      return `${" ".repeat(Math.min(depth, 4))}${body.length > MAX_TEXT_LINE ? `${body.slice(0, MAX_TEXT_LINE)}…` : body}`;
    });
  return clip(lines.join("\n"), max);
}

/**
 * Site map for the model. Lines that appear on most pages (header, nav, footer) are listed once under
 * "On every page" instead of being repeated per page, which is often the largest saving on real sites.
 */
export function formatSiteMap(pages: SitePage[]): string {
  const counts = new Map<string, number>();
  for (const p of pages) for (const line of new Set(p.outline.split("\n"))) counts.set(line, (counts.get(line) ?? 0) + 1);
  const shared = pages.length >= 3 ? new Set([...counts].filter(([, n]) => n >= pages.length * 0.6).map(([l]) => l)) : new Set();
  const sections = pages.map((p) => {
    const own = p.outline.split("\n").filter((l) => !shared.has(l)).join("\n");
    const issues = p.issues.length ? `\nIssues seen: ${p.issues.slice(0, 3).join("; ")}` : "";
    return `## ${p.url} (HTTP ${p.status}, ${(p.loadMs / 1000).toFixed(1)}s) ${p.title}\n${own || "(only shared elements)"}${issues}`;
  });
  return [shared.size ? `## On every page\n${[...shared].join("\n")}` : "", ...sections].filter(Boolean).join("\n\n");
}

/**
 * A fresh browser context for testing `siteUrl`. Defence in depth against SSRF; production workers must also
 * run with egress limited to the public internet:
 * - requests to hosts that resolve to private addresses are aborted;
 * - top-level navigation off the customer's site is aborted, so the tester stays on the site it was booked for;
 * - WebSockets get the same host check, and service workers (which bypass routing) are blocked;
 * - any response served from a private IP taints the context, and assertReadable() then refuses to read it.
 */
export async function openContext(browser: Browser, viewport: "desktop" | "mobile", siteUrl: string): Promise<BrowserContext> {
  const site = siteKey(new URL(siteUrl).hostname);
  const context = await browser.newContext({
    ...(viewport === "mobile" ? devices["Pixel 7"] : { viewport: { width: 1280, height: 800 } }),
    serviceWorkers: "block",
  });
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(30_000);

  const guard = { tainted: false, pending: [] as Promise<void>[] };
  guards.set(context, guard);
  context.on("response", (response) => {
    guard.pending.push(
      response
        .serverAddr()
        .then((addr) => {
          if (addr && isPrivateIp(addr.ipAddress)) guard.tainted = true;
        })
        .catch(() => undefined),
    );
  });

  await context.route("**/*", async (route) => {
    const request = route.request();
    const { hostname, protocol } = new URL(request.url());
    if (protocol !== "http:" && protocol !== "https:") return route.continue();
    if (request.isNavigationRequest() && !request.frame().parentFrame() && siteKey(hostname) !== site) {
      return route.abort("blockedbyclient");
    }
    return (await hostAllowed(hostname)) ? route.continue() : route.abort("blockedbyclient");
  });
  await context.routeWebSocket(/.*/, async (ws) => {
    if (await hostAllowed(new URL(ws.url()).hostname)) ws.connectToServer();
    else await ws.close({ code: 1008, reason: "blocked" });
  });
  return context;
}

/** Prefix for problems caused by other companies' services (analytics, ads, CDNs): noted, never a site bug. */
export const THIRD_PARTY = "[third-party] ";

/**
 * Collects console errors, crashes and failed requests so each step can report what went wrong.
 * Requests the tester itself blocked (private or unresolvable hosts, off-site navigation) are not the site's
 * fault and are left out; failures on other companies' domains are tagged THIRD_PARTY.
 */
export function watchPage(page: Page, siteUrl: string): { drain: () => string[] } {
  const site = siteKey(new URL(siteUrl).hostname);
  const events: string[] = [];
  const tag = (url: string) => {
    try {
      return siteKey(new URL(url).hostname) === site ? "" : THIRD_PARTY;
    } catch {
      return THIRD_PARTY;
    }
  };
  page.on("console", (m) => {
    // Chrome also logs a console error for every request the tester blocked; those aren't the site's fault.
    if (m.type() === "error" && !m.text().includes("ERR_BLOCKED_BY_CLIENT")) {
      events.push(`console error: ${m.text().slice(0, 300)}`);
    }
  });
  page.on("pageerror", (e) => events.push(`uncaught exception: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 400) events.push(`${tag(r.url())}HTTP ${r.status()} ${r.url().slice(0, 200)}`);
  });
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "failed";
    if (reason === "net::ERR_ABORTED" || reason.startsWith("net::ERR_BLOCKED_BY_CLIENT")) return;
    events.push(`${tag(r.url())}request failed (${reason}): ${r.url().slice(0, 200)}`);
  });
  return { drain: () => events.splice(0) };
}

/** Splits collected events into the site's own problems and third-party noise. */
export function splitIssues(events: string[]): { own: string[]; thirdParty: string[] } {
  return {
    own: events.filter((e) => !e.startsWith(THIRD_PARTY)),
    thirdParty: events.filter((e) => e.startsWith(THIRD_PARTY)).map((e) => e.slice(THIRD_PARTY.length)),
  };
}

/** Text view of the page for the model: URL, title, recent errors and the accessibility tree. */
export async function describePage(page: Page, events: string[]): Promise<string> {
  await assertReadable(page);
  const tree = await page
    .locator("body")
    .ariaSnapshot({ timeout: 5_000 })
    .catch((e: Error) => `(could not read the page: ${e.message})`);
  const title = await page.title().catch(() => "");
  return [
    `URL: ${page.url()}`,
    `Title: ${title}`,
    events.length ? `Errors since the last step:\n${events.join("\n")}` : "",
    "Page (accessibility tree):",
    clip(tree, 6_000),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function perform(page: Page, { action, selector, value = "" }: BrowserAction): Promise<void> {
  const target = () => {
    if (!selector) throw new Error(`"${action}" needs a selector`);
    return page.locator(selector);
  };
  switch (action) {
    case "goto":
      await page.goto(value);
      break;
    case "click":
      await target().click();
      break;
    case "dblclick":
      await target().dblclick();
      break;
    case "back":
      await page.goBack();
      break;
    case "reload":
      await page.reload();
      break;
    case "fill":
      await target().fill(value);
      break;
    case "press":
      await (selector ? target().press(value) : page.keyboard.press(value));
      break;
    case "select":
      await target().selectOption(value);
      break;
    case "hover":
      await target().hover();
      break;
    case "expect_visible":
      await target().waitFor({ state: "visible", timeout: 5_000 });
      break;
    case "expect_text":
      await (selector ? target().filter({ hasText: value }) : page.getByText(value))
        .first()
        .waitFor({ state: "visible", timeout: 5_000 });
      break;
    case "expect_url":
      await page.waitForURL((u) => u.href.includes(value), { timeout: 5_000 });
      break;
    case "expect_hidden":
      await (selector ? target() : page.getByText(value)).first().waitFor({ state: "hidden", timeout: 5_000 });
      break;
    case "expect_value": {
      const field = target();
      const deadline = Date.now() + 5_000;
      for (;;) {
        const current = await field.inputValue();
        if (current === value) break;
        if (Date.now() > deadline) throw new Error(`Expected value "${value}" but found "${current}"`);
        await page.waitForTimeout(200);
      }
      break;
    }
  }
  // Let any navigation the action triggered settle before the next snapshot.
  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
}

function normalizeLink(href: string, origin: string): string | null {
  try {
    const u = new URL(href);
    u.hash = "";
    return u.origin === origin && !SKIP_LINK.test(u.pathname) ? u.href : null;
  } catch {
    return null;
  }
}

interface Visit {
  status: number;
  loadMs: number;
  issues: string[];
  headers: Record<string, string>;
}

/** Loads one page and records its HTTP status, load time and the main document's response headers. */
async function visit(page: Page, url: string): Promise<Visit> {
  const started = Date.now();
  const issues: string[] = [];
  let status = 0;
  let headers: Record<string, string> = {};
  try {
    const response = await page.goto(url, { waitUntil: "load" });
    status = response?.status() ?? 0;
    headers = response?.headers() ?? {};
  } catch (e) {
    issues.push(`could not load: ${(e as Error).message.split("\n")[0]}`);
  }
  const loadMs = Date.now() - started;
  // SPAs render after load; give them a moment before reading the page.
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  return { status, loadMs, issues, headers };
}

/** Breadth-first crawl of same-origin pages, recording load status and problems. Stops if the site leads to a private network. */
export async function crawlSite(
  browser: Browser,
  startUrl: string,
  { maxPages, until }: { maxPages: number; until: number },
): Promise<SitePage[]> {
  const origin = new URL(startUrl).origin;
  const first = normalizeLink(startUrl, origin) ?? startUrl;
  const queue = [first];
  const seen = new Set(queue);
  const pages: SitePage[] = [];
  const context = await openContext(browser, "desktop", startUrl);
  const page = await context.newPage();
  const { drain } = watchPage(page, startUrl);

  try {
    for (let url = queue.shift(); url && pages.length < maxPages && Date.now() < until; url = queue.shift()) {
      drain();
      const { status, loadMs, issues } = await visit(page, url);
      try {
        await assertReadable(page);
      } catch (e) {
        if (!(e instanceof PrivateNetworkError)) throw e;
        pages.push({ url, title: "", status, loadMs, outline: "", issues: [e.message] });
        break;
      }
      const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href)).catch(() => []);
      for (const link of links) {
        const next = normalizeLink(link, origin);
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
      const outline = compactOutline(await page.locator("body").ariaSnapshot({ timeout: 5_000 }).catch(() => ""));
      pages.push({
        url,
        title: await page.title().catch(() => ""),
        status,
        loadMs,
        outline,
        issues: [...issues, ...drain()],
      });
    }
  } finally {
    await context.close();
  }
  return pages;
}

export interface PageAudit extends Visit {
  url: string;
  /** Largest Contentful Paint in ms and Cumulative Layout Shift, measured in the lab. Null if not measured. */
  lcpMs: number | null;
  cls: number | null;
}

/** Re-visits known pages for the Prod agent: fresh load status, errors, and optionally Core Web Vitals. */
export async function auditPages(
  browser: Browser,
  siteUrl: string,
  urls: string[],
  { vitals, until }: { vitals: boolean; until: number },
): Promise<PageAudit[]> {
  const context = await openContext(browser, "desktop", siteUrl);
  if (vitals) {
    await context.addInitScript(() => {
      window.__vitals = { lcp: null, cls: 0 };
      const record = window.__vitals;
      try {
        new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1);
          if (last) record.lcp = last.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[]) {
            if (!e.hadRecentInput) record.cls += e.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch {
        // Browsers without these entry types simply report no vitals.
      }
    });
  }
  const page = await context.newPage();
  const { drain } = watchPage(page, siteUrl);
  const audits: PageAudit[] = [];
  try {
    for (const url of urls) {
      if (Date.now() > until) break;
      drain();
      const result = await visit(page, url);
      const readable = await assertReadable(page).then(() => true, () => false);
      if (!readable) break;
      const measured = vitals ? await page.evaluate(() => window.__vitals ?? null).catch(() => null) : null;
      audits.push({
        url,
        ...result,
        issues: [...result.issues, ...drain()],
        lcpMs: measured?.lcp ?? null,
        cls: measured ? measured.cls : null,
      });
    }
  } finally {
    await context.close();
  }
  return audits;
}

export interface AccessibilityResult {
  url: string;
  violations: { id: string; impact: string | null; help: string; count: number }[];
}

/** Runs axe-core's WCAG 2 A/AA rules on each page for the UAT agent. A page that can't be audited is skipped. */
export async function accessibilityAudit(
  browser: Browser,
  siteUrl: string,
  urls: string[],
  until: number,
): Promise<AccessibilityResult[]> {
  const context = await openContext(browser, "desktop", siteUrl);
  const page = await context.newPage();
  const results: AccessibilityResult[] = [];
  try {
    for (const url of urls) {
      if (Date.now() > until) break;
      await visit(page, url);
      try {
        await assertReadable(page);
        // page.evaluate is not subject to the site's CSP, unlike injecting a <script> tag.
        await page.evaluate(axe.source);
        const violations = await page.evaluate(async () => {
          const report = await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
            resultTypes: ["violations"],
          });
          return report.violations.map((v) => ({ id: v.id, impact: v.impact ?? null, help: v.help, count: v.nodes.length }));
        });
        results.push({ url, violations });
      } catch (e) {
        if (e instanceof PrivateNetworkError) break;
        // Usually the page navigated mid-audit (redirect, consent wall); skip it rather than end the shift.
        continue;
      }
    }
  } finally {
    await context.close();
  }
  return results;
}
