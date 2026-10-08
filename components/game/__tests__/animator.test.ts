import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createCharacterAnimator, nextLocoState, resolveClip, type LocoInput, type LocoState } from "../animator";
import { ANIMATION, MOVEMENT, type ClipName } from "../config";

const cfg = ANIMATION;
const base: LocoInput = {
  grounded: true,
  horizontalSpeed: 0,
  verticalVelocity: -1,
  airTime: 0,
  impactSpeed: 0,
  jumpedThisStep: false,
  stateTime: 1,
  landClipDuration: 1,
};
const step = (from: LocoState, over: Partial<LocoInput>) => nextLocoState(from, { ...base, ...over }, cfg);

describe("nextLocoState (design 5.3)", () => {
  it.each(["idle", "walk", "run", "land"] as const)("%s -> jump on jumpedThisStep", (from) => {
    expect(step(from, { jumpedThisStep: true, grounded: false })).toBe("jump");
  });

  it.each(["idle", "walk", "run"] as const)("%s -> fall only after fallDelay airborne", (from) => {
    const speed = from === "run" ? 3.5 : from === "walk" ? 1.5 : 0;
    expect(step(from, { grounded: false, airTime: cfg.fallDelay - 0.01, horizontalSpeed: speed })).toBe(from);
    expect(step(from, { grounded: false, airTime: cfg.fallDelay, horizontalSpeed: speed })).toBe("fall");
  });

  it("jump -> fall when the vertical velocity is not positive", () => {
    expect(step("jump", { grounded: false, verticalVelocity: 2 })).toBe("jump");
    expect(step("jump", { grounded: false, verticalVelocity: 0 })).toBe("fall");
    expect(step("jump", { grounded: false, verticalVelocity: -3 })).toBe("fall");
  });

  it("fall stays fall while airborne", () => {
    expect(step("fall", { grounded: false, airTime: 1, verticalVelocity: -5 })).toBe("fall");
  });

  it.each(["jump", "fall"] as const)("%s -> land on a hard landing (impact speed at the threshold)", (from) => {
    expect(step(from, { grounded: true, impactSpeed: cfg.hardLandSpeed, airTime: 0.9 })).toBe("land");
    expect(step(from, { grounded: true, impactSpeed: 12, airTime: 1.2 })).toBe("land");
  });

  it.each(["jump", "fall"] as const)("%s -> idle, walk or run on a soft landing by speed", (from) => {
    const soft = cfg.hardLandSpeed - 0.01;
    expect(step(from, { grounded: true, impactSpeed: soft, horizontalSpeed: 0 })).toBe("idle");
    expect(step(from, { grounded: true, impactSpeed: soft, horizontalSpeed: cfg.idleMaxSpeed })).toBe("walk");
    expect(step(from, { grounded: true, impactSpeed: soft, horizontalSpeed: cfg.runEnter })).toBe("run");
  });

  it("a hard landing without room plays the soft landing, and a crouch that loses its room is cut short", () => {
    const from: LocoState = "fall";
    const hard = { grounded: true, impactSpeed: cfg.hardLandSpeed + 1, airTime: 0.9 };
    expect(step(from, { ...hard, hardLandAllowed: true })).toBe("land");
    expect(step(from, { ...hard })).toBe("land"); // no verdict from the body pass means room
    expect(step(from, { ...hard, hardLandAllowed: false })).toBe("idle");
    expect(step(from, { ...hard, hardLandAllowed: false, horizontalSpeed: 1 })).toBe("walk");
    expect(step("land", { grounded: true, stateTime: 0.1, landClipDuration: 1.8, hardLandAllowed: false })).toBe("idle");
    expect(step("land", { grounded: true, stateTime: 0.1, landClipDuration: 1.8, hardLandAllowed: true })).toBe("land");
  });

  it("a normal jump lands softly but a drop from above the jump height lands hard", () => {
    const impact = (h: number) => Math.sqrt(2 * MOVEMENT.gravity * h);
    expect(impact(MOVEMENT.jumpHeight)).toBeLessThan(cfg.hardLandSpeed);
    expect(impact(1.3)).toBeGreaterThan(cfg.hardLandSpeed);
    expect(step("fall", { grounded: true, impactSpeed: impact(MOVEMENT.jumpHeight) })).toBe("idle");
    expect(step("fall", { grounded: true, impactSpeed: impact(1.3) })).toBe("land");
  });

  it("no landing decision while still airborne, whatever the impact speed", () => {
    expect(step("fall", { grounded: false, impactSpeed: 20, airTime: 2, verticalVelocity: -9 })).toBe("fall");
  });

  it("walking off a ledge and dropping from a height enter fall after the air-time threshold", () => {
    // From a walking or running state that leaves the ground without a jump: fall only once
    // airTime reaches fallDelay (short edges and steps stay in the ground state).
    expect(step("walk", { grounded: false, airTime: cfg.fallDelay - 0.01, horizontalSpeed: 2.2 })).toBe("walk");
    expect(step("walk", { grounded: false, airTime: cfg.fallDelay, horizontalSpeed: 2.2 })).toBe("fall");
    expect(step("idle", { grounded: false, airTime: cfg.fallDelay })).toBe("fall");
    // ... and the whole drop: fall -> land when the impact is hard.
    let s: LocoState = step("run", { grounded: false, airTime: cfg.fallDelay, horizontalSpeed: 4.8 });
    expect(s).toBe("fall");
    s = step(s, { grounded: true, impactSpeed: 8, horizontalSpeed: 4.8 });
    expect(s).toBe("land");
  });

  it("land -> loco after 0.6 of the clip, or early when running", () => {
    expect(step("land", { stateTime: 0.59, landClipDuration: 1 })).toBe("land");
    expect(step("land", { stateTime: 0.6, landClipDuration: 1 })).toBe("idle");
    expect(step("land", { stateTime: 0.6, landClipDuration: 1, horizontalSpeed: 2 })).toBe("walk");
    expect(step("land", { stateTime: cfg.landLock - 0.01, landClipDuration: 1, horizontalSpeed: cfg.runEnter })).toBe("land");
    expect(step("land", { stateTime: cfg.landLock, landClipDuration: 1, horizontalSpeed: cfg.runEnter })).toBe("run");
  });

  it("land ends at once when no land clip is supplied", () => {
    expect(step("land", { stateTime: 0, landClipDuration: 0 })).toBe("idle");
  });

  it("idle <-> walk at idleMaxSpeed", () => {
    expect(step("idle", { horizontalSpeed: cfg.idleMaxSpeed - 0.01 })).toBe("idle");
    expect(step("idle", { horizontalSpeed: cfg.idleMaxSpeed })).toBe("walk");
    expect(step("walk", { horizontalSpeed: cfg.idleMaxSpeed - 0.01 })).toBe("idle");
    expect(step("walk", { horizontalSpeed: cfg.idleMaxSpeed })).toBe("walk");
  });

  it("walk -> run at runEnter, run -> walk below runExit (hysteresis)", () => {
    expect(step("walk", { horizontalSpeed: cfg.runEnter - 0.01 })).toBe("walk");
    expect(step("walk", { horizontalSpeed: cfg.runEnter })).toBe("run");
    expect(step("run", { horizontalSpeed: cfg.runExit })).toBe("run");
    expect(step("run", { horizontalSpeed: (cfg.runExit + cfg.runEnter) / 2 })).toBe("run");
    expect(step("run", { horizontalSpeed: cfg.runExit - 0.01 })).toBe("walk");
  });

  it("is chosen from measured speed: running into a wall (speed 0) goes to idle", () => {
    let s: LocoState = "run";
    s = step(s, { horizontalSpeed: 0 });
    expect(s).toBe("walk");
    s = step(s, { horizontalSpeed: 0 });
    expect(s).toBe("idle");
  });
});

describe("clip fallbacks (design 5.1)", () => {
  const mk = (name: string) => new THREE.AnimationClip(name, 1, []);
  const only = (...names: ClipName[]) => Object.fromEntries(names.map((n) => [n, mk(n)]));

  it("jump falls back to fall then idle; fall to idle; land has no fallback", () => {
    expect(resolveClip("jump", only("jump", "fall", "idle"))?.name).toBe("jump");
    expect(resolveClip("jump", only("fall", "idle"))?.name).toBe("fall");
    expect(resolveClip("jump", only("idle"))?.name).toBe("idle");
    expect(resolveClip("fall", only("idle"))?.name).toBe("idle");
    expect(resolveClip("land", only("idle"))).toBeNull();
    expect(resolveClip("land", only("land"))?.name).toBe("land");
  });

  it("walk and run fall back toward idle when their clips are missing", () => {
    expect(resolveClip("run", only("walk", "idle"))?.name).toBe("walk");
    expect(resolveClip("walk", only("idle"))?.name).toBe("idle");
  });
});

describe("character animator", () => {
  function makeScene() {
    const root = new THREE.Group();
    const bone = new THREE.Bone();
    bone.name = "Spine";
    root.add(bone);
    return root;
  }
  const track = () => new THREE.QuaternionKeyframeTrack("Spine.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
  const clip = (name: string) => new THREE.AnimationClip(name, 1, [track()]);
  const motor = (over: Partial<Parameters<ReturnType<typeof createCharacterAnimator>["update"]>[1]>) => ({
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

  it("follows measured movement and clamps the playback rate", () => {
    const a = createCharacterAnimator(makeScene(), { idle: clip("idle"), walk: clip("walk"), run: clip("run") }, cfg);
    expect(a.state).toBe("idle");
    a.update(1 / 60, motor({ horizontalSpeed: MOVEMENT.walkSpeed }));
    expect(a.state).toBe("walk");
    expect(a.timeScale).toBeCloseTo(MOVEMENT.walkSpeed / cfg.clipSpeed.walk, 5);
    a.update(1 / 60, motor({ horizontalSpeed: 0.2 }));
    expect(a.timeScale).toBe(cfg.timeScaleMin);
    a.update(1 / 60, motor({ horizontalSpeed: MOVEMENT.runSpeed }));
    expect(a.state).toBe("run");
    expect(a.timeScale).toBeCloseTo(MOVEMENT.runSpeed / cfg.clipSpeed.run, 5);
    a.update(1 / 60, motor({ horizontalSpeed: 20 }));
    expect(a.timeScale).toBe(cfg.timeScaleMax);
    a.update(1 / 60, motor({ horizontalSpeed: 0 }));
    expect(a.state).toBe("walk"); // run exits through walk
    a.update(1 / 60, motor({ horizontalSpeed: 0 }));
    expect(a.state).toBe("idle");
    a.dispose();
  });

  it("the celebration plays over idle, resolves when stopped, and idle comes back; without a clip it resolves at once", async () => {
    const a = createCharacterAnimator(makeScene(), { idle: clip("idle") }, cfg);
    await expect(a.playCelebration()).resolves.toBeUndefined(); // no celebrate clip supplied
    const dance = clip("dance");
    let done = false;
    void a.playCelebration(dance).then(() => (done = true));
    for (let i = 0; i < 30; i++) a.update(1 / 60, motor({}));
    expect(done).toBe(false);
    a.stopCelebration(0.2);
    await Promise.resolve();
    expect(done).toBe(true);
    for (let i = 0; i < 40; i++) a.update(1 / 60, motor({}));
    expect(a.state).toBe("idle");
    a.stopCelebration(); // a second stop is harmless
    a.dispose();
  });

  it("jumps and lands with only idle supplied (fallbacks) without throwing", () => {
    const a = createCharacterAnimator(makeScene(), { idle: clip("idle") }, cfg);
    a.update(1 / 60, motor({ jumpedThisStep: true, grounded: false, verticalVelocity: 6 }));
    expect(a.state).toBe("jump");
    a.update(1 / 60, motor({ grounded: false, verticalVelocity: -1, airTime: 0.5 }));
    expect(a.state).toBe("fall");
    a.update(1 / 60, motor({ grounded: true, airTime: 0.6, impactSpeed: 8, landedThisStep: true }));
    expect(a.state).toBe("land");
    a.update(1 / 60, motor({}));
    expect(a.state).toBe("idle"); // no land clip: the land state ends at once
    a.dispose();
  });

  const allClips = () => ({
    idle: clip("idle"),
    walk: clip("walk"),
    run: clip("run"),
    jump: clip("jump"),
    fall: clip("fall"),
    land: clip("land"),
  });
  it("plays idle when standing still and the matching clip per state with all six clips", () => {
    const a = createCharacterAnimator(makeScene(), allClips(), cfg);
    const seen: string[] = [a.state];
    const push = (m: ReturnType<typeof motor>) => {
      a.update(1 / 60, m);
      seen.push(a.state);
    };
    push(motor({})); // standing still: idle
    push(motor({ jumpedThisStep: true, grounded: false, verticalVelocity: 6 }));
    push(motor({ grounded: false, verticalVelocity: 3, airTime: 0.1 }));
    push(motor({ grounded: false, verticalVelocity: -0.5, airTime: 0.31 }));
    push(motor({ grounded: true, impactSpeed: 5.9, airTime: 0.6, landedThisStep: true })); // soft landing
    expect(seen).toEqual(["idle", "idle", "jump", "jump", "fall", "idle"]);
    // Walk off a ledge: fall after the air-time threshold, then a hard landing.
    push(motor({ horizontalSpeed: 2.2 }));
    expect(a.state).toBe("walk");
    push(motor({ grounded: false, horizontalSpeed: 2.2, airTime: 0.05, verticalVelocity: -1 }));
    expect(a.state).toBe("walk");
    push(motor({ grounded: false, horizontalSpeed: 2.2, airTime: cfg.fallDelay, verticalVelocity: -3 }));
    expect(a.state).toBe("fall");
    push(motor({ grounded: true, impactSpeed: 9, airTime: 0.7, landedThisStep: true }));
    expect(a.state).toBe("land");
    a.dispose();
  });

  it("dispose is idempotent and update after dispose is a no-op", () => {
    const a = createCharacterAnimator(makeScene(), { idle: clip("idle") }, cfg);
    a.dispose();
    a.dispose();
    expect(() => a.update(1 / 60, motor({ horizontalSpeed: 2 }))).not.toThrow();
  });
});
