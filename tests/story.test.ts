import assert from "node:assert/strict";
import test from "node:test";

import { clamp, damp, lerp, smoothstep, steppedIndex } from "../src/lib/motion/math";
import { CHAPTERS, computeTarget, type ChapterContext } from "../src/lib/story/chapters";
import { agentPose, clonePose, heroPose, stagePose, type Pose } from "../src/lib/story/poses";

const POSE_KEYS = ["dim", "focus"] as const;

function sample(index: number, p: number, q: number, narrow: boolean, agentOverride: number | null = null): Pose {
  const out = clonePose(heroPose(narrow));
  const context: ChapterContext = { p, q, narrow, agentOverride };
  computeTarget(index, context, out);
  return out;
}

function assertSamePose(a: Pose, b: Pose, label: string): void {
  for (const key of ["pos", "look"] as const) {
    a[key].forEach((value, axis) => assert.ok(Math.abs(value - b[key][axis]) < 1e-6, `${label}: ${key}[${axis}] ${value} vs ${b[key][axis]}`));
  }
  for (const key of POSE_KEYS) assert.ok(Math.abs(a[key] - b[key]) < 1e-6, `${label}: ${key} ${a[key]} vs ${b[key]}`);
}

test("math helpers stay in range and ease the way the scene expects", () => {
  assert.equal(clamp(5), 1);
  assert.equal(clamp(-2), 0);
  assert.equal(lerp(10, 20, 0.25), 12.5);
  assert.equal(smoothstep(0, 1, 0), 0);
  assert.equal(smoothstep(0, 1, 1), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
  assert.equal(damp(0, 10, 5, 0), 0, "no time passes, nothing moves");
  assert.ok(damp(0, 10, 5, 1) > 9.9, "a second at rate 5 gets almost all the way");
});

test("steppedIndex rests on each stop, then eases to the next, and never leaves the range", () => {
  assert.equal(steppedIndex(0, 4), 0);
  assert.equal(steppedIndex(0.1, 4), 0, "still holding on the first stop");
  assert.equal(steppedIndex(1, 4), 3, "ends on the last stop");
  assert.equal(steppedIndex(2, 4), 3, "progress past the end is clamped");
  assert.equal(steppedIndex(-1, 4), 0);
  let previous = 0;
  for (let i = 0; i <= 200; i++) {
    const value = steppedIndex(i / 200, 4);
    assert.ok(value >= previous - 1e-9, "never goes backwards");
    assert.ok(value >= 0 && value <= 3);
    previous = value;
  }
  const stops = [0.05, 0.3, 0.55, 0.8].map((p) => steppedIndex(p, 4));
  stops.forEach((value, i) => assert.ok(Math.abs(value - i) < 0.05, `holds near stop ${i}, got ${value}`));
});

test("every chapter starts where the previous one ended, so the camera never jumps", () => {
  for (const narrow of [false, true]) {
    for (let i = 0; i < CHAPTERS.length - 1; i++) {
      const end = sample(i, 1, 1, narrow);
      const start = sample(i + 1, 0, 0, narrow);
      assertSamePose(end, start, `${CHAPTERS[i].id} -> ${CHAPTERS[i + 1].id} (${narrow ? "narrow" : "wide"})`);
    }
  }
});

test("the pose is continuous inside every chapter: no frame moves the camera by a jump", () => {
  const STEPS = 400;
  for (const narrow of [false, true]) {
    CHAPTERS.forEach((chapter, index) => {
      let previous = sample(index, 0, 0, narrow);
      for (let step = 1; step <= STEPS; step++) {
        const t = step / STEPS;
        const next = sample(index, t, t, narrow);
        const travel = Math.hypot(next.pos[0] - previous.pos[0], next.pos[1] - previous.pos[1], next.pos[2] - previous.pos[2]);
        assert.ok(travel < 1.5, `${chapter.id}: camera moved ${travel.toFixed(2)} units in one step at t=${t}`);
        assert.ok(Math.abs(next.dim - previous.dim) < 0.1, `${chapter.id}: dim jumped at t=${t}`);
        assert.ok(Math.abs(next.focus - previous.focus) < 0.5, `${chapter.id}: focus jumped at t=${t}`);
        previous = next;
      }
    });
  }
});

test("the agents chapter tours Dev to Prod and lands on the Prod shot", () => {
  const agents = CHAPTERS.findIndex((chapter) => chapter.id === "agents");
  assert.equal(CHAPTERS[agents].tourStops, 4);
  assert.ok(sample(agents, 0.5, 0.05, false).focus < 0.3, "just after the stage pins, the tour is still arriving at Dev");
  assert.ok(Math.abs(sample(agents, 0.5, 0.15, false).focus - 0) < 0.05, "then it rests on Dev");
  assertSamePose(sample(agents, 1, 1, false), agentPose(3, false), "ends on Prod");
  assert.ok(sample(agents, 0.5, 0.55, false).focus > 1.5, "half way through the pinned stage the tour is on Staging or UAT");
});

test("a page can pin the scene to one agent regardless of scroll", () => {
  const agents = CHAPTERS.findIndex((chapter) => chapter.id === "agents");
  const pinned = sample(agents, 0.2, 0.9, false, 1);
  assertSamePose(pinned, agentPose(1, false), "override wins over scroll");
});

test("narrow screens use a different framing from wide ones", () => {
  const wide = heroPose(false);
  const narrow = heroPose(true);
  assert.notDeepEqual(wide.pos, narrow.pos);
  assert.notDeepEqual(agentPose(2, false).pos, agentPose(2, true).pos);
});

test("pages outside the story still get a pose from their stage name", () => {
  assert.deepEqual(stagePose("hero", false), heroPose(false));
  assert.equal(stagePose("uat", false).focus, 2);
  assert.equal(stagePose("anything-else", false).focus, -1);
  assert.equal(stagePose(undefined, false).dim, 0.4, "the overview is dimmed behind text");
});
