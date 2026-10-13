"use client";

import gsap from "gsap";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { damp } from "@/lib/motion/math";
import { observeReveal } from "@/lib/motion/reveal";
import { firePulse } from "@/lib/story/sceneState";

/** Everything that reveals when it scrolls into view. The markup only tags itself; the CSS does the animating. */
const REVEAL_SELECTOR = "[data-reveal], [data-split='view'], [data-odo]";
/** Elements that lean toward the pointer. Primary buttons by default; opt in anything else with data-magnetic. */
const MAGNETIC_SELECTOR = ".btn-primary, [data-magnetic]";
const MAGNET_PULL = 0.3;
const MAGNET_EASE = 9;
const PULSE_SELECTOR = ".btn-primary";

interface Magnet {
  rect: DOMRect;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

/** Starts the leaning-toward-the-cursor behaviour and returns a function that stops it and resets every button. */
function startMagnets(): () => void {
  const magnets = new Map<HTMLElement, Magnet>();
  let hovered: HTMLElement | null = null;

  // `translate` is its own CSS property, so it composes with the button's hover and press transforms.
  const frame = (_time: number, deltaMs: number) => {
    const dt = Math.min(deltaMs / 1000, 0.05);
    magnets.forEach((magnet, element) => {
      magnet.x = damp(magnet.x, magnet.targetX, MAGNET_EASE, dt);
      magnet.y = damp(magnet.y, magnet.targetY, MAGNET_EASE, dt);
      const settled = element !== hovered && Math.abs(magnet.x) < 0.05 && Math.abs(magnet.y) < 0.05;
      if (settled) {
        element.style.translate = "";
        magnets.delete(element);
      } else {
        element.style.translate = `${magnet.x.toFixed(2)}px ${magnet.y.toFixed(2)}px`;
      }
    });
  };

  const release = (element: HTMLElement | null) => {
    const magnet = element ? magnets.get(element) : undefined;
    if (magnet) {
      magnet.targetX = 0;
      magnet.targetY = 0;
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const element = (event.target as Element | null)?.closest<HTMLElement>(MAGNETIC_SELECTOR) ?? null;
    if (element !== hovered) {
      release(hovered);
      hovered = element;
    }
    if (!element || element.matches(":disabled, [aria-disabled='true']")) return;
    let magnet = magnets.get(element);
    if (!magnet) {
      magnet = { rect: element.getBoundingClientRect(), x: 0, y: 0, targetX: 0, targetY: 0 };
      magnets.set(element, magnet);
    }
    magnet.targetX = (event.clientX - (magnet.rect.left + magnet.rect.width / 2)) * MAGNET_PULL;
    magnet.targetY = (event.clientY - (magnet.rect.top + magnet.rect.height / 2)) * MAGNET_PULL;
  };

  const onLeave = () => {
    release(hovered);
    hovered = null;
  };

  gsap.ticker.add(frame);
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onLeave);
  return () => {
    gsap.ticker.remove(frame);
    document.removeEventListener("pointermove", onPointerMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
    magnets.forEach((_magnet, element) => {
      element.style.translate = "";
    });
  };
}

/**
 * One controller for every decorative interaction, so the page does not need a client component per element:
 * it observes the elements tagged for reveal, and one pointer listener makes buttons lean toward the cursor and
 * flashes the 3D pipeline when a primary button is pressed. Renders nothing.
 */
export function PageEffects() {
  const pathname = usePathname();

  // Watch every element tagged for reveal. Re-scan on every route (the layout outlives navigation) and whenever
  // the page adds markup later (streamed or conditionally rendered content), or that content would stay hidden.
  useEffect(() => {
    const stops = new Map<Element, () => void>();
    const scan = () => {
      document.querySelectorAll(REVEAL_SELECTOR).forEach((element) => {
        if (!stops.has(element)) stops.set(element, observeReveal(element));
      });
    };
    scan();

    let queued = false;
    const mutations = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        scan();
      });
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      stops.forEach((stop) => stop());
    };
  }, [pathname]);

  useEffect(() => {
    // Flashing the pipeline and leaning toward the cursor are motion, so neither runs for visitors who asked for less.
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onPointerDown = (event: PointerEvent) => {
      if (!calm && (event.target as Element | null)?.closest(PULSE_SELECTOR)) firePulse(1);
    };
    document.addEventListener("pointerdown", onPointerDown, { passive: true });

    // Leaning toward the cursor also needs a real mouse.
    const stopMagnets = !calm && window.matchMedia("(hover: hover) and (pointer: fine)").matches ? startMagnets() : undefined;

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      stopMagnets?.();
    };
  }, []);

  return null;
}
