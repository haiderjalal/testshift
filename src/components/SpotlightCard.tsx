"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  /** Accent colour (any CSS colour). Tints the light that follows the pointer. */
  accent?: string;
  /** Tilts the card toward the pointer. Use sparingly: one or two focal cards per screen. */
  tilt?: boolean;
}

/**
 * Surface whose light follows the pointer, with an optional 3D tilt. The light and tilt are set as CSS
 * custom properties (see `.spotlight` in globals.css), so hovering does not re-render React.
 * Tilt is skipped for visitors who asked for reduced motion; the light still shows.
 */
export function SpotlightCard({ children, className = "", accent, tilt = false }: SpotlightCardProps) {
  const reduced = usePrefersReducedMotion();
  const style = accent ? ({ "--accent": accent } as CSSProperties) : undefined;

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    const rect = node.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    node.style.setProperty("--mx", `${x}px`);
    node.style.setProperty("--my", `${y}px`);
    if (tilt && !reduced) {
      node.style.setProperty("--rx", `${(0.5 - y / rect.height) * 8}deg`);
      node.style.setProperty("--ry", `${(x / rect.width - 0.5) * 8}deg`);
    }
  }

  function handlePointerLeave(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.style.setProperty("--rx", "0deg");
    event.currentTarget.style.setProperty("--ry", "0deg");
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={style}
      className={`spotlight ${tilt ? "spotlight-tilt" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
