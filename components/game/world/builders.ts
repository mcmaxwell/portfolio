// Small helpers that turn compact descriptions into layout data. Pure functions, no three, no Rapier.
import type { Vec3 } from "../config";
import type { Block, Material } from "./layout";

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

const RAD = Math.PI / 180;

/** Rotate a local (x, z) offset about +Y by `yawDeg`: local +z maps to (sin yaw, cos yaw). */
export function rotateXZ(x: number, z: number, yawDeg: number): { x: number; z: number } {
  const c = Math.cos(yawDeg * RAD);
  const s = Math.sin(yawDeg * RAD);
  return { x: x * c + z * s, z: -x * s + z * c };
}

/**
 * A slab that rises toward +z at `pitchDeg`, with the top surface touching the ground
 * (y = 0) at z = z0. The lower end dips into the ground block, so there is no gap.
 */
export function ramp(
  id: string,
  x: number,
  z0: number,
  length: number,
  width: number,
  pitchDeg: number,
  thickness = 0.5
): Block {
  const th = pitchDeg * RAD;
  // d: up-slope direction; n: top-surface normal.
  const dy = Math.sin(th);
  const dz = Math.cos(th);
  const ny = Math.cos(th);
  const nz = -Math.sin(th);
  return {
    id,
    kind: "ramp",
    center: v(x, (length / 2) * dy - (thickness / 2) * ny, z0 + (length / 2) * dz - (thickness / 2) * nz),
    size: v(width, thickness, length),
    pitchDeg,
    material: "metal",
    blocksCamera: true,
    route: "optional",
  };
}

type Opts = {
  /** False: visual only. */
  collide?: boolean;
  /** Overrides the default (true for anything that collides, false for visual-only pieces). */
  camera?: boolean;
  route?: "main" | "optional";
  yaw?: number;
  pitch?: number;
  rise?: number;
  standoff?: number;
};
type Tri = readonly [number, number, number];

/** One block from centre and size triples. */
export function blk(id: string, kind: Block["kind"], c: Tri, s: Tri, material: Material, o: Opts = {}): Block {
  const collide = o.collide !== false;
  return {
    id,
    kind,
    center: v(c[0], c[1], c[2]),
    size: v(s[0], s[1], s[2]),
    material,
    blocksCamera: o.camera ?? collide,
    ...(o.yaw !== undefined ? { yawDeg: o.yaw } : {}),
    ...(o.pitch !== undefined ? { pitchDeg: o.pitch } : {}),
    ...(o.route ? { route: o.route } : {}),
    ...(collide ? {} : { collide: false }),
    ...(o.rise !== undefined ? { rise: o.rise } : {}),
    ...(o.standoff !== undefined ? { standoff: o.standoff } : {}),
  };
}

/**
 * Moves blocks authored in a building's local frame (front at local z = 0 facing -z, depth toward
 * +z, x lateral, y absolute) into the world: rotate about +Y by `yawDeg`, then translate.
 */
export function placeBlocks(origin: { x: number; z: number }, yawDeg: number, prefix: string, locals: readonly Block[]): Block[] {
  return locals.map((b) => {
    const r = rotateXZ(b.center.x, b.center.z, yawDeg);
    return { ...b, id: `${prefix}-${b.id}`, center: v(origin.x + r.x, b.center.y, origin.z + r.z), yawDeg: yawDeg + (b.yawDeg ?? 0) };
  });
}

export function placePoint(origin: { x: number; z: number }, yawDeg: number, p: Tri): Vec3 {
  const r = rotateXZ(p[0], p[2], yawDeg);
  return v(origin.x + r.x, p[1], origin.z + r.z);
}

/** A flat, collision-free strip on the ground between two points (a path). */
export function pathStrip(id: string, a: { x: number; z: number }, b: { x: number; z: number }, width: number, material: Material = "path"): Block {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  return blk(id, "prop", [(a.x + b.x) / 2, 0.012, (a.z + b.z) / 2], [width, 0.024, len], material, {
    collide: false,
    yaw: Math.atan2(dx, dz) / RAD,
  });
}
