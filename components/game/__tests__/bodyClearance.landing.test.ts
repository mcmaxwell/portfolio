// Body clearance, the landing crouch cases (F-M3-3): anticipated push, hard versus soft landing, getting up at a wall.
// Split from bodyClearance.test.ts so the runner can use another worker; shares bodyClearanceHarness.ts.
import { describe, expect, it } from "vitest";
import { MIN_BONE_CLEARANCE, pushOut, type Solid } from "../bodyClearance";
import { drive, dropHeight, FACES, fmt, MAX_OFFSET, MAX_OFFSET_RATE_SPEC, moved, p95, POSES, useRig, type Face } from "./bodyClearanceHarness";
import { surfaceHeightAt, CAMPUS } from "../world/layout";

describe("body clearance, landing crouch (F-M3-3)", () => {
  useRig();
  it("the landing crouch is anticipated: the push is already in place at touchdown, never built after it (F-M3-3)", { timeout: 180000 }, () => {
    const lines: string[] = [];
    let anticipated = 0;
    // Stand a little further out each time: somewhere in that band the crouch needs a push but there is room for it.
    for (const face of FACES.filter((f, i) => i % 2 === 0 && /^(lab|workshop|tower)/.test(f.id))) {
      if (dropHeight(face) < 1.2) continue;
      for (const extra of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2]) {
        const r = drive(moved(face, extra), POSES[0], "drop-still", true);
        if (r.hardLands === 0 || r.maxOffset < 0.04) continue;
        anticipated++;
        // The root is within 15 percent of its largest offset on the touchdown frame, and the largest offset
        // before it is already that large: the crouch finds the room made, so nothing has to jump.
        if (r.offsetAtTouchdown < 0.85 * r.maxOffset) lines.push(`${face.id} +${extra}: ${fmt(r.offsetAtTouchdown)} m at touchdown of ${fmt(r.maxOffset)} m`);
        if (r.maxOffsetRate > MAX_OFFSET_RATE_SPEC) lines.push(`${face.id} +${extra}: rate ${r.maxOffsetRate.toFixed(2)} m/s`);
        if (r.minFree < MIN_BONE_CLEARANCE - 1e-6) lines.push(`${face.id} +${extra}: ${fmt(r.minFree)} m`);
      }
    }
    expect(lines).toEqual([]);
    expect(anticipated, "hard landings that needed a push").toBeGreaterThanOrEqual(3);
  });

  it("the hard landing still reads hard where there is room, and is the soft one where a wall is within reach of the crouch", { timeout: 180000 }, () => {
    let roomy = 0;
    let roomyHard = 0;
    let tight = 0;
    let tightSoft = 0;
    const odd: string[] = [];
    for (const face of FACES) {
      if (dropHeight(face) < 1.2) continue;
      for (const extra of [0, 1.2, 1.6]) {
        const f2 = moved(face, extra);
        const on = drive(f2, POSES[0], "drop-still", true);
        const off = drive(f2, POSES[0], "drop-still", false);
        if (on.hardLands === 0) continue;
        const sameCrouch = Math.abs(on.lowestHips - off.lowestHips) < 0.02;
        if (on.maxOffset === 0 && on.limitedFrames === 0 && on.lowestHips < 0.5) {
          // Nothing within reach: the crouch is the pass-off crouch.
          roomy++;
          if (sameCrouch) roomyHard++;
          else odd.push(`${face.id} +${extra}: hips ${fmt(on.lowestHips)} vs ${fmt(off.lowestHips)}`);
        }
        if (!sameCrouch) {
          tight++;
          // A soft landing: nothing reaches forward, and the body clearance still holds.
          if (on.lowestHips > off.lowestHips + 0.05 && on.minFree >= MIN_BONE_CLEARANCE - 1e-6) tightSoft++;
        }
      }
    }
    expect(odd).toEqual([]);
    expect(roomy, "landings with room").toBeGreaterThanOrEqual(10);
    expect(roomyHard).toBe(roomy);
    expect(tight, "landings with a wall in reach").toBeGreaterThanOrEqual(5);
    expect(tightSoft).toBe(tight);
  });

  it("walking into a wall during the crouch gets up at once instead of leaning into it (no snap, clearance holds)", { timeout: 120000 }, () => {
    const lines: string[] = [];
    let cancelled = 0;
    for (const face of FACES) {
      if (dropHeight(face) < 1.2) continue;
      const on = drive(moved(face, 1.0), POSES[0], "drop", true);
      const off = drive(moved(face, 1.0), POSES[0], "drop", false);
      if (on.lowestHips > off.lowestHips + 0.05) cancelled++;
      if (on.maxOffsetRate > MAX_OFFSET_RATE_SPEC) lines.push(`${face.id}: rate ${on.maxOffsetRate.toFixed(2)} m/s`);
      if (on.minFree < MIN_BONE_CLEARANCE - 1e-6) lines.push(`${face.id}: ${fmt(on.minFree)} m`);
    }
    expect(lines).toEqual([]);
    expect(cancelled, "crouches cut short at a wall").toBeGreaterThanOrEqual(5);
  });
});
