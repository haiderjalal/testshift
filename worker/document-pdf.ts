import type { Browser } from "playwright";

const FOOTER =
  '<div style="width:100%;font-size:8px;color:#6b7280;padding:0 15mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif">' +
  "<span>TestShift</span><span><span class=\"pageNumber\"></span> / <span class=\"totalPages\"></span></span></div>";

/**
 * Prints the document's HTML to an A4 PDF. Scripts are off and every request is aborted: the markup holds text from
 * the customer's site, and none of it may load anything while the file is made.
 */
export async function renderPdf(browser: Browser, html: string): Promise<Buffer> {
  const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block", acceptDownloads: false });
  try {
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: FOOTER,
      margin: { top: "16mm", bottom: "18mm", left: "15mm", right: "15mm" },
    });
  } finally {
    await context.close().catch(() => undefined);
  }
}
