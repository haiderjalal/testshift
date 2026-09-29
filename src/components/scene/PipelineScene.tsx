"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Fixed full-screen WebGL backdrop. three.js is loaded after the page is interactive so it never
 * delays the first paint. Sections marked `data-stage` tell the camera where to fly as you scroll.
 */
export function PipelineScene() {
  const pathname = usePathname();
  const canvas = useRef<HTMLCanvasElement>(null);
  const disabled = pathname.startsWith("/admin");

  useEffect(() => {
    if (disabled) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    import("./scene")
      .then(({ startScene }) => {
        if (!cancelled && canvas.current) stop = startScene(canvas.current);
      })
      .catch(() => {
        // No WebGL (old device, disabled GPU): the CSS gradient background stays on its own.
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [disabled]);

  useEffect(() => {
    const root = document.documentElement;
    const sections = document.querySelectorAll<HTMLElement>("[data-stage]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const stage = (entry.target as HTMLElement).dataset.stage;
          if (entry.isIntersecting && stage) root.dataset.stage = stage;
        }
      },
      // A thin band across the middle of the screen: the section crossing it is the one being read.
      { rootMargin: "-45% 0px -45% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => {
      observer.disconnect();
      delete root.dataset.stage;
    };
  }, [pathname]);

  if (disabled) return null;
  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 h-dvh w-screen opacity-0 transition-opacity duration-[1600ms] ${
        pathname === "/" ? "data-[ready=true]:opacity-100" : "data-[ready=true]:opacity-45"
      }`}
    />
  );
}

/** Lets a page point the scene at an agent without scroll sections, e.g. the live shift page. */
export function StageSync({ stage }: { stage: string | null }) {
  useEffect(() => {
    const root = document.documentElement;
    if (stage) root.dataset.stage = stage;
    else delete root.dataset.stage;
  }, [stage]);
  return null;
}
