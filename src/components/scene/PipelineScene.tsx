"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { story } from "@/lib/story/sceneState";

/** Brightness ceiling for every page except the landing page, where the scene is the show. */
const BACKDROP_DIM = 0.45;

/**
 * Fixed full-screen WebGL backdrop. three.js is loaded after the page is interactive so it never delays the
 * first paint. On the landing page the scroll story (`StoryDriver`) directs it; other pages point it at an
 * agent with `StageSync`, or leave it on the overview. Without WebGL the CSS gradient background stays on its own.
 */
export function PipelineScene() {
  const pathname = usePathname();
  const canvas = useRef<HTMLCanvasElement>(null);
  const disabled = pathname.startsWith("/admin");

  useEffect(() => {
    story.pageDim = pathname === "/" ? 1 : BACKDROP_DIM;
  }, [pathname]);

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

  if (disabled) return null;
  return <canvas ref={canvas} aria-hidden data-scene className="pointer-events-none fixed inset-0 -z-10 h-dvh w-screen" />;
}

/** Lets a page point the scene at an agent without scroll chapters, e.g. the live shift page. */
export function StageSync({ stage }: { stage: string | null }) {
  useEffect(() => {
    const root = document.documentElement;
    if (stage) root.dataset.stage = stage;
    else delete root.dataset.stage;
    // Leaving the page clears the stage, or the scene would stay on this agent's shot on every page after it.
    return () => {
      delete root.dataset.stage;
    };
  }, [stage]);
  return null;
}
