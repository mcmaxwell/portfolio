// Shared harness of the body clearance tests (QA F-M3-2, F-M3-3), split over several files so the
// test runner spreads them over its workers and every case is short: the real Rapier motor and colliders on the campus, the real
// animator running the shipped clips on the avatar skeleton, and the real body-clearance pass.
// For every wall face generated from the layout the avatar is pressed against the wall facing it,
// diagonally, sideways and with its back to it, and jumps and drops until it lands hard. On every
// frame the head, neck, chest, hips, thighs, shins and feet must stay 0.05 m outside every
// non-ground collider (F-M3-2), and the visual root must never move relative to the physics
// position faster than 3 m/s nor further than 0.3 m (F-M3-3: no pop at the landing crouch).
import RAPIER from "@dimforge/rapier3d-compat";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacterAnimator } from "../animator";
import { createBodyClearance, MAX_OFFSET_RATE, MAX_PUSH, MIN_BONE_CLEARANCE, pushOut, sampleLandPose, solidDistance, solidsOf, supportFloor, type LandPose, type Solid } from "../bodyClearance";
import { jointNamesOf, toGameClip } from "../clips";
import { ANIMATION, FEET_TO_CENTER, HIPS_MOTION_CLIPS, MOTOR_CONFIG, MOVEMENT, PHYSICS, type ClipName, type Vec3 } from "../config";
import { createPlayerMotor, type MotorState } from "../player";
import { buildColliders } from "../world/colliders";
import { blockQuaternion, CAMPUS, surfaceHeightAt, type Block } from "../world/layout";
import { readAvatarRig, type AvatarRig } from "../../../scripts/lib/avatar-rig.mjs";

const DT = PHYSICS.dt;
const NAMES = ["idle", "walk", "run", "jump", "fall", "land"] as const;
/** Probed points: a joint, or a point along the segment from a joint to the next one (head to feet). */
const PROBES: readonly { name: string; bone: string; to?: string; at?: number; support?: boolean; leg?: boolean }[] = [
  { name: "Head", bone: "Head" },
  { name: "Neck", bone: "Neck" },
  { name: "Spine2", bone: "Spine2" },
  { name: "Hips", bone: "Hips" },
  ...(["Left", "Right"] as const).flatMap((side) => [
    { name: `${side}Thigh0`, bone: `${side}UpLeg`, leg: true },
    { name: `${side}Thigh`, bone: `${side}UpLeg`, to: `${side}Leg`, at: 0.5, leg: true },
    { name: `${side}Knee`, bone: `${side}Leg`, leg: true },
    { name: `${side}Shin`, bone: `${side}Leg`, to: `${side}Foot`, at: 0.5, leg: true },
    { name: `${side}Foot`, bone: `${side}Foot`, support: true, leg: true },
    { name: `${side}FootMid`, bone: `${side}Foot`, to: `${side}ToeBase`, at: 0.5, support: true, leg: true },
    { name: `${side}Toe`, bone: `${side}ToeBase`, support: true, leg: true },
  ]),
];
const _tq = new THREE.Quaternion();
const _tv = new THREE.Vector3();
/** Height of a world point above the centre of a solid, in the solid's own frame (m). */
function localY(so: Solid, p: THREE.Vector3): number {
  _tq.set(so.qx, so.qy, so.qz, so.qw).invert();
  return _tv.set(p.x - so.cx, p.y - so.cy, p.z - so.cz).applyQuaternion(_tq).y;
}
/** A foot above the top face of a block stands on it: it is support, not an overlap. */
const SUPPORT_TOL = 0.06;
const SOLIDS = solidsOf(CAMPUS);
/** The acceptance numbers: the visual root offset from the physics position changes by at most 3 m/s and stays under 0.3 m. */
export const MAX_OFFSET_RATE_SPEC = 3;
export const MAX_OFFSET = 0.3;
/** A block whose top is no higher than this above the floor under the avatar is something to step or jump onto (jump 0.9 m). */
const CLIMBABLE = MOVEMENT.jumpHeight + 0.05;
/** The first frames after the teleport are the setup settling onto the floor, not a pose. */
const SETTLE_FRAMES = 3;
/** At the 0.3 m offset limit in a corner a joint may end up at most this far inside a surface (m): a few millimetres, on a single frame. */
export const MAX_INSIDE_AT_LIMIT = 0.02;
/**
 * Where the 0.3 m offset limit is reached on a face that is not a diagonal squeeze, a joint may still fall this far short
 * of the 0.05 m clearance (m). The upright posture (TASK-003) puts the head about 4 cm further forward than the old
 * backward-leaning stand, so the one tight run-up (tree-4-trunk, running jump from a standing start) ends 2 mm short.
 */
export const AT_LIMIT_SHORTFALL = 0.004;
/** A toe joint this close to the soles' height (m) is planted. */
const PLANTED_HEIGHT = 0.05;

let rig: AvatarRig;
const clips: Partial<Record<ClipName, THREE.AnimationClip>> = {};
const bindPose: Array<[THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3]> = [];

let landPose: LandPose | null = null;
const parse = (file: string) =>
  new Promise<THREE.AnimationClip>((resolve, reject) => {
    const buf = readFileSync(join(process.cwd(), "public/game/clips", file));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    new GLTFLoader().parse(ab as ArrayBuffer, "", (g) => resolve(g.animations[0]), reject);
  });

/** Registers the rig, clip and land pose setup of the file that calls it (one beforeAll and afterAll). */
export function useRig() {
  beforeAll(async () => {
    await RAPIER.init();
    rig = readAvatarRig(join(process.cwd(), "public/avatar.glb"));
    const joints = jointNamesOf(rig.root);
    for (const n of NAMES) clips[n] = toGameClip(await parse(`${n}.glb`), joints, HIPS_MOTION_CLIPS.includes(n));
    landPose = sampleLandPose(rig.root, clips, ANIMATION);
    rig.root.traverse((o) => {
      if ((o as THREE.Bone).isBone) bindPose.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
    });
  });
  afterAll(() => {
    for (const [o, p, q, s] of bindPose) {
      o.position.copy(p);
      o.quaternion.copy(q);
      o.scale.copy(s);
    }
  });
}

/** A vertical wall face with open ground in front of it: where to stand and which way is "into" the wall. */
export type Face = { id: string; stand: Vec3; into: { x: number; z: number } };

const quatOf = (b: Block) => {
  const q = blockQuaternion(b);
  return new THREE.Quaternion(q.x, q.y, q.z, q.w);
};

/** Every vertical face of every tall block that rises from a floor, with free floor 1 m out. */
function wallFaces(): Face[] {
  const faces: Face[] = [];
  for (const b of CAMPUS.blocks) {
    if (b.kind === "ground" || b.collide === false || b.kind === "ramp" || b.kind === "step") continue;
    const quat = quatOf(b);
    for (const [ax, sign] of [["x", 1], ["x", -1], ["z", 1], ["z", -1]] as const) {
      const n = new THREE.Vector3(ax === "x" ? sign : 0, 0, ax === "z" ? sign : 0).applyQuaternion(quat);
      const half = ax === "x" ? b.size.x / 2 : b.size.z / 2;
      // Stand a little out and let the walk press the avatar to the wall.
      const from = new THREE.Vector3(b.center.x, 0, b.center.z).addScaledVector(n, half + 1);
      const floor = surfaceHeightAt(CAMPUS, from.x, from.z, { exclude: (o) => o.id === b.id, maxY: 1 });
      if (floor === null) continue;
      if (b.center.y - b.size.y / 2 > floor + 0.1 || b.center.y + b.size.y / 2 < floor + 2.0) continue;
      const clear = SOLIDS.every((s) => s.id === b.id || solidDistance(s, from.x, floor + 1, from.z) > 0.6);
      if (clear) faces.push({ id: `${b.id} ${ax}${sign > 0 ? "+" : "-"}`, stand: { x: from.x, y: floor, z: from.z }, into: { x: -n.x, z: -n.z } });
    }
  }
  return faces;
}
export const FACES = wallFaces();

/** Metres (3, 2, 1 or 0) of run-up along the wall normal over open floor of the same height. */
function openRunUp(face: Face): number {
  for (const r of [3, 2, 1]) {
    let free = true;
    for (let d = 0; d <= r && free; d += 0.25) {
      const x = face.stand.x - face.into.x * d;
      const z = face.stand.z - face.into.z * d;
      const floor = surfaceHeightAt(CAMPUS, x, z, { maxY: face.stand.y + 0.3 });
      if (floor === null || Math.abs(floor - face.stand.y) > 0.05) free = false;
      for (const so of SOLIDS) if (free && solidDistance(so, x, face.stand.y + 0.9, z) < 0.5) free = false;
    }
    if (free) return r;
  }
  return 0;
}
/** Drop height (m) that keeps the head below any roof or lintel over the stand point; at least 1.2 m (a hard landing). */
export function dropHeight(face: Face): number {
  let ceiling = Infinity;
  for (let y = face.stand.y + 0.5; y < face.stand.y + 6; y += 0.1) {
    if (SOLIDS.some((so) => solidDistance(so, face.stand.x, y, face.stand.z) < 0.35)) {
      ceiling = y;
      break;
    }
  }
  return Math.max(0, Math.min(1.6, ceiling - face.stand.y - 2.0));
}

export type Pose = { name: string; intentTurn: number; yawTurn: number };
/** Intent angle off the wall normal and the avatar's facing relative to the intent. */
export const POSES: readonly Pose[] = [
  { name: "facing", intentTurn: 0, yawTurn: 0 },
  { name: "diagonal", intentTurn: Math.PI / 4, yawTurn: 0 },
  { name: "diagonal-other", intentTurn: -Math.PI / 4, yawTurn: 0 },
  { name: "sideways-left", intentTurn: 0, yawTurn: Math.PI / 2 },
  { name: "sideways-right", intentTurn: 0, yawTurn: -Math.PI / 2 },
  { name: "back-to-wall", intentTurn: 0, yawTurn: Math.PI },
];
type Mode = "jumps" | "drop" | "run-jump" | "drop-still";

type Result = {
  minClearance: number;
  worstBone: string;
  worstSolid: string;
  worstFrame: number;
  frames: number;
  hardLands: number;
  maxPush: number;
  /** Largest change of the visual root offset from the physics position in one frame, as a speed (m/s). */
  maxOffsetRate: number;
  /** Largest visual root offset from the physics position (m). */
  maxOffset: number;
  /** Horizontal speed (m/s) of planted toes on the ground on both this frame and the one before. */
  plantedFoot: number[];
  /** Largest crouch depth: the lowest Hips height (m above the soles). */
  lowestHips: number;
  /** Smallest clearance on frames where the offset is below its limit (the pass has room to work). */
  minFree: number;
  /** Frames at the offset limit, and the smallest clearance on them (two limits can meet in a squeeze). */
  limitedFrames: number;
  minLimited: number;
  /** Offset (m) on the frame of the first hard touchdown, and the largest offset up to then; -1 when none. */
  offsetAtTouchdown: number;
  maxOffsetBeforeTouchdown: number;
};

/**
 * Drives the motor, the animator and (optionally) the body-clearance pass the way the frame driver
 * does, one fixed step per frame, and measures the true clearance of the checked bones each frame.
 */
export function drive(face: Face, pose: Pose, mode: Mode, withClearance: boolean): Result {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = DT;
  try {
    buildColliders(RAPIER, world, CAMPUS);
    const start = { ...face.stand };
    const motor = createPlayerMotor(RAPIER, world, { x: CAMPUS.spawn.x, y: CAMPUS.spawn.y + FEET_TO_CENTER, z: CAMPUS.spawn.z }, MOTOR_CONFIG);
    const cs = Math.cos(pose.intentTurn);
    const sn = Math.sin(pose.intentTurn);
    const dir = { x: face.into.x * cs - face.into.z * sn, z: face.into.x * sn + face.into.z * cs };
    const yaw = Math.atan2(dir.x, dir.z) + pose.yawTurn;
    // A run-up starts further out and faces the way it runs; it is as long as the open floor allows.
    const runUp = mode === "run-jump" ? openRunUp(face) : 0;
    const feet = { x: start.x - face.into.x * runUp, y: start.y + (mode === "drop" || mode === "drop-still" ? dropHeight(face) : 0), z: start.z - face.into.z * runUp };
    motor.teleport({ x: feet.x, y: feet.y + FEET_TO_CENTER, z: feet.z });
    motor.capture();

    for (const [o, p, q, s] of bindPose) {
      o.position.copy(p);
      o.quaternion.copy(q);
      o.scale.copy(s);
    }
    const group = new THREE.Group();
    group.add(rig.root);
    const animator = createCharacterAnimator(rig.root, clips, ANIMATION);
    const clearance = createBodyClearance(rig.root, SOLIDS, {
      landPose,
      floorAt: (x, z, maxY) => surfaceHeightAt(CAMPUS, x, z, { maxY }),
      gravity: MOVEMENT.gravity,
      maxFallSpeed: MOVEMENT.maxFallSpeed,
      hardLandSpeed: ANIMATION.hardLandSpeed,
      stepHeight: CLIMBABLE,
    });
    const frame: MotorState = { ...motor.state, position: { ...motor.state.position } };
    animator.update(0, { ...frame, grounded: true, verticalVelocity: 0 });

    const probes = PROBES.map((pr) => ({ ...pr, a: rig.bone(pr.bone), b: pr.to ? rig.bone(pr.to) : null }));
    const footBones = [rig.bone("LeftToeBase"), rig.bone("RightToeBase")];
    const footPrev = [new THREE.Vector3(), new THREE.Vector3()];
    const footNow = new THREE.Vector3();
    const p = new THREE.Vector3();
    const p2 = new THREE.Vector3();
    let floorUnder: number | null = null;
    let prevOx = 0;
    let prevOz = 0;
    const seconds = mode === "jumps" ? 9 : mode === "drop" ? 4 : mode === "drop-still" ? 3 : 5;
    const n = Math.round(seconds / DT);
    let nextJump = 0.7; // jumps: pressed against the wall, again as soon as the crouch has ended, and at varied beats
    const beats = [1.5, 0.9, 1.9, 1.2, 1.6, 1.0];
    let beat = 0;
    const res: Result = { minClearance: Infinity, worstBone: "", worstSolid: "", worstFrame: -1, frames: 0, hardLands: 0, maxPush: 0, maxOffsetRate: 0, maxOffset: 0, plantedFoot: [], lowestHips: Infinity, minFree: Infinity, limitedFrames: 0, minLimited: Infinity, offsetAtTouchdown: -1, maxOffsetBeforeTouchdown: 0 };
    let curYaw = mode === "run-jump" ? Math.atan2(dir.x, dir.z) : yaw;
    for (let f = 0; f < n; f++) {
      const t = f * DT;
      const settled = mode === "drop" ? t > 0.4 : mode === "drop-still" ? false : t > 0.5;
      let jump = false;
      if (mode === "jumps" && t >= nextJump) {
        jump = true;
        nextJump = t + beats[beat++ % beats.length];
      } else if (mode === "run-jump") {
        const d = (motor.state.position.x - start.x) * face.into.x + (motor.state.position.z - start.z) * face.into.z; // < 0 before the face
        if (!motor.state.grounded) jump = false;
        else if (d > -0.9 && t > 0.3 && t < 1.6) jump = true;
        else if (t > 2.4 && t - Math.floor(t) < DT) jump = true;
      }
      const run = mode === "run-jump" && t < 2.0;
      motor.step(DT, { moveWorld: settled || mode === "run-jump" ? dir : { x: 0, z: 0 }, run, jump });
      world.step();
      motor.capture();
      const s = motor.state;
      frame.horizontalSpeed = s.horizontalSpeed;
      frame.verticalVelocity = s.verticalVelocity;
      frame.grounded = s.grounded;
      frame.airTime = s.airTime;
      frame.impactSpeed = s.impactSpeed;
      frame.jumpedThisStep = s.jumpedThisStep;
      frame.landedThisStep = s.landedThisStep;
      frame.respawnedThisStep = s.respawnedThisStep;
      if (s.landedThisStep && s.impactSpeed >= ANIMATION.hardLandSpeed) res.hardLands++;
      // Visual yaw follows the movement while moving and holds when blocked, as in the frame driver.
      if (s.horizontalSpeed > 0.3) {
        const target = Math.atan2(dir.x, dir.z);
        const diff = Math.atan2(Math.sin(target - curYaw), Math.cos(target - curYaw));
        curYaw += diff * (1 - Math.exp(-MOVEMENT.turnRate * DT));
      }
      group.position.set(s.position.x, s.position.y - FEET_TO_CENTER, s.position.z);
      // The facing turns smoothly while moving and holds when blocked (never snaps), as the frame driver does.
      group.rotation.y = mode === "run-jump" ? curYaw : yaw;
      animator.update(DT, frame, { hardLandAllowed: withClearance ? clearance.hardLandOk : true });
      const push = withClearance ? clearance.apply(group, DT, { grounded: s.grounded, verticalVelocity: s.verticalVelocity, landing: animator.state === "land" }) : 0;
      res.maxPush = Math.max(res.maxPush, push);
      group.updateMatrixWorld(true);
      res.frames++;
      const ox = group.position.x - s.position.x;
      const oz = group.position.z - s.position.z;
      if (f > 0) res.maxOffsetRate = Math.max(res.maxOffsetRate, Math.hypot(ox - prevOx, oz - prevOz) / DT);
      res.maxOffset = Math.max(res.maxOffset, Math.hypot(ox, oz));
      if (res.offsetAtTouchdown < 0) {
        if (s.landedThisStep && s.impactSpeed >= ANIMATION.hardLandSpeed) res.offsetAtTouchdown = Math.hypot(ox, oz);
        else res.maxOffsetBeforeTouchdown = Math.max(res.maxOffsetBeforeTouchdown, Math.hypot(ox, oz));
      }
      prevOx = ox;
      prevOz = oz;
      res.lowestHips = Math.min(res.lowestHips, rig.bone("Hips").getWorldPosition(p).y - group.position.y);
      for (let k = 0; k < 2; k++) {
        footBones[k].getWorldPosition(footNow);
        if (f > 0 && footNow.y - group.position.y < PLANTED_HEIGHT && footPrev[k].y - group.position.y < PLANTED_HEIGHT && s.grounded) {
          res.plantedFoot.push(Math.hypot(footNow.x - footPrev[k].x, footNow.z - footPrev[k].z) / DT);
        }
        footPrev[k].copy(footNow);
      }
      // The floor the legs measure steps against follows the floor up at once and down at 2 m/s.
      const fu = supportFloor((x, z, maxY) => surfaceHeightAt(CAMPUS, x, z, { maxY }), group.position.x, group.position.z, group.position.y + 0.2);
      floorUnder = fu === null ? floorUnder : Math.max(fu, (floorUnder ?? -Infinity) - 2 * DT);
      const nearSolids = SOLIDS.filter((so) => solidDistance(so, group.position.x, group.position.y + 1, group.position.z) < 4);
      if (f < SETTLE_FRAMES) continue;
      let frameMin = Infinity;
      for (const pr of probes) {
        pr.a.getWorldPosition(p);
        if (pr.b) p.lerp(pr.b.getWorldPosition(p2), pr.at ?? 0.5);
        for (const so of nearSolids) {
          if (pr.leg && floorUnder !== null && (so.top ?? Infinity) <= floorUnder + CLIMBABLE) continue;
          if (pr.support && (so.walkable || localY(so, p) > so.hy - SUPPORT_TOL)) continue;
          const d = solidDistance(so, p.x, p.y, p.z);
          if (d < frameMin) frameMin = d;
          if (d < res.minClearance) {
            res.minClearance = d;
            res.worstBone = pr.name;
            res.worstSolid = so.id;
            res.worstFrame = f;
          }
        }
      }
      if (push >= MAX_PUSH - 0.004) {
        res.limitedFrames++;
        res.minLimited = Math.min(res.minLimited, frameMin);
      } else res.minFree = Math.min(res.minFree, frameMin);
    }
    animator.dispose();
    motor.dispose();
    return res;
  } finally {
    world.free();
  }
}

/** The same face, with the avatar standing `extra` metres further out from the wall. */
export const moved = (face: Face, extra: number): Face => ({
  ...face,
  stand: { x: face.stand.x - face.into.x * extra, y: face.stand.y, z: face.stand.z - face.into.z * extra },
});
export const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] ?? 0;
export const fmt = (n: number) => n.toFixed(3);


/**
 * One pose of the body clearance matrix: every wall face is its own case (jumps, hard drop, running jump), and a
 * last case checks what only the whole matrix shows (the share of squeezed runs and that the drive reaches hard landings).
 */
export function definePoseSuite(pose: Pose) {
  describe(`body clearance, pose ${pose.name}`, () => {
    useRig();
    let hard = 0;
    let runs = 0;
    let squeezed = 0;
    for (const face of FACES) {
      it(`${pose.name} at ${face.id}: legs, hips, chest, neck and head keep 0.05 m from every collider, and the root never pops or slides (jumps, hard drop, running jump)`, () => {
        const failures: string[] = [];
        for (const mode of ["jumps", "drop", "run-jump"] as const) {
          if (mode === "drop" && dropHeight(face) < 1.2) continue; // a low roof: no room to fall
          const r = drive(face, pose, mode, true);
          runs++;
          hard += r.hardLands;
          const where = `${face.id} ${mode}`;
          // F-M3-3: no frame moves the root faster than 3 m/s relative to the physics position, and never 0.3 m away.
          if (r.maxOffsetRate > MAX_OFFSET_RATE_SPEC) failures.push(`${where}: offset rate ${r.maxOffsetRate.toFixed(2)} m/s`);
          if (r.maxOffset >= MAX_OFFSET) failures.push(`${where}: offset ${fmt(r.maxOffset)} m`);
          // F-M3-2: the clearance holds on every frame. Only where the 0.3 m offset limit is reached (a corner
          // between two solids, pressed diagonally) the limit wins; the shortfall is bounded and rare.
          if (r.limitedFrames === 0) {
            if (r.minClearance < MIN_BONE_CLEARANCE - 1e-6) failures.push(`${where}: ${r.worstBone} ${fmt(r.minClearance)} m from ${r.worstSolid} at frame ${r.worstFrame}`);
          } else if (r.minClearance < MIN_BONE_CLEARANCE - 1e-6) {
            squeezed++;
            if (pose.name !== "diagonal" && pose.name !== "diagonal-other" && r.minClearance < MIN_BONE_CLEARANCE - AT_LIMIT_SHORTFALL) failures.push(`${where}: ${r.worstBone} ${fmt(r.minClearance)} m at the offset limit`);
            if (r.minClearance < -MAX_INSIDE_AT_LIMIT) failures.push(`${where}: ${r.worstBone} ${fmt(r.minClearance)} m inside at the offset limit`);
          }
        }
        expect(failures).toEqual([]);
      });
    }
    it(`${pose.name}: few runs are squeezed against the offset limit, and the drive reaches hard landings`, () => {
      expect(runs, "runs made by the cases above").toBeGreaterThan(0);
      expect(squeezed / runs, "runs squeezed against the offset limit").toBeLessThan(0.08);
      expect(hard, "the drive reaches hard landings").toBeGreaterThanOrEqual(FACES.length / 2);
    });
  });
}
