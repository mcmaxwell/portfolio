// No two surfaces of different materials lie on the same level where they overlap: at the same height
// the two textures fight for the same pixels (z-fighting) and the spot blinks as the camera moves.
// That is what made the path tiles in front of the Project Lab and the Skills Workshop blink, where
// the paths ran onto the plaza paving at its exact height.
import { describe, expect, it } from "vitest";
import { buildDecor } from "../world/decor";
import { CAMPUS } from "../world/layout";
import { blockMaterial } from "../world/resources";

type Top = { id: string; mat: string; x: number; z: number; top: number; sx: number; sz: number; yaw: number };

function tops(): Top[] {
  const out: Top[] = [];
  for (const b of CAMPUS.blocks) {
    const mat = blockMaterial(b);
    if (!mat || b.pitchDeg) continue;
    out.push({ id: b.id, mat, x: b.center.x, z: b.center.z, top: b.center.y + b.size.y / 2, sx: b.size.x, sz: b.size.z, yaw: b.yawDeg ?? 0 });
  }
  buildDecor(CAMPUS).forEach((d, i) => {
    if (d.shape === "box") out.push({ id: `decor-${i}-${d.mat}`, mat: d.mat, x: d.x, z: d.z, top: d.y + d.sy / 2, sx: d.sx, sz: d.sz, yaw: d.yawDeg });
  });
  return out;
}

const RAD = Math.PI / 180;
const inside = (b: Top, x: number, z: number) => {
  const dx = x - b.x;
  const dz = z - b.z;
  const lx = dx * Math.cos(b.yaw * RAD) - dz * Math.sin(b.yaw * RAD);
  const lz = dx * Math.sin(b.yaw * RAD) + dz * Math.cos(b.yaw * RAD);
  return Math.abs(lx) < b.sx / 2 - 0.01 && Math.abs(lz) < b.sz / 2 - 0.01;
};

describe("no z-fighting between top surfaces", () => {
  it("no two different materials share a level (within 3 mm) where their tops overlap", () => {
    const all = tops();
    const clashes: string[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        if (a.mat === b.mat || Math.abs(a.top - b.top) > 0.003) continue;
        const r = a.yaw * RAD;
        let hit = false;
        for (let u = -0.5; u <= 0.5 && !hit; u += 0.05) {
          for (let w = -0.5; w <= 0.5 && !hit; w += 0.05) {
            const lx = u * a.sx;
            const lz = w * a.sz;
            const x = a.x + lx * Math.cos(r) + lz * Math.sin(r);
            const z = a.z - lx * Math.sin(r) + lz * Math.cos(r);
            hit = inside(a, x, z) && inside(b, x, z);
          }
        }
        if (hit) clashes.push(`${a.id} and ${b.id} at ${a.top.toFixed(3)} m`);
      }
    }
    expect(clashes).toEqual([]);
  });
});
