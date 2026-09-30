import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

async function main() {
  const base = "http://127.0.0.1:3107";
  const http = [];
  for (const path of ["/", "/hire", "/custom"]) {
    await fetch(base + path);
    const samples: number[] = [];
    let errors = 0;
    for (let batch = 0; batch < 5; batch++) await Promise.all(Array.from({ length: 4 }, async () => {
      const start = performance.now(); const response = await fetch(base + path); await response.arrayBuffer();
      samples.push(performance.now() - start); if (response.status !== 200) errors++;
    }));
    samples.sort((a, b) => a - b);
    http.push({ path, requests: samples.length, concurrency: 4, errors, p50ms: Math.round(samples[10]), p95ms: Math.round(samples[18]) });
  }
  const browser = await chromium.launch();
  const pages = [];
  try {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
      await page.addInitScript(() => {
        window.__vitals = { lcp: null, cls: 0 };
        new PerformanceObserver((list) => { const entry = list.getEntries().at(-1); if (entry && window.__vitals) window.__vitals.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      });
      await page.goto(base); await page.waitForLoadState("networkidle");
      pages.push({ viewport, ...await page.evaluate(() => {
        const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        return { lcpMs: window.__vitals?.lcp, domContentLoadedMs: navigation.domContentLoadedEventEnd,
          resourceTransferBytes: resources.reduce((n, r) => n + r.transferSize, 0), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      }) });
      await page.close();
    }
  } finally { await browser.close(); }
  const report = { generatedAt: new Date().toISOString(), environment: "Local production build, warm HTTP requests, no network/CPU throttling; not a production capacity or field-vitals measurement", http, pages };
  await mkdir("artifacts/qa", { recursive: true }); await writeFile("artifacts/qa/performance.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
void main();
