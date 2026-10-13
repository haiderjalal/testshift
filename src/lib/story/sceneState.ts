import { clonePose, heroPose, type Pose } from "./poses";

/**
 * State shared between the scroll story, the 3D scene and the components that react to either. It is plain
 * mutable data on purpose: values change every frame, and React should only hear about the slow ones (which
 * chapter is active, which tour stop is in view). Those live in `storyStore`.
 */

/** The pose the story wants. Written by `StoryDriver`, read by the scene. */
export const target: Pose = clonePose(heroPose(false));

/** What the scene is actually showing right now: `target`, eased. Written by the scene. */
export const live = {
  ...clonePose(heroPose(false)),
  /** Camera pull-back that eases to 0 on load, so the scene flies in. */
  intro: 1,
  /** A short flash across the whole pipeline, 0 to 1. Fire it with `firePulse`. */
  pulse: 0,
};

/** Progress through each chapter's own scene, 0 to 1. */
export const chapterProgress: Record<string, number> = {};

/** Where a chapter sits in the document, measured by `StoryDriver`. All positions are document coordinates in pixels. */
export interface ChapterMetrics {
  id: string;
  /** Index in `CHAPTERS`. */
  index: number;
  /** Scroll position at which the chapter becomes active: its top passes the middle of the screen. */
  zone: number;
  top: number;
  height: number;
  /** Present when the chapter holds a pinned stage on screen. */
  pin: { top: number; height: number; stageHeight: number; stickyTop: number } | null;
}

export const metrics = new Map<string, ChapterMetrics>();

export const story = {
  /** True while the page has chapters. The scene follows `target` then, and `data-stage` otherwise. */
  active: false,
  /** An agent index the page wants lit regardless of scroll, or null. See `ChapterContext`. */
  agentOverride: null as number | null,
  /** Changes whenever `agentOverride` does, so the driver knows to recompute while the page is not scrolling. */
  version: 0,
  /** Ceiling on scene brightness for pages that are not the landing page. */
  pageDim: 1,
};

export function setAgentOverride(index: number | null): void {
  if (story.agentOverride === index) return;
  story.agentOverride = index;
  story.version += 1;
}

/** A network-wide flash, e.g. when a call to action is pressed. */
export function firePulse(strength = 1): void {
  live.pulse = Math.max(live.pulse, strength);
}
