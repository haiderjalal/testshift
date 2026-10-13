"use client";

import Link from "next/link";

import { useStoryStore } from "@/store/storyStore";

/** The hero and the closing section already carry the call to action, so the floating one steps aside there. */
const HIDDEN_DURING = new Set(["hero", "cta"]);

/** A call to action that follows the visitor down the landing page and hides where the page makes its own. */
export function FloatingCta() {
  const activeChapter = useStoryStore((state) => state.activeChapter);
  const visible = activeChapter !== null && !HIDDEN_DURING.has(activeChapter);

  return (
    <div
      inert={!visible}
      className={`fixed right-5 bottom-5 z-30 transition duration-500 print:hidden ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
      }`}
    >
      <Link href="/hire" className="btn-primary h-12 px-6 shadow-glow">
        Start a shift
      </Link>
    </div>
  );
}
