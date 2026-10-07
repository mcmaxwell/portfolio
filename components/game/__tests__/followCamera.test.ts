// Follow camera: obstacle pull-in, on a fake query and on real Rapier drops (QA F6).
// The drop scenarios walk the real player motor off the end and off the side of the 30 degree
// ramp (4 m and about 2 m drops) with the real camera and the real sphere-cast query, and check
// the camera position against every block of the layout on every 60 Hz frame.
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createObstacleQuery } from "../cameraProbe";
import { CAMERA, FEET_TO_CENTER, MOTOR_CONFIG, PHYSICS, type Vec3 } from "../config";
import { createFollowCamera, type ObstacleQuery } from "../followCamera";
import { createPlayerMotor, type MotorIntent } from "../player";
import { buildColliders } from "../world/colliders";
import { blockQuaternion, getBlock, TEST_ARENA, type Block } from "../world/layout";

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

describe("follow camera with a fake obstacle query", () => {
  const target: Vec3 = { x: 0, y: 1, z: 0 };

  it("without a query the camera sits at the full distance behind the pivot", () => {
    const cam = newCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    fc.snapTo(target, 0);
    expect(cam.position.distanceTo(new THREE.Vector3(0, 1 + CAMERA.pivotHeight, 0))).toBeCloseTo(
      Math.hypot(CAMERA.distance, CAMERA.shoulder),
      5
    );
  });

  it("pulls in at once to the hit distance and eases back out when the path clears", () => {
    let hit: number | null = 2;
    const query: ObstacleQuery = () => hit;
    const cam = newCamera();
    const fc = createFollowCamera(cam, query, CAMERA);
    const pivot = new THREE.Vector3(0, 1 + CAMERA.pivotHeight, 0);
    fc.snapTo(target, 0);
    expect(cam.position.distanceTo(pivot)).toBeCloseTo(2, 5);
    hit = null;
    fc.update(1 / 60, target, true, 0, LOOK, false);
    const d1 = cam.position.distanceTo(pivot);
    expect(d1).toBeGreaterThan(2);
    expect(d1).toBeLessThan(2.5); // eased, not a pop
    for (let i = 0; i < 300; i++) fc.update(1 / 60, target, true, 0, LOOK, false);
    expect(cam.position.distanceTo(pivot)).toBeGreaterThan(Math.hypot(CAMERA.distance, CAMERA.shoulder) - 0.01);
    hit = 1;
    fc.update(1 / 60, target, true, 0, LOOK, false);
    expect(cam.position.distanceTo(pivot)).toBeCloseTo(1, 5); // shrinks immediately
  });

  it("passes the probe radius, the pivot and the wanted position to the query", () => {
    const calls: { from: Vec3; to: Vec3; radius: number }[] = [];
    const cam = newCamera();
    const fc = createFollowCamera(cam, (from, to, radius) => (calls.push({ from: { ...from }, to: { ...to }, radius }), null), CAMERA);
    fc.snapTo(target, 0);
    expect(calls).toHaveLength(1);
    expect(calls[0].radius).toBe(CAMERA.probeRadius);
    expect(calls[0].from.y).toBeCloseTo(1 + CAMERA.pivotHeight, 5);
    expect(new THREE.Vector3(calls[0].to.x, calls[0].to.y, calls[0].to.z).distanceTo(cam.position)).toBeLessThan(1e-9);
  });
});

/** Signed distance from a point to a block's oriented box: negative inside, positive outside. */
function signedDistance(b: Block, p: THREE.Vector3): number {
  const q = blockQuaternion(b);
  const local = p
    .clone()
    .sub(new THREE.Vector3(b.center.x, b.center.y, b.center.z))
    .applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w).invert());
  const d = new THREE.Vector3(Math.abs(local.x) - b.size.x / 2, Math.abs(local.y) - b.size.y / 2, Math.abs(local.z) - b.size.z / 2);
  const outside = new THREE.Vector3(Math.max(d.x, 0), Math.max(d.y, 0), Math.max(d.z, 0)).length();
  return outside + Math.min(Math.max(d.x, d.y, d.z), 0);
}

type Leg = [until: (feet: Vec3) => boolean, x: number, z: number];
type Run = { minClearance: number; worstBlock: string; frames: number; insideFrames: number; finalReach: number; minY: number };

/**
 * Walks the motor along `legs` (hold direction x, z until the predicate on the feet position
 * is true, or 15 s), starting at `start` (feet), with the camera yaw fixed at `yaw` so the camera trails from that side. Every frame
 * the camera position is checked against every block.
 */
function drive(start: Vec3, legs: Leg[], yaw: number, withQuery: boolean, run = false): Run {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = DT;
  worlds.push(world);
  buildColliders(RAPIER, world, TEST_ARENA);
  const center = (f: Vec3): Vec3 => ({ x: f.x, y: f.y + FEET_TO_CENTER, z: f.z });
  const motor = createPlayerMotor(RAPIER, world, center(TEST_ARENA.spawn), MOTOR_CONFIG);
  motor.teleport(center(start));
  motor.capture();
  const cam = newCamera();
  const fc = createFollowCamera(cam, withQuery ? createObstacleQuery(RAPIER, world) : null, CAMERA);
  fc.snapTo(center(start), yaw);
  const out: Run = { minClearance: Infinity, worstBlock: "", frames: 0, insideFrames: 0, finalReach: 0, minY: Infinity };
  const tmp: Vec3 = { x: 0, y: 0, z: 0 };
  const step = (intent: MotorIntent) => {
    const s = motor.step(DT, intent);
    world.step();
    motor.capture();
    const pos = motor.interpolated(1, tmp);
    fc.update(DT, pos, s.grounded, yaw, LOOK, false);
    cam.updateMatrixWorld(true);
    for (const b of TEST_ARENA.blocks) {
      const d = signedDistance(b, cam.position);
      if (d < out.minClearance) {
        out.minClearance = d;
        out.worstBlock = b.id;
      }
      if (d < 0) out.insideFrames++;
    }
    out.minY = Math.min(out.minY, cam.position.y);
    out.frames++;
  };
  for (let i = 0; i < 30; i++) step({ moveWorld: { x: 0, z: 0 }, run: false, jump: false });
  const feet = (): Vec3 => ({ x: motor.state.position.x, y: motor.state.position.y - FEET_TO_CENTER, z: motor.state.position.z });
  for (const [until, x, z] of legs) {
    for (let i = 0; i < 15 / DT && !until(feet()); i++) step({ moveWorld: { x, z }, run, jump: false });
  }
  for (let i = 0; i < 2 / DT; i++) step({ moveWorld: { x: 0, z: 0 }, run: false, jump: false }); // settle
  const pivot = new THREE.Vector3(motor.state.position.x, motor.state.position.y + CAMERA.pivotHeight, motor.state.position.z);
  out.finalReach = cam.position.distanceTo(pivot);
  return out;
}

const ramp30 = getBlock(TEST_ARENA, "ramp-30");
const FULL = Math.hypot(CAMERA.distance, CAMERA.shoulder);

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
      });
      it(`side drop, camera ${label}, ${run ? "run" : "walk"}: clear of every block on every frame`, () => {
        const r = drive({ x: ramp30.center.x, y: 0, z: 0 }, sideDrop, yaw, true, run);
        expect(r.insideFrames, `worst ${r.worstBlock}`).toBe(0);
        expect(r.minClearance, `worst ${r.worstBlock}`).toBeGreaterThanOrEqual(0.1);
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
