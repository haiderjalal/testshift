import axe from "axe-core";
import { devices, type Browser, type BrowserContext, type Page } from "playwright";

import type { BrowserAction, SitePage } from "@/lib/db";
import { isPublicHost } from "@/lib/net";

declare global {
  interface Window {
    axe: typeof axe;
    __vitals?: { lcp: number | null; cls: number };
  }
}

const hostChecks = new Map<string, Promise<boolean>>();
const SKIP_LINK = /\.(pdf|zip|jpe?g|png|gif|svg|webp|mp4|mp3|dmg|exe)$/i;

export const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;

export async function openContext(browser: Browser, viewport: "desktop" | "mobile"): Promise<BrowserContext> {
  const context = await browser.newContext(
    viewport === "mobile" ? devices["Pixel 7"] : { viewport: { width: 1280, height: 800 } },
  );
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(30_000);
  // Block requests to private networks so a submitted URL can't reach internal services.
  // ponytail: Chromium re-resolves DNS after this check (rebinding window) and service workers bypass
  // routing; production workers must also run in a network-isolated container.
  await context.route("**/*", async (route) => {
    const { hostname } = new URL(route.request().url());
    let check = hostChecks.get(hostname);
    if (!check) {
      check = isPublicHost(hostname);
      hostChecks.set(hostname, check);
    }
    return (await check) ? route.continue() : route.abort("blockedbyclient");
  });
  return context;
}

/** Collects console errors, crashes and failed requests so each step can report what went wrong. */
export function watchPage(page: Page): { drain: () => string[] } {
  const events: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") events.push(`console error: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => events.push(`uncaught exception: ${e.message.slice(0, 300)}`));
  page.on("response", (r) => {
    if (r.status() >= 400) events.push(`HTTP ${r.status()} ${r.url().slice(0, 200)}`);
  });
  page.on("requestfailed", (r) => {
    const reason = r.failure()?.errorText ?? "failed";
    if (reason !== "net::ERR_ABORTED") events.push(`request failed (${reason}): ${r.url().slice(0, 200)}`);
  });
  return { drain: () => events.splice(0) };
}

/** Text view of the page for the model: URL, title, recent errors and the accessibility tree. */
export async function describePage(page: Page, events: string[]): Promise<string> {
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
    clip(tree, 8_000),
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

/** Breadth-first crawl of same-origin pages, recording load status and problems. */
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
  const context = await openContext(browser, "desktop");
  const page = await context.newPage();
  const { drain } = watchPage(page);

  try {
    for (let url = queue.shift(); url && pages.length < maxPages && Date.now() < until; url = queue.shift()) {
      drain();
      const { status, loadMs, issues } = await visit(page, url);
      const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href)).catch(() => []);
      for (const link of links) {
        const next = normalizeLink(link, origin);
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
      const outline = await page.locator("body").ariaSnapshot({ timeout: 5_000 }).catch(() => "");
      pages.push({
        url,
        title: await page.title().catch(() => ""),
        status,
        loadMs,
        outline: clip(outline, 1_500),
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
  urls: string[],
  { vitals, until }: { vitals: boolean; until: number },
): Promise<PageAudit[]> {
  const context = await openContext(browser, "desktop");
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
  const { drain } = watchPage(page);
  const audits: PageAudit[] = [];
  try {
    for (const url of urls) {
      if (Date.now() > until) break;
      drain();
      const result = await visit(page, url);
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

/** Runs axe-core's WCAG 2 A/AA rules on each page for the UAT agent. */
export async function accessibilityAudit(browser: Browser, urls: string[], until: number): Promise<AccessibilityResult[]> {
  const context = await openContext(browser, "desktop");
  const page = await context.newPage();
  const results: AccessibilityResult[] = [];
  try {
    for (const url of urls) {
      if (Date.now() > until) break;
      await visit(page, url);
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
    }
  } finally {
    await context.close();
  }
  return results;
}
