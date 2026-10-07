// Character animator: a small state machine plus an AnimationMixer (design 2.6, 5.3, 5.4).
// Animation owns pose only; physics owns the world position.
import * as THREE from "three";
import { HIPS_MOTION_CLIPS, type AnimationConfig, type ClipName } from "./config";
import type { MotorState } from "./player";

export type LocoState = "idle" | "walk" | "run" | "jump" | "fall" | "land";
export type LocoInput = {
  grounded: boolean;
  horizontalSpeed: number;
  verticalVelocity: number;
  airTime: number;
  /** Downward speed (m/s) at the last touchdown; see MotorState.impactSpeed. */
  impactSpeed: number;
  jumpedThisStep: boolean;
  stateTime: number;
  landClipDuration: number;
  /** False where a hard landing has no room (a wall within reach of the crouch): the soft landing plays. Default true. */
  hardLandAllowed?: boolean;
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
        return i.impactSpeed >= cfg.hardLandSpeed && i.hardLandAllowed !== false ? "land" : bySpeed(i.horizontalSpeed, cfg);
      }
      if (current === "jump" && i.verticalVelocity <= 0) return "fall";
      return current;
    }
    case "land": {
      if (i.jumpedThisStep) return "jump";
      // The crouch has no room any more (the avatar walked toward a wall): get up now.
      if (i.hardLandAllowed === false) return bySpeed(i.horizontalSpeed, cfg);
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
  update(dt: number, motor: MotorState, opts?: { hardLandAllowed?: boolean }): void;
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

const FOOT_BONES = ["LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"] as const;

/**
 * Keeps the feet out of the ground while a clip blend is in progress. Blending the crouch
 * (low Hips, bent legs) with the standing pose in joint space dips the feet below both poses
 * (up to 7 cm at the end of a hard landing), so the Hips are lifted by whatever the lowest
 * foot or toe joint went below its bind-pose height. One-sided: it never lowers the avatar.
 */
function createFootFloor(scene: THREE.Object3D) {
  const hips = scene.getObjectByName("Hips");
  const bones = FOOT_BONES.map((n) => scene.getObjectByName(n)).filter((b): b is THREE.Object3D => !!b);
  if (!hips || bones.length !== FOOT_BONES.length) return null;
  const tmp = new THREE.Vector3();
  const origin = new THREE.Vector3();
  const lowest = () => {
    scene.updateMatrixWorld(true);
    scene.getWorldPosition(origin);
    let low = Infinity;
    for (const b of bones) low = Math.min(low, b.getWorldPosition(tmp).y - origin.y);
    return low;
  };
  const floor = lowest();
  return {
    /** Lifts the Hips so no foot joint is below the bind-pose height; returns the lift (m). */
    apply(): number {
      const deficit = floor - lowest();
      if (deficit <= 0) return 0;
      hips.position.y += deficit;
      return deficit;
    },
  };
}

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

  // Crossfades are driven here, not with fadeIn/fadeOut: those always start from weight 1 and 0, so a
  // fade interrupted halfway (a short fall, a quick stop) makes the pose jump to the fading clip at full weight.
  const fades = new Map<THREE.AnimationAction, { to: number; rate: number }>();
  const fadeTo = (a: THREE.AnimationAction, to: number, duration: number) => {
    fades.set(a, { to, rate: duration > 0 ? 1 / duration : Infinity });
  };
  const stepFades = (dt: number) => {
    fades.forEach((f, a) => {
      const w = a.weight;
      const step = f.rate === Infinity ? Infinity : f.rate * dt;
      const nw = w < f.to ? Math.min(f.to, w + step) : Math.max(f.to, w - step);
      a.setEffectiveWeight(nw);
      if (nw === f.to) {
        fades.delete(a);
        if (f.to === 0) a.enabled = false;
      }
    });
  };

  const footFloor = createFootFloor(scene);
  const hipsClips: THREE.AnimationAction[] = [];
  for (const n of HIPS_MOTION_CLIPS) {
    const c = clips[n];
    if (c) hipsClips.push(actionFor(c));
  }
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
      // A looping clip that is still fading out keeps playing and fades back in from where it is.
      const carried = !oneShot && prev !== null && next.isScheduled() && next.enabled && next.weight > 1e-3 ? next.weight : 0;
      if (carried === 0) next.reset();
      next.setEffectiveTimeScale(1);
      next.setEffectiveWeight(prev ? carried : 1);
      fades.delete(next);
      // Walk and run share a gait: keep the phase to avoid a foot pop.
      if (prev && activeName && (to === "walk" || to === "run") && (activeName === "walk" || activeName === "run")) {
        next.time = (prev.time / prev.getClip().duration) * target.clip.duration;
      }
      // The very first action (idle at creation) starts at full weight: a fade-in from nothing
      // would show the bind pose (a T-pose) for a quarter of a second.
      if (prev) fadeTo(next, 1, fadeFor(to));
      next.play();
      if (prev) fadeTo(prev, 0, fadeFor(to));
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
    update(dt, motor, opts) {
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
          impactSpeed: motor.impactSpeed,
          jumpedThisStep: motor.jumpedThisStep,
          stateTime,
          landClipDuration: landClip ? landClip.duration : 0,
          hardLandAllowed: opts?.hardLandAllowed,
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
      stepFades(dt);
      mixer.update(dt);
      // Only while a clip that moves the Hips (fall, land) still has weight: the other clips
      // keep the pelvis at standing height and are left exactly as authored.
      if (footFloor && hipsClips.some((a) => a.isRunning() && a.getEffectiveWeight() > 0)) footFloor.apply();
    },
    playCelebration() {
      const clip = clips.celebrate;
      if (!clip || disposed) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const action = actionFor(clip);
        action.reset().setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = false;
        if (active) fadeTo(active, 0, 0.2);
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
      // stopAllAction and uncacheRoot put the bones back to the bind pose (a T-pose). The next owner
      // of the skeleton (the hero Avatar after Exit) needs a frame or two to start its own idle, so
      // the last pose is kept instead of flashing the bind pose.
      const pose: Array<[THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3]> = [];
      scene.traverse((o) => {
        if ((o as THREE.Bone).isBone) pose.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
      });
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      for (const [o, p, q, sc] of pose) {
        o.position.copy(p);
        o.quaternion.copy(q);
        o.scale.copy(sc);
      }
      celebrate?.resolve();
      celebrate = null;
      actions.clear();
    },
  };
}
