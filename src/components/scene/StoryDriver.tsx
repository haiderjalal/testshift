"use client";

import gsap from "gsap";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { clamp, steppedIndex } from "@/lib/motion/math";
import { scroll, subscribeToScroll } from "@/lib/motion/scrollState";
import { CHAPTERS, chapterIndex, computeTarget } from "@/lib/story/chapters";
import { chapterProgress, metrics, story, target, type ChapterMetrics } from "@/lib/story/sceneState";
import { useStoryStore } from "@/store/storyStore";

/** Reads the page's chapter sections (`data-chapter`) and keeps them sorted in document order. */
function measureChapters(): ChapterMetrics[] {
  const viewportHeight = window.innerHeight;
  const scrollY = window.scrollY;
  const found: ChapterMetrics[] = [];

  document.querySelectorAll<HTMLElement>("[data-chapter]").forEach((element) => {
    const id = element.dataset.chapter;
    const index = id ? chapterIndex(id) : -1;
    if (!id || index < 0) return;
    const rect = element.getBoundingClientRect();
    const top = rect.top + scrollY;

    let pin: ChapterMetrics["pin"] = null;
    const wrapper = element.querySelector<HTMLElement>("[data-pin]");
    const stage = wrapper?.querySelector<HTMLElement>("[data-pin-stage]");
    // The CSS decides whether the stage is pinned (it depends on screen size and reduced motion), so ask it.
    if (wrapper && stage && getComputedStyle(stage).position === "sticky") {
      pin = {
        top: wrapper.getBoundingClientRect().top + scrollY,
        height: wrapper.getBoundingClientRect().height,
        stageHeight: stage.getBoundingClientRect().height,
        stickyTop: Number.parseFloat(getComputedStyle(stage).top) || 0,
      };
    }
    found.push({ id, index, zone: top - viewportHeight / 2, top, height: rect.height, pin });
  });

  return found.sort((a, b) => a.top - b.top);
}

/**
 * Turns scroll into story: which chapter the visitor is in, how far through it, and what the 3D scene should
 * do about it. Runs on GSAP's ticker, does nothing while the page is still, and writes plain state that the
 * scene and the scrubbed components read each frame. Only the slow values (active chapter, tour stop) go
 * through React. Renders nothing.
 */
export function StoryDriver() {
  const pathname = usePathname();

  useEffect(() => {
    let measured: ChapterMetrics[] = [];
    let documentHeight = 0;
    let stale = true;
    let lastScroll = -1;
    let lastVersion = -1;
    let activeId: string | null = null;
    const root = document.documentElement;

    const markStale = () => {
      stale = true;
    };

    const measure = () => {
      stale = false;
      scroll.y = window.scrollY;
      documentHeight = document.documentElement.scrollHeight;
      measured = measureChapters();
      metrics.clear();
      measured.forEach((chapter) => metrics.set(chapter.id, chapter));
      story.active = measured.length > 0;
      lastScroll = -1;
    };

    const frame = () => {
      if (stale) measure();
      if (measured.length === 0) return;
      const y = scroll.y;
      if (y === lastScroll && story.version === lastVersion) return;
      lastScroll = y;
      lastVersion = story.version;

      const viewportHeight = window.innerHeight;
      const narrow = window.innerWidth / viewportHeight < 1;
      const store = useStoryStore.getState();

      let activePosition = 0;
      let activeZoneProgress = 0;
      let activeOwnProgress = 0;
      measured.forEach((chapter, position) => {
        const zoneEnd = measured[position + 1]?.zone ?? Math.max(chapter.zone + 1, documentHeight - viewportHeight);
        const zoneProgress = clamp((y - chapter.zone) / Math.max(1, zoneEnd - chapter.zone));
        const ownProgress = chapter.pin
          ? clamp((y - (chapter.pin.top - chapter.pin.stickyTop)) / Math.max(1, chapter.pin.height - chapter.pin.stageHeight))
          : clamp((y + viewportHeight - chapter.top) / (chapter.height + viewportHeight));
        chapterProgress[chapter.id] = ownProgress;

        const stops = CHAPTERS[chapter.index].tourStops;
        if (stops && chapter.pin) {
          const stop = Math.round(steppedIndex(ownProgress, stops));
          if (store.tourIndex !== stop) store.setTourIndex(stop);
        }
        if (y >= chapter.zone) {
          activePosition = position;
          activeZoneProgress = zoneProgress;
          activeOwnProgress = ownProgress;
        }
      });

      const active = measured[activePosition];
      computeTarget(active.index, { p: activeZoneProgress, q: activeOwnProgress, narrow, agentOverride: story.agentOverride }, target);

      if (activeId !== active.id) {
        activeId = active.id;
        root.dataset.activeChapter = active.id;
        store.setActiveChapter(active.id);
      }
    };

    subscribeToScroll();
    gsap.ticker.add(frame);
    window.addEventListener("resize", markStale);
    window.addEventListener("load", markStale);
    const observer = new ResizeObserver(markStale);
    observer.observe(document.body);
    void document.fonts?.ready.then(markStale);
    // Measure now, so the scene has a target before its first frame.
    measure();

    return () => {
      gsap.ticker.remove(frame);
      window.removeEventListener("resize", markStale);
      window.removeEventListener("load", markStale);
      observer.disconnect();
      story.active = false;
      metrics.clear();
      delete root.dataset.activeChapter;
      useStoryStore.getState().setActiveChapter(null);
    };
  }, [pathname]);

  return null;
}
