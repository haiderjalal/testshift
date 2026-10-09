import axe from "axe-core";
import { devices, type Browser, type BrowserContext, type Page } from "playwright";

import type { CompatibilityResult, EngineId, EngineOutcome } from "@/lib/compat";
import type { BrowserAction, SitePage } from "@/lib/db";
import { isPrivateIp, isPublicHost, siteKey } from "@/lib/net";
import { exactTextPattern, scopedUrl, urlMatches, validateAction } from "@/lib/qa";

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
  if (hostChecks.size >= 1_000) hostChecks.delete(hostChecks.keys().next().value!);
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
const guards = new WeakMap<BrowserContext, { tainted: boolean; pending: Set<Promise<void>>; origin: string; blocked: string | null }>();
const egressProxies = new WeakMap<Browser, { ip: string; port: number }>();
/** Only called for a browser launched through our DNS-pinning proxy. */
export function registerEgressBrowser(browser: Browser, proxyUrl: string): void {
  const proxy = new URL(proxyUrl);
  egressProxies.set(browser, { ip: proxy.hostname, port: Number(proxy.port) });
}

function closeAt(context: BrowserContext, until: number): ReturnType<typeof setTimeout> {
  return setTimeout(() => { void context.close().catch(() => undefined); }, Math.max(1, until - Date.now()));
}

/** Throws PrivateNetworkError if anything in this page's context came from a private address. */
export async function assertReadable(page: Page): Promise<void> {
  const guard = guards.get(page.context());
  if (!guard) return;
  await Promise.all([...guard.pending]);
  if (guard.tainted) throw new PrivateNetworkError();
  if (guard.blocked) throw new BrowserPolicyError(guard.blocked);
  if (!scopedUrl(page.url(), guard.origin)) throw new BrowserPolicyError("Navigation left the booked origin.");
}
export class BrowserPolicyError extends Error {}
const SKIP_LINK = /\.(pdf|zip|jpe?g|png|gif|svg|webp|mp4|mp3|dmg|exe)$/i;

export const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;

// Accessibility-tree lines worth showing the planner: things a test can act on or check.
const KEEP_LINE =
  /^\s*- (heading|link|button|textbox|searchbox|checkbox|radio|combobox|listbox|option|switch|slider|spinbutton|tab|menuitem|dialog|alert|status|img|form|paragraph|text|cell|columnheader|\/url)\b/;
const MAX_TEXT_LINE = 90;

/** Bounded accessibility evidence for planning; omitted content remains a coverage limitation. */
export function compactOutline(tree: string, max = 3_000): string {
  const lines = tree
    .split("\n")
    .filter((line) => KEEP_LINE.test(line))
    .map((line) => {
      const depth = Math.floor((line.length - line.trimStart().length) / 2);
      const body = line.trim();
      // Never truncate actionable names: the planner copies them into exact selectors.
      const prose = /^- (paragraph|text)\b/.test(body);
      return `${" ".repeat(Math.min(depth, 4))}${prose && body.length > MAX_TEXT_LINE ? `${body.slice(0, MAX_TEXT_LINE)}…` : body}`;
    });
  return clip(lines.join("\n"), max);
}

/** Native constraints are often missing from an accessibility tree but define useful boundary tests. */
export async function formConstraints(page: Page): Promise<string> {
  await assertReadable(page);
  const fields = await page.locator("input:not([type=hidden]),textarea,select").evaluateAll((elements) => elements.slice(0, 40).map((element) => {
    const field = element as HTMLInputElement;
    const attrs: Record<string, string> = {};
    for (const key of ["type", "required", "min", "max", "minlength", "maxlength", "pattern", "disabled", "readonly", "autocomplete"]) {
      const value = field.getAttribute(key);
      if (value !== null) attrs[key] = value.slice(0, 120);
    }
    return { label: [...(field.labels ?? [])].map((l) => l.textContent?.trim()).join(" ").slice(0, 120), id: field.id.slice(0, 120), ...attrs };
  })).catch(() => []);
  return fields.length ? `Observed field constraints: ${JSON.stringify(fields)}` : "";
}

/**
 * Site map for the model. Lines that appear on every page (header, nav, footer) are listed once under
 * "On every page" instead of being repeated per page, which is often the largest saving on real sites.
 */
export function formatSiteMap(pages: SitePage[]): string {
  const counts = new Map<string, number>();
  for (const p of pages) for (const line of new Set(p.outline.split("\n"))) counts.set(line, (counts.get(line) ?? 0) + 1);
  const shared = pages.length >= 3 ? new Set([...counts].filter(([line, n]) => line.trim() && n === pages.length).map(([l]) => l)) : new Set();
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
  const origin = new URL(siteUrl).origin;
  const context = await browser.newContext({
    ...(viewport === "mobile" ? devices["Pixel 7"] : { viewport: { width: 1280, height: 800 } }),
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(30_000);

  const guard = { tainted: false, pending: new Set<Promise<void>>(), origin, blocked: null as string | null };
  guards.set(context, guard);
  context.on("response", (response) => {
    if (response.headers()["x-testshift-network-blocked"] === "1") guard.blocked = "The browser network policy refused this destination.";
    const pending = response
        .serverAddr()
        .then((addr) => {
          const proxy = egressProxies.get(browser);
          if (addr && isPrivateIp(addr.ipAddress) && !(proxy && addr.ipAddress === proxy.ip && addr.port === proxy.port)) guard.tainted = true;
        })
        .catch(() => undefined);
    guard.pending.add(pending);
    void pending.finally(() => guard.pending.delete(pending));
  });

  await context.route("**/*", async (route) => {
    const request = route.request();
    const { hostname, protocol } = new URL(request.url());
    if (protocol !== "http:" && protocol !== "https:") return route.abort("blockedbyclient");
    if (request.isNavigationRequest() && !request.frame().parentFrame() && !scopedUrl(request.url(), origin)) {
      guard.blocked = "The site navigated outside the booked origin; that destination is out of scope.";
      return route.abort("blockedbyclient");
    }
    if (request.method() === "DELETE") {
      guard.blocked = "A destructive DELETE request was blocked by the testing policy.";
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
  const add = (event: string) => { if (events.length < 100 && !events.includes(event)) events.push(event); };
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
      add(`${m.location().url ? tag(m.location().url) : ""}console error: ${m.text().slice(0, 300)}`);
    }
  });
  page.on("pageerror", (e) => add(`uncaught exception: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 400) add(`${tag(r.url())}HTTP ${r.status()} ${r.url().slice(0, 200)}`);
  });
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "failed";
    if (reason === "net::ERR_ABORTED" || reason.startsWith("net::ERR_BLOCKED_BY_CLIENT")) return;
    add(`${tag(r.url())}request failed (${reason}): ${r.url().slice(0, 200)}`);
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

export async function perform(page: Page, step: BrowserAction): Promise<void> {
  validateAction(step);
  const { action, selector, value = "" } = step;
  const guard = guards.get(page.context());
  if (guard && page.url() !== "about:blank") await assertReadable(page);
  if (action === "goto" && guard && !scopedUrl(value, guard.origin)) throw new BrowserPolicyError("Navigation must stay on the booked origin.");
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
      await (selector ? target().filter({ hasText: new RegExp(exactTextPattern(value)) }) : page.getByText(value, { exact: true }))
        .waitFor({ state: "visible", timeout: 5_000 });
      break;
    case "expect_url":
      await page.waitForURL((u) => urlMatches(u.href, value), { timeout: 5_000 });
      break;
    case "expect_hidden":
      await (selector ? target() : page.getByText(value, { exact: true })).waitFor({ state: "hidden", timeout: 5_000 });
      break;
    case "expect_valid":
    case "expect_enabled":
    case "expect_checked":
    case "expect_count": {
      const field = target();
      const deadline = Date.now() + 5_000;
      for (;;) {
        const actual = action === "expect_count" ? await field.count()
          : action === "expect_enabled" ? await field.isEnabled()
            : action === "expect_checked" ? await field.isChecked()
              : await field.evaluate((element) => {
                if (!element.matches("input,textarea,select,form")) throw new Error("Validity checks require a form control or form");
                return element.matches(":valid");
              });
        if (actual === (action === "expect_count" ? Number(value) : value === "true")) break;
        if (Date.now() >= deadline) throw new Error(`${action}: expected ${value}, observed ${actual}`);
        await page.waitForTimeout(100);
      }
      break;
    }
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
  await assertReadable(page);
}

export function normalizeLink(href: string, origin: string): string | null {
  try {
    const u = new URL(href);
    if (!/^#(?:\/|!)/.test(u.hash)) u.hash = "";
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
    return scopedUrl(u.href, origin) && !SKIP_LINK.test(u.pathname) ? u.href : null;
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
  const deadline = closeAt(context, until);
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
      if (status === 0 || [401, 403, 429].includes(status)) {
        pages.push({ url, title: "", status, loadMs, outline: "", issues: [...issues, ...drain()] });
        continue;
      }
      const links = await page.$$eval("a[href]", (as) => as.slice(0, 500).map((a) => (a as HTMLAnchorElement).href)).catch(() => []);
      for (const link of links) {
        const next = normalizeLink(link, origin);
        if (next && !seen.has(next) && seen.size < 500) {
          seen.add(next);
          queue.push(next);
        }
      }
      const outline = [compactOutline(await page.locator("body").ariaSnapshot({ timeout: 5_000 }).catch(() => "")), await formConstraints(page)].filter(Boolean).join("\n");
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
    clearTimeout(deadline);
    await context.close().catch(() => undefined);
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
  const deadline = closeAt(context, until);
  if (vitals) {
    await context.addInitScript(() => {
      window.__vitals = { lcp: null, cls: 0 };
      const record = window.__vitals;
      let sessionStart = 0;
      let sessionLast = 0;
      let sessionValue = 0;
      try {
        new PerformanceObserver((list) => {
          const last = list.getEntries().at(-1);
          if (last) record.lcp = last.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[]) {
            if (e.hadRecentInput) continue;
            if (sessionValue && e.startTime - sessionLast < 1_000 && e.startTime - sessionStart < 5_000) sessionValue += e.value;
            else { sessionStart = e.startTime; sessionValue = e.value; }
            sessionLast = e.startTime;
            record.cls = Math.max(record.cls, sessionValue);
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
    clearTimeout(deadline);
    await context.close().catch(() => undefined);
  }
  return audits;
}

export interface AccessibilityResult {
  url: string;
  blocked?: string;
  violations: { id: string; impact: string | null; help: string; count: number }[];
}

/** WCAG 2.2 AA is the current standard; the 2.1 and 2.0 criteria it builds on are included. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TAB_STOPS = 25;
const FOCUS_EXAMPLES = 3;

/**
 * Keyboard users need to see where focus is. Tabs through the first stops and flags controls with no focus
 * outline or shadow. This is a heuristic: a focus style that only changes colour is not caught.
 */
export async function keyboardFocusProblems(page: Page): Promise<AccessibilityResult["violations"]> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const examples: string[] = [];
  let unseen = 0;
  for (let stop = 0; stop < TAB_STOPS; stop++) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return null;
      const style = getComputedStyle(el);
      const outlined = style.outlineStyle !== "none" && style.outlineWidth !== "0px";
      const text = (el.getAttribute("aria-label") ?? el.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 50);
      return { visible: outlined || style.boxShadow !== "none", label: `<${el.tagName.toLowerCase()}>${text ? ` "${text}"` : ""}` };
    });
    if (!focus) break; // focus left the page: the end of the tab order
    if (!focus.visible) {
      unseen++;
      if (examples.length < FOCUS_EXAMPLES) examples.push(focus.label);
    }
  }
  if (unseen === 0) return [];
  return [
    {
      id: "keyboard-focus-visible",
      impact: "serious",
      help: `Focus is not visible on ${unseen} of the first ${TAB_STOPS} keyboard stops (for example ${examples.join(", ")})`,
      count: unseen,
    },
  ];
}

/**
 * Loads the same pages in every engine and records what each one saw, so the verdicts compare like with like.
 * Each engine gets its own guarded context, so the network policy is identical across engines.
 */
export async function compatibilityAudit(
  engines: Map<EngineId, Browser>,
  siteUrl: string,
  urls: string[],
  until: number,
): Promise<CompatibilityResult[]> {
  const byUrl = new Map<string, EngineOutcome[]>(urls.map((url) => [url, []]));
  for (const [engine, browser] of engines) {
    if (Date.now() > until) break;
    const context = await openContext(browser, "desktop", siteUrl);
    const deadline = closeAt(context, until);
    try {
      const page = await context.newPage();
      const { drain } = watchPage(page, siteUrl);
      for (const url of urls) {
        if (Date.now() > until) break;
        drain();
        const result = await visit(page, url);
        const readable = await assertReadable(page).then(() => true, () => false);
        const blocked = guards.get(context)?.blocked ?? (readable ? null : "The page could not be read safely.");
        byUrl.get(url)?.push({
          engine,
          status: result.status,
          ownIssues: splitIssues([...result.issues, ...drain()]).own,
          blocked,
        });
        if (!readable) break;
      }
    } finally {
      clearTimeout(deadline);
      await context.close().catch(() => undefined);
    }
  }
  return [...byUrl].map(([url, outcomes]) => ({ url, outcomes }));
}

/** Runs axe-core's WCAG 2.2 AA rules and a keyboard focus check on each page for the UAT agent. A page that can't be audited is skipped. */
export async function accessibilityAudit(
  browser: Browser,
  siteUrl: string,
  urls: string[],
  until: number,
): Promise<AccessibilityResult[]> {
  const context = await openContext(browser, "desktop", siteUrl);
  const deadline = closeAt(context, until);
  const page = await context.newPage();
  const results: AccessibilityResult[] = [];
  try {
    for (const url of urls) {
      if (Date.now() > until) break;
      const visitResult = await visit(page, url);
      if (visitResult.status < 200 || visitResult.status >= 400) {
        results.push({ url, violations: [], blocked: `HTTP ${visitResult.status || "no response"}: the intended page could not be audited.` });
        continue;
      }
      try {
        await assertReadable(page);
        // page.evaluate is not subject to the site's CSP, unlike injecting a <script> tag.
        await page.evaluate(axe.source);
        const violations = await page.evaluate(async () => {
          const report = await window.axe.run(document, {
            runOnly: { type: "tag", values: WCAG_TAGS },
            resultTypes: ["violations"],
          });
          return report.violations.map((v) => ({ id: v.id, impact: v.impact ?? null, help: v.help, count: v.nodes.length }));
        });
        const keyboard = await keyboardFocusProblems(page);
        results.push({ url, violations: [...violations, ...keyboard] });
      } catch (e) {
        results.push({ url, violations: [], blocked: "The automated accessibility audit could not finish on this page." });
        if (e instanceof PrivateNetworkError || e instanceof BrowserPolicyError) break;
        // Usually the page navigated mid-audit (redirect, consent wall); skip it rather than end the shift.
        continue;
      }
    }
  } finally {
    clearTimeout(deadline);
    await context.close().catch(() => undefined);
  }
  return results;
}
