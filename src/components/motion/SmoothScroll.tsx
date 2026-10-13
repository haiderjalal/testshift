"use client";

import gsap from "gsap";
import Lenis from "lenis";
import { useEffect } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { setLenis } from "@/lib/motion/lenis";

const ANCHOR_SCROLL_SECONDS = 1.6;

/** The hash of a link that points at the page we are already on ("" for the page itself), or null for any other link. */
function samePageHash(anchor: HTMLAnchorElement): string | null {
  const url = new URL(anchor.href, window.location.href);
  const samePage =
    url.origin === window.location.origin && url.pathname === window.location.pathname && url.search === window.location.search;
  return samePage ? url.hash : null;
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

    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, smoothWheel: true });
    setLenis(lenis);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // Links to a place on this page scroll there smoothly. Capture phase, so Next's own link handling steps aside.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const hash = samePageHash(anchor);
      if (hash === null) return;
      const destination = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
      if (hash && !destination) return;
      event.preventDefault();
      lenis.scrollTo(destination ?? 0, { duration: ANCHOR_SCROLL_SECONDS });
      window.history.pushState(null, "", new URL(anchor.href, window.location.href).pathname + hash);
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
