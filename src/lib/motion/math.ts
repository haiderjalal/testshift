/** Small numeric helpers shared by the scroll story, the 3D scene and the scroll-scrubbed components. */

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** 0 below `edge0`, 1 above `edge1`, with a smooth S-curve between. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Frame-rate independent easing of `current` toward `target`. `rate` is how fast, per second. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/**
 * Turns continuous progress into a tour with a hold on every stop: it rests on a stop for `hold` of its
 * share of the progress, then eases to the next. Returns a float from 0 to count - 1.
 */
export function steppedIndex(progress: number, count: number, hold = 0.62): number {
  const scaled = clamp(progress) * count;
  const base = Math.min(count - 1, Math.floor(scaled));
  const local = scaled - base;
  const move = smoothstep(hold, 1, local);
  return Math.min(count - 1, base + (base < count - 1 ? move : 0));
}
