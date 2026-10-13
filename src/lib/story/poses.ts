import { AGENTS } from "@/lib/agents";

/** A point or direction in the 3D scene. A plain tuple keeps this module free of three.js. */
export type Vec3 = [number, number, number];

/**
 * Everything the scroll story can ask of the 3D scene. The scene eases toward these values, so the story only
 * has to say where it wants things to be.
 */
export interface Pose {
  /** Camera position. */
  pos: Vec3;
  /** Point the camera looks at. */
  look: Vec3;
  /** Scene brightness, 0 to 1. Text-heavy chapters dim the scene so copy stays readable. */
  dim: number;
  /** Which agent is lit. A float: 1.5 is half way from Staging to UAT. -1 or lower lights none. */
  focus: number;
}

/** Where each agent core sits, in pipeline order. Agents are right of centre so section text can live on the left. */
export const AGENT_POSITIONS: readonly Vec3[] = [
  [-4.8, 0.5, 0.4],
  [-1.6, -0.7, -2.6],
  [1.6, 0.7, -0.8],
  [4.8, -0.4, -3.2],
];

const LAST_AGENT = AGENTS.length - 1;

export function clonePose(pose: Pose): Pose {
  return { pos: [...pose.pos], look: [...pose.look], dim: pose.dim, focus: pose.focus };
}

export function heroPose(narrow: boolean): Pose {
  return narrow
    ? { pos: [0, 8, 34], look: [0, 7, 0], dim: 1, focus: -1 }
    : { pos: [-6.5, 2.6, 18.5], look: [-6.5, 2.1, 0], dim: 1, focus: -1 };
}

/** The whole pipeline from above and behind. Used while the page is mostly text. */
export function overviewPose(narrow: boolean, dim = 0.4): Pose {
  return { pos: [0, 7.5, narrow ? 32 : 22], look: [0, -1, -1], dim, focus: -1 };
}

/** The camera shot for one agent. `index` may be a float, which blends between neighbouring agents. */
export function agentPose(index: number, narrow: boolean): Pose {
  const clamped = Math.min(LAST_AGENT, Math.max(0, index));
  const lower = Math.floor(clamped);
  const upper = Math.min(LAST_AGENT, lower + 1);
  const t = clamped - lower;
  const a = AGENT_POSITIONS[lower];
  const b = AGENT_POSITIONS[upper];
  const at = (axis: 0 | 1 | 2): number => a[axis] + (b[axis] - a[axis]) * t;
  const base: Vec3 = [at(0), at(1), at(2)];
  // Wide screens: the camera sits to the agent's right and looks past it to the left, so the agent lands right of
  // centre and the agents before it stay behind the text. Narrow screens: straight on, a little above.
  const pos: Vec3 = narrow ? [base[0], base[1] + 1.8, base[2] + 11] : [base[0] + 1.2, base[1] + 2.2, base[2] + 9];
  const look: Vec3 = narrow ? [...base] : [base[0] - 3.4, base[1] - 0.2, base[2]];
  // On narrow screens the copy takes the whole width, so the agent shot is a calmer backdrop.
  return { pos, look, dim: narrow ? 0.75 : 1, focus: clamped };
}

/**
 * The pose for a page that is not part of the scroll story but still names a stage on `<html data-stage>`:
 * "hero" frames the pipeline, an agent id flies to that agent, anything else pulls back to the overview.
 */
export function stagePose(stage: string | undefined, narrow: boolean): Pose {
  const agentIndex = AGENTS.findIndex((agent) => agent.id === stage);
  if (agentIndex >= 0) return agentPose(agentIndex, narrow);
  if (stage === "hero") return heroPose(narrow);
  return overviewPose(narrow);
}
