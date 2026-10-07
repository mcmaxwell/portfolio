// World data: one file drives both the visuals and the colliders (design 2.8).
// TEST_ARENA (M1) is a flat 30 x 30 m ground with a wall, ramps, steps, a ledge and a pit.
// All sizes are full extents in metres. Ground tops sit at y = 0.
import type { Vec3 } from "../config";

export type Block = {
  id: string;
  kind: "ground" | "wall" | "building" | "ramp" | "step" | "prop";
  center: Vec3;
  size: Vec3;
  yawDeg?: number;
  pitchDeg?: number; // ramps rise toward +z before the yaw is applied
  material: "ground" | "path" | "stone" | "metal" | "accent-green" | "accent-cyan";
  blocksCamera: boolean;
  route?: "main" | "optional";
};

/** Placeholder until the interaction system arrives in M3. */
export type Interactable = { id: string; position: Vec3 };

export type Layout = {
  name: "test-arena" | "campus";
  blocks: readonly Block[];
  spawn: Vec3; // feet position
  spawnYawDeg: number;
  killPlaneY: number;
  interactables: readonly Interactable[];
  beacon: Vec3 | null;
};

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/**
 * A slab that rises toward +z at `pitchDeg`, with the top surface touching the ground
 * (y = 0) at z = z0. The lower end dips into the ground block, so there is no gap.
 */
function ramp(
  id: string,
  x: number,
  z0: number,
  length: number,
  width: number,
  pitchDeg: number,
  thickness = 0.5
): Block {
  const th = (pitchDeg * Math.PI) / 180;
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
};

// CAMPUS arrives in M3.

/** Until CAMPUS exists every name resolves to the test arena. */
export function resolveLayout(name?: Layout["name"]): Layout {
  void name;
  return TEST_ARENA;
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
