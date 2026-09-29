import Link from "next/link";

import { AGENTS } from "@/lib/agents";
import { SITE } from "@/lib/plans";

// Hexagon vertices that carry the four agent nodes, in pipeline order.
const NODES = [
  { cx: 16, cy: 2.5 },
  { cx: 28, cy: 9.5 },
  { cx: 16, cy: 29.5 },
  { cx: 4, cy: 22.5 },
];

/**
 * Animated TestShift mark: the hexagon draws itself, the check follows, and four agent nodes
 * pulse in pipeline order. "Shift" slides in letter by letter and a sheen passes every few seconds.
 * Hover replays the drawing.
 */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} aria-label={`${SITE.name} home`} className="logo group flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <path
          className="logo-hex"
          pathLength={1}
          d="M16 2.5 L28 9.5 V22.5 L16 29.5 L4 22.5 V9.5 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        <path
          className="logo-check"
          pathLength={1}
          d="M10.5 16.5 L14.3 20.2 L21.8 12"
          fill="none"
          style={{ stroke: "var(--color-dev)" }}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {NODES.map((n, i) => (
          <circle
            key={AGENTS[i].id}
            className="logo-node"
            style={{ ["--i" as string]: i, fill: AGENTS[i].color }}
            cx={n.cx}
            cy={n.cy}
            r={1.9}
          />
        ))}
      </svg>
      <span className="logo-word font-display text-[1.05rem] font-semibold tracking-tight">
        Test
        {"Shift".split("").map((letter, i) => (
          <span key={i} className="logo-letter" style={{ ["--i" as string]: i }}>
            {letter}
          </span>
        ))}
      </span>
    </Link>
  );
}
