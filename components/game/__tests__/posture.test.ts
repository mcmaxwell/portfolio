// Torso posture of the shipped locomotion clips on the avatar skeleton (TASK-003, user report: "weirdly bent
// backward when I walk"). The clips ship without their Hips tracks (ADR-003), which took the pelvis pitch the
// source authored out of the pose (walk +2, run +10 degrees) and left the chest, and in the run the head, behind
// vertical (measured on b61b848: walk -6 degrees, idle -1, run -1 with a head thrown back 18 degrees).
// The measure is the forward pitch of the Hips-to-Head line from vertical: 0 is upright, positive leans forward.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createCharacterAnimator } from "../animator";
import { jointNamesOf, toGameClip } from "../clips";
import { ANIMATION, HIPS_MOTION_CLIPS, type ClipName } from "../config";
import type { MotorState } from "../player";
import { readAvatarRig, type AvatarRig } from "../../../scripts/lib/avatar-rig.mjs";
import { boneTiltDeg, clipPitchStats, torsoPitchDeg } from "../../../scripts/lib/posture.mjs";

const root = process.cwd();
const NAMES = ["idle", "walk", "run", "jump", "fall", "land"] as const;
/**
 * Upper bound of the forward pitch per clip: the clip's own forward lean. The Mixamo run leans 10 to 16 degrees on
 * its own skeleton (measured offline); the walk and the stand are near upright, so a small forward lean is the limit.
 */
const MAX_FORWARD = { idle: 6, walk: 8, run: 16 } as const;

let rig: AvatarRig;
const clips: Partial<Record<ClipName, THREE.AnimationClip>> = {};

const parse = (file: string) =>
  new Promise<THREE.AnimationClip>((resolve, reject) => {
    const buf = readFileSync(join(root, "public/game/clips", file));
    new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "", (g) => resolve(g.animations[0]), reject);
  });

beforeAll(async () => {
  rig = readAvatarRig(join(root, "public/avatar.glb"));
  const joints = jointNamesOf(rig.root);
  for (const n of NAMES) clips[n] = toGameClip(await parse(`${n}.glb`), joints, HIPS_MOTION_CLIPS.includes(n));
});

describe("torso pitch of the looping clips", () => {
  it.each(["idle", "walk", "run"] as const)("%s: never behind vertical, never past the clip's own forward lean", (name) => {
    const s = clipPitchStats(rig, clips[name]!, 120);
    expect(s.min, `${name} min ${s.min.toFixed(2)}`).toBeGreaterThanOrEqual(0);
    expect(s.max, `${name} max ${s.max.toFixed(2)}`).toBeLessThanOrEqual(MAX_FORWARD[name]);
  });

  it("running leans forward more than walking, and walking more than standing (it reads as effort)", () => {
    const [idle, walk, run] = (["idle", "walk", "run"] as const).map((n) => clipPitchStats(rig, clips[n]!, 120).mean);
    expect(walk).toBeGreaterThan(idle);
    expect(run).toBeGreaterThan(walk + 3);
  });

  it.each(["idle", "walk", "run"] as const)("%s: the head stays about level (the gaze is not thrown back or dropped)", (name) => {
    const s = clipPitchStats(rig, clips[name]!, 120, undefined, (r: AvatarRig) => boneTiltDeg(r, "Head"));
    expect(s.min, `${name} head tilt min ${s.min.toFixed(1)}`).toBeGreaterThanOrEqual(-8);
    expect(s.max, `${name} head tilt max ${s.max.toFixed(1)}`).toBeLessThanOrEqual(8);
  });

  it("the legs are not touched by the lean: the pelvis stays at the bind pose, so every foot position comes from the leg tracks alone", () => {
    // The lean tracks are Spine, Spine1, Spine2, Neck and Head; evaluating the clip with those removed must
    // not move any leg joint (they are not descendants of the spine).
    const legs = ["LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"];
    const pose = (clip: THREE.AnimationClip, t: number) => {
      const m = new THREE.AnimationMixer(rig.root);
      m.clipAction(clip).play();
      m.setTime(t);
      rig.root.updateMatrixWorld(true);
      const out = legs.map((n) => rig.bone(n).getWorldPosition(new THREE.Vector3()).toArray());
      m.stopAllAction();
      m.uncacheRoot(rig.root);
      return out;
    };
    for (const name of ["walk", "run"] as const) {
      const clip = clips[name]!;
      const noUpper = new THREE.AnimationClip(name, clip.duration, clip.tracks.filter((t) => !/^(Spine|Spine1|Spine2|Neck|Head)\./.test(t.name)));
      for (const t of [0, clip.duration * 0.3, clip.duration * 0.7]) {
        pose(clip, t).forEach((p, i) => p.forEach((v, k) => expect(v).toBeCloseTo(pose(noUpper, t)[i][k], 9)));
      }
    }
  });
});

describe("torso pitch through the real state machine (start, stop, turn)", () => {
  /** A grounded motor state at a horizontal speed. */
  const motor = (speed: number): MotorState => ({
    position: { x: 0, y: 0, z: 0 },
    horizontalSpeed: speed,
    verticalVelocity: 0,
    grounded: true,
    airTime: 0,
    impactSpeed: 0,
    jumpedThisStep: false,
    landedThisStep: false,
    respawnedThisStep: false,
  });

  it("idle -> walk -> run -> turn (speed dip) -> walk -> stop: every frame stays upright or forward", () => {
    const animator = createCharacterAnimator(rig.root, clips, ANIMATION);
    const dt = 1 / 60;
    const phases: Array<[string, number, number]> = [
      ["idle", 0, 0.8],
      ["start walking", 2.2, 1.6],
      ["start running", 4.8, 1.4],
      ["turn (speed dips to 1.2)", 1.2, 0.5],
      ["run again", 4.8, 0.6],
      ["slow to walk", 2.2, 0.8],
      ["stop", 0, 1.2],
      ["start again", 4.8, 0.8],
      ["stop from run", 0, 1.2],
    ];
    let lowest = Infinity;
    let highest = -Infinity;
    for (const [label, speed, seconds] of phases) {
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        animator.update(dt, motor(speed));
        rig.root.updateMatrixWorld(true);
        const p = torsoPitchDeg(rig);
        if (p < lowest) lowest = p;
        if (p > highest) highest = p;
        expect(p, `${label}, frame ${i}`).toBeGreaterThanOrEqual(0);
      }
    }
    expect(highest).toBeLessThanOrEqual(MAX_FORWARD.run);
    animator.dispose();
    expect(lowest).toBeGreaterThanOrEqual(0);
  });
});
