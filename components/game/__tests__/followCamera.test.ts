// Follow camera (M3 rework: QA F6, F7, F8 and the cross-review minDistance finding).
// Part 1 runs the camera on an analytic fake world (axis-aligned boxes), part 2 on real Rapier:
// the real player motor walks drops and the campus passages with the real camera and the real
// sphere-cast query, and every 60 Hz frame is checked against every block of the layout:
//   - the camera is not inside any block and is never below the floor under the avatar,
//   - the head and the torso are in line of sight of the camera (analytic, not Rapier),
//   - the camera is never closer than CAMERA.minDistance to the avatar,
//   - the camera is never inside a building interior while the avatar is outside it.
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createObstacleQuery } from "../cameraProbe";
import { CAMERA, FEET_TO_CENTER, MOTOR_CONFIG, PHYSICS, type Vec3 } from "../config";
import { createFollowCamera, ZONE_DOORWAY, type ObstacleQuery } from "../followCamera";
import { createPlayerMotor, type MotorIntent } from "../player";
import { buildColliders } from "../world/colliders";
import { buildDecor } from "../world/decor";
import { blockQuaternion, CAMPUS, getBlock, TEST_ARENA, type Layout, type Room } from "../world/layout";
import { segmentHitsBlock, signedDistance } from "./cameraHarness";

const DT = PHYSICS.dt;
const worlds: RAPIER.World[] = [];
beforeAll(async () => {
  await RAPIER.init();
});
afterEach(() => {
  while (worlds.length) worlds.pop()!.free();
});

const newCamera = () => new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 200);
const LOOK = { dx: 0, dy: 0 };

/** A swept sphere against axis-aligned boxes (box inflated by the radius). Starts inside a box: ignored, like Rapier's cast. */
type Box = { min: readonly [number, number, number]; max: readonly [number, number, number] };
function boxWorld(boxes: () => Box[]): ObstacleQuery {
  return (from, to, r) => {
    const o = [from.x, from.y, from.z];
    const d = [to.x - from.x, to.y - from.y, to.z - from.z];
    const len = Math.hypot(d[0], d[1], d[2]);
    let best: number | null = null;
    for (const b of boxes()) {
      let enter = -Infinity;
      let exit = Infinity;
      let miss = false;
      for (let a = 0; a < 3; a++) {
        const lo = b.min[a] - r;
        const hi = b.max[a] + r;
        if (Math.abs(d[a]) < 1e-12) {
          if (o[a] < lo || o[a] > hi) miss = true;
          continue;
        }
        let ta = (lo - o[a]) / d[a];
        let tb = (hi - o[a]) / d[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        enter = Math.max(enter, ta);
        exit = Math.min(exit, tb);
      }
      if (miss || enter > exit || enter <= 1e-9 || enter > 1) continue;
      const hit = enter * len;
      if (best === null || hit < best) best = hit;
    }
    return best;
  };
}

const FULL = Math.hypot(CAMERA.distance, CAMERA.shoulder);
const dist3 = (a: THREE.Vector3, p: { x: number; y: number; z: number }) => a.distanceTo(new THREE.Vector3(p.x, p.y, p.z));

describe("follow camera on a fake world", () => {
  const target: Vec3 = { x: 0, y: 1, z: 0 }; // capsule centre: feet at 1 - FEET_TO_CENTER = 0.09
  const anchor = { x: 0, y: 1 + CAMERA.pivotHeight, z: 0 };
  const feetY = target.y - FEET_TO_CENTER;

  it("without a query the camera sits at the full distance behind the pivot", () => {
    const cam = newCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    fc.snapTo(target, 0);
    expect(dist3(cam.position, anchor)).toBeCloseTo(FULL, 5);
  });

  it("pulls in at once in front of a wall behind the avatar and eases back out when it is gone", () => {
    let walls: Box[] = [{ min: [-5, -5, -2.4], max: [5, 9, -2.2] }]; // a wall 2.2 m behind the avatar
    const cam = newCamera();
    const fc = createFollowCamera(cam, boxWorld(() => walls), CAMERA);
    fc.snapTo(target, 0);
    const d0 = dist3(cam.position, anchor);
    expect(d0).toBeLessThan(2.2);
    expect(d0).toBeGreaterThan(CAMERA.minDistance);
    expect(cam.position.z).toBeGreaterThan(-2.2 + CAMERA.probeRadius - 1e-3); // not in or behind the wall
    walls = [];
    fc.update(1 / 60, target, true, 0, LOOK, false);
    const d1 = dist3(cam.position, anchor);
    expect(d1).toBeGreaterThan(d0);
    expect(d1).toBeLessThan(d0 + 0.2); // eased, not a pop
    let prev = d1;
    for (let i = 0; i < 300; i++) {
      fc.update(1 / 60, target, true, 0, LOOK, false);
      const d = dist3(cam.position, anchor);
      expect(d - prev, `frame ${i}`).toBeLessThan(0.2); // never a jump outward
      expect(d, `frame ${i}`).toBeGreaterThanOrEqual(prev - 1e-9); // and never back in while the path is clear
      prev = d;
    }
    expect(prev).toBeGreaterThan(FULL - 0.01);
    walls = [{ min: [-5, -5, -2.4], max: [5, 9, -2.2] }];
    fc.update(1 / 60, target, true, 0, LOOK, false);
    expect(dist3(cam.position, anchor)).toBeLessThan(2.2); // shrinks immediately
  });

  it("keeps CAMERA.minDistance when a wall is right behind the avatar, by climbing instead of sinking into it", () => {
    // The wall stands 0.35 m behind the avatar's centre line: the cast along the default ray is cut to nothing.
    const walls: Box[] = [{ min: [-6, -5, -0.75], max: [6, 20, -0.35] }];
    const cam = newCamera();
    const fc = createFollowCamera(cam, boxWorld(() => walls), CAMERA);
    fc.snapTo(target, 0);
    for (let i = 0; i < 60; i++) fc.update(1 / 60, target, true, 0, LOOK, false);
    const d = dist3(cam.position, anchor);
    expect(d).toBeGreaterThanOrEqual(CAMERA.minDistance - 1e-6);
    expect(cam.position.z).toBeGreaterThanOrEqual(-0.35 + CAMERA.probeRadius - 0.02); // not inside the wall
    // Never inside the avatar capsule (radius 0.3, from the soles to the head).
    const lx = cam.position.x;
    const lz = cam.position.z;
    const inside = Math.hypot(lx, lz) < 0.3 && cam.position.y > feetY && cam.position.y < feetY + 1.9;
    expect(inside).toBe(false);
    expect(cam.position.y).toBeGreaterThan(anchor.y); // climbed above the avatar to look down over the wall
  });

  it("a fully sealed pocket (every cast reports an immediate hit) never places the camera beyond the reported clear distance, and clips the avatar body with the near plane", () => {
    const cam = newCamera();
    const fc = createFollowCamera(cam, () => 0, CAMERA);
    fc.snapTo(target, 0);
    for (let i = 0; i < 30; i++) {
      fc.update(1 / 60, target, true, 0, LOOK, false);
      expect(dist3(cam.position, anchor), `frame ${i}`).toBeLessThanOrEqual(1e-6); // clear distance is 0
      expect(cam.near, `frame ${i}`).toBeGreaterThanOrEqual(0.3); // the body around the camera is clipped
      expect(Number.isFinite(cam.quaternion.x + cam.quaternion.w), `frame ${i}`).toBe(true);
    }
  });

  it("never places the camera beyond the clear distance the query reports, for every hit distance and look input", () => {
    for (const clear of [0, 0.05, 0.2, 0.44, 0.45, 0.6, 1.5]) {
      const cam = newCamera();
      const fc = createFollowCamera(cam, () => clear, CAMERA);
      fc.snapTo(target, 0);
      for (let i = 0; i < 120; i++) {
        fc.update(1 / 60, target, true, i * 0.03, { dx: i % 7 === 0 ? 30 : 0, dy: i % 11 === 0 ? -20 : 3 }, false);
        expect(dist3(cam.position, anchor), `clear ${clear} frame ${i}`).toBeLessThanOrEqual(clear + 1e-6);
      }
    }
  });

  it("restores the normal near plane once the pocket opens", () => {
    let hit: number | null = 0;
    const cam = newCamera();
    const fc = createFollowCamera(cam, () => hit, CAMERA);
    fc.snapTo(target, 0);
    expect(cam.near).toBeGreaterThan(0.3);
    hit = null;
    for (let i = 0; i < 240; i++) fc.update(1 / 60, target, true, 0, LOOK, false);
    expect(cam.near).toBeCloseTo(0.1, 6);
  });

  it("does not let the minimum distance be shrunk by the smoothed restore after a hit", () => {
    let hit: number | null = 0.1;
    const cam = newCamera();
    const fc = createFollowCamera(cam, () => hit, CAMERA);
    fc.snapTo(target, 0);
    expect(dist3(cam.position, anchor)).toBeLessThanOrEqual(0.1 + 1e-6); // sealed: never beyond the reported clear distance
    hit = null;
    for (let i = 0; i < 120; i++) {
      fc.update(1 / 60, target, true, 0, LOOK, false);
      expect(dist3(cam.position, anchor)).toBeGreaterThanOrEqual(CAMERA.minDistance - 1e-6);
    }
  });

  it("never goes below the floor under the avatar at any pitch, with no obstacle at all (QA F8)", () => {
    const cam = newCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    fc.snapTo(target, 0);
    // Drag the pitch to its lower limit (drag up: dy < 0) and hold it, then sweep through the range.
    for (let i = 0; i < 90; i++) {
      fc.update(1 / 60, target, true, 0, { dx: 0, dy: -40 }, false);
      expect(cam.position.y, `down ${i}`).toBeGreaterThanOrEqual(feetY + CAMERA.probeRadius - 1e-6);
    }
    for (let i = 0; i < 400; i++) {
      fc.update(1 / 60, target, true, 0, { dx: 0, dy: i < 200 ? -4 : 4 }, false);
      expect(cam.position.y, `sweep ${i}`).toBeGreaterThanOrEqual(feetY + CAMERA.probeRadius - 1e-6);
    }
  });

  it("the floor follows the avatar up a raised floor and down a long fall", () => {
    const cam = newCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    const high = { x: 0, y: 2 + FEET_TO_CENTER, z: 0 }; // standing on a 2 m platform
    fc.snapTo(high, 0);
    for (let i = 0; i < 60; i++) fc.update(1 / 60, high, true, 0, { dx: 0, dy: -40 }, false);
    expect(cam.position.y).toBeGreaterThanOrEqual(2 + CAMERA.probeRadius - 1e-6);
    // Then fall to y = 0 (airborne): the floor comes down with the avatar, the camera never goes below its feet.
    for (let i = 0; i < 120; i++) {
      const y = Math.max(0, 2 - 0.5 * 20 * (i / 60) ** 2);
      const t = { x: 0, y: y + FEET_TO_CENTER, z: 0 };
      fc.update(1 / 60, t, false, 0, { dx: 0, dy: -40 }, false);
      expect(cam.position.y, `fall ${i}`).toBeGreaterThanOrEqual(Math.min(2, y) + CAMERA.probeRadius - 1e-6);
    }
  });

  it("casts from the avatar and not from the lagging pivot, so a wall between them is seen (QA F7)", () => {
    // The avatar has just stepped through a thin wall opening: the smoothed pivot is still behind the wall.
    const wall: Box[] = [{ min: [-6, -5, -0.15], max: [6, 20, -0.05] }];
    const cam = newCamera();
    const fc = createFollowCamera(cam, boxWorld(() => wall), CAMERA);
    fc.snapTo({ x: 0, y: 1, z: -0.5 }, 0); // pivot starts behind the wall
    fc.update(1 / 600, { x: 0, y: 1, z: 0.3 }, true, 0, LOOK, false); // the avatar is in front, the pivot lags
    cam.updateMatrixWorld(true);
    // The camera must be on the avatar's side of the wall: z above the wall's front face.
    expect(cam.position.z).toBeGreaterThan(-0.05);
  });

  it("keeps the head and the torso visible: a slab between the avatar and the wanted position pulls the camera in", () => {
    const slab: Box[] = [{ min: [-1, -1, -3.2], max: [1, 3.5, -2.8] }]; // 3 m behind, 3.5 m tall
    const cam = newCamera();
    const fc = createFollowCamera(cam, boxWorld(() => slab), CAMERA);
    fc.snapTo(target, 0);
    const world = boxWorld(() => slab);
    for (const h of CAMERA.losHeights) {
      const from = { x: 0, y: feetY + h, z: 0 };
      expect(world(from, { x: cam.position.x, y: cam.position.y, z: cam.position.z }, 0), `height ${h}`).toBeNull();
    }
  });

  it("keeps the camera out of a building while the avatar is outside it, and lets it follow the avatar through the doorway", () => {
    // A 4 x 4 m room in front of the avatar (avatar at z = 0, room z 3 to 7); the camera looks back from in front of the avatar.
    const room = { center: { x: 0, y: 1.8, z: 5 }, size: { x: 4, y: 3.6, z: 4 }, yawDeg: 0 };
    const cam = newCamera();
    const fc = createFollowCamera(cam, null, CAMERA, [room]);
    fc.snapTo(target, Math.PI); // the camera trails from +z, inside the room
    expect(cam.position.z).toBeLessThan(3); // stopped at the room's mouth
    // At the doorway (within ZONE_DOORWAY of the room) the camera may enter.
    const at = { x: 0, y: 1, z: 3 - ZONE_DOORWAY + 0.1 };
    fc.snapTo(at, Math.PI);
    expect(cam.position.z).toBeGreaterThan(3); // inside now
  });

  it("passes the probe radius, the avatar and the wanted position to the sphere cast", () => {
    const calls: { from: Vec3; to: Vec3; radius: number }[] = [];
    const cam = newCamera();
    const fc = createFollowCamera(cam, (from, to, radius) => (calls.push({ from: { ...from }, to: { ...to }, radius }), null), CAMERA);
    fc.snapTo(target, 0);
    const sphere = calls.filter((c) => c.radius === CAMERA.probeRadius);
    expect(sphere).toHaveLength(1);
    expect(sphere[0].from.y).toBeCloseTo(1 + CAMERA.pivotHeight, 5);
    expect(new THREE.Vector3(sphere[0].to.x, sphere[0].to.y, sphere[0].to.z).distanceTo(cam.position)).toBeLessThan(1e-9);
    // And thin line-of-sight rays from the torso and the head.
    const rays = calls.filter((c) => c.radius === CAMERA.losRadius);
    expect(rays.map((c) => +(c.from.y - feetY).toFixed(2)).sort()).toEqual([...CAMERA.losHeights].sort());
  });
});

type Leg = [until: (feet: Vec3) => boolean, x: number, z: number];
type Run = {
  minClearance: number;
  worstBlock: string;
  frames: number;
  insideFrames: number;
  finalReach: number;
  minY: number;
  /** Frames on which the head or the torso is hidden from the camera by a camera-blocking block. */
  occludedFrames: number;
  /** Frames on which the camera is closer than CAMERA.minDistance to the avatar's upper body. */
  tooCloseFrames: number;
  /** Frames on which the camera is below the floor under the avatar. */
  belowFloorFrames: number;
  /** Frames on which the camera sits in a building interior while the avatar is outside it. */
  interiorFrames: number;
  minDist: number;
  /** Where the avatar's feet ended up. */
  finalFeet: Vec3;
};

function inRoom(r: Room, p: THREE.Vector3, shrink = 0): boolean {
  const yaw = (r.yawDeg * Math.PI) / 180;
  const dx = p.x - r.center.x;
  const dz = p.z - r.center.z;
  const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return Math.abs(lx) < r.size.x / 2 - shrink && Math.abs(lz) < r.size.z / 2 - shrink && Math.abs(p.y - r.center.y) < r.size.y / 2 - shrink;
}

type DriveOpts = { layout?: Layout; run?: boolean; withQuery?: boolean; look?: (frame: number) => { dx: number; dy: number }; legSeconds?: number; onFrame?: (cam: THREE.Vector3, feet: Vec3) => void };

/**
 * Walks the motor along `legs` (hold direction x, z until the predicate on the feet position
 * is true, or 15 s), starting at `start` (feet), with the camera yaw fixed at `yaw` so the camera trails from that side. Every frame
 * the camera position is checked against every block, the head and torso lines of sight,
 * the minimum distance, the floor and the building interiors.
 */
function drive(start: Vec3, legs: Leg[], yaw: number, withQuery: boolean, run = false, opts: DriveOpts = {}): Run {
  const layout = opts.layout ?? TEST_ARENA;
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = DT;
  worlds.push(world);
  buildColliders(RAPIER, world, layout);
  const center = (f: Vec3): Vec3 => ({ x: f.x, y: f.y + FEET_TO_CENTER, z: f.z });
  const motor = createPlayerMotor(RAPIER, world, center(layout.spawn), MOTOR_CONFIG);
  motor.teleport(center(start));
  motor.capture();
  const cam = newCamera();
  const fc = createFollowCamera(cam, withQuery ? createObstacleQuery(RAPIER, world) : null, CAMERA, layout.rooms);
  fc.snapTo(center(start), yaw);
  const out: Run = {
    minClearance: Infinity, worstBlock: "", frames: 0, insideFrames: 0, finalReach: 0, minY: Infinity,
    occludedFrames: 0, tooCloseFrames: 0, belowFloorFrames: 0, interiorFrames: 0, minDist: Infinity,
    finalFeet: { x: 0, y: 0, z: 0 },
  };
  const tmp: Vec3 = { x: 0, y: 0, z: 0 };
  const blockers = layout.blocks.filter((b) => b.blocksCamera);
  // Everything the camera must stay out of: what collides or blocks the camera (not paving, trims, screens).
  const solids = layout.blocks.filter((b) => b.collide !== false || b.blocksCamera);
  let lastGround = start.y;
  let frame = 0;
  const step = (intent: MotorIntent) => {
    const s = motor.step(DT, intent);
    world.step();
    motor.capture();
    const pos = motor.interpolated(1, tmp);
    const feetNow = pos.y - FEET_TO_CENTER;
    if (s.grounded) lastGround = feetNow;
    fc.update(DT, pos, s.grounded, yaw, opts.look ? opts.look(frame++) : LOOK, false);
    cam.updateMatrixWorld(true);
    for (const b of solids) {
      const d = signedDistance(b, cam.position);
      if (d < out.minClearance) {
        out.minClearance = d;
        out.worstBlock = b.id;
      }
      if (d < 0) out.insideFrames++;
    }
    out.minY = Math.min(out.minY, cam.position.y);
    out.frames++;
    opts.onFrame?.(cam.position, { x: pos.x, y: feetNow, z: pos.z });
    // Line of sight from the head and the torso (analytic, independent of Rapier).
    let hidden = false;
    for (const h of CAMERA.losHeights) {
      const from = new THREE.Vector3(pos.x, feetNow + h, pos.z);
      if (blockers.some((b) => segmentHitsBlock(b, from, cam.position))) hidden = true;
    }
    if (hidden) out.occludedFrames++;
    const upper = new THREE.Vector3(pos.x, pos.y + CAMERA.pivotHeight, pos.z);
    const dist = cam.position.distanceTo(upper);
    out.minDist = Math.min(out.minDist, dist);
    if (dist < CAMERA.minDistance - 1e-3) out.tooCloseFrames++;
    if (cam.position.y < Math.min(lastGround, feetNow) + CAMERA.probeRadius - 1e-3) out.belowFloorFrames++;
    const avatarPoint = new THREE.Vector3(pos.x, pos.y, pos.z);
    // The camera inside a building while the avatar is outside it (and not at its doorway).
    for (const r of layout.rooms) if (inRoom(r, cam.position) && !inRoom(r, avatarPoint, -ZONE_DOORWAY)) out.interiorFrames++;
  };
  for (let i = 0; i < 30; i++) step({ moveWorld: { x: 0, z: 0 }, run: false, jump: false });
  const feet = (): Vec3 => ({ x: motor.state.position.x, y: motor.state.position.y - FEET_TO_CENTER, z: motor.state.position.z });
  for (const [until, x, z] of legs) {
    for (let i = 0; i < (opts.legSeconds ?? 15) / DT && !until(feet()); i++) step({ moveWorld: { x, z }, run, jump: false });
  }
  for (let i = 0; i < 2 / DT; i++) step({ moveWorld: { x: 0, z: 0 }, run: false, jump: false }); // settle
  const pivot = new THREE.Vector3(motor.state.position.x, motor.state.position.y + CAMERA.pivotHeight, motor.state.position.z);
  out.finalReach = cam.position.distanceTo(pivot);
  out.finalFeet = feet();
  return out;
}

const ramp30 = getBlock(TEST_ARENA, "ramp-30");
describe("camera never ends inside a level block while dropping off the 30 degree ramp (QA F6)", () => {
  // End drop (4 m): up the ramp toward +z, off its top end, then on across the ground.
  // Side drop: climb to about 2 m height, then leave over the +x edge (x half width 1.5).
  const landed = (f: Vec3) => f.y < 0.05;
  const pastEnd = (f: Vec3) => f.z > 9.4; // the top end of the ramp is at z 8.93, height 4
  const climbed = (f: Vec3) => f.y >= 2;
  const endDrop: Leg[] = [[pastEnd, 0, 1], [landed, 0, 1], [(f) => f.z > 12.5, 0, 1]];
  const sideDrop: Leg[] = [[climbed, 0, 1], [landed, 1, 0], [(f) => f.x > -9, 1, 0]];
  const yaws: [string, number][] = [
    ["behind (+z forward)", 0],
    ["from the right (+x forward)", Math.PI / 2],
    ["from the left (-x forward)", -Math.PI / 2],
    ["in front (-z forward)", Math.PI],
  ];

  for (const [label, yaw] of yaws) {
    for (const run of [false, true]) {
      it(`end drop, camera ${label}, ${run ? "run" : "walk"}: clear of every block on every frame`, () => {
        const r = drive({ x: ramp30.center.x, y: 0, z: 0 }, endDrop, yaw, true, run);
        expect(r.frames).toBeGreaterThan(300);
        expect(r.insideFrames, `worst ${r.worstBlock}`).toBe(0);
        expect(r.minClearance, `worst ${r.worstBlock}`).toBeGreaterThanOrEqual(0.1);
        expect(r.occludedFrames, "head or torso hidden").toBe(0);
        expect(r.tooCloseFrames, `closest ${r.minDist.toFixed(2)}`).toBe(0);
        expect(r.belowFloorFrames).toBe(0);
      });
      it(`side drop, camera ${label}, ${run ? "run" : "walk"}: clear of every block on every frame`, () => {
        const r = drive({ x: ramp30.center.x, y: 0, z: 0 }, sideDrop, yaw, true, run);
        expect(r.insideFrames, `worst ${r.worstBlock}`).toBe(0);
        expect(r.minClearance, `worst ${r.worstBlock}`).toBeGreaterThanOrEqual(0.1);
        expect(r.occludedFrames, "head or torso hidden (QA F7)").toBe(0);
        expect(r.tooCloseFrames, `closest ${r.minDist.toFixed(2)}`).toBe(0);
        expect(r.belowFloorFrames).toBe(0);
      });
    }
  }

  it("is red without the query: the same end drop puts the camera inside the ramp slab", () => {
    const r = drive({ x: ramp30.center.x, y: 0, z: 0 }, endDrop, 0, false);
    expect(r.insideFrames).toBeGreaterThan(10);
    expect(r.worstBlock).toBe("ramp-30");
  });

  it("is red without the query for the side drop too (camera trailing over the slab)", () => {
    const r = drive({ x: ramp30.center.x, y: 0, z: 0 }, sideDrop, 2, false); // camera yaw 2 rad: trailing over the slab
    expect(r.insideFrames).toBeGreaterThan(0);
    expect(r.worstBlock).toBe("ramp-30");
  });

  it("does not get stuck: after walking clear of the ramp the camera is back at full distance", () => {
    const r = drive({ x: ramp30.center.x, y: 0, z: 0 }, [...endDrop, [(f) => f.x > -5, 1, 0]], 0, true);
    expect(r.insideFrames).toBe(0);
    expect(r.finalReach).toBeGreaterThan(FULL - 0.05);
  });
});

describe("camera on the campus (M3)", () => {
  const tower = CAMPUS.destinations.find((d) => d.id === "tower")!;
  const lab = CAMPUS.destinations.find((d) => d.id === "lab")!;
  const workshop = CAMPUS.destinations.find((d) => d.id === "workshop")!;
  const YAWS = [0, Math.PI / 6, -Math.PI / 6, Math.PI / 2, -Math.PI / 2, (5 * Math.PI) / 6, Math.PI];
  const opts: DriveOpts = { layout: CAMPUS };

  /** The whole contract on every frame. */
  const expectClean = (r: Run, label: string) => {
    expect(r.frames, label).toBeGreaterThan(100);
    expect(r.insideFrames, `${label}: inside ${r.worstBlock}`).toBe(0);
    expect(r.minClearance, `${label}: clearance to ${r.worstBlock}`).toBeGreaterThanOrEqual(0.1);
    expect(r.occludedFrames, `${label}: head or torso hidden`).toBe(0);
    expect(r.tooCloseFrames, `${label}: closest ${r.minDist.toFixed(2)} m`).toBe(0);
    expect(r.belowFloorFrames, `${label}: below the floor`).toBe(0);
    expect(r.interiorFrames, `${label}: camera in an interior`).toBe(0);
  };

  // Walk legs are "hold direction (x, z) until predicate". The tower passage is the narrowest (2.4 m).
  const towerWalk: Leg[] = [[(f) => f.z >= tower.entrance.z + 4.6, 0, 1]];
  const start = (x: number, z: number, y = 0): Vec3 => ({ x, y, z });

  for (const yaw of YAWS) {
    it(`tower passage (narrowest, 2.4 m) from the forecourt to the contact display, camera yaw ${((yaw * 180) / Math.PI).toFixed(0)}: clean on every frame`, () => {
      expectClean(drive(start(0, tower.entrance.z - 6), towerWalk, yaw, true, false, opts), "tower");
    });
  }

  it("tower passage while the player drags the camera around and up and down the whole time", () => {
    const look = (f: number) => ({ dx: 7 * Math.sin(f / 40), dy: 9 * Math.sin(f / 23) });
    expectClean(drive(start(0, tower.entrance.z - 6), towerWalk, 0, true, false, { layout: CAMPUS, look }), "tower drag");
    expectClean(drive(start(0, tower.entrance.z - 6), towerWalk, Math.PI, true, true, { layout: CAMPUS, look: (f) => ({ dx: 12, dy: 6 * Math.sin(f / 17) }) }), "tower spin");
  });

  for (const yaw of YAWS) {
    it(`lab door and displays, camera yaw ${((yaw * 180) / Math.PI).toFixed(0)}: clean on every frame`, () => {
      const dir = { x: lab.centre.x - lab.entrance.x, z: lab.centre.z - lab.entrance.z };
      const len = Math.hypot(dir.x, dir.z);
      const legs: Leg[] = [[(f) => Math.hypot(f.x - lab.centre.x, f.z - lab.centre.z) < 1.5, dir.x / len, dir.z / len]];
      const from = start(lab.entrance.x - (dir.x / len) * 5, lab.entrance.z - (dir.z / len) * 5);
      expectClean(drive(from, legs, yaw, true, false, opts), "lab");
    });
    it(`workshop ramp, platform and displays, camera yaw ${((yaw * 180) / Math.PI).toFixed(0)}: clean on every frame`, () => {
      const dir = { x: workshop.centre.x - workshop.entrance.x, z: workshop.centre.z - workshop.entrance.z };
      const len = Math.hypot(dir.x, dir.z);
      const legs: Leg[] = [[(f) => Math.hypot(f.x - workshop.centre.x, f.z - workshop.centre.z) < 1.5, dir.x / len, dir.z / len]];
      const from = start(workshop.entrance.x - (dir.x / len) * 6, workshop.entrance.z - (dir.z / len) * 6);
      expectClean(drive(from, legs, yaw, true, true, opts), "workshop");
    });
  }

  it("open plaza with the pitch dragged to its lower limit: never below the floor, never inside a block (QA F8)", () => {
    const r = drive(start(0, -6), [[() => false, 0, 0]], 0, true, false, { layout: CAMPUS, look: () => ({ dx: 0, dy: -30 }) });
    expectClean(r, "plaza low pitch");
    expect(r.minY).toBeGreaterThanOrEqual(CAMERA.probeRadius - 0.03); // 0.2 m over the ground, within the capsule skin
  });

  it("open ground on the arena (ground is not a camera blocker there): the camera floor still holds at the lower pitch limit (QA F8)", () => {
    const r = drive({ x: 0, y: 0, z: -12 }, [[() => false, 0, 0]], 0, true, false, { look: () => ({ dx: 0, dy: -30 }) });
    expect(r.belowFloorFrames).toBe(0);
    expect(r.minY).toBeGreaterThanOrEqual(CAMERA.probeRadius - 0.03); // 0.2 m over the ground, within the capsule skin
  });

  it("walking down and up the tower stairs with the camera in front and behind", () => {
    for (const yaw of [0, Math.PI]) {
      const up: Leg[] = [[(f) => f.z >= tower.entrance.z + 1, 0, 1], [(f) => f.z <= tower.entrance.z - 5, 0, -1]];
      expectClean(drive(start(0, tower.entrance.z - 5), up, yaw, true, false, opts), `stairs yaw ${yaw}`);
    }
  });

  it("stepping off the 2.4 m terrace beside a wall of platforms", () => {
    const top = getBlock(CAMPUS, "terrace-2");
    for (const yaw of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const legs: Leg[] = [[(f) => f.x > top.center.x + 2.2, 1, 0], [(f) => f.y < 0.1, 1, 0], [(f) => f.x > top.center.x + 6, 1, 0]];
      expectClean(drive(start(top.center.x, 2.4, top.center.z), legs, yaw, true, true, opts), `terrace yaw ${yaw}`);
    }
  });
});

// F-M3-1 (QA round 4): the pocket case. The avatar pressed against a wall (or standing in the
// narrow tower passage) while the player drags the camera through a full yaw sweep at the
// pitch limits and in between. Every frame: not inside a solid, head and torso visible, not under
// the floor and the camera not inside the avatar.
describe("camera pockets: pressed against a wall during a full yaw and pitch sweep (F-M3-1)", () => {
  const YAW_STEP = 7; // drag units per frame: 0.028 rad, one full turn in about 225 frames
  const TURN = Math.ceil((2 * Math.PI) / (YAW_STEP * CAMERA.lookSensitivity));
  /** Pitch pinned to a limit for 70 frames, then a full yaw turn at that pitch, for each pitch. */
  const sweep = (f: number) => {
    const phase = 70 + TURN;
    const k = Math.floor(f / phase);
    const within = f % phase;
    const dy = [-30, 30, -30, 8][k % 4]; // low limit, high limit, low, then back toward the middle
    if (within < 70) return { dx: 0, dy };
    return { dx: YAW_STEP, dy: 0 };
  };
  const SWEEP_FRAMES = 4 * (70 + TURN);
  const sweepLegs = (x: number, z: number): Leg[] => [[() => false, x, z]];

  /** The walk goes on for 15 s, longer than the sweep, so the avatar stays pressed to the wall. */
  const hug = (label: string, from: Vec3, dirX: number, dirZ: number) => {
    it(`${label}: clean on every frame of the sweep`, () => {
      const r = drive(from, sweepLegs(dirX, dirZ), 0, true, false, { layout: CAMPUS, look: sweep, legSeconds: 25 });
      expect(r.frames).toBeGreaterThan(SWEEP_FRAMES);
      // The scenario really is a hug: the avatar ends pressed to a camera-blocking block.
      const body = new THREE.Vector3(r.finalFeet.x, r.finalFeet.y + 1, r.finalFeet.z);
      const nearest = Math.min(...CAMPUS.blocks.filter((b) => b.blocksCamera && b.kind !== "ground").map((b) => signedDistance(b, body) - (b.standoff ?? 0)));
      expect(nearest, `${label}: avatar at ${r.finalFeet.x.toFixed(2)}, ${r.finalFeet.z.toFixed(2)}`).toBeLessThan(0.4);
      expect(r.insideFrames, `${label}: inside ${r.worstBlock}`).toBe(0);
      expect(r.minClearance, `${label}: clearance to ${r.worstBlock}`).toBeGreaterThanOrEqual(0.05);
      expect(r.occludedFrames, `${label}: head or torso hidden`).toBe(0);
      expect(r.belowFloorFrames, `${label}: below the floor`).toBe(0);
      expect(r.tooCloseFrames, `${label}: closest ${r.minDist.toFixed(2)} m`).toBe(0);
      expect(r.interiorFrames, `${label}: in an interior`).toBe(0);
    });
  };
  // The tower passage (2.4 m wide, tower origin z 17.5) stands on the podium.
  const podium = getBlock(CAMPUS, "tower-podium");
  const floorY = podium.center.y + podium.size.y / 2;
  hug("tower passage, left wing wall (QA pass-side)", { x: -0.5, y: floorY, z: 21 }, -1, 0);
  hug("tower passage, right wing wall (QA pass-side)", { x: 0.5, y: floorY, z: 21 }, 1, 0);
  hug("tower passage dead end (QA pass-end)", { x: 0, y: floorY, z: 21 }, 0, 1);
  hug("outer Lab wall (QA hug-lab-side)", { x: 9, y: 0, z: 10.5 }, 0.5, 1);
  hug("hedge north boundary", { x: 0, y: 0, z: 28 }, 0, 1);
  hug("tower wing outer face", { x: -4.5, y: 0, z: 21.5 }, 1, 0);

  // Every tall camera-blocking wall of the campus that starts at the ground, each hugged from each
  // face that has open ground in front of it (the face centre, 1 m out, pushing straight at it).
  const faces: { id: string; from: Vec3; dx: number; dz: number }[] = [];
  for (const b of CAMPUS.blocks) {
    if (!b.blocksCamera || b.kind === "ground" || b.kind === "ramp" || b.kind === "step") continue;
    if (b.center.y + b.size.y / 2 < 2.5 || b.center.y - b.size.y / 2 > 0.6) continue;
    const q = blockQuaternion(b);
    const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    for (const [ax, sign] of [["x", 1], ["x", -1], ["z", 1], ["z", -1]] as const) {
      const n = new THREE.Vector3(ax === "x" ? sign : 0, 0, ax === "z" ? sign : 0).applyQuaternion(quat);
      const half = ax === "x" ? b.size.x / 2 : b.size.z / 2;
      const face = new THREE.Vector3(b.center.x, 0, b.center.z).addScaledVector(n, half);
      const from = face.clone().addScaledVector(n, 1);
      const probe = new THREE.Vector3(from.x, 1, from.z);
      const free = CAMPUS.blocks.every((o) => o.id === b.id || signedDistance(o, probe) > 0.6 || o.kind === "ground");
      const onGround = CAMPUS.blocks.some((o) => o.kind === "ground" && signedDistance(o, new THREE.Vector3(from.x, -0.4, from.z)) < 0);
      if (free && onGround) faces.push({ id: `${b.id} ${ax}${sign > 0 ? "+" : "-"}`, from: { x: from.x, y: 0, z: from.z }, dx: -n.x, dz: -n.z });
    }
  }
  it("covers at least the campus walls the issue names plus several more", () => {
    expect(faces.length).toBeGreaterThanOrEqual(40);
  });
  // Every fifth face keeps the suite fast; the stride is coprime with the face order of the layout.
  for (const f of faces.filter((_, i) => i % 5 === 0)) hug(`wall ${f.id}`, f.from, f.dx, f.dz);
});

// The lamp that filled the foreground at the workshop entrance (QA round 4): a lamp head close to a
// trailing camera is a huge orange block. Walk the three main routes with the camera behind the
// avatar and require every lamp to stay at least LAMP_MIN_DISTANCE from the camera on every frame.
describe("lamps stay out of the camera's foreground on the main routes", () => {
  const LAMP_MIN_DISTANCE = 1.8; // a 0.34 m lamp head subtends under 11 degrees at this range
  const heads = buildDecor(CAMPUS).filter((p) => p.mat === "lamp-glow" && p.shape === "box" && p.sx < 0.3);
  const tower = CAMPUS.destinations.find((d) => d.id === "tower")!;
  const lab = CAMPUS.destinations.find((d) => d.id === "lab")!;
  const workshop = CAMPUS.destinations.find((d) => d.id === "workshop")!;
  const routes: [string, Vec3[]][] = [
    ["spawn to the workshop door", [{ x: 0, y: 0, z: -6 }, { x: workshop.entrance.x, y: 0, z: workshop.entrance.z }]],
    ["spawn to the lab door", [{ x: 0, y: 0, z: -6 }, { x: lab.entrance.x, y: 0, z: lab.entrance.z }]],
    ["spawn to the tower", [{ x: 0, y: 0, z: -6 }, { x: tower.entrance.x, y: 0, z: tower.entrance.z }]],
    ["plaza to the workshop along its path", [{ x: -7, y: 0, z: 4 }, { x: workshop.entrance.x, y: 0, z: workshop.entrance.z }]],
    ["plaza to the lab along its path", [{ x: 7, y: 0, z: 4 }, { x: lab.entrance.x, y: 0, z: lab.entrance.z }]],
  ];
  it("finds the lamp heads of the campus", () => {
    expect(heads.length).toBeGreaterThanOrEqual(16);
  });
  for (const [label, pts] of routes) {
    for (const run of [false, true]) {
      it(`${label}, ${run ? "run" : "walk"}: no lamp within ${LAMP_MIN_DISTANCE} m of the camera`, () => {
        const [a, b] = pts;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        const yaw = Math.atan2(dx, dz);
        let nearest = Infinity;
        let which = "";
        const onFrame = (cam: THREE.Vector3) => {
          for (const h of heads) {
            const d = Math.hypot(cam.x - h.x, cam.y - h.y, cam.z - h.z);
            if (d < nearest) {
              nearest = d;
              which = `${h.x.toFixed(1)}, ${h.z.toFixed(1)}`;
            }
          }
        };
        drive(a, [[(f) => Math.hypot(f.x - b.x, f.z - b.z) < 0.6, dx / len, dz / len]], yaw, true, run, { layout: CAMPUS, onFrame });
        expect(nearest, `closest lamp at ${which}`).toBeGreaterThanOrEqual(LAMP_MIN_DISTANCE);
      });
    }
  }
});
