// Follow camera with obstacle pull-in (design 2.7). The optional ObstacleQuery is a sphere cast
// from the pivot toward the wanted camera position; the camera never ends past the first hit.
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
const smooth = (k: number, dt: number) => 1 - Math.exp(-k * dt);

export function createFollowCamera(
  camera: THREE.PerspectiveCamera,
  query: ObstacleQuery | null,
  cfg: CameraConfig
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
  const setFov = (fov: number) => {
    if (Math.abs(camera.fov - fov) < 1e-6) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  };

  camera.fov = cfg.fov;
  camera.near = 0.1;
  camera.far = 200;
  camera.updateProjectionMatrix();

  const place = () => {
    const cp = Math.cos(pitch);
    // Camera sits behind the pivot along -forward, plus a shoulder offset to the right.
    const fx = Math.sin(yaw) * cp;
    const fy = -Math.sin(pitch);
    const fz = Math.cos(yaw) * cp;
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    desired.set(
      pivot.x - fx * cfg.distance + rx * cfg.shoulder,
      pivot.y - fy * cfg.distance,
      pivot.z - fz * cfg.distance + rz * cfg.shoulder
    );
  };

  const pullIn = (dt: number, instant: boolean) => {
    let allowed = 1;
    if (query) {
      pivotVec.x = pivot.x;
      pivotVec.y = pivot.y;
      pivotVec.z = pivot.z;
      desiredVec.x = desired.x;
      desiredVec.y = desired.y;
      desiredVec.z = desired.z;
      const len = desired.distanceTo(pivot);
      const hit = len > 1e-6 ? query(pivotVec, desiredVec, cfg.probeRadius) : null;
      if (hit !== null) allowed = Math.min(1, Math.max(0, hit) / len);
    }
    if (instant || allowed < reach) reach = allowed;
    else reach = Math.min(allowed, reach + (allowed - reach) * smooth(cfg.restoreK, dt));
    if (reach < 1) desired.sub(pivot).multiplyScalar(reach).add(pivot);
  };

  const apply = () => {
    camera.position.copy(desired);
    look.set(pivot.x, pivot.y, pivot.z);
    camera.lookAt(look);
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
      const start = heroPoseToGame(snapshot.position, snapshot.quaternion, feetOf(target), avatarYaw);
      yaw = finalYaw;
      pivot.set(target.x, target.y + cfg.pivotHeight, target.z);
      lastGroundY = pivot.y;
      initialised = true;
      reach = 1;
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
        place();
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
      place();
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
      place();
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
