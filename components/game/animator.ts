// Character animator: a small state machine plus an AnimationMixer (design 2.6, 5.3, 5.4).
// Animation owns pose only; physics owns the world position.
import * as THREE from "three";
import type { AnimationConfig, ClipName } from "./config";
import type { MotorState } from "./player";

export type LocoState = "idle" | "walk" | "run" | "jump" | "fall" | "land";
export type LocoInput = {
  grounded: boolean;
  horizontalSpeed: number;
  verticalVelocity: number;
  airTime: number;
  jumpedThisStep: boolean;
  stateTime: number;
  landClipDuration: number;
};

type Grounded = "idle" | "walk" | "run";

/** Pick idle, walk or run from measured speed when arriving from the air. */
function bySpeed(speed: number, cfg: AnimationConfig): Grounded {
  if (speed >= cfg.runEnter) return "run";
  if (speed >= cfg.idleMaxSpeed) return "walk";
  return "idle";
}

/** Pure transition function; every row of design 5.3 lives here. */
export function nextLocoState(current: LocoState, i: LocoInput, cfg: AnimationConfig): LocoState {
  switch (current) {
    case "idle":
    case "walk":
    case "run": {
      if (i.jumpedThisStep) return "jump";
      if (!i.grounded && i.airTime >= cfg.fallDelay) return "fall";
      if (current === "idle") return i.horizontalSpeed >= cfg.idleMaxSpeed ? "walk" : "idle";
      if (current === "walk") {
        if (i.horizontalSpeed < cfg.idleMaxSpeed) return "idle";
        return i.horizontalSpeed >= cfg.runEnter ? "run" : "walk";
      }
      return i.horizontalSpeed < cfg.runExit ? "walk" : "run"; // run, with hysteresis
    }
    case "jump":
    case "fall": {
      if (i.grounded) {
        return i.airTime >= cfg.hardLandAirTime ? "land" : bySpeed(i.horizontalSpeed, cfg);
      }
      if (current === "jump" && i.verticalVelocity <= 0) return "fall";
      return current;
    }
    case "land": {
      if (i.jumpedThisStep) return "jump";
      if (!i.grounded && i.airTime >= cfg.fallDelay) return "fall";
      if (
        i.stateTime >= 0.6 * i.landClipDuration ||
        (i.stateTime >= cfg.landLock && i.horizontalSpeed >= cfg.runEnter)
      ) {
        return bySpeed(i.horizontalSpeed, cfg);
      }
      return "land";
    }
  }
}

export interface CharacterAnimator {
  readonly state: LocoState;
  /** Playback rate of the active locomotion action (1 for non-locomotion states). */
  readonly timeScale: number;
  update(dt: number, motor: MotorState): void;
  playCelebration(): Promise<void>;
  dispose(): void;
}

type Clips = Partial<Record<ClipName, THREE.AnimationClip>>;

/**
 * Which clip plays for a state. Missing clips fall back (design 5.1):
 * jump -> fall -> idle, fall -> idle, land -> none (the state then ends at once).
 */
export function resolveClip(state: LocoState, clips: Clips): { name: ClipName; clip: THREE.AnimationClip } | null {
  const order: Record<LocoState, ClipName[]> = {
    idle: ["idle"],
    walk: ["walk", "idle"],
    run: ["run", "walk", "idle"],
    jump: ["jump", "fall", "idle"],
    fall: ["fall", "idle"],
    land: ["land"],
  };
  for (const name of order[state]) {
    const clip = clips[name];
    if (clip) return { name, clip };
  }
  return null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function createCharacterAnimator(
  scene: THREE.Object3D,
  clips: Clips,
  cfg: AnimationConfig
): CharacterAnimator {
  const mixer = new THREE.AnimationMixer(scene);
  const actions = new Map<THREE.AnimationClip, THREE.AnimationAction>();
  const actionFor = (clip: THREE.AnimationClip) => {
    let a = actions.get(clip);
    if (!a) {
      a = mixer.clipAction(clip);
      actions.set(clip, a);
    }
    return a;
  };

  let state: LocoState = "idle";
  let stateTime = 0;
  let active: THREE.AnimationAction | null = null;
  let activeName: ClipName | null = null;
  let celebrate: { resolve: () => void; action: THREE.AnimationAction } | null = null;
  let disposed = false;

  const fadeFor = (to: LocoState) =>
    to === "jump" ? cfg.fade.jump : to === "fall" ? cfg.fade.fall : to === "land" ? cfg.fade.land : cfg.fade.loco;

  const enter = (to: LocoState) => {
    const target = resolveClip(to, clips);
    const prev = active;
    if (!target) {
      state = to;
      stateTime = 0;
      return;
    }
    const next = actionFor(target.clip);
    if (next !== prev) {
      const oneShot = to === "jump" || to === "land";
      next.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
      next.clampWhenFinished = oneShot;
      next.reset();
      next.setEffectiveTimeScale(1);
      next.setEffectiveWeight(1);
      // Walk and run share a gait: keep the phase to avoid a foot pop.
      if (prev && activeName && (to === "walk" || to === "run") && (activeName === "walk" || activeName === "run")) {
        next.time = (prev.time / prev.getClip().duration) * target.clip.duration;
      }
      next.fadeIn(fadeFor(to));
      next.play();
      if (prev) prev.fadeOut(fadeFor(to));
      active = next;
      activeName = target.name;
    }
    state = to;
    stateTime = 0;
  };

  enter("idle");

  return {
    get state() {
      return state;
    },
    get timeScale() {
      return active ? active.getEffectiveTimeScale() : 1;
    },
    update(dt, motor) {
      if (disposed) return;
      stateTime += dt;
      const landClip = clips.land;
      const nxt = nextLocoState(
        state,
        {
          grounded: motor.grounded,
          horizontalSpeed: motor.horizontalSpeed,
          verticalVelocity: motor.verticalVelocity,
          airTime: motor.airTime,
          jumpedThisStep: motor.jumpedThisStep,
          stateTime,
          landClipDuration: landClip ? landClip.duration : 0,
        },
        cfg
      );
      if (nxt !== state) enter(nxt);
      if (active && (state === "walk" || state === "run")) {
        const base = state === "walk" ? cfg.clipSpeed.walk : cfg.clipSpeed.run;
        // A fallback clip (for example idle standing in for walk) keeps its own speed.
        const clipName = activeName;
        const matched = clipName === state;
        active.setEffectiveTimeScale(
          matched ? clamp(motor.horizontalSpeed / base, cfg.timeScaleMin, cfg.timeScaleMax) : 1
        );
      }
      mixer.update(dt);
    },
    playCelebration() {
      const clip = clips.celebrate;
      if (!clip || disposed) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const action = actionFor(clip);
        action.reset().setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = false;
        if (active) active.fadeOut(0.2);
        action.fadeIn(0.2).play();
        const onDone = (e: { action?: THREE.AnimationAction }) => {
          if (e.action !== action) return;
          mixer.removeEventListener("finished", onDone as never);
          celebrate = null;
          resolve();
        };
        mixer.addEventListener("finished", onDone as never);
        celebrate = { resolve, action };
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      celebrate?.resolve();
      celebrate = null;
      actions.clear();
    },
  };
}
