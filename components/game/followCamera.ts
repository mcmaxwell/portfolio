// Follow camera (M1: no obstacle query; M3 adds the sphere cast). Design 2.7.
import * as THREE from "three";
import type { CameraConfig, Vec3 } from "./config";

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
  dispose(): void;
}

const DEG = Math.PI / 180;
const smooth = (k: number, dt: number) => 1 - Math.exp(-k * dt);

export function createFollowCamera(
  camera: THREE.PerspectiveCamera,
  query: ObstacleQuery | null,
  cfg: CameraConfig
): FollowCamera {
  void query; // reserved for M3 (obstacle pull-in)
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

  const apply = () => {
    camera.position.copy(desired);
    look.set(pivot.x, pivot.y, pivot.z);
    camera.lookAt(look);
  };

  return {
    get yaw() {
      return yaw;
    },
    update(dt, target, grounded, characterYaw, input, recenter) {
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
      apply();
    },
    snapTo(target, characterYaw) {
      yaw = characterYaw;
      pivot.set(target.x, target.y + cfg.pivotHeight, target.z);
      lastGroundY = pivot.y;
      initialised = true;
      place();
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
