import assert from "node:assert/strict";
import { chromium } from "playwright";
import { assertReadable, openContext, registerEgressBrowser } from "../worker/browser";
import { startEgressProxy } from "../worker/egress";

// Optional connectivity smoke check: set QA_PUBLIC_SMOKE_URL to a public page you own.
async function main() {
  const target = process.env.QA_PUBLIC_SMOKE_URL;
  if (!target || !/^https?:\/\//.test(target)) throw new Error("Set QA_PUBLIC_SMOKE_URL to an authorized public HTTP(S) test page.");
  const proxy = await startEgressProxy();
  const browser = await chromium.launch({ proxy: { server: proxy.server }, args: ["--proxy-bypass-list=<-loopback>", "--disable-quic"] });
  registerEgressBrowser(browser, proxy.server);
  try {
    for (const url of [target]) {
      const context = await openContext(browser, "desktop", url);
      try {
        const page = await context.newPage();
        const response = await page.goto(url, { waitUntil: "domcontentloaded" });
        await assertReadable(page);
        assert.equal(response?.status(), 200);
        const body = await page.locator("body").innerText();
        assert.ok(body.trim().length > 0, `${url}: response has no readable text`);
        console.log(`${url}: allowed through checked proxy`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); await proxy.close(); }
}
void main();
