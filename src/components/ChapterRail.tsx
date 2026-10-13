"use client";

import Link from "next/link";

import { CHAPTERS } from "@/lib/story/chapters";
import { useStoryStore } from "@/store/storyStore";

const RAIL_CHAPTERS = CHAPTERS.filter((chapter) => chapter.label);

/**
 * A column of dots down the right edge, one per chapter of the landing page. The dot for the chapter in view
 * glows; hovering or focusing a dot names it. Wide screens only, where there is room for it.
 */
export function ChapterRail() {
  const activeChapter = useStoryStore((state) => state.activeChapter);

  return (
    <nav aria-label="Page sections" className="fixed top-1/2 right-5 z-30 hidden -translate-y-1/2 xl:block print:hidden">
      <ul className="flex flex-col items-end gap-3.5">
        {RAIL_CHAPTERS.map((chapter) => {
          const current = chapter.id === activeChapter;
          return (
            <li key={chapter.id}>
              <Link
                href={chapter.href ?? `/#${chapter.id}`}
                aria-current={current ? "location" : undefined}
                className="group flex items-center gap-3 py-0.5"
              >
                <span className="font-mono text-[10px] tracking-widest text-graphite uppercase opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                  {chapter.label}
                </span>
                <span
                  aria-hidden
                  className={`block rounded-full transition-all duration-300 ${
                    current
                      ? "size-2.5 bg-brand shadow-[0_0_14px_rgb(69_212_255/0.9)]"
                      : "size-1.5 bg-graphite/60 group-hover:bg-ink group-focus-visible:bg-ink"
                  }`}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
