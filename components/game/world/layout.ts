// World data: one file drives both the visuals and the colliders (design 2.8).
// TEST_ARENA (M1) is a flat 30 x 30 m ground with a wall, ramps, steps, a ledge and a pit.
// CAMPUS (M3) is the 60 x 60 m technology campus. All sizes are full extents in metres. Ground
// tops sit at y = 0. Geometry (blocks), signs, rooms and interactables are plain data: the
// colliders, the visuals and the tests all read the same lists.
import type { Interactable, Vec3 } from "../config";
import { ramp, v } from "./builders";
import { buildCampus } from "./campus";

export type { Interactable };

export type Block = {
  id: string;
  kind: "ground" | "wall" | "building" | "ramp" | "step" | "prop";
  center: Vec3;
  size: Vec3;
  yawDeg?: number;
  pitchDeg?: number; // ramps rise toward +z before the yaw is applied
  material: Material;
  /** True: the follow camera may not pass through it (walls, roofs, every walkable surface). */
  blocksCamera: boolean;
  route?: "main" | "optional";
  /** False: visual only, no collider (paving, canopies, trim). Absent means it collides. */
  collide?: boolean;
  /**
   * Extra collision margin (m) added on every side of the collider, none to the visual: the
   * avatar's head, shoulders and hands reach past its capsule, and this keeps them out of a
   * wall they are walked or jumped against (the boundary hedge). The camera blocker follows it.
   */
  standoff?: number;
  /** Steps: the riser height this tread adds over what is in front of it (checked by layout.test). */
  rise?: number;
};

export type Material =
  | "ground"
  | "path"
  | "stone"
  | "metal"
  | "accent-green"
  | "accent-cyan"
  | "paving"
  | "wood"
  | "foliage"
  | "glow-green"
  | "glow-cyan";

/** A readable label board. The visual pass draws `text` on a plane facing `yawDeg`. */
export type Sign = {
  id: string;
  text: string;
  center: Vec3;
  yawDeg: number; // the plane faces (sin yaw, cos yaw)
  width: number;
  height: number;
  accent: "green" | "cyan";
};

export type DestinationId = "lab" | "workshop" | "tower";
export type Destination = {
  id: DestinationId;
  name: string;
  /** Feet position on the threshold, where the walkable route enters. */
  entrance: Vec3;
  centre: Vec3;
};

/** An oriented interior volume (a building's inside). The camera must not sit in one unless the avatar does. */
export type Room = { id: string; center: Vec3; size: Vec3; yawDeg: number };

export type Layout = {
  name: "test-arena" | "campus";
  blocks: readonly Block[];
  spawn: Vec3; // feet position
  spawnYawDeg: number;
  killPlaneY: number;
  interactables: readonly Interactable[];
  beacon: Vec3 | null;
  signs: readonly Sign[];
  destinations: readonly Destination[];
  rooms: readonly Room[];
};

export const TEST_ARENA: Layout = {
  name: "test-arena",
  killPlaneY: -10,
  // Ground with a 4 x 4 m pit at x 8..12, z 8..12 (nothing below it: the fall hits the kill plane).
  blocks: [
    { id: "ground-a", kind: "ground", center: v(-3.5, -0.5, 0), size: v(23, 1, 30), material: "ground", blocksCamera: false },
    { id: "ground-b", kind: "ground", center: v(13.5, -0.5, 0), size: v(3, 1, 30), material: "ground", blocksCamera: false },
    { id: "ground-c", kind: "ground", center: v(10, -0.5, -3.5), size: v(4, 1, 23), material: "ground", blocksCamera: false },
    { id: "ground-d", kind: "ground", center: v(10, -0.5, 13.5), size: v(4, 1, 3), material: "ground", blocksCamera: false },
    { id: "wall", kind: "wall", center: v(-6, 1.5, 0), size: v(8, 3, 0.5), material: "stone", blocksCamera: true },
    ramp("ramp-30", -12, 2, 8, 3, 30),
    ramp("ramp-45", -7, 2, 6, 3, 45),
    { id: "step-020", kind: "step", center: v(0, 0.1, 3), size: v(4, 0.2, 2), material: "accent-green", blocksCamera: false },
    { id: "step-035", kind: "step", center: v(5, 0.175, 3), size: v(4, 0.35, 2), material: "accent-cyan", blocksCamera: false },
    { id: "ledge-100", kind: "prop", center: v(0, 0.5, 10), size: v(4, 1, 4), material: "stone", blocksCamera: true },
  ],
  spawn: v(0, 0, -12),
  spawnYawDeg: 0,
  interactables: [],
  beacon: null,
  signs: [],
  destinations: [],
  rooms: [],
};

export const CAMPUS: Layout = buildCampus();

/** The campus is the shipped world; the test arena stays reachable for QA with `?arena=test`. */
export function resolveLayout(name?: Layout["name"]): Layout {
  return name === "test-arena" ? TEST_ARENA : CAMPUS;
}

export function getBlock(layout: Layout, id: string): Block {
  const b = layout.blocks.find((x) => x.id === id);
  if (!b) throw new Error(`layout ${layout.name} has no block ${id}`);
  return b;
}

/** Rotation of a block: yaw about Y applied after the pitch about X (rising toward +z). */
export function blockQuaternion(b: Block): { x: number; y: number; z: number; w: number } {
  const pitch = ((b.pitchDeg ?? 0) * Math.PI) / 180;
  const yaw = ((b.yawDeg ?? 0) * Math.PI) / 180;
  // qx = rotation of -pitch about X, qy = rotation of yaw about Y; q = qy * qx.
  const sx = Math.sin(-pitch / 2);
  const cx = Math.cos(-pitch / 2);
  const sy = Math.sin(yaw / 2);
  const cy = Math.cos(yaw / 2);
  return { x: cy * sx, y: sy * cx, z: -sy * sx, w: cy * cx };
}

/**
 * Height of the highest collidable top surface under (x, z), or null over a void. Flat blocks and
 * ramps are handled (pitch about X, then yaw). `maxY` ignores anything above it (a roof over a
 * floor). Used by the tests and by layout checks.
 */
export function surfaceHeightAt(layout: Layout, x: number, z: number, opts: { exclude?: (b: Block) => boolean; maxY?: number } = {}): number | null {
  const { exclude, maxY = Infinity } = opts;
  let best: number | null = null;
  for (const b of layout.blocks) {
    if (b.collide === false || exclude?.(b)) continue;
    const q = blockQuaternion(b);
    // Top-face normal = q * (0, 1, 0).
    const ny = 1 - 2 * (q.x * q.x + q.z * q.z);
    const nx = 2 * (q.x * q.y - q.w * q.z);
    const nz = 2 * (q.y * q.z + q.w * q.x);
    if (ny < 0.2) continue; // a wall face, not a floor
    const py = (nx * (b.center.x + nx * (b.size.y / 2)) + ny * (b.center.y + ny * (b.size.y / 2)) + nz * (b.center.z + nz * (b.size.y / 2)) - nx * x - nz * z) / ny;
    // Footprint test in the block's own frame (inverse rotation of the point on the top plane).
    const dx = x - b.center.x;
    const dy = py - b.center.y;
    const dz = z - b.center.z;
    const lx = (1 - 2 * (q.y * q.y + q.z * q.z)) * dx + 2 * (q.x * q.y + q.w * q.z) * dy + 2 * (q.x * q.z - q.w * q.y) * dz;
    const lz = 2 * (q.x * q.z + q.w * q.y) * dx + 2 * (q.y * q.z - q.w * q.x) * dy + (1 - 2 * (q.x * q.x + q.y * q.y)) * dz;
    if (Math.abs(lx) <= b.size.x / 2 + 1e-9 && Math.abs(lz) <= b.size.z / 2 + 1e-9 && py <= maxY && (best === null || py > best)) best = py;
  }
  return best;
}
