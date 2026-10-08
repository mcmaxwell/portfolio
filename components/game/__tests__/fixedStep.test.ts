import { describe, expect, it } from "vitest";
import { PHYSICS } from "../config";
import { createFixedStepper } from "../fixedStep";

const cfg = { dt: 1 / 60, maxSteps: 4, maxFrameDelta: 0.25 };

describe("fixed step accumulator", () => {
  it("runs exactly one step per nominal 60 Hz frame", () => {
    const s = createFixedStepper(cfg);
    let steps = 0;
    for (let i = 0; i < 60; i++) steps += s.advance(1 / 60, () => {}).steps;
    expect(steps).toBe(60);
  });

  it("keeps the remainder and reports alpha in [0, 1)", () => {
    const s = createFixedStepper(cfg);
    const r = s.advance(1 / 60 + 1 / 120, () => {});
    expect(r.steps).toBe(1);
    expect(r.alpha).toBeCloseTo(0.5, 6);
    expect(r.dropped).toBe(false);
    const r2 = s.advance(1 / 120, () => {});
    expect(r2.steps).toBe(1);
    expect(r2.alpha).toBeCloseTo(0, 6);
  });

  it("skips steps on a fast frame and accumulates them", () => {
    const s = createFixedStepper(cfg);
    expect(s.advance(1 / 144, () => {}).steps).toBe(0);
    expect(s.advance(1 / 144, () => {}).steps).toBe(0);
    expect(s.advance(1 / 144, () => {}).steps).toBe(1);
  });

  it("caps catch-up at maxSteps and drops the backlog", () => {
    const s = createFixedStepper(cfg);
    let calls = 0;
    const r = s.advance(0.1, () => calls++);
    expect(calls).toBe(4);
    expect(r.steps).toBe(4);
    expect(r.dropped).toBe(true);
    expect(r.alpha).toBe(0);
    // The backlog is gone: the next nominal frame is one step again.
    expect(s.advance(1 / 60, () => {}).steps).toBe(1);
  });

  it("clamps a huge frame delta to maxFrameDelta before stepping", () => {
    const s = createFixedStepper({ ...cfg, maxSteps: 100 });
    let calls = 0;
    s.advance(10, () => calls++);
    expect(calls).toBe(Math.floor(cfg.maxFrameDelta / cfg.dt + 1e-6)); // 15
  });

  it("ignores negative and non-finite deltas", () => {
    const s = createFixedStepper(cfg);
    expect(s.advance(-1, () => {}).steps).toBe(0);
    expect(s.advance(NaN, () => {}).steps).toBe(0);
    expect(s.advance(Infinity, () => {}).steps).toBe(0);
  });

  it("reset clears the accumulator", () => {
    const s = createFixedStepper(cfg);
    s.advance(1 / 60 + 1 / 120, () => {});
    s.reset();
    const r = s.advance(1 / 120, () => {});
    expect(r.steps).toBe(0);
    expect(r.alpha).toBeCloseTo(0.5, 6);
  });

  it("uses the shipped PHYSICS configuration at 60 Hz", () => {
    expect(PHYSICS.dt).toBeCloseTo(1 / 60, 10);
    expect(PHYSICS.maxSteps).toBe(4);
    expect(PHYSICS.maxFrameDelta).toBe(0.25);
  });
});
