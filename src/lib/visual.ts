/** Screenshot comparison rules. Pure: the captures and storage live in worker/visual.ts. */

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/** Pixels whose colour differs by more than this (0 to 1) count as changed. Below it is anti-aliasing noise. */
const COLOUR_THRESHOLD = 0.1;
/** More than this share of changed pixels is a visual change worth reporting. */
export const CHANGED_RATIO_LIMIT = 0.001;
/** Above this share the page is clearly different, not just moved by a few pixels. */
export const CHANGED_RATIO_MAJOR = 0.05;
/** Pages taller than this are not compared: a full-page capture that long is unreliable. */
export const MAX_PAGE_HEIGHT = 4_000;

export type VisualOutcome = "match" | "changed" | "size-changed";

export interface VisualComparison {
  outcome: VisualOutcome;
  changedPixels: number;
  changedRatio: number;
  /** The highlighted difference, as PNG. Null when the sizes differ and no pixel comparison was made. */
  diffPng: Buffer | null;
  width: number;
  height: number;
}

export function decodePng(bytes: Buffer): { width: number; height: number } {
  const png = PNG.sync.read(bytes);
  return { width: png.width, height: png.height };
}

/** Compares a current capture with its approved baseline, pixel by pixel. */
export function compareScreenshots(baseline: Buffer, current: Buffer): VisualComparison {
  const a = PNG.sync.read(baseline);
  const b = PNG.sync.read(current);
  if (a.width !== b.width || a.height !== b.height) {
    return { outcome: "size-changed", changedPixels: 0, changedRatio: 1, diffPng: null, width: b.width, height: b.height };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const changedPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: COLOUR_THRESHOLD, includeAA: false });
  const total = a.width * a.height;
  const changedRatio = total === 0 ? 0 : changedPixels / total;
  return {
    outcome: changedRatio > CHANGED_RATIO_LIMIT ? "changed" : "match",
    changedPixels,
    changedRatio,
    diffPng: changedPixels > 0 ? PNG.sync.write(diff) : null,
    width: a.width,
    height: a.height,
  };
}

/** Severity follows how much of the page changed. Small changes are minor; large ones are major. */
export function visualSeverity(comparison: VisualComparison): "major" | "minor" | null {
  if (comparison.outcome === "match") return null;
  if (comparison.outcome === "size-changed" || comparison.changedRatio > CHANGED_RATIO_MAJOR) return "major";
  return "minor";
}
