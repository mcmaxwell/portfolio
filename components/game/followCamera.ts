// Follow camera with obstacle handling (design 2.7). The optional ObstacleQuery is a sphere cast;
// the camera is resolved every frame from the avatar's true position (not from the lagging
// pivot) against five rules:
//   1. the path from the avatar to the camera is clear (sphere of probeRadius),
//   2. the head and the torso are in line of sight of the camera (thin rays),
//   3. the camera is never below the floor under the avatar (pitch can not dig it into the ground),
//   4. the camera is never closer than minDistance to the avatar: next to a wall it climbs to a
//      higher pitch (the "lift"), and in a pocket no lift clears (a corner, a dead end, a narrow
//      passage) it also swings sideways round the avatar (the "swing", smallest first) instead of
//      sinking into the avatar or the wall. The camera is never forced past the clear distance:
//      a position inside a collider is never an option,
//   5. with the avatar outside a building (not in its doorway) the camera stays outside it too.
// It pulls in at once and restores smoothly.
import * as THREE from "three";
import { HERO } from "./shell/transition";
import { FEET_TO_CENTER, type CameraConfig, type Vec3 } from "./config";
import { easeInOutCubic, easeOutCubic } from "./tween";

/**
 * Sphere cast from `from` toward `to`: the travelled distance (m) to the first blocker, or
 * null when the path is clear. A cast that starts inside a blocker must not report 0 forever
 * (that would trap the camera at the pivot): implementations let it exit (see cameraProbe.ts).
 */
export type ObstacleQuery = (from: Vec3, to: Vec3, radius: number) => number | null;

/**
 * An oriented interior volume (a building's inside). While the avatar is outside it, the camera
 * stays outside it too, so a doorway never lets the camera look at the avatar from inside a
 * building, in particular not from inside the narrowest passage.
 */
export type CameraZone = { center: Vec3; size: Vec3; yawDeg: number };

/** The avatar this close to a zone counts as in its doorway: the camera may follow it in. */
export const ZONE_DOORWAY = 1.0;

function insideZone(z: CameraZone, p: { x: number; y: number; z: number }, shrink: number): boolean {
  const yaw = (z.yawDeg * Math.PI) / 180;
  const dx = p.x - z.center.x;
  const dz = p.z - z.center.z;
  const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return (
    Math.abs(lx) < z.size.x / 2 - shrink &&
    Math.abs(lz) < z.size.z / 2 - shrink &&
    Math.abs(p.y - z.center.y) < z.size.y / 2 - shrink
  );
}

export interface FollowCamera {
  readonly yaw: number;
  update(
    dt: number,
    target: Vec3,
    grounded: boolean,
    characterYaw: number,
    look: { dx: number; dy: number },
    recenter: boolean
  ): void;
  snapTo(target: Vec3, characterYaw: number): void;
  /**
   * Entry (play-transition.md 2.4): start from the live hero camera pose, expressed relative to
   * the avatar that now stands at `target` facing `avatarYaw`, then slide to the follow pose
   * for `finalYaw` while the fov widens. Applies the start pose at once, so the first game
   * frame equals the last hero frame.
   */
  beginEntry(target: Vec3, avatarYaw: number, finalYaw: number, seconds: number): void;
  /** Finish the running entry tween from the current pose in `seconds` (0 = snap now). */
  finishEntry(seconds: number, target: Vec3): void;
  /** Exit (4.1): slide to the hero framing in front of the avatar, which faces `avatarYaw`. */
  beginExit(target: Vec3, avatarYaw: number, seconds: number): void;
  /** What the camera is doing: following, the entry tween, or the exit tween. */
  readonly phase: "follow" | "entry" | "exit";
  /** True once an exit tween has run to its end. */
  readonly exitDone: boolean;
  dispose(): void;
}

/** Rotate a vector about +Y by `yaw` (+z maps to (sin, 0, cos), the avatar facing convention). */
export function rotateY(v: THREE.Vector3, yaw: number): THREE.Vector3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const x = v.x * c + v.z * s;
  const z = -v.x * s + v.z * c;
  return v.set(x, v.y, z);
}

/**
 * The hero camera pose carried into game coordinates: the hero avatar (feet at `HERO.feetY`,
 * facing +z) maps to the game avatar (feet at `feet`, facing `yaw`).
 */
export function heroPoseToGame(
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  feet: Vec3,
  yaw: number
): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const p = position.clone();
  p.y -= HERO.feetY;
  rotateY(p, yaw);
  p.x += feet.x;
  p.y += feet.y;
  p.z += feet.z;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(quaternion);
  return { position: p, quaternion: q };
}

const DEG = Math.PI / 180;
const NEAR = 0.1;
const smooth = (k: number, dt: number) => 1 - Math.exp(-k * dt);

export function createFollowCamera(
  camera: THREE.PerspectiveCamera,
  query: ObstacleQuery | null,
  cfg: CameraConfig,
  zones: readonly CameraZone[] = []
): FollowCamera {
  const snapshot = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
  };
  let yaw = 0;
  let pitch = 15 * DEG;
  let recentering = 0; // seconds left of the eased recenter
  let recenterTarget = 0;
  const pivot = new THREE.Vector3();
  let lastGroundY = 0;
  let initialised = false;
  const desired = new THREE.Vector3();
  const look = new THREE.Vector3();
  const pivotVec: Vec3 = { x: 0, y: 0, z: 0 };
  const desiredVec: Vec3 = { x: 0, y: 0, z: 0 };
  // Fraction (0..1) of the pivot-to-desired segment the camera may use; shrinks at once,
  // eases back out so the camera does not pop when the blocker is passed.
  let reach = 1;
  // Extra pitch (radians) added next to a wall to keep minDistance; rises at once, decays smoothly.
  let lift = 0;
  // Extra yaw (radians, signed) the camera swings round the avatar in a pocket; set at once, decays smoothly.
  let swing = 0;
  // Floor tracking: feet height of the last grounded frame (the camera floor follows a fall down).
  let lastGroundFeet = 0;
  let feetNow = 0;
  const anchor = new THREE.Vector3(); // the avatar's true upper body, the origin of every cast
  const anchorVec: Vec3 = { x: 0, y: 0, z: 0 };
  const probeVec: Vec3 = { x: 0, y: 0, z: 0 };
  const endVec: Vec3 = { x: 0, y: 0, z: 0 };
  const dir = new THREE.Vector3();
  const resolved = new THREE.Vector3();
  const MAX_PITCH = 85 * (Math.PI / 180);

  type Blend = {
    kind: "entry" | "exit";
    t: number;
    duration: number;
    startPos: THREE.Vector3;
    startLook: THREE.Vector3;
    startFov: number;
    endFov: number;
    exitYaw: number;
  };
  let blend: Blend | null = null;
  let exitDone = false;
  const LOOK_DISTANCE = 5;
  const lookFrom = (pos: THREE.Vector3, q: THREE.Quaternion) =>
    new THREE.Vector3(0, 0, -1).applyQuaternion(q).multiplyScalar(LOOK_DISTANCE).add(pos);
  const mix = new THREE.Vector3();
  const mixLook = new THREE.Vector3();
  const feetOf = (target: Vec3): Vec3 => ({ x: target.x, y: target.y - FEET_TO_CENTER, z: target.z });
  const setNear = (near: number) => {
    if (Math.abs(camera.near - near) < 1e-6) return;
    camera.near = near;
    camera.updateProjectionMatrix();
  };
  const setFov = (fov: number) => {
    if (Math.abs(camera.fov - fov) < 1e-6) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  };

  camera.fov = cfg.fov;
  camera.near = NEAR;
  camera.far = 200;
  camera.updateProjectionMatrix();

  // The wanted camera position for `pitchRad`: behind the (smoothed) pivot, shoulder to the right.
  const place = (pitchRad: number, yawRad: number) => {
    const cp = Math.cos(pitchRad);
    const fx = Math.sin(yawRad) * cp;
    const fy = -Math.sin(pitchRad);
    const fz = Math.cos(yawRad) * cp;
    const rx = -Math.cos(yawRad);
    const rz = Math.sin(yawRad);
    desired.set(
      pivot.x - fx * cfg.distance + rx * cfg.shoulder,
      pivot.y - fy * cfg.distance,
      pivot.z - fz * cfg.distance + rz * cfg.shoulder
    );
  };

  const blocked = (fromY: number, to: THREE.Vector3): boolean => {
    probeVec.x = anchor.x;
    probeVec.y = fromY;
    probeVec.z = anchor.z;
    endVec.x = to.x;
    endVec.y = to.y;
    endVec.z = to.z;
    return query!(probeVec, endVec, cfg.losRadius) !== null;
  };

  type Solution = { t: number; dist: number };
  /**
   * Rules 1 to 3 for a given extra pitch: how far along avatar -> wanted position the camera may
   * go (fraction t of the segment) and the distance that is.
   */
  const solve = (liftRad: number, swingRad: number, out: Solution): Solution => {
    place(Math.min(pitch + liftRad, MAX_PITCH), yaw + swingRad);
    dir.copy(desired).sub(anchor);
    const len = dir.length();
    let t = 1;
    if (len < 1e-6) {
      out.t = 0;
      out.dist = 0;
      return out;
    }
    if (query) {
      anchorVec.x = anchor.x;
      anchorVec.y = anchor.y;
      anchorVec.z = anchor.z;
      endVec.x = desired.x;
      endVec.y = desired.y;
      endVec.z = desired.z;
      const hit = query(anchorVec, endVec, cfg.probeRadius);
      if (hit !== null) t = Math.min(1, Math.max(0, hit) / len);
    }
    // Rule 3: not below the floor under the avatar (plus the probe radius).
    const floor = Math.min(lastGroundFeet, feetNow) + cfg.probeRadius;
    if (desired.y < floor) {
      const room = anchor.y - floor;
      t = Math.min(t, room > 1e-6 ? room / (anchor.y - desired.y) : 0);
    }
    // Rule 5: with the avatar outside a building (and not in its doorway), the camera stays outside.
    for (const z of zones) {
      if (insideZone(z, anchor, -ZONE_DOORWAY)) continue; // the avatar is in or at the zone
      resolved.copy(dir).multiplyScalar(t).add(anchor);
      if (!insideZone(z, resolved, 0)) continue;
      let lo = 0;
      let hi = t;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        resolved.copy(dir).multiplyScalar(mid).add(anchor);
        if (insideZone(z, resolved, 0)) hi = mid;
        else lo = mid;
      }
      t = lo;
    }
    // Rule 2: head and torso in line of sight. Bisect to the farthest clear point.
    if (query) {
      for (const h of cfg.losHeights) {
        const fromY = feetNow + h;
        resolved.copy(dir).multiplyScalar(t).add(anchor);
        if (!blocked(fromY, resolved)) continue;
        let lo = 0;
        let hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          resolved.copy(dir).multiplyScalar(mid).add(anchor);
          if (blocked(fromY, resolved)) hi = mid;
          else lo = mid;
        }
        t = lo;
      }
    }
    out.t = t;
    out.dist = t * len;
    return out;
  };

  const sol: Solution = { t: 1, dist: 0 };
  const probeSol: Solution = { t: 1, dist: 0 };

  const enough = (d: number) => d >= cfg.minDistance - 1e-6;

  /**
   * The smallest lift in [from, maxLift] (continuous: 4 degree steps, then bisected) at which the
   * clear distance for `swingRad` is at least minDistance, or -1 when no lift gets there.
   */
  const findLift = (from: number, swingRad: number, stepRad: number): number => {
    const maxLift = cfg.maxLiftDeg * DEG;
    let lo = from;
    let found = -1;
    for (let l = from + stepRad; l <= maxLift + 1e-9; l += stepRad) {
      if (enough(solve(l, swingRad, probeSol).dist)) {
        found = l;
        break;
      }
      lo = l;
    }
    if (found < 0) return -1;
    let hi = found;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      if (enough(solve(mid, swingRad, probeSol).dist)) hi = mid;
      else lo = mid;
    }
    return hi;
  };

  /**
   * Near-plane threshold, not a guaranteed minimum distance: just outside the 0.3 m capsule. Below
   * this camera distance (sealed pocket only) the near plane is raised; HARD_MIN is deliberately
   * absent from the resolved distance, which never exceeds the solved clear distance.
   */
  const HARD_MIN = 0.45;
  const BODY_CLIP = 0.35;
  const SWING_STEP = 15 * DEG;
  const SWING_MAX = 180 * DEG;

  /**
   * Places `desired` (and so the camera) for this frame. `instant` skips the smooth restore.
   * Rule 4: if the clear distance is under minDistance, find the smallest lift that restores it;
   * if no lift does, the smallest swing (nearest the player's own yaw) with its smallest lift;
   * if nothing does, the roomiest direction found. The camera never goes past the clear distance.
   */
  const pullIn = (dt: number, instant: boolean) => {
    const maxLift = cfg.maxLiftDeg * DEG;
    const decay = Math.exp(-cfg.restoreK * dt);
    lift = instant ? 0 : lift * decay;
    swing = instant ? 0 : swing * decay;
    if (Math.abs(swing) < 1e-3) swing = 0;
    solve(lift, swing, sol);
    if (!enough(sol.dist)) {
      let l = findLift(lift, swing, 4 * DEG);
      if (l >= 0) {
        lift = l;
      } else {
        // A pocket the lift alone cannot clear: swing round the avatar, the smallest swing first.
        let bestSwing = swing;
        let bestLift = lift;
        let bestDist = -1;
        let cleared = false;
        const prefer = swing >= 0 ? 1 : -1; // on a tie keep the side the camera is already on
        for (let k = 0; k * SWING_STEP <= SWING_MAX + 1e-9 && !cleared; k++) {
          for (const sign of k === 0 ? [1] : [prefer, -prefer]) {
            const sw = sign * k * SWING_STEP;
            l = findLift(0, sw, 8 * DEG);
            if (l >= 0) {
              swing = sw;
              lift = l;
              cleared = true;
              break;
            }
            // Remember the roomiest direction in case nothing clears.
            for (let ll = 0; ll <= maxLift + 1e-9; ll += 8 * DEG) {
              const d = solve(ll, sw, probeSol).dist;
              if (d > bestDist) {
                bestDist = d;
                bestSwing = sw;
                bestLift = ll;
              }
            }
          }
        }
        if (!cleared) {
          swing = bestSwing;
          lift = bestLift;
        }
      }
      solve(lift, swing, sol);
    }
    if (instant || sol.t < reach) reach = sol.t;
    else reach = Math.min(sol.t, reach + (sol.t - reach) * smooth(cfg.restoreK, dt));
    // The easing back out never leaves the camera nearer than minDistance, and never goes past the
    // solved clear distance (reach <= sol.t): minDistance is a goal that yields to the collider.
    const len = dir.length();
    const floor = len > 1e-6 ? Math.min(sol.t, cfg.minDistance / len) : sol.t;
    const t = Math.max(reach, floor);
    // Sealed pocket (no direction has HARD_MIN of room; never the case on the campus): the camera
    // stays inside the clear distance, so it can sit within the avatar's own body. That body is
    // handled by the near plane, not by pushing the camera out into the collider: the plane is set
    // BODY_CLIP (the capsule radius plus a margin) beyond the camera, which clips the avatar's
    // meshes around the camera and leaves the view of what is beyond the avatar. In every other
    // frame the near plane is the normal one.
    setNear(t * len < HARD_MIN - 1e-6 ? t * len + BODY_CLIP : NEAR);
    resolved.copy(dir).multiplyScalar(t).add(anchor);
    desired.copy(resolved);
  };

  const apply = () => {
    camera.position.copy(desired);
    look.set(pivot.x, pivot.y, pivot.z);
    camera.lookAt(look);
  };

  const setAnchor = (target: Vec3) => {
    anchor.set(target.x, target.y + cfg.pivotHeight, target.z);
    feetNow = target.y - FEET_TO_CENTER;
  };

  const applyBlend = (b: Blend, endPos: THREE.Vector3, endLook: THREE.Vector3, kPos: number, kFov: number) => {
    mix.copy(b.startPos).lerp(endPos, kPos);
    mixLook.copy(b.startLook).lerp(endLook, kPos);
    camera.position.copy(mix);
    camera.lookAt(mixLook);
    setFov(b.startFov + (b.endFov - b.startFov) * kFov);
  };

  return {
    get yaw() {
      return yaw;
    },
    get phase() {
      return blend ? blend.kind : "follow";
    },
    get exitDone() {
      return exitDone;
    },
    beginEntry(target, avatarYaw, finalYaw, seconds) {
      setNear(NEAR);
      const start = heroPoseToGame(snapshot.position, snapshot.quaternion, feetOf(target), avatarYaw);
      yaw = finalYaw;
      pivot.set(target.x, target.y + cfg.pivotHeight, target.z);
      lastGroundY = pivot.y;
      initialised = true;
      reach = 1;
      lift = 0;
      swing = 0;
      setAnchor(target);
      lastGroundFeet = feetNow;
      exitDone = false;
      blend = {
        kind: "entry",
        t: 0,
        duration: Math.max(seconds, 1e-3),
        startPos: start.position,
        startLook: lookFrom(start.position, start.quaternion),
        startFov: snapshot.fov,
        endFov: cfg.fov,
        exitYaw: 0,
      };
      camera.position.copy(start.position);
      camera.quaternion.copy(start.quaternion);
      setFov(snapshot.fov);
    },
    finishEntry(seconds, target) {
      if (!blend || blend.kind !== "entry") return;
      if (seconds <= 0) {
        blend = null;
        pivot.set(target.x, target.y + cfg.pivotHeight, target.z);
        lastGroundY = pivot.y;
        setAnchor(target);
        lastGroundFeet = feetNow;
        pullIn(0, true);
        apply();
        setFov(cfg.fov);
        return;
      }
      blend.startPos = camera.position.clone();
      blend.startLook = lookFrom(camera.position, camera.quaternion);
      blend.startFov = camera.fov;
      blend.t = 0;
      blend.duration = seconds;
    },
    beginExit(target, avatarYaw, seconds) {
      void target;
      setNear(NEAR);
      exitDone = false;
      blend = {
        kind: "exit",
        t: 0,
        duration: Math.max(seconds, 1e-3),
        startPos: camera.position.clone(),
        startLook: lookFrom(camera.position, camera.quaternion),
        startFov: camera.fov,
        endFov: snapshot.fov,
        exitYaw: avatarYaw,
      };
    },
    update(dt, target, grounded, characterYaw, input, recenter) {
      if (blend && blend.kind === "exit") {
        blend.t += dt;
        const k = Math.min(1, blend.t / blend.duration);
        const feet = feetOf(target);
        const end = new THREE.Vector3(0, HERO.offsetFromFeet.up, HERO.offsetFromFeet.back);
        rotateY(end, blend.exitYaw).add(new THREE.Vector3(feet.x, feet.y, feet.z));
        const endLook = new THREE.Vector3(feet.x, feet.y + HERO.lookHeight, feet.z);
        applyBlend(blend, end, endLook, easeInOutCubic(k), easeInOutCubic(k));
        if (k >= 1) exitDone = true;
        return;
      }
      if (!initialised) {
        yaw = characterYaw;
        pivot.set(target.x, target.y + cfg.pivotHeight, target.z);
        lastGroundY = pivot.y;
        setAnchor(target);
        lastGroundFeet = feetNow;
        initialised = true;
      }
      yaw -= input.dx * cfg.lookSensitivity;
      pitch = Math.min(
        Math.max(pitch + input.dy * cfg.lookSensitivity, cfg.pitchMinDeg * DEG),
        cfg.pitchMaxDeg * DEG
      );
      if (recenter) {
        recentering = 0.25;
        recenterTarget = characterYaw;
      }
      if (recentering > 0) {
        let diff = recenterTarget - yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        const step = Math.min(1, dt / recentering);
        yaw += diff * step;
        recentering = Math.max(0, recentering - dt);
      }
      // Airborne: follow the last grounded height unless the character falls below it.
      const targetY = target.y + cfg.pivotHeight;
      if (grounded) lastGroundY = targetY;
      const wantY = grounded || targetY < lastGroundY ? targetY : lastGroundY;
      const kh = smooth(cfg.followK, dt);
      const kv = smooth(cfg.followKVertical, dt);
      pivot.x += (target.x - pivot.x) * kh;
      pivot.z += (target.z - pivot.z) * kh;
      pivot.y += (wantY - pivot.y) * kv;
      setAnchor(target);
      if (grounded) lastGroundFeet = feetNow;
      pullIn(dt, false);
      if (blend && blend.kind === "entry") {
        blend.t += dt;
        const k = Math.min(1, blend.t / blend.duration);
        look.set(pivot.x, pivot.y, pivot.z);
        applyBlend(blend, desired, look, easeInOutCubic(k), easeOutCubic(k));
        if (k >= 1) blend = null;
      } else {
        apply();
      }
    },
    snapTo(target, characterYaw) {
      blend = null;
      setFov(cfg.fov);
      yaw = characterYaw;
      pivot.set(target.x, target.y + cfg.pivotHeight, target.z);
      lastGroundY = pivot.y;
      initialised = true;
      setAnchor(target);
      lastGroundFeet = feetNow;
      pullIn(0, true);
      apply();
    },
    dispose() {
      camera.position.copy(snapshot.position);
      camera.quaternion.copy(snapshot.quaternion);
      camera.fov = snapshot.fov;
      camera.near = snapshot.near;
      camera.far = snapshot.far;
      camera.updateProjectionMatrix();
    },
  };
}
