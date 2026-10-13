import type Lenis from "lenis";

let instance: Lenis | null = null;

/** Registers (or clears) the smooth-scroll instance. Only `SmoothScroll` calls this. */
export function setLenis(next: Lenis | null): void {
  instance = next;
}

interface ScrollOptions {
  offset?: number;
  duration?: number;
}

/**
 * Scrolls to an element or a document position. Uses Lenis when it is running; otherwise (reduced motion,
 * before hydration) jumps with the browser's own scroll, which already respects the visitor's setting.
 * An element's `scroll-margin-top` is honoured either way, so a section clears the floating header by declaring it.
 */
export function scrollToTarget(target: HTMLElement | number, { offset = 0, duration = 1.4 }: ScrollOptions = {}): void {
  if (instance) {
    instance.scrollTo(target, { offset, duration });
    return;
  }
  const margin = typeof target === "number" ? 0 : Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const top = typeof target === "number" ? target + offset : target.getBoundingClientRect().top + window.scrollY - margin + offset;
  window.scrollTo({ top, behavior: "auto" });
}
