// Stance tests: every shipped clip is evaluated on the avatar skeleton (the bone tree of
// public/avatar.glb, read without textures) through the same runtime filter the game uses
// (toGameClip), and the lowest foot or toe joint height is checked against the ground.
// The land clip once left the feet 0.85 m in the air (Hips stripped, legs folded).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";
import { createCharacterAnimator, type CharacterAnimator } from "../animator";
import { jointNamesOf, toGameClip } from "../clips";
import { ANIMATION, HIPS_MOTION_CLIPS, type ClipName } from "../config";
import type { MotorState } from "../player";
import { FOOT_BONES, readAvatarRig, type AvatarRig } from "../../../scripts/lib/avatar-rig.mjs";

const root = process.cwd();
const FPS = 60;
const NAMES = ["idle", "walk", "run", "jump", "fall", "land"] as const;

/**
 * Height of a bone joint above the ground (m) when the avatar stands on y = 0. The ankle is
 * 0.088 and the toe joint 0.022 above the sole at the bind pose, so a planted foot reads
 * about 0.02 here; the stated tolerance for "on the ground" is 0.05.
 */
const GROUND_TOLERANCE = 0.05;

let rig: AvatarRig;
const clips: Partial<Record<ClipName, THREE.AnimationClip>> = {};

const parse = (file: string) =>
  new Promise<THREE.AnimationClip>((resolve, reject) => {
    const buf = readFileSync(join(root, "public/game/clips", file));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    new GLTFLoader().parse(ab as ArrayBuffer, "", (g) => resolve(g.animations[0]), reject);
  });

beforeAll(async () => {
  rig = readAvatarRig(join(root, "public/avatar.glb"));
  const joints = jointNamesOf(rig.root);
  for (const n of NAMES) clips[n] = toGameClip(await parse(`${n}.glb`), joints, HIPS_MOTION_CLIPS.includes(n));
});

const SIDES = ["Left", "Right"] as const;

/** Per frame, the lowest bone (ankle or toe) height of each foot: [left, right]. */
function perFootPerFrame(name: ClipName): [number, number][] {
  const clip = clips[name]!;
  const mixer = new THREE.AnimationMixer(rig.root);
  mixer.clipAction(clip).play();
  const out: [number, number][] = [];
  const n = Math.round(clip.duration * FPS);
  for (let f = 0; f <= n; f++) {
    mixer.setTime(Math.min(f / FPS, clip.duration));
    rig.root.updateMatrixWorld(true);
    const [l, r] = SIDES.map((s) => Math.min(rig.height(`${s}Foot`), rig.height(`${s}ToeBase`)));
    out.push([l, r]);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(rig.root);
  return out;
}

/** Lowest foot/toe height at every frame of a clip evaluated on the rig. */
function lowestPerFrame(name: ClipName): number[] {
  const clip = clips[name]!;
  const mixer = new THREE.AnimationMixer(rig.root);
  mixer.clipAction(clip).play();
  const out: number[] = [];
  const n = Math.round(clip.duration * FPS);
  for (let f = 0; f <= n; f++) {
    mixer.setTime(Math.min(f / FPS, clip.duration));
    out.push(rig.lowestFoot());
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(rig.root);
  return out;
}

describe("clip stance on the avatar skeleton", () => {
  it("uses the real foot and toe bones", () => {
    expect(FOOT_BONES).toEqual(["LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"]);
    for (const n of FOOT_BONES) expect(rig.bone(n)).toBeDefined();
  });

  it("idle: the feet stay on the ground on every frame", () => {
    for (const h of lowestPerFrame("idle")) expect(Math.abs(h)).toBeLessThanOrEqual(GROUND_TOLERANCE);
  });

  it("walk: a foot reaches the ground, and at most 0.12 m of float (Hips bob is not modelled)", () => {
    const h = lowestPerFrame("walk");
    expect(Math.min(...h)).toBeGreaterThanOrEqual(-GROUND_TOLERANCE);
    expect(Math.min(...h)).toBeLessThanOrEqual(GROUND_TOLERANCE);
    expect(Math.max(...h)).toBeLessThanOrEqual(0.12);
  });

  it("run: a foot reaches the ground, and the flight phase stays under 0.25 m", () => {
    const h = lowestPerFrame("run");
    expect(Math.min(...h)).toBeGreaterThanOrEqual(-GROUND_TOLERANCE);
    expect(Math.min(...h)).toBeLessThanOrEqual(GROUND_TOLERANCE);
    expect(Math.max(...h)).toBeLessThanOrEqual(0.25);
  });

  it("jump: starts at the push-off (source frame 21, under 0.25 m), tucks to under 0.6 m, never below ground", () => {
    const h = lowestPerFrame("jump");
    expect(h[0]).toBeLessThanOrEqual(0.25);
    expect(Math.max(...h)).toBeLessThanOrEqual(0.6);
    expect(Math.min(...h)).toBeGreaterThanOrEqual(-GROUND_TOLERANCE);
  });

  it("fall: the feet hang on the capsule bottom (Hips planted), so a touchdown starts on the ground", () => {
    for (const h of lowestPerFrame("fall")) expect(Math.abs(h)).toBeLessThanOrEqual(GROUND_TOLERANCE);
  });

  it("land: the feet stay on the ground on every frame the land state plays (0.6 of the clip)", () => {
    const h = lowestPerFrame("land");
    const played = Math.ceil(0.6 * clips.land!.duration * FPS);
    h.slice(0, played + 1).forEach((x, i) => expect(Math.abs(x), `frame ${i}`).toBeLessThanOrEqual(GROUND_TOLERANCE));
    // The unplayed tail (the stand-up heel lift at 1.43 s) peaks at 0.052; it only blends out.
    for (const x of h) expect(Math.abs(x)).toBeLessThanOrEqual(0.06);
  });

  it("land: each foot (ankle and toe joints) stays within tolerance on every played frame, not only the lower one", () => {
    // The Mixamo Hard Landing is a one-knee landing whose trailing toe hangs 0.13 m up; the
    // clip is baked with a leg IK that lowers it (scripts/lib/plant-feet.mjs).
    const feet = perFootPerFrame("land");
    const played = Math.ceil(0.6 * clips.land!.duration * FPS);
    feet.slice(0, played + 1).forEach(([l, r], i) => {
      expect(Math.abs(l), `left foot frame ${i}`).toBeLessThanOrEqual(GROUND_TOLERANCE);
      expect(Math.abs(r), `right foot frame ${i}`).toBeLessThanOrEqual(GROUND_TOLERANCE);
    });
  });

  it("land: the legs stay physically plausible (no knee past straight, bones keep their length)", () => {
    const clip = clips.land!;
    const mixer = new THREE.AnimationMixer(rig.root);
    mixer.clipAction(clip).play();
    const len = (a: string, b: string) => rig.bone(a).getWorldPosition(new THREE.Vector3()).distanceTo(rig.bone(b).getWorldPosition(new THREE.Vector3()));
    rig.root.traverse((o) => o.matrixWorldNeedsUpdate);
    const rest = SIDES.map((s) => [len(`${s}UpLeg`, `${s}Leg`), len(`${s}Leg`, `${s}Foot`)]);
    for (let f = 0; f <= Math.round(clip.duration * FPS); f++) {
      mixer.setTime(Math.min(f / FPS, clip.duration));
      rig.root.updateMatrixWorld(true);
      SIDES.forEach((s, i) => {
        expect(len(`${s}UpLeg`, `${s}Leg`)).toBeCloseTo(rest[i][0], 3);
        expect(len(`${s}Leg`, `${s}Foot`)).toBeCloseTo(rest[i][1], 3);
        expect(len(`${s}UpLeg`, `${s}Foot`), `${s} leg stretched at frame ${f}`).toBeLessThan(rest[i][0] + rest[i][1] - 0.002);
      });
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(rig.root);
  });

  it("land: the hips crouch visibly and come back up", () => {
    const clip = clips.land!;
    const track = clip.tracks.find((t) => t.name === "Hips.position")!;
    expect(track).toBeDefined();
    const ys = Array.from({ length: track.times.length }, (_, i) => track.values[i * 3 + 1]);
    const rest = rig.bone("Hips").position.y;
    expect(Math.min(...ys)).toBeLessThan(rest - 0.3); // at least 0.3 m crouch
    expect(Math.min(...ys)).toBeGreaterThan(rest - 0.7);
    expect(ys[ys.length - 1]).toBeGreaterThan(rest - 0.2); // nearly standing at the end
  });
});

const motor = (over: Partial<MotorState>): MotorState => ({
  position: { x: 0, y: 0, z: 0 },
  horizontalSpeed: 0,
  verticalVelocity: -1,
  grounded: true,
  airTime: 0,
  impactSpeed: 0,
  jumpedThisStep: false,
  landedThisStep: false,
  respawnedThisStep: false,
  ...over,
});

describe("hard landing through the animator (fall -> land -> idle or walk)", () => {
  type Sample = { t: number; state: string; low: number; hips: number };

  function drop(after: Partial<MotorState>, secondsAfter = 2.2): Sample[] {
    const rig = readAvatarRig(join(root, "public/avatar.glb")); // a fresh bind-pose skeleton
    const animator: CharacterAnimator = createCharacterAnimator(rig.root, clips, ANIMATION);
    const dt = 1 / FPS;
    const out: Sample[] = [];
    const frame = (m: MotorState, t: number) => {
      animator.update(dt, m);
      out.push({ t, state: animator.state, low: rig.lowestFoot(), hips: rig.bone("Hips").getWorldPosition(new THREE.Vector3()).y });
    };
    for (let i = 0; i < 20; i++) frame(motor({}), -1);
    for (let i = 0; i < 40; i++) frame(motor({ grounded: false, airTime: i * dt, verticalVelocity: -9 }), -0.5);
    const landing = motor({ impactSpeed: 9, airTime: 0.8, ...after });
    for (let i = 0; i < secondsAfter * FPS; i++) frame(landing, i * dt);
    animator.dispose();
    return out;
  }

  it("the lowest foot is within tolerance for the whole land state and after it (idle)", () => {
    const s = drop({});
    const land = s.filter((x) => x.t >= 0 && x.state === "land");
    expect(land.length).toBeGreaterThan(0.5 * FPS);
    // The first land frames still blend in from the fall pose (fade.land); allow that window.
    const settled = land.filter((x) => x.t >= ANIMATION.fade.land + 1e-6);
    for (const x of settled) expect(Math.abs(x.low), `t=${x.t.toFixed(3)}`).toBeLessThanOrEqual(GROUND_TOLERANCE);
    const hipsMin = Math.min(...land.map((x) => x.hips));
    expect(hipsMin).toBeLessThan(0.984 - 0.3);
  });

  it("no pop: fall -> land -> idle or walk changes the lowest foot and the hips by under 0.07 m per frame", () => {
    // The impact itself takes the feet from the 0.35 m fall hover to the ground in fade.land
    // (0.15 s) and the source clip drops the pelvis 0.1 m per 30 fps frame at touchdown, so
    // 0.06 m per 60 Hz frame is the natural peak; a one-frame snap would show as 0.3 m or more.
    for (const after of [{}, { horizontalSpeed: 2.2 }]) {
      const s = drop(after).filter((x) => x.t >= 0);
      for (let i = 1; i < s.length; i++) {
        // A walking exit has its own gait lift (up to 0.1 m over several frames); skip it.
        if (s[i].state !== "land") break;
        expect(Math.abs(s[i].low - s[i - 1].low), `foot at ${s[i].t.toFixed(3)}`).toBeLessThan(0.07);
        expect(Math.abs(s[i].hips - s[i - 1].hips), `hips at ${s[i].t.toFixed(3)}`).toBeLessThan(0.07);
      }
    }
  });

  it("the blend out of land to idle sinks the feet by under 0.05 m and has no step above 0.06 m", () => {
    const s = drop({}).filter((x) => x.t >= 0);
    const k = s.findIndex((x) => x.state === "idle");
    expect(k).toBeGreaterThan(0);
    for (let i = k; i < s.length; i++) {
      expect(s[i].low).toBeGreaterThanOrEqual(-GROUND_TOLERANCE);
      expect(Math.abs(s[i].low - s[i - 1].low)).toBeLessThan(0.06);
      expect(Math.abs(s[i].hips - s[i - 1].hips)).toBeLessThan(0.06);
    }
  });
});

describe("other stance changes through the animator", () => {
  function run(frames: [number, Partial<MotorState>][]) {
    const rig = readAvatarRig(join(root, "public/avatar.glb"));
    const animator = createCharacterAnimator(rig.root, clips, ANIMATION);
    const out: { state: string; low: number; hips: number }[] = [];
    for (const [count, over] of frames) {
      for (let i = 0; i < count; i++) {
        animator.update(1 / FPS, motor(over));
        out.push({ state: animator.state, low: rig.lowestFoot(), hips: rig.bone("Hips").getWorldPosition(new THREE.Vector3()).y });
      }
    }
    animator.dispose();
    return out;
  }
  const stepsOf = (s: { low: number; hips: number }[]) =>
    s.slice(1).map((x, i) => Math.max(Math.abs(x.low - s[i].low), Math.abs(x.hips - s[i].hips)));

  it("jump -> fall in the air has no pelvis snap above 0.05 m per frame", () => {
    const s = run([
      [20, {}],
      [1, { grounded: false, jumpedThisStep: true, verticalVelocity: 4.2 }],
      [20, { grounded: false, verticalVelocity: 3 }],
      [60, { grounded: false, verticalVelocity: -4, airTime: 0.5 }],
    ]);
    // The feet reaching down from the tuck move 0.08 m per frame (clip motion); the pelvis must not snap.
    expect(Math.max(...s.slice(1).map((x, i) => Math.abs(x.hips - s[i].hips)))).toBeLessThan(0.05);
    expect(Math.max(...stepsOf(s))).toBeLessThan(0.1);
  });

  it("a soft landing (fall -> idle) ends with the feet on the ground and never sinks them", () => {
    const s = run([
      [20, {}],
      [40, { grounded: false, verticalVelocity: -5, airTime: 0.6 }],
      [90, { impactSpeed: 5, airTime: 0.6 }],
    ]);
    expect(s[s.length - 1].state).toBe("idle");
    expect(Math.abs(s[s.length - 1].low)).toBeLessThanOrEqual(GROUND_TOLERANCE);
    expect(Math.min(...s.map((x) => x.low))).toBeGreaterThanOrEqual(-GROUND_TOLERANCE);
    expect(Math.max(...stepsOf(s))).toBeLessThan(0.07);
  });

  it("a fall cut short by touchdown does not pop the pose: the fade out of the fall starts from its weight, not from 1 (F-M3-3)", () => {
    // Five frames of fall (the fade-in has reached a quarter), then a soft touchdown. Fading the fall out from
    // full weight, as three's fadeOut does, drops the pelvis 0.3 m in one frame.
    const s = run([
      [20, {}],
      [5, { grounded: false, verticalVelocity: -3.5, airTime: 0.3 }],
      [60, { impactSpeed: 3.5, airTime: 0.3 }],
    ]);
    expect(Math.max(...s.slice(1).map((x, i) => Math.abs(x.hips - s[i].hips)))).toBeLessThan(0.05);
    expect(Math.max(...stepsOf(s))).toBeLessThan(0.1);
  });

  it("walking off a ledge (walk -> fall) lowers the pelvis smoothly, at most 0.06 m per frame", () => {
    const s = run([
      [30, { horizontalSpeed: 2.2 }],
      [60, { grounded: false, verticalVelocity: -3, airTime: 0.4, horizontalSpeed: 2.2 }],
    ]);
    expect(Math.max(...stepsOf(s))).toBeLessThan(0.06);
  });
});

