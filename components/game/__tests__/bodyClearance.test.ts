// Body clearance (QA F-M3-2, F-M3-3): the reproduction without the pass, the open ground, the Lab and Workshop
// spots, the planted feet and the pushOut geometry. The pose matrix is in bodyClearance.pose-*.test.ts and the
// landing cases in bodyClearance.landing.test.ts; all share bodyClearanceHarness.ts.
import { describe, expect, it } from "vitest";
import { MIN_BONE_CLEARANCE, pushOut, type Solid } from "../bodyClearance";
import { drive, dropHeight, FACES, fmt, MAX_OFFSET, MAX_OFFSET_RATE_SPEC, moved, p95, POSES, useRig, type Face } from "./bodyClearanceHarness";
import { surfaceHeightAt, CAMPUS } from "../world/layout";

describe("wall faces generated from the layout", () => {
  it("finds at least 20 faces including the Lab walls and the tower wings", () => {
    expect(FACES.length).toBeGreaterThanOrEqual(20);
    const ids = FACES.map((f) => f.id.split(" ")[0]);
    for (const want of ["lab-side-l", "lab-side-r", "lab-back"]) expect(ids.some((i) => i.includes(want)), want).toBe(true);
    expect(ids.some((i) => i.includes("tower-wing")), "tower wings").toBe(true);
  });
});

describe("body clearance on the campus (F-M3-2, F-M3-3)", () => {
  useRig();
  it("reproduces F-M3-2 without the pass: a hard landing at a wall puts a checked bone closer than 0.05 m", { timeout: 120000 }, () => {
    const worst = FACES.filter((f) => dropHeight(f) >= 1.2).map((f) => drive(f, POSES[0], "drop", false)).reduce((a, b) => (b.minClearance < a.minClearance ? b : a));
    expect(worst.hardLands).toBeGreaterThan(0);
    expect(worst.minClearance).toBeLessThan(MIN_BONE_CLEARANCE);
    const lab = FACES.filter((f) => f.id.startsWith("lab-")).map((f) => drive(f, POSES[0], "drop", false).minClearance);
    expect(Math.min(...lab)).toBeLessThan(0);
  });

  it("open ground is untouched: no push, and the hard landing crouch is exactly the pass-off one", () => {
    const open = { id: "open", stand: { x: 0, y: 0, z: -12 }, into: { x: 0, z: 1 } } as Face;
    const on = drive(open, POSES[0], "drop-still", true);
    const off = drive(open, POSES[0], "drop-still", false);
    expect(on.maxPush).toBe(0);
    expect(on.hardLands).toBeGreaterThan(0);
    expect(on.lowestHips).toBeCloseTo(off.lowestHips, 6);
    expect(on.maxOffsetRate).toBe(0);
  });

  /** The wall and prop spots the Lab and the Workshop are played at: where the avatar stands and which way the player holds the stick. */
  const SPOTS: readonly { name: string; at: [number, number]; dir: [number, number] }[] = [
    { name: "lab-side-l-inner", at: [9.0, 18.5], dir: [-1, 0] },
    { name: "lab-kiosk", at: [9.0, 16.4], dir: [-1, 0] },
    { name: "lab-plinth-apex", at: [9.66, 18.9], dir: [0.53, 0.85] },
    { name: "lab-plinth-xecsuite", at: [14.75, 15.73], dir: [0.53, 0.85] },
    { name: "workshop-machine-0", at: [-9.4, 16.0], dir: [1, 0.4] },
  ];
  it("the Lab and Workshop wall spots (side wall, kiosk, plinths, machine): no pop, offset under 0.3 m, clearance", { timeout: 180000 }, () => {
    const lines: string[] = [];
    for (const spot of SPOTS) {
      const len = Math.hypot(...spot.dir);
      const floor = surfaceHeightAt(CAMPUS, spot.at[0], spot.at[1], { maxY: 1 }) ?? 0;
      const face: Face = { id: spot.name, stand: { x: spot.at[0], y: floor, z: spot.at[1] }, into: { x: spot.dir[0] / len, z: spot.dir[1] / len } };
      for (const mode of ["jumps", "run-jump"] as const) {
        const r = drive(face, POSES[0], mode, true);
        const where = `${spot.name} ${mode}`;
        if (r.maxOffsetRate > MAX_OFFSET_RATE_SPEC) lines.push(`${where}: rate ${r.maxOffsetRate.toFixed(2)} m/s`);
        if (r.maxOffset >= MAX_OFFSET) lines.push(`${where}: offset ${fmt(r.maxOffset)} m`);
        // At the offset limit in a corner a few centimetres may be lost; elsewhere the full 0.05 m holds.
        const need = r.limitedFrames === 0 ? MIN_BONE_CLEARANCE : 0.02;
        if (r.minClearance < need - 1e-6) lines.push(`${where}: ${r.worstBone} ${fmt(r.minClearance)} m`);
      }
    }
    expect(lines).toEqual([]);
  });

  it("feet show no extra skating against the pass-off control (planted-foot speed, p95)", { timeout: 180000 }, () => {
    const on: number[] = [];
    const off: number[] = [];
    for (const face of FACES.filter((_, i) => i % 3 === 0)) {
      for (const mode of ["jumps", "run-jump"] as const) {
        on.push(...drive(face, POSES[0], mode, true).plantedFoot);
        off.push(...drive(face, POSES[0], mode, false).plantedFoot);
      }
    }
    expect(on.length).toBeGreaterThan(500);
    // A foot that is planted but carried by a slow release or a push would show here; the margin is a quarter of a walk's own foot speed.
    expect(p95(on)).toBeLessThanOrEqual(p95(off) + 0.4);
  });
});


describe("pushOut geometry", () => {
  const box: Solid = { id: "b", cx: 0, cy: 1, cz: 0, hx: 2, hy: 1, hz: 0.2, qx: 0, qy: 0, qz: 0, qw: 1 };
  const out = { x: 0, z: 0 };
  it("is null when the point is clear", () => {
    expect(pushOut(box, 0, 1, 0.6, 0.3, 0, 1, out)).toBe(false);
  });
  it("pushes straight away from a face", () => {
    expect(pushOut(box, 0, 1, 0.3, 0.3, 0, 1, out)).toBe(true);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.z).toBeCloseTo(0.2, 6); // 0.1 from the face, needs 0.3
  });
  it("leaves a point inside the wall on the side the feet are on", () => {
    expect(pushOut(box, 0, 1, -0.1, 0.1, 0, -1, out)).toBe(true);
    expect(out.z).toBeCloseTo(-(0.1 + 0.1), 6);
    expect(pushOut(box, 0, 1, -0.1, 0.1, 0, 1, out)).toBe(true);
    expect(out.z).toBeCloseTo(0.3 + 0.1, 6);
  });
  it("ignores a point above the wall top with no horizontal way out", () => {
    expect(pushOut(box, 0, 2.05, 0, 0.1, 0, 1, out)).toBe(false);
  });
  it("accounts for height: a point above the top corner needs less push", () => {
    expect(pushOut(box, 0, 2.06, 0.3, 0.1, 0, 1, out)).toBe(false);
  });
});
