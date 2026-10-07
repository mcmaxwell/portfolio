// Visual-only decor for the campus (visual pass): trees, bushes, lamps, windows, door frames, floors,
// light pools. Pure data, no three, no Rapier: nothing here has a collider, and nothing reads or
// moves the layout. Each part is a shape, a material key (world/materials.ts) and a transform;
// resources.ts batches parts of the same shape and material into one instanced draw call.
import { placePoint } from "./builders";
import { FRAMES, HALL } from "./campus";
import type { Layout } from "./layout";

export type Shape = "box" | "cyl" | "orb" | "cone" | "quad" | "pine";

export type DecorPart = {
  shape: Shape;
  mat: string;
  /** Centre in world metres. */
  x: number;
  y: number;
  z: number;
  /** Scale: box and quad are extents, cyl and cone are (diameter, height, diameter), orb is the diameter. */
  sx: number;
  sy: number;
  sz: number;
  yawDeg: number;
  /** 0..1 colour variation for instanced tints (leaves, rock). */
  tint: number;
};

type Frame = { origin: { x: number; z: number }; yaw: number };

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Parts {
  readonly list: DecorPart[] = [];
  add(shape: Shape, mat: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, yawDeg = 0, tint = 0.5) {
    this.list.push({ shape, mat, x, y, z, sx, sy, sz, yawDeg, tint });
  }
  /** A part authored in a building's local frame (front at z = 0 facing -z, depth toward +z). */
  local(f: Frame, shape: Shape, mat: string, p: readonly [number, number, number], s: readonly [number, number, number], extraYaw = 0, tint = 0.5) {
    const w = placePoint(f.origin, f.yaw, p);
    this.add(shape, mat, w.x, w.y, w.z, s[0], s[1], s[2], f.yaw + extraYaw, tint);
  }
}

const { W, D, H, T, DOOR, DOOR_H } = HALL;

/** Front windows, door frame, plinth, corner pilasters and interior finish shared by the two halls. */
function hall(out: Parts, f: Frame, fy: number, accent: "cyan" | "green", poolZ: number) {
  const glass = `glass-${accent}`;
  const neon = `neon-${accent}`;
  const seg = W / 2 + T - DOOR / 2;
  const segX = DOOR / 2 + seg / 2;
  const front = -T;
  for (const sgn of [-1, 1]) {
    // Base plinth in front of each wall segment and along the sides.
    out.local(f, "box", "trim", [sgn * segX, fy + 0.2, front - 0.04], [seg + 0.1, 0.4, 0.08]);
    out.local(f, "box", "trim", [sgn * (W / 2 + T + 0.04), fy + 0.2, D / 2], [0.08, 0.4, D + 0.2]);
    // Corner pilasters, front and back.
    out.local(f, "box", "trim", [sgn * (W / 2 + T - 0.05), fy + H / 2, front - 0.06], [0.5, H, 0.12]);
    out.local(f, "box", "trim", [sgn * (W / 2 + T - 0.05), fy + H / 2, D + T + 0.06], [0.5, H, 0.12]);
    // Window: frame, glass, mullions.
    const wx = sgn * segX;
    const wy = fy + 1.75;
    out.local(f, "box", "trim", [wx, wy, front - 0.03], [2.7, 1.8, 0.06]);
    out.local(f, "box", "glass-" + accent, [wx, wy, front - 0.065], [2.4, 1.5, 0.04]);
    out.local(f, "box", "trim", [wx, wy, front - 0.1], [0.07, 1.5, 0.04]);
    out.local(f, "box", "trim", [wx, wy, front - 0.1], [2.4, 0.07, 0.04]);
    // Door jamb.
    out.local(f, "box", "trim", [sgn * (DOOR / 2 + 0.13), fy + DOOR_H / 2, front - 0.04], [0.26, DOOR_H, 0.08]);
    // Side windows (outside faces), two per side.
    for (const z of [2.2, 5.6]) {
      out.local(f, "box", "trim", [sgn * (W / 2 + T + 0.12), fy + 1.75, z], [0.06, 1.8, 2.0], 0);
      out.local(f, "box", glass, [sgn * (W / 2 + T + 0.16), fy + 1.75, z], [1.7, 1.5, 0.04], sgn * -90);
    }
  }
  out.local(f, "box", "trim", [0, fy + DOOR_H + 0.1, front - 0.04], [DOOR + 0.52, 0.2, 0.08]);
  out.local(f, "box", neon, [0, fy + DOOR_H + 0.28, front - 0.07], [DOOR + 0.52, 0.05, 0.04]);
  // Interior: floor slab, ceiling light panels, skirting light.
  out.local(f, "box", "floor", [0, fy + 0.006, D / 2], [W, 0.012, D]);
  out.local(f, "box", "wall", [0, fy + H - 0.015, D / 2], [W, 0.03, D]);
  for (const z of [1.8, 4.2, 6.6]) {
    out.local(f, "box", "panel-light", [0, fy + H - 0.04, z], [2.4, 0.06, 0.5]);
    out.local(f, "quad", "decal-white", [0, fy + 0.03, z], [6.5, 1, 6.5]);
  }
  out.local(f, "box", neon, [0, fy + 0.07, D - 0.03], [W - 0.2, 0.05, 0.04]);
  for (const sgn of [-1, 1]) out.local(f, "box", neon, [sgn * (W / 2 - 0.03), fy + 0.07, D / 2], [0.04, 0.05, D - 0.2]);
  // Light pool in front of the door.
  out.local(f, "quad", `decal-${accent}`, [0, 0.045, poolZ], [7.5, 1, 7.5]);
}

/** Soft light spilled on the floor by the glowing strips and machine tops (read from the layout, never changes it). */
function spill(out: Parts, layout: Layout) {
  for (const blk of layout.blocks) {
    const yaw = blk.yawDeg ?? 0;
    if (blk.id === "floor-glow") {
      out.add("quad", "decal-cyan", blk.center.x, blk.center.y + blk.size.y / 2 + 0.012, blk.center.z, 2.2, 1, blk.size.z + 1.6, yaw);
    } else if (/^machine-glow-\d$/.test(blk.id)) {
      const floor = FRAMES.workshopFloor;
      out.add("quad", "decal-green", blk.center.x, floor + 0.04, blk.center.z, blk.size.x + 2.2, 1, blk.size.z + 2.2, yaw);
    }
  }
}

function lab(out: Parts) {
  const f = FRAMES.lab;
  hall(out, f, 0, "cyan", -2.6);
  // Rooftop plant: two units and a vent.
  out.local(f, "box", "trim", [-2.6, H + 0.75, 3.5], [1.6, 0.7, 1.1]);
  out.local(f, "box", "steel", [-2.6, H + 1.15, 3.5], [1.4, 0.1, 0.9]);
  out.local(f, "box", "trim", [2.4, H + 0.7, 5.5], [1.2, 0.6, 1.0]);
  out.local(f, "cyl", "steel", [3.0, H + 0.9, 2.2], [0.5, 1.0, 0.5]);
  // Kiosk screen bezel.
  out.local(f, "box", "trim", [-4.0, 1.25, 1.55], [0.82, 0.62, 0.05], 30);
}

function workshop(out: Parts) {
  const f = FRAMES.workshop;
  const fy = FRAMES.workshopFloor;
  hall(out, f, fy, "green", -5);
  const eave = fy + H;
  out.local(f, "box", "trim", [0, eave + 2.95, 4.1], [0.5, 0.22, D + T + 1.0]);
  // Vents on the roof slopes and a flue cap on the chimney.
  out.local(f, "cyl", "steel", [-3.8, eave + 5.05, D - 1.2], [1.05, 0.12, 1.05]);
  // Platform edge trim.
  out.local(f, "box", "trim", [0, fy + 0.02, -0.52], [W + 2 * T + 1.7, 0.06, 0.08]);
}

function tower(out: Parts) {
  const f = FRAMES.tower;
  const fy = FRAMES.towerFloor;
  // Dark steel surround behind the neon door frame.
  for (const sgn of [-1, 1]) out.local(f, "box", "trim", [sgn * 1.5, fy + 1.75, -0.07], [0.6, 3.5, 0.1]);
  out.local(f, "box", "trim", [0, fy + 3.62, -0.07], [3.6, 0.35, 0.1]);
  // Window slits on the wing fronts and sides.
  for (const sgn of [-1, 1]) {
    for (const y of [1.3, 2.7, 3.9, 6.85]) {
      out.local(f, "box", "trim", [sgn * 2.2, fy + y, -0.03], [0.96, 1.06, 0.06]);
      out.local(f, "box", "glass-cyan", [sgn * 2.2, fy + y, -0.065], [0.8, 0.9, 0.04]);
    }
    for (const y of [2.0, 4.4, 6.8]) {
      for (const z of [1.2, 2.8, 4.4, 6.0]) {
        out.local(f, "box", "trim", [sgn * 3.23, fy + y, z], [0.06, 1.06, 1.0]);
        out.local(f, "box", "glass-cyan", [sgn * 3.27, fy + y, z], [0.8, 0.9, 0.04], sgn * -90);
      }
    }
  }
  // Cornice along the top of the wings.
  out.local(f, "box", "trim", [0, 8.09, 4], [6.6, 0.18, 8.3]);
  // Crown mast and tip.
  out.local(f, "cyl", "pole", [0, 11.9, 4], [0.14, 2.6, 0.14]);
  out.local(f, "orb", "lamp-glow", [0, 13.25, 4], [0.34, 0.34, 0.34]);
  // Podium trim, light pools and ceiling lights in the passage.
  out.local(f, "box", "trim", [0, fy - 0.03, -0.02], [12.1, 0.06, 0.1]);
  for (const z of [1.4, 3.6, 5.8]) {
    out.local(f, "box", "panel-light", [0, fy + 3.37, z], [0.5, 0.06, 1.1]);
    out.local(f, "quad", "decal-white", [0, fy + 0.03, z], [4.2, 1, 4.2]);
  }
  out.local(f, "quad", "decal-cyan", [0, 0.05, -3.4], [9, 1, 9]);
  out.local(f, "quad", "decal-cyan", [0, fy + 0.02, 1.2], [4.5, 1, 4.5]);
}

function plaza(out: Parts, layout: Layout) {
  const b = layout.beacon;
  if (b) {
    out.add("quad", "decal-cyan", b.x, 0.05, b.z, 10.5, 1, 10.5);
    out.add("quad", "ring-cyan", b.x, 0.052, b.z, 8.4, 1, 8.4);
    out.add("cyl", "trim", b.x, 0.97, b.z, 0.85, 0.06, 0.85);
    for (const [dx, dz] of [[0.42, 0.42], [-0.42, 0.42], [0.42, -0.42], [-0.42, -0.42]] as const) {
      out.add("cyl", "pole", b.x + dx, 0.45, b.z + dz, 0.07, 0.9, 0.07);
    }
  }
  // Curbs along both sides of each path strip.
  for (const blk of layout.blocks) {
    if (!blk.id.startsWith("path-")) continue;
    const yaw = blk.yawDeg ?? 0;
    const sin = Math.sin((yaw * Math.PI) / 180);
    const cos = Math.cos((yaw * Math.PI) / 180);
    // The curb starts where the path leaves the 16 m plaza paving.
    const len = blk.size.z;
    let s0 = 0;
    while (s0 < len) {
      const px = blk.center.x + sin * (s0 - len / 2);
      const pz = blk.center.z + cos * (s0 - len / 2);
      if (Math.max(Math.abs(px), Math.abs(pz)) >= 8.1) break;
      s0 += 0.1;
    }
    const cl = len - s0;
    if (cl < 0.5) continue;
    const mid = (s0 + len) / 2 - len / 2;
    for (const sgn of [-1, 1]) {
      const off = sgn * (blk.size.x / 2 + 0.06);
      out.add("box", "curb", blk.center.x + off * cos + sin * mid, 0.035, blk.center.z - off * sin + cos * mid, 0.12, 0.07, cl, yaw);
    }
  }
  // Benches get a backrest, a seat board and legs.
  for (const blk of layout.blocks) {
    if (!/^bench-\d$/.test(blk.id)) continue;
    out.add("box", "wood", blk.center.x, 0.53, blk.center.z, blk.size.x + 0.1, 0.06, blk.size.z + 0.1);
    out.add("box", "wood", blk.center.x, 0.82, blk.center.z + 0.3, blk.size.x, 0.4, 0.06);
    for (const sgn of [-1, 1]) out.add("box", "pole", blk.center.x + sgn * 0.85, 0.26, blk.center.z, 0.08, 0.5, 0.5);
  }
  // Planter shrubs: two clumps each, with a rim.
  for (const blk of layout.blocks) {
    const m = /^planter-(\d)-shrub$/.exec(blk.id);
    if (!m) continue;
    const i = +m[1];
    out.add("orb", "leaves", blk.center.x - 0.12, 0.92, blk.center.z + 0.05, 1.05, 1, 1.05, i * 37, 0.2 + i * 0.15);
    out.add("orb", "leaves", blk.center.x + 0.22, 0.85, blk.center.z - 0.15, 0.8, 1, 0.8, i * 53, 0.6 + i * 0.1);
    out.add("box", "trim", blk.center.x, 0.62, blk.center.z, 1.5, 0.05, 1.5);
  }
}

function trees(out: Parts, layout: Layout) {
  for (const blk of layout.blocks) {
    const m = /^tree-(\d+)-trunk$/.exec(blk.id);
    if (!m) continue;
    const i = +m[1];
    const { x, z } = blk.center;
    out.add("cyl", "bark", x, 1.3, z, 0.46, 2.6, 0.46);
    if (i % 3 === 2) {
      // A conifer inside the same camera-blocking volume.
      out.add("cone", "leaves", x, 3.0, z, 2.4, 1.4, 2.4, i * 29, 0.2);
      out.add("cone", "leaves", x, 3.65, z, 1.9, 1.3, 1.9, i * 31, 0.3);
      out.add("cone", "leaves", x, 4.3, z, 1.3, 1.1, 1.3, i * 41, 0.4);
    } else {
      out.add("orb", "leaves", x, 3.4, z, 2.3, 2.3, 2.3, i * 17, 0.3 + 0.1 * (i % 4));
      out.add("orb", "leaves", x + 0.55, 3.15, z + 0.4, 1.4, 1.4, 1.4, i * 23, 0.55);
      out.add("orb", "leaves", x - 0.55, 3.7, z - 0.35, 1.3, 1.3, 1.3, i * 13, 0.7);
      out.add("orb", "leaves", x - 0.3, 3.0, z + 0.55, 1.2, 1.2, 1.2, i * 19, 0.4);
    }
  }
  // A tree line beyond the hedge: tall, pointed pines.
  const r = mulberry(91);
  for (let i = 0; i < 90; i++) {
    const ring = r();
    const a = r() * 4;
    // A point on a square ring 36 to 70 m out from the origin.
    const d = 36 + ring * 34;
    const t = (a % 1) * 2 - 1;
    const side = Math.floor(a);
    const px = side === 0 ? t * d : side === 1 ? d : side === 2 ? -t * d : -d;
    const pz = side === 0 ? d : side === 1 ? -t * d : side === 2 ? -d : t * d;
    const s = 1.6 + r() * 1.7;
    out.add("pine", "leaves", px, 0, pz, s, s, s, r() * 360, r());
  }
}

/**
 * Lateral offset (m) of the lamps either side of a hall door. A trailing camera passes a lamp on the
 * approach path, so they stand well clear of the 3.4 m path: a lamp head nearer than about 1.8 m to the
 * camera fills the foreground (QA round 4; followCamera.test.ts walks the routes).
 */
const LAMP_DOOR_X = 3.9;

function lamps(out: Parts) {
  const spots: { x: number; y?: number; z: number }[] = [];
  for (const sgn of [-1, 1]) {
    for (const z of [8.6, 11.6, 14.6]) spots.push({ x: sgn * 2.7, z });
    spots.push({ x: sgn * 7.8, z: -4.5 }, { x: sgn * 7.8, z: -1.2 }, { x: sgn * 4.6, z: -9.5 });
    for (const f of [FRAMES.lab, FRAMES.workshop]) {
      const p = placePoint(f.origin, f.yaw, [sgn * LAMP_DOOR_X, 0, -2.4]);
      spots.push({ x: p.x, z: p.z });
    }
    const q = placePoint(FRAMES.tower.origin, FRAMES.tower.yaw, [sgn * 5.2, FRAMES.towerFloor, 0.8]);
    spots.push({ x: q.x, y: q.y, z: q.z });
  }
  for (const { x, y = 0, z } of spots) {
    out.add("cyl", "pole", x, y + 1.3, z, 0.09, 2.6, 0.09);
    out.add("cyl", "pole", x, y + 0.08, z, 0.3, 0.16, 0.3);
    out.add("cyl", "pole", x, y + 0.3, z, 0.16, 0.3, 0.16);
    out.add("box", "trim", x, y + 2.92, z, 0.34, 0.06, 0.34);
    out.add("box", "lamp-glow", x, y + 2.76, z, 0.2, 0.26, 0.2);
    out.add("box", "pole", x, y + 2.59, z, 0.26, 0.06, 0.26);
    out.add("quad", "decal-warm", x, y + 0.045, z, 6.4, 1, 6.4);
  }
}

function rocks(out: Parts) {
  const r = mulberry(7);
  for (const [x, z] of [[-27, -12], [26, -9], [-26, 26], [27, 27], [-18, 26.5], [18, 27], [-12, -26], [-27, 10], [27, 12]] as const) {
    for (let k = 0; k < 3; k++) {
      const s = 0.5 + r() * 0.9;
      out.add("orb", "rock", x + (r() - 0.5) * 2, s * 0.22, z + (r() - 0.5) * 2, s * 1.4, s * 0.7, s * 1.1, r() * 360, r());
    }
  }
}

/** The outer ground: 4 slabs round the campus ground, so the world has no edge. Tops at y = 0. */
function outerGround(out: Parts) {
  const R = 150;
  out.add("box", "grass", 0, -0.5, (32 + R) / 2, 2 * R, 1, R - 32);
  out.add("box", "grass", 0, -0.5, -(32 + R) / 2, 2 * R, 1, R - 32);
  out.add("box", "grass", (32 + R) / 2, -0.5, 0, R - 32, 1, 64);
  out.add("box", "grass", -(32 + R) / 2, -0.5, 0, R - 32, 1, 64);
}

export function buildDecor(layout: Layout): DecorPart[] {
  if (layout.name !== "campus") return [];
  const out = new Parts();
  outerGround(out);
  plaza(out, layout);
  lab(out);
  workshop(out);
  tower(out);
  spill(out, layout);
  trees(out, layout);
  lamps(out);
  rocks(out);
  return out.list;
}
