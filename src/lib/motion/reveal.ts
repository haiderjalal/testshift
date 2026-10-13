/**
 * One shared IntersectionObserver for every element that reveals on scroll. It only sets `data-in`; the CSS in
 * globals.css does the animating (see the `html.js:not(.rm)` rules there).
 */

const pending = new Set<Element>();
let observer: IntersectionObserver | null = null;
let sweepQueued = false;
let sweepAttached = false;

function reveal(element: Element): void {
  element.setAttribute("data-in", "");
  pending.delete(element);
  observer?.unobserve(element);
}

/** An observer never reports an element the visitor jumped over, so reveal anything already above the screen. */
function sweepAbove(): void {
  sweepQueued = false;
  pending.forEach((element) => {
    if (element.getBoundingClientRect().bottom < 0) reveal(element);
  });
}

function queueSweep(): void {
  if (sweepQueued || pending.size === 0) return;
  sweepQueued = true;
  requestAnimationFrame(sweepAbove);
}

/** Starts watching an element. Returns a function that stops watching it. */
export function observeReveal(element: Element): () => void {
  if (typeof IntersectionObserver === "undefined") {
    reveal(element);
    return () => undefined;
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) reveal(entry.target);
      });
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
  );
  if (!sweepAttached) {
    window.addEventListener("scroll", queueSweep, { passive: true });
    sweepAttached = true;
  }
  pending.add(element);
  observer.observe(element);
  return () => {
    pending.delete(element);
    observer?.unobserve(element);
  };
}
