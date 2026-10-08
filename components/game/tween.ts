// Small pure tween helpers for the entry and exit legs (play-transition.md 1).
// No React, three or Rapier imports.

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const easeInCubic = (t: number): number => {
  const x = clamp01(t);
  return x * x * x;
};
export const easeOutCubic = (t: number): number => {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
};
export const easeInOutCubic = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
export function shortestAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export type YawTween = { from: number; to: number; delay: number; duration: number; elapsed: number };

export function createYawTween(from: number, to: number, duration: number, delay = 0): YawTween {
  // Resolve to the shortest turn once, so the tween never spins the long way round.
  return { from, to: from + shortestAngle(from, to), delay, duration, elapsed: 0 };
}

/** Advances the tween and returns the yaw. Holds `from` during the delay and `to` afterwards. */
export function stepYawTween(t: YawTween, dt: number): number {
  t.elapsed += dt;
  const k = t.duration <= 0 ? 1 : (t.elapsed - t.delay) / t.duration;
  return lerp(t.from, t.to, easeInOutCubic(k));
}

export const yawTweenDone = (t: YawTween): boolean => t.elapsed >= t.delay + t.duration;

/** A value tween with a start delay and an easing, advanced by frame time (the world look tween). */
export type EnvTween = { from: number; to: number; delay: number; duration: number; elapsed: number; ease: (t: number) => number };

/**
 * The most frame time the FIRST step of an opening (from < to) tween may consume: 10 ms, under the 16.7 ms of a 60 Hz frame (the fade then opens gently and builds up).
 * The first visible frame of the world follows the swap from the hero, which is a long frame
 * (shader and texture work, 35 to 47 ms measured). Counted in full it becomes the first step of
 * the fade, two to three times a regular step. Capped, the fade starts no harder than it
 * runs and the hitch only delays the fade by the time it cost. Later steps take the whole frame.
 */
export const ENV_FIRST_STEP_S = 0.01;

/** Advances the tween by one frame and returns [value, done]. Closing tweens (exit) take the whole frame. */
export function stepEnvTween(t: EnvTween, dt: number): [value: number, done: boolean] {
  const opening = t.to > t.from;
  t.elapsed += opening && t.elapsed <= 0 ? Math.min(dt, ENV_FIRST_STEP_S) : dt;
  const k = t.duration <= 0 ? 1 : (t.elapsed - t.delay) / t.duration;
  return [lerp(t.from, t.to, t.ease(k)), k >= 1];
}
