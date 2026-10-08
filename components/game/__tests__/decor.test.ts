import { describe, expect, it } from "vitest";
import { buildDecor } from "../world/decor";
import { buildCampus } from "../world/campus";
import { TEST_ARENA } from "../world/layout";
import { isWorldMaterial } from "../world/materials";
import { blockMaterial } from "../world/resources";

// The visual pass is data on top of the layout: it must never touch the layout, and every surface
// it names must exist in the material set.
describe("campus decor (visual pass)", () => {
  const campus = buildCampus();

  it("leaves the layout untouched", () => {
    const before = JSON.stringify(campus);
    buildDecor(campus);
    expect(JSON.stringify(campus)).toBe(before);
  });

  it("is empty for the test arena", () => {
    expect(buildDecor(TEST_ARENA)).toEqual([]);
  });

  it("names only known materials, for blocks and for decor", () => {
    for (const b of campus.blocks) {
      const m = blockMaterial(b);
      if (m === null) expect(b.id).toMatch(/^(tree-\d+-(trunk|crown)|planter-\d+-shrub)$/);
      else expect(isWorldMaterial(m), `${b.id} -> ${m}`).toBe(true);
    }
    for (const d of buildDecor(campus)) expect(isWorldMaterial(d.mat), d.mat).toBe(true);
  });

  it("has finite transforms inside the world", () => {
    for (const d of buildDecor(campus)) {
      for (const n of [d.x, d.y, d.z, d.sx, d.sy, d.sz, d.yawDeg, d.tint]) expect(Number.isFinite(n)).toBe(true);
      expect(Math.abs(d.x)).toBeLessThan(200);
      expect(Math.abs(d.z)).toBeLessThan(200);
      expect(d.sx).toBeGreaterThan(0);
      expect(d.sy).toBeGreaterThan(0);
      expect(d.sz).toBeGreaterThan(0);
    }
  });

  it("replaces every tree box with a trunk and a leafy crown that stays inside the camera volume", () => {
    const trunks = campus.blocks.filter((b) => /^tree-\d+-trunk$/.test(b.id));
    expect(trunks.length).toBeGreaterThan(0);
    const decor = buildDecor(campus);
    for (const t of trunks) {
      const crown = campus.blocks.find((b) => b.id === t.id.replace("trunk", "crown"))!;
      const leaves = decor.filter((d) => d.mat === "leaves" && Math.abs(d.x - t.center.x) < 1.3 && Math.abs(d.z - t.center.z) < 1.3 && d.y > 2);
      expect(leaves.length, t.id).toBeGreaterThanOrEqual(3);
      for (const l of leaves) {
        expect(Math.abs(l.x - crown.center.x) + l.sx / 2).toBeLessThanOrEqual(crown.size.x / 2 + 0.02);
        expect(Math.abs(l.z - crown.center.z) + l.sz / 2).toBeLessThanOrEqual(crown.size.z / 2 + 0.02);
      }
    }
  });

  it("keeps the far tree line outside the hedge", () => {
    for (const d of buildDecor(campus)) if (d.shape === "pine") expect(Math.max(Math.abs(d.x), Math.abs(d.z))).toBeGreaterThanOrEqual(35);
  });
});
