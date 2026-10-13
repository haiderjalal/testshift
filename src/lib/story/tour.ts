import { scrollToTarget } from "@/lib/motion/lenis";

import { metrics } from "./sceneState";

/** Where within a stop's share of the scroll the page rests when the visitor picks that stop. */
const STOP_REST = 0.3;

/**
 * Scrolls a pinned tour to one of its stops, so tabs and keyboard shortcuts can drive a scroll-driven scene.
 * Returns false when the chapter is not pinned right now (small screens, reduced motion), so the caller can
 * simply select the stop instead.
 */
export function scrollToTourStop(chapterId: string, stop: number, stops: number): boolean {
  const pin = metrics.get(chapterId)?.pin;
  if (!pin) return false;
  const progress = (stop + STOP_REST) / stops;
  scrollToTarget(pin.top - pin.stickyTop + progress * (pin.height - pin.stageHeight), { offset: 0, duration: 1.3 });
  return true;
}
