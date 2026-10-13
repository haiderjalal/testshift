import { AGENTS } from "@/lib/agents";
import { clamp, easeInOutCubic, lerp, smoothstep, steppedIndex } from "@/lib/motion/math";

import { agentPose, clonePose, heroPose, overviewPose, type Pose, type Vec3 } from "./poses";

/**
 * The landing page as a story told by the 3D scene. Each chapter says only where the scene ends up; where it
 * starts is where the previous chapter ended, so the camera never jumps between chapters.
 *
 * A chapter is a section marked `data-chapter="<id>"`. Its zone runs from the moment its top passes the middle of
 * the screen until the next chapter's does, and `p` is how far through that zone the visitor is. `q` is the
 * chapter's own progress: while a pinned stage is held on screen, or while a normal section crosses the screen.
 */

export interface ChapterContext {
  /** Progress through the chapter's zone, 0 to 1. Zones tile the page, so one chapter's end is the next one's start. */
  p: number;
  /** Progress through the chapter's own scene, 0 to 1. */
  q: number;
  narrow: boolean;
  /** An agent index chosen by the page (the agent tabs, when the section is not pinned). Overrides scroll. */
  agentOverride: number | null;
}

export interface ChapterDef {
  id: string;
  /** Shown on the chapter rail. Chapters without a label are in the story but not in the rail. */
  label?: string;
  /** Where the rail link goes. Defaults to `/#<id>`. */
  href?: string;
  /** Marks a chapter whose scene is a tour with this many stops. The story publishes the stop in view. */
  tourStops?: number;
  /** The pose this chapter ends on, as changes to the pose it started from. */
  to: (narrow: boolean) => Partial<Pose>;
  /** Refines the eased pose while the visitor is inside the chapter. `from` and `to` are the resolved end poses. */
  during?: (context: ChapterContext, out: Pose, from: Pose, to: Pose) => void;
}

const AGENT_COUNT = AGENTS.length;

/** The share of a chapter's zone over which brightness and the lit agent settle on their new values. */
const SETTLE_SHARE = 0.2;
/** The share of a chapter's zone over which the camera arrives at the chapter's pose. The rest of the zone is for sway. */
const GLIDE_SHARE = 0.3;

function mix3(a: Vec3, b: Vec3, t: number, out: Vec3): void {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
}

/** A gentle sideways sway that is zero at both ends of the chapter, so it never breaks continuity. */
function sway(context: ChapterContext, out: Pose, amount = 1.2): void {
  out.pos[0] += Math.sin(Math.PI * context.p) * amount;
}

export const CHAPTERS: readonly ChapterDef[] = [
  { id: "hero", label: "Intro", href: "/", to: (narrow) => heroPose(narrow) },
  {
    id: "statement",
    // The camera looks below the pipeline, which lifts it into the upper part of the screen and clear of the sentence.
    to: (narrow) => ({ ...overviewPose(narrow, 0.6), pos: [0, 6, narrow ? 32 : 23], look: [0, narrow ? -5 : -9, -1] }),
    during: ({ q }, out) => {
      // Each agent lights up in turn as its sentence is read, then the glow clears so the chapter ends where it began.
      const presence = smoothstep(0, 0.08, q) * (1 - smoothstep(0.92, 1, q));
      const tour = steppedIndex(clamp((q - 0.06) / 0.88), AGENT_COUNT, 0.5);
      out.focus = lerp(out.focus, tour, presence);
    },
  },
  {
    id: "agents",
    label: "Agents",
    tourStops: AGENT_COUNT,
    to: (narrow) => agentPose(AGENT_COUNT - 1, narrow),
    during: (context, out, from) => {
      // Held on the wide shot until the stage is pinned, then flown agent to agent.
      const index = context.agentOverride ?? steppedIndex(context.q, AGENT_COUNT);
      const tour = agentPose(index, context.narrow);
      const weight = context.agentOverride === null ? smoothstep(0, 0.08, context.q) : 1;
      mix3(from.pos, tour.pos, weight, out.pos);
      mix3(from.look, tour.look, weight, out.look);
      out.dim = lerp(from.dim, tour.dim, weight);
      out.focus = lerp(from.focus, tour.focus, weight);
    },
  },
  { id: "coverage", label: "Coverage", to: (narrow) => overviewPose(narrow, 0.32), during: (c, out) => sway(c, out) },
  { id: "live", label: "Live shift", to: (narrow) => overviewPose(narrow, 0.45), during: (c, out) => sway(c, out, -1.2) },
  { id: "deliverables", label: "Report", to: (narrow) => overviewPose(narrow, 0.35), during: (c, out) => sway(c, out) },
  { id: "pricing", label: "Pricing", to: (narrow) => overviewPose(narrow, 0.3), during: (c, out) => sway(c, out, -1.2) },
  { id: "faq", label: "FAQ", to: (narrow) => overviewPose(narrow, 0.3) },
  { id: "cta", label: "Start", to: (narrow) => agentPose(AGENT_COUNT - 1, narrow) },
];

interface Resolved {
  def: ChapterDef;
  from: Pose;
  to: Pose;
}

const cache = new Map<boolean, readonly Resolved[]>();

/** Chapters with their start and end poses filled in. Each chapter starts where the one before it ended. */
function resolve(narrow: boolean): readonly Resolved[] {
  const cached = cache.get(narrow);
  if (cached) return cached;
  let previous = heroPose(narrow);
  const resolved = CHAPTERS.map((def) => {
    const from = clonePose(previous);
    const to = { ...clonePose(from), ...def.to(narrow) };
    previous = to;
    return { def, from, to };
  });
  cache.set(narrow, resolved);
  return resolved;
}

/** Writes into `out` the pose the scene should ease toward while chapter `index` is `context.p` of the way through. */
export function computeTarget(index: number, context: ChapterContext, out: Pose): void {
  const chapter = resolve(context.narrow)[index];
  if (!chapter) return;
  const p = clamp(context.p);
  // The camera arrives within the first third of the chapter and brightness settles within the first fifth, so a
  // long chapter does not spend its first half with text over a bright scene and a camera still on its way.
  const glide = easeInOutCubic(clamp(p / GLIDE_SHARE));
  const settle = smoothstep(0, SETTLE_SHARE, p);
  mix3(chapter.from.pos, chapter.to.pos, glide, out.pos);
  mix3(chapter.from.look, chapter.to.look, glide, out.look);
  out.dim = lerp(chapter.from.dim, chapter.to.dim, settle);
  out.focus = lerp(chapter.from.focus, chapter.to.focus, settle);
  chapter.def.during?.({ ...context, p: clamp(context.p), q: clamp(context.q) }, out, chapter.from, chapter.to);
}

export function chapterIndex(id: string): number {
  return CHAPTERS.findIndex((chapter) => chapter.id === id);
}
