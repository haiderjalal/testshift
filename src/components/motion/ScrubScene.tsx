"use client";

import gsap from "gsap";
import { useEffect, useRef, type ReactNode } from "react";

import { clamp } from "@/lib/motion/math";
import { chapterProgress } from "@/lib/story/sceneState";

/** Words that have not been reached yet. High enough that dimmed text still meets 4.5:1 contrast on the page background. */
const UNLIT_OPACITY = 0.56;
/** Coloured words (`.scrub-name`) are dimmer to start with, so they need a higher floor to stay readable. */
const UNLIT_NAME_OPACITY = 0.8;

interface ScrubSceneProps {
  /** The chapter whose progress drives this scene. */
  progressKey: string;
  /** The chapter progress at which the scene starts and finishes. */
  from?: number;
  to?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Brings server-rendered markup to life as a chapter scrolls. Inside it:
 *   .scrub-word   lights up in reading order (opacity); add .scrub-name for coloured words
 *   .scrub-draw   an SVG path (pathLength="1") that draws itself
 *   .scrub-node   SVG marks that light up in order along the path
 * It reads one number per frame, writes only when that number changed, and does nothing for visitors who asked for
 * reduced motion, who see the finished state straight away.
 */
export function ScrubScene({ progressKey, from = 0.05, to = 0.9, className, children }: ScrubSceneProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const words = Array.from(root.querySelectorAll<HTMLElement>(".scrub-word"));
    const path = root.querySelector<SVGPathElement>(".scrub-draw");
    const nodes = Array.from(root.querySelectorAll<SVGElement>(".scrub-node"));
    let lastProgress = -1;

    const update = () => {
      const progress = chapterProgress[progressKey] ?? 0;
      if (progress === lastProgress) return;
      lastProgress = progress;
      const reached = clamp((progress - from) / (to - from));
      words.forEach((word, i) => {
        const unlit = word.classList.contains("scrub-name") ? UNLIT_NAME_OPACITY : UNLIT_OPACITY;
        word.style.opacity = String(unlit + (1 - unlit) * clamp(reached * words.length - i));
      });
      path?.style.setProperty("stroke-dashoffset", String(1 - reached));
      nodes.forEach((node, i) => node.toggleAttribute("data-lit", reached >= i / Math.max(1, nodes.length - 1) - 0.001));
    };

    gsap.ticker.add(update);
    update();
    return () => {
      gsap.ticker.remove(update);
      words.forEach((word) => word.style.removeProperty("opacity"));
      path?.style.removeProperty("stroke-dashoffset");
      nodes.forEach((node) => node.removeAttribute("data-lit"));
    };
  }, [progressKey, from, to]);

  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  );
}
