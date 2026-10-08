import { describe, expect, it } from "vitest";
import {
  clamp01,
  createYawTween,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  lerp,
  shortestAngle,
  stepYawTween,
  yawTweenDone,
} from "../tween";

describe("easing", () => {
  it.each([easeInCubic, easeOutCubic, easeInOutCubic])("starts at 0, ends at 1 and clamps", (f) => {
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
    expect(f(-3)).toBe(0);
    expect(f(7)).toBe(1);
  });
  it("ease-in is slow first, ease-out fast first, in-out symmetric", () => {
    expect(easeInCubic(0.5)).toBeLessThan(0.5);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutCubic(0.25) + easeInOutCubic(0.75)).toBeCloseTo(1, 12);
  });
  it("are monotonic", () => {
    for (const f of [easeInCubic, easeOutCubic, easeInOutCubic]) {
      let prev = -1;
      for (let i = 0; i <= 100; i++) {
        const v = f(i / 100);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });
  it("lerp and clamp01", () => {
    expect(lerp(2, 4, 0.5)).toBe(3);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-1)).toBe(0);
  });
});

describe("yaw tween", () => {
  it("shortestAngle picks the short way round", () => {
    expect(shortestAngle(0.1, -0.1)).toBeCloseTo(-0.2, 12);
    expect(shortestAngle(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6, 12);
    expect(Math.abs(shortestAngle(0, 2 * Math.PI))).toBeLessThan(1e-12);
  });

  it("holds during the delay, turns over the duration and ends exactly on target", () => {
    const t = createYawTween(Math.PI, 0, 0.42, 0.15);
    expect(stepYawTween(t, 0.1)).toBeCloseTo(t.from, 12); // still in the delay
    expect(yawTweenDone(t)).toBe(false);
    let last = t.from;
    let yaw = t.from;
    for (let i = 0; i < 60; i++) {
      yaw = stepYawTween(t, 0.01);
      expect(Math.abs(yaw - t.to)).toBeLessThanOrEqual(Math.abs(last - t.to) + 1e-12); // never moves away
      last = yaw;
    }
    expect(yawTweenDone(t)).toBe(true);
    expect(yaw).toBeCloseTo(t.to, 12);
  });

  it("a half turn is the full pi and a 350 degree difference turns the 10 degree way", () => {
    expect(Math.abs(createYawTween(0, Math.PI, 1).to - createYawTween(0, Math.PI, 1).from)).toBeCloseTo(Math.PI, 12);
    const short = createYawTween(0, (350 * Math.PI) / 180, 1);
    expect(short.to).toBeCloseTo((-10 * Math.PI) / 180, 12);
  });

  it("a zero-length tween is done at once", () => {
    const t = createYawTween(0, 1, 0);
    expect(stepYawTween(t, 0)).toBeCloseTo(1, 12);
    expect(yawTweenDone(t)).toBe(true);
  });
});
