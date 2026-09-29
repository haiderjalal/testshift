import { devices, type Browser, type BrowserContext, type Page } from "playwright";

import type { BrowserAction, SitePage } from "@/lib/db";
import { isPublicHost } from "@/lib/net";

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

/** Breadth-first crawl of same-origin pages, recording load status and problems for smoke tests. */
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
      const started = Date.now();
      let status = 0;
      const issues: string[] = [];
      try {
        status = (await page.goto(url, { waitUntil: "load" }))?.status() ?? 0;
      } catch (e) {
        issues.push(`could not load: ${(e as Error).message.split("\n")[0]}`);
      }
      const loadMs = Date.now() - started;
      // SPAs render after load; give them a moment before reading links.
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

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
