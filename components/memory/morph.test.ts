import { describe, expect, it } from "vitest";
import { MORPH_SECONDS, Morph } from "./morph";

const pts = (v: number, n = 4) => new Float32Array(n * 3).fill(v);
const target = (id: string, v: number, family = "word") => ({ id, family, pts: pts(v), place: { cx: v, cy: v, scale: 1, alpha: 1, rot: 0 } });

describe("morph", () => {
  it("takes the first shape straight into slot A", () => {
    const m = new Morph(4);
    m.update(0.016, target("x", 1), 0);
    expect(m.a.id).toBe("x");
    expect(m.b.id).toBeNull();
    expect(m.a.pts[0]).toBe(1);
    expect(m.a.dirty).toBe(true);
  });

  it("morphs to a new shape through slot B and commits it", () => {
    const m = new Morph(4);
    m.update(0.016, target("x", 1), 0);
    m.update(0.5, target("y", 2), 0);
    expect(m.b.id).toBe("y");
    expect(m.mix).toBeCloseTo(0.5 / MORPH_SECONDS.far);
    expect(m.bulge).toBe(1);
    m.update(1, target("y", 2), 0);
    expect(m.a.id).toBe("y");
    expect(m.b.id).toBeNull();
    expect(m.mix).toBe(0);
    expect(m.a.pts[0]).toBe(2);
    expect(m.a.place.cx).toBe(2);
  });

  it("freezes an interrupted morph into A before starting the next one", () => {
    const m = new Morph(4);
    m.update(0.016, target("x", 1), 0);
    m.update(MORPH_SECONDS.far / 2, target("y", 2), 0);
    m.update(0.016, target("z", 3), 0);
    expect(m.a.id).toBe("x>y");
    expect(m.a.pts[0]).toBeCloseTo(1.5);
    expect(m.a.place.cx).toBeCloseTo(1.5);
    expect(m.b.id).toBe("z");
    expect(m.mix).toBeCloseTo(0.016 / MORPH_SECONDS.far);
  });

  it("moves quickly and without a bulge between poses of the avatar", () => {
    const m = new Morph(4);
    m.update(0.016, target("wave:idle", 1, "avatar"), 0);
    m.update(MORPH_SECONDS.near / 2, target("wave:a", 2, "avatar"), 0);
    expect(m.bulge).toBe(0);
    expect(m.mix).toBeCloseTo(0.5);
  });

  it("follows the target's place every frame and eases the scatter", () => {
    const m = new Morph(4);
    m.update(0.35, target("x", 1), 0);
    expect(m.scatter).toBeCloseTo(Math.exp(-1), 3);
    m.update(0.016, { ...target("x", 1), place: { cx: 50, cy: 60, scale: 2, alpha: 0.5, rot: 1 } }, 0);
    expect(m.head.place).toEqual({ cx: 50, cy: 60, scale: 2, alpha: 0.5, rot: 1 });
    m.update(10, null, 1);
    expect(m.scatter).toBeCloseTo(1, 3);
  });
});
