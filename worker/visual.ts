import { randomUUID } from "node:crypto";

import type postgres from "postgres";
import type { Browser } from "playwright";

import { db } from "@/lib/db";
import type { ImageStore } from "@/lib/image-store";
import { errorMessage, log } from "@/lib/log";
import { compareScreenshots, decodePng, visualSeverity, type VisualComparison } from "@/lib/visual";

import { captureScreenshots } from "./browser";

/** Pages per shift that get a visual comparison. Each page costs one capture per viewport. */
export const MAX_VISUAL_PAGES = 5;

export type Viewport = "desktop" | "mobile";

export interface VisualCheck {
  title: string;
  url: string;
  viewport: Viewport;
  /** null means blocked: not compared yet, or not possible on this page. */
  passed: boolean | null;
  severity: "major" | "minor" | null;
  steps: string[];
  expected: string;
  actual: string;
}

type LeaseWrite = <T>(write: (sql: postgres.TransactionSql) => Promise<T>) => Promise<T>;

export interface VisualInput {
  runId: string;
  browser: Browser;
  siteUrl: string;
  urls: string[];
  viewports: Viewport[];
  until: number;
  /** Null when no image storage is configured on this deployment. */
  store: ImageStore | null;
  withLease: LeaseWrite;
}

const pathOf = (url: string): string => new URL(url).pathname || "/";
const EXPECTED = "The page matches its approved screenshot, allowing for anti-aliasing noise.";

function stepsFor(url: string, viewport: Viewport): string[] {
  return [
    `Open ${url} at ${viewport} width`,
    "Capture a full-page screenshot with animations frozen",
    "Compare it pixel by pixel with the approved screenshot",
  ];
}

/**
 * For each page and viewport: capture, compare with the approved baseline for that host, path and viewport,
 * store the images privately, and record a snapshot. A page with no approved baseline is blocked until someone
 * approves its screenshot on the report page. Nothing is passed on a guess.
 */
export async function runVisualChecks(input: VisualInput): Promise<VisualCheck[]> {
  const { runId, siteUrl, store } = input;
  if (!store) {
    log("warn", "Visual comparison skipped: image storage is not configured", { runId });
    return [{
      title: "Visual comparison of pages",
      url: siteUrl,
      viewport: "desktop",
      passed: null,
      severity: null,
      steps: [],
      expected: EXPECTED,
      actual: "Visual comparison is not available right now.",
    }];
  }

  const [{ done }] = await db()<{ done: boolean }[]>`select exists (select 1 from visual_snapshots where run_id = ${runId}) as done`;
  if (done) return [];

  const host = new URL(siteUrl).hostname;
  const checks: VisualCheck[] = [];
  for (const viewport of input.viewports) {
    const captures = await captureScreenshots(input.browser, siteUrl, input.urls.slice(0, MAX_VISUAL_PAGES), viewport, input.until);
    for (const capture of captures) {
      const url = capture.url;
      if (!capture.png) {
        checks.push({ title: `${pathOf(url)} can be captured (${viewport})`, url, viewport, passed: null, severity: null, steps: stepsFor(url, viewport), expected: EXPECTED, actual: capture.skipped ?? "No screenshot was taken." });
        continue;
      }
      try {
        checks.push(await compareCapture({ ...input, store, host, url, viewport, png: capture.png }));
      } catch (e) {
        log("error", "Visual comparison failed for a page", { runId, error: errorMessage(e) });
        checks.push({ title: `${pathOf(url)} matches its approved screenshot (${viewport})`, url, viewport, passed: null, severity: null, steps: stepsFor(url, viewport), expected: EXPECTED, actual: "The comparison could not finish for this page." });
      }
    }
  }
  return checks;
}

interface CaptureInput extends VisualInput {
  store: ImageStore;
  host: string;
  url: string;
  viewport: Viewport;
  png: Buffer;
}

async function compareCapture(c: CaptureInput): Promise<VisualCheck> {
  const path = pathOf(c.url);
  const title = `${path} matches its approved screenshot (${c.viewport})`;
  const snapshotId = randomUUID();
  const currentKey = `runs/${c.runId}/${snapshotId}.png`;
  const { width, height } = decodePng(c.png);
  await c.store.put(currentKey, c.png);

  const [baseline] = await db()<{ storage_key: string }[]>`
    select storage_key from visual_baselines where host = ${c.host} and path = ${path} and viewport = ${c.viewport}`;
  const approved = baseline ? await c.store.get(baseline.storage_key) : null;

  if (!baseline || !approved) {
    await record(c, snapshotId, { status: "no_baseline", currentKey, baselineKey: null, diffKey: null, ratio: null, width, height });
    return {
      title,
      url: c.url,
            viewport: c.viewport,
      passed: null,
      severity: null,
      steps: stepsFor(c.url, c.viewport),
      expected: EXPECTED,
      actual: "No approved screenshot yet. Approve this screenshot on the report page, and future shifts will compare against it.",
    };
  }

  const comparison = compareScreenshots(approved, c.png);
  const diffKey = comparison.diffPng ? `runs/${c.runId}/${snapshotId}-diff.png` : null;
  if (comparison.diffPng && diffKey) await c.store.put(diffKey, comparison.diffPng);
  await record(c, snapshotId, {
    status: comparison.outcome === "size-changed" ? "size_changed" : comparison.outcome,
    currentKey,
    baselineKey: baseline.storage_key,
    diffKey,
    ratio: comparison.changedRatio,
    width,
    height,
  });
  return {
    title,
    url: c.url,
        viewport: c.viewport,
    passed: comparison.outcome === "match",
    severity: comparison.outcome === "match" ? null : visualSeverity(comparison),
    steps: stepsFor(c.url, c.viewport),
    expected: EXPECTED,
    actual: describe(comparison, approved),
  };
}

function describe(comparison: VisualComparison, approved: Buffer): string {
  if (comparison.outcome === "match") return "Matches the approved screenshot.";
  if (comparison.outcome === "size-changed") {
    return `The page height changed from ${decodePng(approved).height} px to ${comparison.height} px. Review the screenshots on the report page.`;
  }
  return `${(comparison.changedRatio * 100).toFixed(2)}% of pixels changed. Review the highlighted difference on the report page.`;
}

interface SnapshotRecord {
  status: "no_baseline" | "match" | "changed" | "size_changed";
  currentKey: string;
  baselineKey: string | null;
  diffKey: string | null;
  ratio: number | null;
  width: number;
  height: number;
}

async function record(c: CaptureInput, snapshotId: string, s: SnapshotRecord): Promise<void> {
  await c.withLease(async (sql) => {
    await sql`
      insert into visual_snapshots (id, run_id, host, path, viewport, status, storage_key, baseline_key, diff_key, changed_ratio, width, height)
      values (${snapshotId}, ${c.runId}, ${c.host}, ${pathOf(c.url)}, ${c.viewport}, ${s.status}, ${s.currentKey}, ${s.baselineKey}, ${s.diffKey}, ${s.ratio}, ${s.width}, ${s.height})`;
  });
}
