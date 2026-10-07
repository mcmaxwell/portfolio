// The campus (Milestone 3): authored as plain data, in building-local frames where that helps.
//
// Handedness: the camera looks along +z at spawn, so screen-left is world +x. The Project Lab
// stands on the left of the plaza (+x) and the Skills Workshop on the right (-x); the Contact
// Tower is straight ahead beyond the garden path (+z). The spec says "Project Lab left of the
// plaza", which is what the player sees; design.md's "negative x" was written without the
// handedness in mind.
//
// A separate visual pass (dusk lighting, materials, trees, props) follows this stage, so the
// geometry here is primitives only, and blocks are tagged so that visuals and colliders stay
// separate: `collide: false` blocks are visual only.
import type { Interactable } from "../config";
import { blk, pathStrip, placeBlocks, placePoint, ramp, v } from "./builders";
import type { Block, Destination, Layout, Room, Sign } from "./layout";

/** Extra collision margin round the boundary hedge (m): the head, shoulders and hands reach this far past the capsule. */
const HEDGE_STANDOFF = 0.6;
/** The same for building and wall faces (m): the head reaches about 0.08 m past the capsule on a jump. */
const WALL_STANDOFF = 0.15;

const RAD = Math.PI / 180;

// A hall: 10 m wide, 8 m deep, 3.6 m walls, a 3 m door.
const W = 10;
const D = 8;
const H = 3.6;
const T = 0.4;
const DOOR = 3;
const DOOR_H = 2.6;

/** Walls with a door in the front (local z = 0, facing -z). */
function hallShell(fy: number): Block[] {
  const seg = W / 2 + T - DOOR / 2;
  const segX = DOOR / 2 + seg / 2;
  return [
    blk("back", "building", [0, fy + H / 2, D + T / 2], [W + 2 * T, H, T], "stone"),
    blk("side-l", "building", [-(W / 2 + T / 2), fy + H / 2, D / 2], [T, H, D], "stone"),
    blk("side-r", "building", [W / 2 + T / 2, fy + H / 2, D / 2], [T, H, D], "stone"),
    blk("front-l", "building", [-segX, fy + H / 2, -T / 2], [seg, H, T], "stone"),
    blk("front-r", "building", [segX, fy + H / 2, -T / 2], [seg, H, T], "stone"),
    blk("lintel", "building", [0, fy + DOOR_H + (H - DOOR_H) / 2, -T / 2], [DOOR, H - DOOR_H, T], "stone"),
  ];
}

const hallRoom = (id: string, fy: number): Room => ({ id, center: v(0, fy + H / 2, D / 2), size: v(W, H, D), yawDeg: 0 });

// The halls stand at the V of the plaza and face its centre, so both signs are in view from spawn.
const LAB = { origin: { x: 9.5, z: 13 }, yaw: Math.atan2(0.5, 0.8) / RAD };
const WORKSHOP = { origin: { x: -9.5, z: 13 }, yaw: -Math.atan2(0.5, 0.8) / RAD };
const TOWER = { origin: { x: 0, z: 17.5 }, yaw: 0 };
const WORKSHOP_FLOOR = 0.5;
const TOWER_FLOOR = 0.6;

/** Building frames and hall dimensions, read by the visual-only decor (world/decor.ts). */
export const FRAMES = { lab: LAB, workshop: WORKSHOP, tower: TOWER, workshopFloor: WORKSHOP_FLOOR, towerFloor: TOWER_FLOOR } as const;
export const HALL = { W, D, H, T, DOOR, DOOR_H } as const;

function labBlocks(): Block[] {
  const roofLen = D + T + 0.8;
  const out: Block[] = [
    ...hallShell(0),
    blk("roof", "building", [0, H + 0.2, -0.5 + roofLen / 2], [W + 2 * T + 0.6, 0.4, roofLen], "metal"),
    blk("roof-glow", "prop", [0, H + 0.12, -0.6], [W + 2 * T + 0.6, 0.16, 0.12], "glow-cyan", { collide: false }),
    blk("floor-glow", "prop", [0, 0.025, D / 2], [0.3, 0.05, D - 1.5], "glow-cyan", { collide: false }),
    blk("kiosk", "prop", [-4.0, 0.55, 1.5], [0.8, 1.1, 0.8], "metal"),
    blk("kiosk-screen", "prop", [-4.0, 1.25, 1.5], [0.7, 0.5, 0.08], "glow-cyan", { collide: false, yaw: 30 }),
    blk("sign-board", "prop", [0, 5.0, -0.2], [6.8, 1.7, 0.2], "metal", { collide: false }),
    blk("sign-post-l", "prop", [-2.8, 4.15, -0.2], [0.2, 0.3, 0.2], "metal", { collide: false }),
    blk("sign-post-r", "prop", [2.8, 4.15, -0.2], [0.2, 0.3, 0.2], "metal", { collide: false }),
  ];
  // Three project displays along the back wall, XecSuite on the left as the visitor walks in.
  for (const [name, x] of [["xecsuite", 3], ["newsstocks", 0], ["apex", -3]] as const) {
    out.push(blk(`plinth-${name}`, "prop", [x, 0.5, D - 0.9], [1.6, 1.0, 0.7], "metal"));
    out.push(blk(`screen-${name}`, "prop", [x, 1.6, D - 0.3], [1.5, 0.9, 0.1], "glow-cyan", { collide: false }));
  }
  return out;
}

function workshopBlocks(): Block[] {
  const fy = WORKSHOP_FLOOR;
  const roofLen = D + T + 0.8;
  const eave = fy + H;
  const slope = 25;
  const half = W / 2 + T + 0.3;
  const slabLen = half / Math.cos(slope * RAD);
  const rise = half * Math.tan(slope * RAD);
  const out: Block[] = [
    // The raised platform and the main-route ramp to the door.
    blk("platform", "prop", [0, fy / 2, 4.5], [W + 2 * T + 1.6, fy, D + T + 0.8], "stone", { route: "main" }),
    { ...ramp("ramp", 0, -3.6, 3.6, 4, (Math.asin(fy / 3.6) * 180) / Math.PI), route: "main", material: "stone" },
    ...hallShell(fy),
    // Gable roof: two slabs meeting at a ridge along the depth axis, stepped fill in the gable ends.
    blk("roof-l", "building", [-half / 2, eave + rise / 2 + 0.15, -0.5 + roofLen / 2], [roofLen, 0.3, slabLen], "metal", { yaw: 90, pitch: slope }),
    blk("roof-r", "building", [half / 2, eave + rise / 2 + 0.15, -0.5 + roofLen / 2], [roofLen, 0.3, slabLen], "metal", { yaw: -90, pitch: slope }),
    blk("chimney", "prop", [-3.8, eave + 2.2, D - 1.2], [0.9, 5.0, 0.9], "stone"),
    blk("chimney-glow", "prop", [-3.8, eave + 4.8, D - 1.2], [0.7, 0.4, 0.7], "glow-green", { collide: false }),
    blk("sign-board", "prop", [0, eave + 1.05, -0.5], [6.6, 1.5, 0.15], "metal", { collide: false }),
    blk("trim-glow", "prop", [0, eave - 0.1, -0.52], [W + 2 * T, 0.14, 0.1], "glow-green", { collide: false }),
  ];
  for (const [i, w, y] of [[0, 10.8, 0.45], [1, 7.5, 1.35], [2, 4.2, 2.25]] as const) {
    out.push(blk(`gable-front-${i}`, "building", [0, eave + y, -T / 2], [w, 0.9, T], "stone"));
    out.push(blk(`gable-back-${i}`, "building", [0, eave + y, D + T / 2], [w, 0.9, T], "stone"));
  }
  // Machinery along the side walls (green accents) and the two displays at the back.
  for (const [i, x, z] of [[0, 4.1, 2.2], [1, 4.1, 5.0], [2, -4.1, 2.2], [3, -4.1, 5.0]] as const) {
    out.push(blk(`machine-${i}`, "prop", [x, fy + 0.6, z], [1.2, 1.2, 1.6], "metal"));
    out.push(blk(`machine-glow-${i}`, "prop", [x, fy + 1.25, z], [1.0, 0.1, 1.4], "glow-green", { collide: false }));
  }
  for (const [name, x] of [["skills", 2.5], ["experience", -2.5]] as const) {
    out.push(blk(`plinth-${name}`, "prop", [x, fy + 0.5, D - 0.9], [1.6, 1.0, 0.7], "metal"));
    out.push(blk(`screen-${name}`, "prop", [x, fy + 1.6, D - 0.3], [1.5, 0.9, 0.1], "glow-green", { collide: false }));
  }
  return out;
}

function towerBlocks(): Block[] {
  const fy = TOWER_FLOOR;
  const out: Block[] = [
    blk("podium", "prop", [0, fy / 2, 4.8], [12, fy, 9.6], "stone", { route: "main" }),
  ];
  // Stairs up to the podium: three treads of 0.2 m.
  for (let i = 1; i <= 3; i++) {
    const front = -0.6 * (4 - i);
    out.push(blk(`step-${i}`, "step", [0, (0.2 * i) / 2, (front + 0.05) / 2], [6, 0.2 * i, 0.05 - front], "stone", { route: "main", rise: 0.2 }));
  }
  out.push(
    blk("wing-l", "building", [-2.2, (fy + 8) / 2, 4], [2, 8 - fy, 8], "stone"),
    blk("wing-r", "building", [2.2, (fy + 8) / 2, 4], [2, 8 - fy, 8], "stone"),
    // The beam over the 2.4 m wide, 3.4 m high passage and the mass above it.
    blk("beam", "building", [0, (fy + 3.4 + 8) / 2, 4], [2.4, 8 - fy - 3.4, 8], "stone"),
    blk("passage-end", "building", [0, fy + 1.7, 7.2], [2.4, 3.4, 1.6], "stone"),
    blk("spire", "building", [0, 8.8, 4], [2.8, 1.6, 2.8], "metal"),
    blk("crown", "prop", [0, 10.1, 4], [1.8, 1.0, 1.8], "glow-cyan", { collide: false }),
    blk("sign-board", "prop", [0, 5.9, -0.1], [5.2, 1.4, 0.2], "metal", { collide: false }),
    blk("trim-top", "prop", [0, fy + 3.45, -0.15], [2.7, 0.14, 0.12], "glow-cyan", { collide: false }),
    blk("trim-l", "prop", [-1.28, fy + 1.7, -0.15], [0.14, 3.4, 0.12], "glow-cyan", { collide: false }),
    blk("trim-r", "prop", [1.28, fy + 1.7, -0.15], [0.14, 3.4, 0.12], "glow-cyan", { collide: false }),
    blk("plinth-contact", "prop", [0, fy + 0.5, 6.1], [1.6, 1.0, 0.7], "metal"),
    blk("screen-contact", "prop", [0, fy + 1.6, 6.3], [1.5, 0.9, 0.1], "glow-cyan", { collide: false })
  );
  return out;
}

const TREES: readonly (readonly [number, number])[] = [
  [-3.2, 10], [3.2, 10], [-3.2, 13.2], [3.2, 13.2],
  [-14, -6], [14, -6], [-10, -12], [10, -12], [0, -14],
  [-22, 8], [22, 6], [-6, 24], [6, 24], [-24, 22], [24, 22],
];

function sceneryBlocks(): Block[] {
  const out: Block[] = [];
  TREES.forEach(([x, z], i) => {
    out.push(blk(`tree-${i}-trunk`, "prop", [x, 1.3, z], [0.5, 2.6, 0.5], "wood"));
    out.push(blk(`tree-${i}-crown`, "prop", [x, 3.4, z], [2.6, 1.8, 2.6], "foliage", { collide: false, camera: true }));
  });
  // Plaza planters and benches: low, so the camera looks over them.
  for (const [i, x, z] of [[0, 6.5, 5.5], [1, -6.5, 5.5], [2, 6.5, -7], [3, -6.5, -7]] as const) {
    out.push(blk(`planter-${i}`, "prop", [x, 0.3, z], [1.4, 0.6, 1.4], "stone", { camera: false }));
    out.push(blk(`planter-${i}-shrub`, "prop", [x, 0.9, z], [1.1, 0.7, 1.1], "foliage", { collide: false }));
  }
  for (const [i, x, z] of [[0, 5, 4.2], [1, -5, 4.2]] as const) {
    out.push(blk(`bench-${i}`, "prop", [x, 0.25, z], [2.0, 0.5, 0.6], "wood", { camera: false }));
  }
  return out;
}

function groundBlocks(): Block[] {
  // A ravine (x 10..22, z -26..-18) cuts the south-east: the ground has no tile under it, so a
  // fall reaches the kill plane. Three stepping stones cross it (the optional jumping challenge).
  const g = (id: string, c: readonly [number, number], s: readonly [number, number]) =>
    blk(id, "ground", [c[0], -0.5, c[1]], [s[0], 1, s[1]], "ground");
  const out: Block[] = [
    g("ground-main", [0, 7], [64, 50]),
    g("ground-south", [0, -29], [64, 6]),
    g("ground-sw", [-11, -22], [42, 8]),
    g("ground-se", [27, -22], [10, 8]),
  ];
  for (const [i, x] of [[0, 12.4], [1, 16], [2, 19.6]] as const) {
    out.push(blk(`stone-${i}`, "prop", [x, -0.5, -22], [2.4, 1, 2.4], "path", { route: "optional" }));
  }
  // The raised terrace: three platforms, each 0.8 m above the last (one jump each).
  for (const [i, x, top] of [[0, -24, 0.8], [1, -20.5, 1.6], [2, -17, 2.4]] as const) {
    out.push(blk(`terrace-${i}`, "prop", [x, top / 2, -14], [3, top, 3], "stone", { route: "optional" }));
  }
  // Scenery boundary: hedge walls at the edge of the 60 x 60 m campus. The collider is HEDGE_STANDOFF
  // wider than the hedge so a jumping avatar's head and hands stay out of the foliage.
  out.push(
    blk("edge-n", "wall", [0, 1.25, 30.5], [62, 2.5, 1], "foliage", { standoff: HEDGE_STANDOFF }),
    blk("edge-s", "wall", [0, 1.25, -30.5], [62, 2.5, 1], "foliage", { standoff: HEDGE_STANDOFF }),
    blk("edge-e", "wall", [30.5, 1.25, 0], [1, 2.5, 62], "foliage", { standoff: HEDGE_STANDOFF }),
    blk("edge-w", "wall", [-30.5, 1.25, 0], [1, 2.5, 62], "foliage", { standoff: HEDGE_STANDOFF })
  );
  return out;
}

function plazaBlocks(): Block[] {
  return [
    blk("plaza-paving", "prop", [0, 0.012, 0], [16, 0.024, 16], "paving", { collide: false }),
    blk("beacon-pad", "prop", [0, 0.03, 1.5], [3.4, 0.03, 3.4], "accent-cyan", { collide: false }),
    blk("beacon-base", "prop", [0, 0.45, 1.5], [1.0, 0.9, 1.0], "metal"),
    blk("beacon-cap", "prop", [0, 0.98, 1.5], [0.7, 0.14, 0.7], "glow-cyan", { collide: false }),
    pathStrip("path-tower", { x: 0, z: 8 }, { x: 0, z: 17 }, 4),
    pathStrip("path-lab", { x: 7, z: 4 }, placePoint(LAB.origin, LAB.yaw, [0, 0, -1.2]), 3.4),
    pathStrip("path-workshop", { x: -7, z: 4 }, placePoint(WORKSHOP.origin, WORKSHOP.yaw, [0, 0, -3.8]), 3.4),
  ];
}

const dest = (id: Destination["id"], name: string, o: { origin: { x: number; z: number }; yaw: number }, fy: number, depth: number): Destination => ({
  id,
  name,
  entrance: placePoint(o.origin, o.yaw, [0, fy, 0.6]),
  centre: placePoint(o.origin, o.yaw, [0, fy, depth]),
});

export function buildCampus(): Layout {
  const blocks: Block[] = [
    ...groundBlocks(),
    ...plazaBlocks(),
    ...sceneryBlocks(),
    ...placeBlocks(LAB.origin, LAB.yaw, "lab", labBlocks()),
    ...placeBlocks(WORKSHOP.origin, WORKSHOP.yaw, "workshop", workshopBlocks()),
    ...placeBlocks(TOWER.origin, TOWER.yaw, "tower", towerBlocks()),
  ].map((b) => (b.standoff === undefined && (b.kind === "wall" || b.kind === "building") ? { ...b, standoff: WALL_STANDOFF } : b));

  const at = (o: { origin: { x: number; z: number }; yaw: number }, p: readonly [number, number, number]) => placePoint(o.origin, o.yaw, p);
  const labFace = D - 2.3;
  const interactables: Interactable[] = [
    { id: "lab-xecsuite", kind: "project", position: at(LAB, [3, 0, labFace]), radius: 1.6, prompt: "View project", panel: { kind: "project", projectId: 1 } },
    { id: "lab-newsstocks", kind: "project", position: at(LAB, [0, 0, labFace]), radius: 1.6, prompt: "View project", panel: { kind: "project", projectId: 2 } },
    { id: "lab-apex", kind: "project", position: at(LAB, [-3, 0, labFace]), radius: 1.6, prompt: "View project", panel: { kind: "project", projectId: 3 } },
    { id: "lab-all", kind: "all-projects", position: at(LAB, [-3.4, 0, 2.9]), radius: 1.5, prompt: "Browse all projects", panel: { kind: "all-projects" } },
    { id: "workshop-skills", kind: "skills", position: at(WORKSHOP, [2.5, WORKSHOP_FLOOR, labFace]), radius: 1.6, prompt: "View skills", panel: { kind: "skills" } },
    { id: "workshop-experience", kind: "experience", position: at(WORKSHOP, [-2.5, WORKSHOP_FLOOR, labFace]), radius: 1.6, prompt: "View experience", panel: { kind: "experience" } },
    { id: "tower-contact", kind: "contact", position: at(TOWER, [0, TOWER_FLOOR, 4.8]), radius: 1.8, prompt: "View contact options", panel: { kind: "contact" } },
  ];

  const sign = (id: string, text: string, o: { origin: { x: number; z: number }; yaw: number }, p: readonly [number, number, number], width: number, height: number, accent: Sign["accent"]): Sign => ({
    id,
    text,
    center: at(o, p),
    yawDeg: o.yaw + 180,
    width,
    height,
    accent,
  });
  const eave = WORKSHOP_FLOOR + H;
  const signs: Sign[] = [
    sign("sign-lab", "PROJECT LAB", LAB, [0, 5.0, -0.32], 6.4, 1.4, "cyan"),
    sign("sign-workshop", "SKILLS WORKSHOP", WORKSHOP, [0, eave + 1.05, -0.62], 6.2, 1.3, "green"),
    sign("sign-tower", "CONTACT TOWER", TOWER, [0, 5.9, -0.22], 4.9, 1.2, "cyan"),
  ];

  return {
    name: "campus",
    killPlaneY: -10,
    blocks,
    spawn: v(0, 0, -6),
    spawnYawDeg: 0,
    interactables,
    beacon: v(0, 0, 1.5),
    signs,
    destinations: [
      dest("lab", "Project Lab", LAB, 0, D / 2),
      dest("workshop", "Skills Workshop", WORKSHOP, WORKSHOP_FLOOR, D / 2),
      dest("tower", "Contact Tower", TOWER, TOWER_FLOOR, 4),
    ],
    rooms: [
      ...[LAB, WORKSHOP].map((o, i) => {
        const r = hallRoom(i === 0 ? "lab" : "workshop", i === 0 ? 0 : WORKSHOP_FLOOR);
        const c = placePoint(o.origin, o.yaw, [r.center.x, r.center.y, r.center.z]);
        return { ...r, center: c, yawDeg: o.yaw };
      }),
      { id: "tower-passage", center: placePoint(TOWER.origin, TOWER.yaw, [0, TOWER_FLOOR + 1.7, 3.2]), size: v(2.4, 3.4, 6.4), yawDeg: TOWER.yaw },
    ],
  };
}
