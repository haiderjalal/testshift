import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const route of ["/", "/hire", "/custom", "/admin/login", "/runs/11111111-1111-4111-8111-111111111111"]) {
      await page.goto(`http://127.0.0.1:3107${route}`);
      await page.waitForLoadState("networkidle");
      console.log(route, (await page.locator("body").ariaSnapshot()).slice(0, 6_000));
    }
    await page.screenshot({ path: "artifacts/qa/report.png", fullPage: true });
  } finally { await browser.close(); }
}
void main();
