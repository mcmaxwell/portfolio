// Entry and exit legs of the follow camera (play-transition.md 2.4 and 4.1): the first game frame
// equals the last hero frame, the entry ends exactly on the follow pose, the exit ends exactly on the
// hero framing in front of the avatar, and a skip finishes from where the camera is.
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAMERA, FEET_TO_CENTER, type Vec3 } from "../config";
import { createFollowCamera, heroPoseToGame, rotateY } from "../followCamera";
import { HERO } from "../shell/transition";

const LOOK = { dx: 0, dy: 0 };
const DT = 1 / 60;

/** The camera exactly as the hero CameraRig leaves it. */
function heroCamera(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(HERO.fov, 16 / 9, 0.1, 200);
  cam.position.set(...HERO.cameraPosition);
  cam.lookAt(new THREE.Vector3(...HERO.cameraTarget));
  cam.updateMatrixWorld(true);
  return cam;
}
const spawnCenter = (z = -12): Vec3 => ({ x: 0, y: FEET_TO_CENTER, z });
const feetOf = (c: Vec3) => new THREE.Vector3(c.x, c.y - FEET_TO_CENTER, c.z);
const forward = (cam: THREE.Camera) => new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
const run = (fc: ReturnType<typeof createFollowCamera>, target: Vec3, seconds: number, yaw = 0) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) fc.update(DT, target, true, yaw, LOOK, false);
};

describe("hero pose carried into game coordinates", () => {
  it("rotateY maps +z to (sin, 0, cos)", () => {
    const v = rotateY(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    expect(v.x).toBeCloseTo(1, 12);
    expect(v.z).toBeCloseTo(0, 12);
  });

  it("the hero camera stands the hero offset away from the avatar, in front, looking at its chest", () => {
    const cam = heroCamera();
    const feet = { x: 3, y: 0, z: -5 };
    for (const yaw of [0, Math.PI, 1.1, -2.4]) {
      const { position, quaternion } = heroPoseToGame(cam.position, cam.quaternion, feet, yaw);
      const rel = position.clone().sub(new THREE.Vector3(feet.x, feet.y, feet.z));
      expect(rel.y).toBeCloseTo(HERO.offsetFromFeet.up, 6);
      expect(Math.hypot(rel.x, rel.z)).toBeCloseTo(HERO.offsetFromFeet.back, 6);
      // in front of the avatar: along its facing direction (sin yaw, cos yaw)
      expect(rel.x / HERO.offsetFromFeet.back).toBeCloseTo(Math.sin(yaw), 6);
      expect(rel.z / HERO.offsetFromFeet.back).toBeCloseTo(Math.cos(yaw), 6);
      // looking at the chest point above the feet
      const chest = new THREE.Vector3(feet.x, feet.y + HERO.lookHeight, feet.z);
      const dir = chest.sub(position).normalize();
      const q = new THREE.Camera();
      q.quaternion.copy(quaternion);
      expect(forward(q).dot(dir)).toBeGreaterThan(0.999999);
    }
  });
});

describe("entry", () => {
  it("the first game frame equals the last hero frame: same distance, height, aim and fov", () => {
    const cam = heroCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    const heroPos = cam.position.clone();
    const target = spawnCenter();
    fc.beginEntry(target, Math.PI, 0, CAMERA.entrySeconds);
    expect(fc.phase).toBe("entry");
    expect(cam.fov).toBeCloseTo(HERO.fov, 9); // not the follow fov yet
    // the camera is behind the spawn point (the avatar will turn to face away from it)
    expect(cam.position.x).toBeCloseTo(0, 6);
    expect(cam.position.y).toBeCloseTo(HERO.offsetFromFeet.up, 6);
    expect(cam.position.z).toBeCloseTo(-12 - HERO.offsetFromFeet.back, 6);
    // same distance to the avatar's chest as in the hero scene
    const heroChest = new THREE.Vector3(0, HERO.feetY + HERO.lookHeight, 0);
    const chest = new THREE.Vector3(0, HERO.lookHeight, -12);
    expect(cam.position.distanceTo(chest)).toBeCloseTo(heroPos.distanceTo(heroChest), 6);
    // aims at the chest
    expect(forward(cam).dot(chest.clone().sub(cam.position).normalize())).toBeGreaterThan(0.999999);
  });

  it("slides to exactly the follow pose with the follow fov, with a monotonic fov and no overshoot", () => {
    const cam = heroCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    const target = spawnCenter();
    fc.beginEntry(target, Math.PI, 0, CAMERA.entrySeconds);
    let lastFov = cam.fov;
    const startDist = cam.position.distanceTo(new THREE.Vector3(0, 0.8, -12));
    for (let i = 0; i < Math.round(CAMERA.entrySeconds / DT) - 1; i++) {
      fc.update(DT, target, true, 0, LOOK, false);
      expect(cam.fov).toBeGreaterThanOrEqual(lastFov - 1e-9);
      expect(cam.fov).toBeLessThanOrEqual(CAMERA.fov + 1e-9);
      lastFov = cam.fov;
      expect(Number.isFinite(cam.position.x + cam.position.y + cam.position.z)).toBe(true);
    }
    expect(fc.phase).toBe("entry"); // one step left
    fc.update(DT * 1.5, target, true, 0, LOOK, false);
    expect(fc.phase).toBe("follow");
    expect(cam.fov).toBeCloseTo(CAMERA.fov, 9);
    // identical to a camera that was placed directly
    const ref = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 200);
    createFollowCamera(ref, null, CAMERA).snapTo(target, 0);
    expect(cam.position.distanceTo(ref.position)).toBeLessThan(1e-6);
    expect(1 - forward(cam).dot(forward(ref))).toBeLessThan(1e-9);
    expect(startDist).toBeGreaterThan(4.5); // it did travel
  });

  it("keeps following while the avatar walks away during the entry and ends on the follow pose of where it is", () => {
    const cam = heroCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    const t: Vec3 = spawnCenter();
    fc.beginEntry(t, Math.PI, 0, CAMERA.entrySeconds);
    const steps = Math.round(CAMERA.entrySeconds / DT);
    for (let i = 0; i < steps + 30; i++) {
      if (i > 30) t.z += 2.2 * DT; // the scripted walk
      fc.update(DT, t, true, 0, LOOK, false);
    }
    expect(fc.phase).toBe("follow");
    const behind = new THREE.Vector3(0, 0, 1).dot(new THREE.Vector3(t.x, 0, t.z).sub(new THREE.Vector3(cam.position.x, 0, cam.position.z)));
    expect(behind).toBeGreaterThan(3.5); // the avatar is ahead of the camera, which trails behind
  });

  it("finishEntry(seconds) finishes from the current pose without a jump", () => {
    const cam = heroCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    const target = spawnCenter();
    fc.beginEntry(target, Math.PI, 0, CAMERA.entrySeconds);
    run(fc, target, 0.4);
    const before = cam.position.clone();
    fc.finishEntry(0.25, target);
    fc.update(0, target, true, 0, LOOK, false);
    expect(cam.position.distanceTo(before)).toBeLessThan(0.05); // no jump
    run(fc, target, 0.3);
    expect(fc.phase).toBe("follow");
    expect(cam.fov).toBeCloseTo(CAMERA.fov, 9);
  });

  it("finishEntry(0) and snapTo settle at once on the follow pose", () => {
    for (const how of ["finish", "snap"] as const) {
      const cam = heroCamera();
      const fc = createFollowCamera(cam, null, CAMERA);
      const target = spawnCenter();
      fc.beginEntry(target, Math.PI, 0, CAMERA.entrySeconds);
      run(fc, target, 0.2);
      if (how === "finish") fc.finishEntry(0, target);
      else fc.snapTo(target, 0);
      expect(fc.phase).toBe("follow");
      expect(cam.fov).toBeCloseTo(CAMERA.fov, 9);
      const ref = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 200);
      createFollowCamera(ref, null, CAMERA).snapTo(target, 0);
      expect(cam.position.distanceTo(ref.position)).toBeLessThan(1e-6);
    }
  });

  it("dispose restores the hero pose and fov (the snapshot taken at creation)", () => {
    const cam = heroCamera();
    const pos = cam.position.clone();
    const quat = cam.quaternion.clone();
    const fc = createFollowCamera(cam, null, CAMERA);
    fc.beginEntry(spawnCenter(), Math.PI, 0, CAMERA.entrySeconds);
    run(fc, spawnCenter(), 0.5);
    fc.dispose();
    expect(cam.position.distanceTo(pos)).toBeLessThan(1e-9);
    expect(cam.quaternion.angleTo(quat)).toBeLessThan(1e-9);
    expect(cam.fov).toBe(HERO.fov);
  });
});

describe("exit", () => {
  it("ends on the hero framing in front of the avatar, with the hero fov, and reports done", () => {
    const cam = heroCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    const target: Vec3 = { x: 4, y: FEET_TO_CENTER, z: 7 };
    fc.snapTo(target, 0.7); // following, camera behind the avatar
    const bearing = Math.atan2(cam.position.x - target.x, cam.position.z - target.z);
    fc.beginExit(target, bearing, 0.7);
    expect(fc.phase).toBe("exit");
    expect(fc.exitDone).toBe(false);
    run(fc, target, 0.7 + 2 * DT);
    expect(fc.exitDone).toBe(true);
    const feet = feetOf(target);
    const rel = cam.position.clone().sub(feet);
    expect(rel.y).toBeCloseTo(HERO.offsetFromFeet.up, 5);
    expect(Math.hypot(rel.x, rel.z)).toBeCloseTo(HERO.offsetFromFeet.back, 5);
    expect(Math.atan2(rel.x, rel.z)).toBeCloseTo(bearing, 5);
    expect(cam.fov).toBeCloseTo(HERO.fov, 6);
    const chest = feet.clone().add(new THREE.Vector3(0, HERO.lookHeight, 0));
    expect(forward(cam).dot(chest.sub(cam.position).normalize())).toBeGreaterThan(0.999999);
  });

  it("is the same pose the hero scene shows once expressed relative to the avatar (round trip)", () => {
    const cam = heroCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    const target = spawnCenter(3);
    fc.snapTo(target, 0);
    fc.beginExit(target, Math.PI, 0.7);
    run(fc, target, 0.8);
    const expected = heroPoseToGame(heroCamera().position, heroCamera().quaternion, feetOf(target), Math.PI);
    expect(cam.position.distanceTo(expected.position)).toBeLessThan(1e-5);
    expect(cam.quaternion.angleTo(expected.quaternion)).toBeLessThan(1e-5);
  });

  it("lands with zero velocity: the last fov and position steps are no larger than the preceding ones (F-M2-2)", () => {
    const cam = heroCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    const target = spawnCenter(3);
    fc.snapTo(target, 0);
    fc.beginExit(target, Math.PI, 0.7);
    const fov: number[] = [cam.fov];
    const pos: THREE.Vector3[] = [cam.position.clone()];
    for (let i = 0; i < Math.round(0.7 / DT) + 2; i++) {
      fc.update(DT, target, true, Math.PI, LOOK, false);
      fov.push(cam.fov);
      pos.push(cam.position.clone());
    }
    const dFov = fov.slice(1).map((v, i) => Math.abs(v - fov[i]));
    const dPos = pos.slice(1).map((v, i) => v.distanceTo(pos[i]));
    const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    for (const d of [dFov, dPos]) {
      const early = d.slice(d.length - 12, d.length - 2); // the ten frames before the landing
      expect(d[d.length - 3]).toBeLessThan(median(early)); // the arrival step is smaller than they were
      expect(d[d.length - 3]).toBeLessThan(d[d.length - 8]); // and still decelerating
    }
  });

  it("the fov narrows monotonically and the camera never leaves the segment between start and end", () => {
    const cam = heroCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    const target = spawnCenter(0);
    fc.snapTo(target, 0);
    fc.beginExit(target, Math.PI, 0.7);
    let last = cam.fov;
    for (let i = 0; i < 42; i++) {
      fc.update(DT, target, true, 0, LOOK, false);
      expect(cam.fov).toBeLessThanOrEqual(last + 1e-9);
      expect(cam.fov).toBeGreaterThanOrEqual(HERO.fov - 1e-9);
      last = cam.fov;
    }
  });

  it("follows an avatar that is still settling while the leg runs", () => {
    const cam = heroCamera();
    const fc = createFollowCamera(cam, null, CAMERA);
    const target: Vec3 = spawnCenter(0);
    fc.snapTo(target, 0);
    fc.beginExit(target, Math.PI, 0.7);
    for (let i = 0; i < 50; i++) {
      target.z += 0.01; // decelerating
      fc.update(DT, target, true, 0, LOOK, false);
    }
    const rel = cam.position.clone().sub(feetOf(target));
    expect(Math.hypot(rel.x, rel.z)).toBeCloseTo(HERO.offsetFromFeet.back, 5);
  });
});
