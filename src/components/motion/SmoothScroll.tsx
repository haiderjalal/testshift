"use client";

import gsap from "gsap";
import Lenis from "lenis";
import { useEffect } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { setLenis } from "@/lib/motion/lenis";

const ANCHOR_SCROLL_SECONDS = 1.6;

/** The URL of a link that points at the page we are already on (same path and query), or null for any other link. */
function samePageUrl(anchor: HTMLAnchorElement): URL | null {
  const url = new URL(anchor.href, window.location.href);
  const samePage =
    url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search;
  return samePage ? url : null;
}

/** Moves keyboard and screen-reader focus to the place a link scrolled to, as a native in-page link would. */
function focusDestination(destination: HTMLElement): void {
  if (!destination.hasAttribute("tabindex") && !destination.matches("a[href], button, input, select, textarea, summary")) {
    destination.tabIndex = -1;
  }
  destination.focus({ preventScroll: true });
}

/**
 * Smooth, momentum scrolling (Lenis) on the same animation clock as everything else (GSAP's ticker), so scroll,
 * the story and the 3D scene stay in step. It never takes over the scroll: it only eases the wheel.
 * Not started for visitors who asked for reduced motion; they get the browser's own scrolling. Renders nothing.
 */
export function SmoothScroll() {
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    // Everything that reveals on scroll relies on this class; the CSS failsafe shows it all if it never appears.
    document.documentElement.classList.add("ready");
    if (reduced) return;

    const lenis = new Lenis({
      lerp: 0.09,
      wheelMultiplier: 0.95,
      smoothWheel: true,
      // Scrollable boxes (long textareas, code blocks) keep their own wheel scrolling instead of scrolling the page.
      allowNestedScroll: true,
      // A link to another page stops any scroll still easing, so it cannot drag the new page down with it.
      stopInertiaOnNavigate: true,
    });
    setLenis(lenis);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // Links to a place on this page scroll there smoothly. Capture phase, so Next's own link handling steps aside.
    // It mirrors a native in-page link: same URL rules, one history entry per new place, focus moves to the target.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = samePageUrl(anchor);
      if (!url) return;
      const destination = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
      if (url.hash && !destination) return;
      event.preventDefault();
      lenis.scrollTo(destination ?? 0, { duration: ANCHOR_SCROLL_SECONDS });
      const next = url.pathname + url.search + url.hash;
      if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.pushState(null, "", next);
      if (destination) focusDestination(destination);
    };
    document.addEventListener("click", onClick, true);

    return () => {
      document.removeEventListener("click", onClick, true);
      gsap.ticker.remove(raf);
      setLenis(null);
      lenis.destroy();
    };
  }, [reduced]);

  return null;
}
