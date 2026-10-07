// Body clearance: keeps the visible avatar out of level geometry in every pose (QA F-M3-2).
//
// The capsule stops the avatar a standoff short of a wall, but the animation moves the head,
// chest, hips and legs well off the capsule axis: the hard-landing crouch puts the head 0.5 m ahead
// of it, and a jump or a lean does the same in smaller measure. Instead of tuning each clip or
// each wall, this runs after the animator on the finished pose. For the head, torso, legs and feet
// (and, with what is left over, the shoulders and hands) it measures the distance to every solid
// near the avatar, and the visual root is nudged horizontally away from whatever is too close. Physics, the capsule and the camera are untouched; the
// push is visual only. In the open nothing is near, nothing is moved and no bone is read.
//
// F-M3-3: a correction made after the pose needs it pops (the crouch moves the head 0.5 m in a few
// frames). So the pass looks ahead and rate-limits what is left. While the avatar falls toward a
// hard landing, the landing crouch (sampled once from the real animator on a copy of the bones) is
// tested against the solids around it and the push is built up during the fall, before the pose
// needs it. Where the crouch would need more than HARD_LAND_MAX_PUSH, `hardLandOk` goes false, the
// animator plays the soft landing there instead and nothing reaches forward. Whatever correction
// is still needed (jump and run poses against a wall) moves the root at MAX_OFFSET_RATE at most.
import * as THREE from "three";
import { createCharacterAnimator } from "./animator";
import type { AnimationConfig, ClipName } from "./config";
import type { MotorState } from "./player";
import { blockQuaternion, type Block, type Layout } from "./world/layout";

/**
 * A point of the body the pass keeps clear: a joint, or a point `at` of the way from joint `bone` to
 * joint `to` (thigh, shin, foot), and the clearance (m) its surface needs: its own radius plus 0.05 m.
 * `support` marks the feet: a point above the top face of a block stands on it and is left alone.
 * `soft` marks shoulders and hands: they are kept clear only with what the required points leave over
 * (at most SOFT_EXTRA of extra push), so that a hand never costs a head or a leg its clearance.
 * `leg` marks thighs, shins and feet: they step and jump onto anything low enough to climb (see
 * `stepHeight`), so such a block is not kept clear of them; the torso and head always are.
 */
export type Probe = { name: string; bone: string; to?: string; at?: number; margin: number; support?: boolean; leg?: boolean; soft?: boolean };

export const CLEARANCE_PROBES: readonly Probe[] = [
  { name: "Head", bone: "Head", margin: 0.17 },
  { name: "Neck", bone: "Neck", margin: 0.13 },
  { name: "Spine2", bone: "Spine2", margin: 0.17 },
  { name: "Hips", bone: "Hips", margin: 0.17 },
  { name: "LeftShoulder", bone: "LeftShoulder", margin: 0.1, soft: true },
  { name: "RightShoulder", bone: "RightShoulder", margin: 0.1, soft: true },
  { name: "LeftHand", bone: "LeftHand", margin: 0.1, soft: true },
  { name: "RightHand", bone: "RightHand", margin: 0.1, soft: true },
  ...(["Left", "Right"] as const).flatMap((side): Probe[] => [
    { name: `${side}Thigh`, bone: `${side}UpLeg`, to: `${side}Leg`, at: 0.5, margin: 0.15, leg: true },
    { name: `${side}Knee`, bone: `${side}Leg`, margin: 0.12, leg: true },
    { name: `${side}Shin`, bone: `${side}Leg`, to: `${side}Foot`, at: 0.5, margin: 0.11, leg: true },
    { name: `${side}Foot`, bone: `${side}Foot`, margin: 0.1, support: true, leg: true },
    { name: `${side}FootMid`, bone: `${side}Foot`, to: `${side}ToeBase`, at: 0.5, margin: 0.1, support: true, leg: true },
    { name: `${side}Toe`, bone: `${side}ToeBase`, margin: 0.09, support: true, leg: true },
  ]),
];

/** The measured clearance a bone must keep from the true surface (m); also what the tests assert. */
export const MIN_BONE_CLEARANCE = 0.05;

/**
 * The visual root never moves relative to the physics position faster than this (m/s). A walking
 * clip's own foot speed is about 1.5 m/s; a push this slow reads as a lean or a step, not a pop.
 */
export const MAX_OFFSET_RATE = 2.2;
/** The most extra push (m) the soft points (hands, shoulders) may ask for on top of what the required points need. */
const SOFT_EXTRA = 0.08;
/** Largest visual push (m). Total offset from the physics position stays under 0.3 m. */
export const MAX_PUSH = 0.299;
/**
 * A hard landing is only played where the crouch needs no more than this much push (m) in front of
 * a solid; otherwise the landing is the soft one (no crouch, nothing reaches forward).
 */
export const HARD_LAND_MAX_PUSH = 0.2;
/**
 * How fast a push the pose no longer needs is released (1/s). Slow on purpose: a push that follows every
 * swing of a walking leg would ask the root for more than the rate limit allows and lag behind it.
 */
const RELEASE_RATE = 1.5;
/** Horizontal reach of the pose past the capsule axis (m): solids farther than this are skipped. */
const REACH = 1.3;
/** Vertical span checked above the soles (m): a jump takes the head to about 2.7 m. */
const SPAN_UP = 3;
const PASSES = 4;
/** The room check follows the avatar's heading this far ahead (s): a crouch lasts about a second, a step toward a wall ends it. */
const LOOKAHEAD: readonly number[] = [0, 0.2, 0.4];
const MAX_LOOKAHEAD_SPEED = 5;
/** The body pose is also kept clear this many seconds ahead along the physics velocity (s). */
const LEAD = 0.14;
/** The longest look-ahead (m): a run at 5 m/s is read about this far ahead. */
const LEAD_MAX = 0.5;
/** ...but only for a body that really is travelling: at least this far ahead (m), about 1.5 m/s. */
const LEAD_MIN = 0.12;
/** How fast the floor the legs measure steps against may drop (m/s). */
const FLOOR_REF_FALL = 2;
/** A falling avatar is tested for a hard landing from this downward speed (m/s). */
const FALL_PROBE_SPEED = 1;
/** The floor under the avatar is the highest surface up to this far (m) above the soles: the capsule can rest on an edge with its sphere, a few cm to a hand lower than the visible top. */
const FLOOR_SLACK = 0.2;
/** What must hold at a joint: the 0.05 m the acceptance measures plus a hair (m), and how much worse than that a comfort margin may leave it. */
const HARD_MARGIN = 0.075;
const HARD_TOL = 0.002;
/** Extra reach (m) a push can add while a solve is under way: points farther than margin plus this from a box are skipped. */
const CULL = 0.35;
type Tier = "hard" | "comfort" | "all";
/** Tolerance (m) under a block top face within which a foot counts as standing on it (the colliders stop the soles a few cm short of the visible top). */
const SUPPORT_TOL = 0.06;

/** An oriented box the avatar must stay out of. */
export type Solid = {
  id: string;
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  /** A ramp or a step: the feet walk on it, so they are not kept clear of it. */
  walkable?: boolean;
  /** Highest world point of the box (m). */
  top?: number;
  /** World bounding box of the box (m): min x, max x, min y, max y, min z, max z. A point farther than any margin from it is clear. */
  bb?: readonly [number, number, number, number, number, number];
  /** Block rotation (unit quaternion). */
  qx: number;
  qy: number;
  qz: number;
  qw: number;
};

/** The world bounding box of a rotated block. */
function boundsOf(b: Block, q: { x: number; y: number; z: number; w: number }): [number, number, number, number, number, number] {
  const hx = b.size.x / 2;
  const hy = b.size.y / 2;
  const hz = b.size.z / 2;
  const ex = Math.abs(1 - 2 * (q.y * q.y + q.z * q.z)) * hx + Math.abs(2 * (q.x * q.y - q.w * q.z)) * hy + Math.abs(2 * (q.x * q.z + q.w * q.y)) * hz;
  const ey = Math.abs(2 * (q.x * q.y + q.w * q.z)) * hx + Math.abs(1 - 2 * (q.x * q.x + q.z * q.z)) * hy + Math.abs(2 * (q.y * q.z - q.w * q.x)) * hz;
  const ez = Math.abs(2 * (q.x * q.z - q.w * q.y)) * hx + Math.abs(2 * (q.y * q.z + q.w * q.x)) * hy + Math.abs(1 - 2 * (q.x * q.x + q.y * q.y)) * hz;
  return [b.center.x - ex, b.center.x + ex, b.center.y - ey, b.center.y + ey, b.center.z - ez, b.center.z + ez];
}

/** Every colliding, non-ground block of a layout, at its true (visible) size without the standoff. */
export function solidsOf(layout: Layout): Solid[] {
  const out: Solid[] = [];
  for (const b of layout.blocks as readonly Block[]) {
    if (b.kind === "ground" || b.collide === false) continue;
    const q = blockQuaternion(b);
    out.push({
      id: b.id,
      cx: b.center.x,
      cy: b.center.y,
      cz: b.center.z,
      hx: b.size.x / 2,
      hy: b.size.y / 2,
      hz: b.size.z / 2,
      walkable: b.kind === "ramp" || b.kind === "step",
      top: b.center.y + Math.abs(2 * (q.x * q.y + q.w * q.z)) * (b.size.x / 2) + Math.abs(1 - 2 * (q.x * q.x + q.z * q.z)) * (b.size.y / 2) + Math.abs(2 * (q.y * q.z - q.w * q.x)) * (b.size.z / 2),
      bb: boundsOf(b, q),
      qx: q.x,
      qy: q.y,
      qz: q.z,
      qw: q.w,
    });
  }
  return out;
}

const _l = new THREE.Vector3();
const _w = new THREE.Vector3();

/** Rotates (x, y, z) by the inverse (inv) or the forward rotation of a solid into `out`. */
function rotate(s: Solid, x: number, y: number, z: number, inv: boolean, out: THREE.Vector3): THREE.Vector3 {
  // v + 2w (q x v) + 2 q x (q x v), with q negated for the inverse.
  const sg = inv ? -1 : 1;
  const qx = s.qx * sg;
  const qy = s.qy * sg;
  const qz = s.qz * sg;
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return out.set(x + s.qw * tx + (qy * tz - qz * ty), y + s.qw * ty + (qz * tx - qx * tz), z + s.qw * tz + (qx * ty - qy * tx));
}

/** Signed distance (m) from a world point to a solid: negative inside. Used by the tests and the probes. */
export function solidDistance(s: Solid, px: number, py: number, pz: number): number {
  rotate(s, px - s.cx, py - s.cy, pz - s.cz, true, _l);
  const dx = Math.abs(_l.x) - s.hx;
  const dy = Math.abs(_l.y) - s.hy;
  const dz = Math.abs(_l.z) - s.hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dy, dz), 0);
}

/**
 * The horizontal push (x, z) that takes the point at least `margin` away from the solid, or null
 * if it is already clear or no horizontal move can help (directly above or below a face).
 * `ox, oz` is a point known to be outside (the avatar's feet): it picks the side to leave by when
 * the bone is inside the box, so a thin wall is never crossed to its far side.
 */
export function pushOut(
  s: Solid,
  px: number,
  py: number,
  pz: number,
  margin: number,
  ox: number,
  oz: number,
  out: { x: number; z: number },
  support = false
): boolean {
  rotate(s, px - s.cx, py - s.cy, pz - s.cz, true, _l);
  const lx = _l.x;
  const ly = _l.y;
  const lz = _l.z;
  if (support && ly > s.hy - SUPPORT_TOL) return false;
  const ax = Math.abs(lx) - s.hx;
  const ay = Math.abs(ly) - s.hy;
  const az = Math.abs(lz) - s.hz;
  const inside = ax < 0 && ay < 0 && az < 0;
  if (!inside) {
    const dx = Math.max(ax, 0);
    const dy = Math.max(ay, 0);
    const dz = Math.max(az, 0);
    if (Math.hypot(dx, dy, dz) >= margin) return false;
    // Offset from the nearest point of the box, in world axes.
    rotate(s, Math.sign(lx) * dx, Math.sign(ly) * dy, Math.sign(lz) * dz, false, _w);
    const dh = Math.hypot(_w.x, _w.z);
    const need = margin * margin - _w.y * _w.y;
    if (dh < 1e-6 || need <= 0) return false;
    const want = Math.sqrt(need);
    if (dh >= want) return false;
    out.x = (_w.x / dh) * (want - dh);
    out.z = (_w.z / dh) * (want - dh);
    return true;
  }
  // Inside: leave through the side the feet are on (local x or z, whichever exit is shorter).
  rotate(s, ox - s.cx, 0, oz - s.cz, true, _w);
  const sx = _w.x === 0 ? Math.sign(lx) || 1 : Math.sign(_w.x);
  const sz = _w.z === 0 ? Math.sign(lz) || 1 : Math.sign(_w.z);
  const exitX = s.hx - sx * lx;
  const exitZ = s.hz - sz * lz;
  if (exitX <= exitZ) rotate(s, sx * (exitX + margin), 0, 0, false, _w);
  else rotate(s, 0, 0, sz * (exitZ + margin), false, _w);
  out.x = _w.x;
  out.z = _w.z;
  return true;
}

/** Where the landing crouch puts each probe, in the avatar's own frame (yaw 0, feet at the origin). */
export type LandPose = { margin: number; support: boolean; leg: boolean; soft: boolean; points: Float32Array }[];

/** A copy of the bone tree only (no meshes), so a second animator can pose it without touching the live skeleton. */
function cloneBones(root: THREE.Object3D): THREE.Object3D {
  const copy = (o: THREE.Object3D): THREE.Object3D => {
    const n = (o as THREE.Bone).isBone ? new THREE.Bone() : new THREE.Object3D();
    n.name = o.name;
    n.position.copy(o.position);
    n.quaternion.copy(o.quaternion);
    n.scale.copy(o.scale);
    for (const c of o.children) if (!(c as THREE.Mesh).isMesh) n.add(copy(c));
    return n;
  };
  return copy(root);
}

type ProbeBones = { probe: Probe; a: THREE.Object3D; b: THREE.Object3D | null };

function probeBones(root: THREE.Object3D): ProbeBones[] {
  const out: ProbeBones[] = [];
  for (const probe of CLEARANCE_PROBES) {
    const a = root.getObjectByName(probe.bone);
    const b = probe.to ? root.getObjectByName(probe.to) : null;
    if (a && (!probe.to || b)) out.push({ probe, a, b: b ?? null });
  }
  return out;
}

const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
function probePoint(pb: ProbeBones, out: THREE.Vector3): THREE.Vector3 {
  pb.a.getWorldPosition(out);
  if (pb.b) out.lerp(pb.b.getWorldPosition(_pb), pb.probe.at ?? 0.5);
  return out;
}

/** Spacing (m) under which two sampled crouch points of one probe count as the same point. */
const SAMPLE_GRID = 0.03;

/** A grounded standing state, a falling one and a hard touchdown: what the frame driver feeds the animator. */
const MOTOR_BASE: MotorState = {
  position: { x: 0, y: 0, z: 0 },
  horizontalSpeed: 0,
  verticalVelocity: 0,
  grounded: true,
  airTime: 0,
  impactSpeed: 0,
  jumpedThisStep: false,
  landedThisStep: false,
  respawnedThisStep: false,
};

/**
 * Plays the real animator on a copy of the bones through a fall and a hard landing and records where
 * every probe goes while the land state lasts. Done once per avatar; the live skeleton is never touched.
 */
export function sampleLandPose(
  scene: THREE.Object3D,
  clips: Partial<Record<ClipName, THREE.AnimationClip>>,
  cfg: AnimationConfig,
  step = 1 / 60
): LandPose | null {
  if (!clips.land) return null;
  const root = cloneBones(scene);
  const bones = probeBones(root);
  if (bones.length === 0) return null;
  const animator = createCharacterAnimator(root, clips, cfg);
  const seen = bones.map(() => new Set<string>());
  const pts: number[][] = bones.map(() => []);
  const record = () => {
    root.updateMatrixWorld(true);
    bones.forEach((pb, i) => {
      probePoint(pb, _pa);
      const key = `${Math.round(_pa.x / SAMPLE_GRID)},${Math.round(_pa.y / SAMPLE_GRID)},${Math.round(_pa.z / SAMPLE_GRID)}`;
      if (seen[i].has(key)) return;
      seen[i].add(key);
      pts[i].push(_pa.x, _pa.y, _pa.z);
    });
  };
  const falling: MotorState = { ...MOTOR_BASE, grounded: false, verticalVelocity: -8, airTime: 0.5 };
  const landed: MotorState = { ...MOTOR_BASE, impactSpeed: Math.max(cfg.hardLandSpeed, 8), landedThisStep: true };
  try {
    animator.update(0, MOTOR_BASE);
    // Fall long enough to be in the fall pose, then touch down hard.
    for (let i = 0; i < 40; i++) animator.update(step, falling);
    animator.update(step, landed, { hardLandAllowed: true });
    record();
    landed.landedThisStep = false;
    for (let i = 0; i < 120 && animator.state === "land"; i++) {
      animator.update(step, landed, { hardLandAllowed: true });
      record();
    }
  } finally {
    animator.dispose();
  }
  return bones.map((pb, i) => ({ margin: pb.probe.margin, support: !!pb.probe.support, leg: !!pb.probe.leg, soft: !!pb.probe.soft, points: Float32Array.from(pts[i]) }));
}

export interface ClearanceOptions {
  /** The landing crouch of this avatar (see sampleLandPose); without it nothing is anticipated. */
  landPose?: LandPose | null;
  /** Height (m) of the highest floor under (x, z) at or below maxY; null over a void. */
  floorAt?: (x: number, z: number, maxY: number) => number | null;
  gravity?: number;
  maxFallSpeed?: number;
  /** Downward speed (m/s) from which a landing is hard. */
  hardLandSpeed?: number;
  /** Height (m) of what the avatar steps or jumps onto: legs are not kept clear of blocks with a top this low above the floor. */
  stepHeight?: number;
}

export interface ClearanceFrame {
  grounded: boolean;
  verticalVelocity: number;
  /** True while the animator plays the landing crouch. */
  landing: boolean;
}

export interface BodyClearance {
  /**
   * Call after the animator and the pose blend wrote this frame and after the group was placed
   * at the physics position. Moves `group` horizontally if a bone is too close to a solid, never
   * faster than MAX_OFFSET_RATE, and returns the offset applied (m).
   */
  apply(group: THREE.Object3D, dt: number, frame?: ClearanceFrame): number;
  /**
   * False when a hard landing here would need more room than HARD_LAND_MAX_PUSH: the animator plays
   * the soft landing instead. Valid from the frame before touchdown (read it before the animator update).
   */
  readonly hardLandOk: boolean;
  /** The offset currently applied (m). */
  readonly push: number;
  reset(): void;
}

/** A set of probe points to keep clear: world position, clearance needed and what kind of body part it is. */
class PointSet {
  x: number[] = [];
  y: number[] = [];
  z: number[] = [];
  /** The comfortable clearance (its own radius plus 0.05 m) and the least that must hold (0.05 m plus a hair at the joint). */
  margin: number[] = [];
  hard: number[] = [];
  support: boolean[] = [];
  leg: boolean[] = [];
  soft: boolean[] = [];
  clear() {
    this.x.length = this.y.length = this.z.length = this.margin.length = this.hard.length = this.support.length = this.leg.length = this.soft.length = 0;
  }
  add(x: number, y: number, z: number, margin: number, support: boolean, leg: boolean, soft = false) {
    this.soft.push(soft);
    this.hard.push(Math.min(HARD_MARGIN, margin));
    this.x.push(x);
    this.y.push(y);
    this.z.push(z);
    this.margin.push(margin);
    this.support.push(support);
    this.leg.push(leg);
  }
}

export function createBodyClearance(scene: THREE.Object3D, solids: readonly Solid[], opts: ClearanceOptions = {}): BodyClearance {
  const bones = probeBones(scene);
  const gravity = opts.gravity ?? 20;
  const maxFall = opts.maxFallSpeed ?? 20;
  const hardLand = opts.hardLandSpeed ?? 6.5;
  const stepHeight = opts.stepHeight ?? 0.95;
  const land = opts.landPose ?? null;
  let ox = 0;
  let oz = 0;
  let hardOk = true;
  let prevX = 0;
  let prevZ = 0;
  let havePrev = false;
  let floorRef = -Infinity;
  const pts = bones.map(() => new THREE.Vector3());
  const delta = { x: 0, z: 0 };
  const near: Solid[] = [];
  const live = new PointSet();
  const ghost = new PointSet();
  const gOut = { x: 0, z: 0 };
  const tOut = { x: 0, z: 0 };

  /**
   * The extra horizontal push (x, z) the point set needs from the position (gx, gz). A leg point
   * leaves alone any block whose top is not above `climbTop`: that is something to step or jump onto.
   */
  const solve = (set: PointSet, gx: number, gz: number, climbTop: number, out: { x: number; z: number }, tier: Tier, ax0 = 0, az0 = 0) => {
    let ax = ax0;
    let az = az0;
    for (let pass = 0; pass < PASSES; pass++) {
      let moved = false;
      for (const s of near) {
        const climbable = (s.top ?? Infinity) <= climbTop;
        const bb = s.bb;
        for (let i = 0; i < set.x.length; i++) {
          if (tier !== "all" && set.soft[i]) continue;
          if (set.leg[i] && climbable) continue;
          if (set.support[i] && s.walkable) continue;
          const margin = tier === "hard" ? set.hard[i] : set.margin[i];
          // A point farther from the box's bounds than its margin plus all the push so far can reach is clear.
          if (bb && (set.x[i] + ax < bb[0] - margin - CULL || set.x[i] + ax > bb[1] + margin + CULL || set.z[i] + az < bb[4] - margin - CULL || set.z[i] + az > bb[5] + margin + CULL || set.y[i] < bb[2] - margin || set.y[i] > bb[3] + margin)) continue;
          if (pushOut(s, set.x[i] + ax, set.y[i], set.z[i] + az, margin, gx + ax, gz + az, delta, set.support[i])) {
            ax += delta.x;
            az += delta.z;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    out.x = ax;
    out.z = az;
  };

  /** The worst shortfall (m) of a required point against its hard clearance if the avatar moves (ax, az) more; 0 when all hold. */
  const hardShortfall = (set: PointSet, ax: number, az: number, climbTop: number): number => {
    let worst = 0;
    for (const s of near) {
      const climbable = (s.top ?? Infinity) <= climbTop;
      const bb = s.bb;
      for (let i = 0; i < set.x.length; i++) {
        if (set.soft[i] || (set.leg[i] && climbable) || (set.support[i] && s.walkable)) continue;
        if (bb && (set.x[i] + ax < bb[0] - set.hard[i] || set.x[i] + ax > bb[1] + set.hard[i] || set.z[i] + az < bb[4] - set.hard[i] || set.z[i] + az > bb[5] + set.hard[i] || set.y[i] < bb[2] - set.hard[i] || set.y[i] > bb[3] + set.hard[i])) continue;
        if (set.support[i]) {
          rotate(s, set.x[i] + ax - s.cx, set.y[i] - s.cy, set.z[i] + az - s.cz, true, _l);
          if (_l.y > s.hy - SUPPORT_TOL) continue;
        }
        const short = set.hard[i] - solidDistance(s, set.x[i] + ax, set.y[i], set.z[i] + az);
        if (short > worst) worst = short;
      }
    }
    return worst;
  };

  /**
   * Adds as much of the extra push (ex, ez) on top of (ax, az) as keeps the hard clearance no worse
   * than it is at (ax, az); the extra is what a more comfortable margin asked for.
   */
  const addExtra = (set: PointSet, ax: number, az: number, ex: number, ez: number, climbTop: number, out: { x: number; z: number }, rx: number, rz: number) => {
    const base = hardShortfall(set, ax, az, climbTop);
    for (const k of [1, 0.7, 0.4, 0.2]) {
      // The extra must fit under the offset limit too: the required push is never traded for comfort.
      if (Math.hypot(rx + ax + ex * k, rz + az + ez * k) > MAX_PUSH) continue;
      if (hardShortfall(set, ax + ex * k, az + ez * k, climbTop) <= base + HARD_TOL) {
        out.x = ax + ex * k;
        out.z = az + ez * k;
        return;
      }
    }
    out.x = ax;
    out.z = az;
  };

  /** Adds the landing crouch placed at (gx, gy, gz) facing `yaw` to a point set. */
  const addCrouch = (set: PointSet, gx: number, gy: number, gz: number, yaw: number) => {
    if (!land) return;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    for (const pr of land) {
      for (let k = 0; k < pr.points.length; k += 3) {
        const lx = pr.points[k];
        const lz = pr.points[k + 2];
        set.add(gx + lx * c + lz * sn, gy + pr.points[k + 1], gz - lx * sn + lz * c, pr.margin, pr.support, pr.leg, pr.soft);
      }
    }
  };

  return {
    get push() {
      return Math.hypot(ox, oz);
    },
    get hardLandOk() {
      return hardOk;
    },
    reset() {
      ox = oz = 0;
      hardOk = true;
      havePrev = false;
      floorRef = -Infinity;
    },
    apply(group, dt, frame) {
      const px = group.position.x;
      const pz = group.position.z;
      const py = group.position.y;
      const yaw = group.rotation.y;
      // The offset is released smoothly; the pose then asks for what it still needs.
      const k = Math.exp(-RELEASE_RATE * Math.max(dt, 0));
      let rx = ox * k;
      let rz = oz * k;
      if (Math.hypot(rx, rz) < 1e-4) rx = rz = 0;

      // Velocity of the physics position, to see which way the avatar is heading.
      let vx = 0;
      let vz = 0;
      if (havePrev && dt > 1e-6) {
        vx = (px - prevX) / dt;
        vz = (pz - prevZ) / dt;
        const sp = Math.hypot(vx, vz);
        if (sp > MAX_LOOKAHEAD_SPEED) {
          vx *= MAX_LOOKAHEAD_SPEED / sp;
          vz *= MAX_LOOKAHEAD_SPEED / sp;
        }
      }
      prevX = px;
      prevZ = pz;
      havePrev = true;

      // A hard landing is coming (falling toward a floor that is hard to hit) or is playing: is there room
      // for the crouch where the avatar is heading, and when there is, build the push now. The crouch is
      // tested where it will happen: at the height of the floor the fall ends on.
      let anticipate = !!frame?.landing;
      let landY = py;
      if (frame && land) {
        let judge = false;
        if (frame.landing) {
          judge = true;
        } else if (frame.grounded) {
          // The verdict stands until the next fall: the landing frame itself reads it.
        } else if (frame.verticalVelocity >= -FALL_PROBE_SPEED) {
          hardOk = true;
        } else {
          near.length = 0;
          collectNear(solids, px, py, pz, near);
          const floor = near.length > 0 && opts.floorAt ? opts.floorAt(px, pz, py + FLOOR_SLACK) : null;
          const h = floor === null ? Infinity : Math.max(0, py - floor);
          const impact = Math.min(Math.sqrt(frame.verticalVelocity * frame.verticalVelocity + 2 * gravity * h), maxFall);
          if (floor !== null && impact >= hardLand) {
            landY = floor;
            judge = true;
          } else {
            hardOk = true;
          }
        }
        if (judge) {
          near.length = 0;
          collectNear(solids, px, py, pz, near);
          if (landY !== py) collectNear(solids, px, landY, pz, near, true);
          for (const tau of LOOKAHEAD) collectNear(solids, px + vx * tau, landY, pz + vz * tau, near, true);
          if (near.length === 0) {
            hardOk = true;
          } else {
            // Along the way the avatar is heading, from the physics position itself (no offset); a little
            // hysteresis keeps the verdict from flickering.
            ghost.clear();
            for (const tau of LOOKAHEAD) addCrouch(ghost, px + vx * tau, landY, pz + vz * tau, yaw);
            solve(ghost, px, pz, landY + stepHeight, gOut, "comfort");
            hardOk = Math.hypot(gOut.x, gOut.z) <= HARD_LAND_MAX_PUSH - (hardOk ? 0 : 0.03);
          }
          anticipate = hardOk;
        }
      }

      const gx = px + rx;
      const gz = pz + rz;
      near.length = 0;
      collectNear(solids, gx, py, gz, near);
      if (anticipate && landY !== py) collectNear(solids, gx, landY, gz, near, true);
      let tx = rx;
      let tz = rz;
      if (near.length === 0) floorRef = -Infinity;
      if (near.length > 0 && bones.length > 0) {
        group.position.x = gx;
        group.position.z = gz;
        group.updateMatrixWorld(true);
        // What the legs may step onto is measured from the floor under the avatar.
        // It follows the floor up at once and down gently, so stepping off a ledge does not flip the rule in one frame.
        const floor = supportFloor(opts.floorAt, gx, gz, py + FLOOR_SLACK);
        floorRef = Math.max(floor ?? -Infinity, floorRef - FLOOR_REF_FALL * Math.max(dt, 0));
        if (floor !== null && floorRef === -Infinity) floorRef = floor;
        const climbTop = floorRef + stepHeight;
        live.clear();
        for (let i = 0; i < bones.length; i++) {
          probePoint(bones[i], pts[i]);
          live.add(pts[i].x, pts[i].y, pts[i].z, bones[i].probe.margin, !!bones[i].probe.support, !!bones[i].probe.leg, !!bones[i].probe.soft);
        }
        // Where the body will be in a few frames if it keeps going: the push is built before it arrives, not after.
        const n = live.x.length;
        let lx = vx * LEAD;
        let lz = vz * LEAD;
        const ll = Math.hypot(lx, lz);
        if (ll > LEAD_MAX) {
          lx *= LEAD_MAX / ll;
          lz *= LEAD_MAX / ll;
        }
        if (Math.hypot(lx, lz) > LEAD_MIN) {
          for (let i = 0; i < n; i++) live.add(live.x[i] + lx, live.y[i], live.z[i] + lz, live.margin[i], live.support[i], live.leg[i], live.soft[i]);
        }
        if (anticipate) addCrouch(live, gx, landY, gz, yaw);
        const top = anticipate ? Math.max(climbTop, landY + stepHeight) : climbTop;
        // First what must hold (0.05 m at the joints), then the comfortable margin as far as that allows,
        // then the soft points (hands, shoulders) with at most a small extra push.
        solve(live, gx, gz, top, tOut, "hard");
        const hx = tOut.x;
        const hz = tOut.z;
        solve(live, gx, gz, top, tOut, "comfort", hx, hz);
        addExtra(live, hx, hz, tOut.x - hx, tOut.z - hz, top, tOut, rx, rz);
        const cx = tOut.x;
        const cz = tOut.z;
        solve(live, gx, gz, top, tOut, "all", cx, cz);
        let ex = tOut.x - cx;
        let ez = tOut.z - cz;
        const el = Math.hypot(ex, ez);
        if (el > SOFT_EXTRA) {
          ex *= SOFT_EXTRA / el;
          ez *= SOFT_EXTRA / el;
        }
        addExtra(live, cx, cz, ex, ez, top, tOut, rx, rz);
        tx = rx + tOut.x;
        tz = rz + tOut.z;
      }
      const tl = Math.hypot(tx, tz);
      if (tl > MAX_PUSH) {
        tx *= MAX_PUSH / tl;
        tz *= MAX_PUSH / tl;
      }
      // Move toward the target at a bounded speed.
      let sx = tx - ox;
      let sz = tz - oz;
      const step = Math.hypot(sx, sz);
      const maxStep = MAX_OFFSET_RATE * Math.max(dt, 0);
      if (step > maxStep) {
        sx *= maxStep / step;
        sz *= maxStep / step;
      }
      ox += sx;
      oz += sz;
      if (Math.hypot(ox, oz) < 1e-4 && Math.hypot(tx, tz) < 1e-4) ox = oz = 0;
      group.position.x = px + ox;
      group.position.z = pz + oz;
      return Math.hypot(ox, oz);
    },
  };
}

/**
 * The highest floor under the avatar: the centre and four points a capsule radius around it, since
 * the capsule can stand on an edge with its centre already past it.
 */
export function supportFloor(floorAt: ClearanceOptions["floorAt"], x: number, z: number, maxY: number, radius = 0.3): number | null {
  if (!floorAt) return null;
  let best = floorAt(x, z, maxY);
  for (let k = 0; k < 4; k++) {
    const h = floorAt(x + Math.cos((k * Math.PI) / 2) * radius, z + Math.sin((k * Math.PI) / 2) * radius, maxY);
    if (h !== null && (best === null || h > best)) best = h;
  }
  return best;
}

/** Solids whose box, grown by the pose's reach, contains the avatar. */
function collectNear(solids: readonly Solid[], gx: number, gy: number, gz: number, out: Solid[], dedupe = false): void {
  for (const s of solids) {
    if (dedupe && out.includes(s)) continue;
    // Quick reject: the avatar's origin against the box grown by the pose's reach.
    rotate(s, gx - s.cx, gy + 1 - s.cy, gz - s.cz, true, _l);
    if (Math.abs(_l.x) > s.hx + REACH + 0.1 || Math.abs(_l.z) > s.hz + REACH + 0.1) continue;
    if (gy > s.cy + s.hy + 0.5 || gy + SPAN_UP < s.cy - s.hy) continue;
    out.push(s);
  }
}
