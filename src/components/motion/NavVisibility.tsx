"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { scroll, subscribeToScroll } from "@/lib/motion/scrollState";

/** Scrolling less than this does not count as a direction change, so a trackpad's jitter does not flicker the header. */
const DEAD_ZONE_PX = 6;
/** The header stays put until the visitor has read this far down. */
const HIDE_AFTER_PX = 240;

/**
 * Slides the header away while reading down the page and brings it back on the first scroll up. It only sets
 * `<html data-nav>`; the CSS (`.site-header`) does the sliding, and keyboard focus inside the header keeps it
 * on screen. Not used for visitors who asked for reduced motion. Renders nothing.
 */
export function NavVisibility() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let last = window.scrollY;
    const stop = subscribeToScroll(() => {
      const delta = scroll.y - last;
      if (Math.abs(delta) < DEAD_ZONE_PX) return;
      root.dataset.nav = delta > 0 && scroll.y > HIDE_AFTER_PX ? "hidden" : "shown";
      last = scroll.y;
    });

    return () => {
      stop();
      delete root.dataset.nav;
    };
  }, [pathname]);

  return null;
}
