// F2 (TASK-002 final QA): leaving the tower passage and jumping at its mouth, the camera is pulled
// out of the passage to the mouth (rule 5) while the avatar is still airborne, 1 to 2 m from the
// head and well above the lagging pivot, and the head leaves the top of the view. Every frame of the
// jump must keep the crown inside the frame at the three shipped viewports, with the head clear of
// the near plane and in line of sight (no geometry between the camera and the head).
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createObstacleQuery } from "../cameraProbe";
import { CAMERA, FEET_TO_CENTER, MOTOR_CONFIG, PHYSICS } from "../config";
import { createFollowCamera } from "../followCamera";
import { createPlayerMotor } from "../player";
import { buildColliders } from "../world/colliders";
import { CAMPUS, getBlock } from "../world/layout";
import { segmentHitsBlock } from "./cameraHarness";

const DT = PHYSICS.dt;
const VIEWPORTS = [
  { name: "portrait 390x844", w: 390, h: 844 },
  { name: "landscape 844x390", w: 844, h: 390 },
  { name: "desktop 1440x900", w: 1440, h: 900 },
] as const;
const worlds: RAPIER.World[] = [];
beforeAll(async () => {
  await RAPIER.init();
});
afterEach(() => {
  while (worlds.length) worlds.pop()!.free();
});

const podium = getBlock(CAMPUS, "tower-podium");
const FLOOR_Y = podium.center.y + podium.size.y / 2;
const PASSAGE_Z = 21; // inside the passage, the tower origin is z 17.5 and its mouth faces -z
const blockers = CAMPUS.blocks.filter((b) => b.blocksCamera);

type Verdict = { frames: number; worst: string; bad: number; occluded: number; nearClipped: number };

/** Walks out of the passage toward its mouth and jumps when the feet reach `jumpZ`; checks every airborne and landing frame. */
function jumpAtMouth(jumpZ: number, yaw: number, run: boolean): Verdict {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.timestep = DT;
  worlds.push(world);
  buildColliders(RAPIER, world, CAMPUS);
  const centre = (z: number) => ({ x: 0, y: FLOOR_Y + FEET_TO_CENTER, z });
  const motor = createPlayerMotor(RAPIER, world, centre(PASSAGE_Z), MOTOR_CONFIG);
  motor.teleport(centre(PASSAGE_Z));
  motor.capture();
  const cam = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 200);
  const fc = createFollowCamera(cam, createObstacleQuery(RAPIER, world), CAMERA, CAMPUS.rooms);
  fc.snapTo(centre(PASSAGE_Z), yaw);
  const cams = VIEWPORTS.map((v) => {
    const c = new THREE.PerspectiveCamera(CAMERA.fov, v.w / v.h, 0.1, 200);
    return c;
  });
  const out: Verdict = { frames: 0, worst: "", bad: 0, occluded: 0, nearClipped: 0 };
  const tmp = { x: 0, y: 0, z: 0 };
  let jumped = false;
  let landedAfter = 0;
  for (let i = 0; i < 480 && landedAfter < 30; i++) {
    const wantJump = !jumped && i >= 30 && motor.state.position.z <= jumpZ;
    if (wantJump) jumped = true;
    const s = motor.step(DT, { moveWorld: { x: 0, z: i < 30 ? 0 : -1 }, run, jump: wantJump });
    world.step();
    motor.capture();
    const pos = motor.interpolated(1, tmp);
    fc.update(DT, pos, s.grounded, yaw, { dx: 0, dy: 0 }, false);
    cam.updateMatrixWorld(true);
    if (!jumped) continue;
    if (s.grounded && pos.y - FEET_TO_CENTER - FLOOR_Y < 0.05 && i > 60) landedAfter++;
    const feet = pos.y - FEET_TO_CENTER;
    const crown = new THREE.Vector3(pos.x, feet + CAMERA.headTop, pos.z);
    const head = new THREE.Vector3(pos.x, feet + 1.65, pos.z);
    out.frames++;
    cams.forEach((c, k) => {
      c.near = cam.near;
      c.position.copy(cam.position);
      c.quaternion.copy(cam.quaternion);
      c.updateMatrixWorld(true);
      c.updateProjectionMatrix();
      const ndc = crown.clone().project(c);
      const inside = Math.abs(ndc.x) <= 1 && ndc.y <= 1 && ndc.y >= -1 && ndc.z >= -1 && ndc.z <= 1;
      if (!inside) {
        out.bad++;
        out.worst = `${VIEWPORTS[k].name} frame ${out.frames}: crown ndc (${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)}, ${ndc.z.toFixed(2)}), feet ${feet.toFixed(2)}, camera (${cam.position.x.toFixed(2)}, ${cam.position.y.toFixed(2)}, ${cam.position.z.toFixed(2)})`;
      }
    });
    if (cam.position.distanceTo(head) <= cam.near + 0.3) out.nearClipped++; // the head is clear of the near plane by the capsule radius
    if (blockers.some((b) => segmentHitsBlock(b, head, cam.position) || segmentHitsBlock(b, crown, cam.position))) out.occluded++;
  }
  return out;
}

describe("jumping at the mouth of the tower passage keeps the avatar's head in frame", () => {
  const yaws: [string, number][] = [["facing out", Math.PI], ["slightly left", Math.PI - 0.3], ["slightly right", Math.PI + 0.3]];
  for (const [label, yaw] of yaws) {
    for (const run of [false, true]) {
      it(`${label}, ${run ? "run" : "walk"}: crown inside the frame at every viewport on every frame, no near clip, no occlusion`, () => {
        for (const jumpZ of [18.2, 17.8, 17.5, 17.2, 16.9, 16.6]) {
          const r = jumpAtMouth(jumpZ, yaw, run);
          expect(r.frames, `jump at z ${jumpZ}`).toBeGreaterThan(20);
          expect(r.bad, `jump at z ${jumpZ}: ${r.worst}`).toBe(0);
          expect(r.nearClipped, `jump at z ${jumpZ}`).toBe(0);
          expect(r.occluded, `jump at z ${jumpZ}`).toBe(0);
        }
      }, 60_000);
    }
  }
});
