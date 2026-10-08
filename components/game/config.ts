// Game configuration: constants and pure helpers only.
// Must never import React, three or Rapier at runtime (design 2.12).

export type Vec3 = { x: number; y: number; z: number };
export type CellId = "lab" | "workshop" | "tower";
export type PanelId =
  | { kind: "project"; projectId: 1 | 2 | 3 }
  | {
      kind:
        | "all-projects"
        | "skills"
        | "experience"
        | "contact"
        | "controls"
        | "settings"
        | "completion";
    };
/**
 * Something the player can use. `prompt` is the action name shown next to the key ("View
 * project"); the key itself (E, or the Interact button on touch) is chosen by the interface.
 * `panel` opens an accessible panel; cells and the beacon (Milestone 4) carry no panel.
 */
export type Interactable = {
  id: string;
  kind: "project" | "all-projects" | "skills" | "experience" | "contact" | "cell" | "beacon";
  position: Vec3; // where the player stands: feet level, in front of the display
  radius: number; // horizontal reach in metres
  prompt: string;
  panel?: PanelId;
  cellId?: CellId;
};
export type ClipName =
  | "idle"
  | "walk"
  | "run"
  | "jump"
  | "fall"
  | "land"
  | "celebrate";

export const PHYSICS = { dt: 1 / 60, maxSteps: 4, maxFrameDelta: 0.25 } as const;

// Total height 1.8 m (audit avatar bounds: about 1.865 m with feet at y about 0).
export const CAPSULE = { radius: 0.3, halfHeight: 0.6, skin: 0.01 } as const;

// Walk and run speeds are the spec defaults (2.2 and 4.8 m/s). The shipped Walking and
// Running clips (ASSETS.md) have measured ground speeds of about 1.54 and 4.86 m/s, so the
// playback rates are about 1.43 and 0.99, inside the 0.75 to 1.8 clamp (the earlier
// R1 retune to 1.6 and 3.8 is superseded).
export const MOVEMENT = {
  walkSpeed: 2.2,
  runSpeed: 4.8,
  groundAccel: 30,
  airAccel: 8,
  gravity: 20,
  jumpHeight: 0.9,
  maxFallSpeed: 20,
  groundStickSpeed: 1,
  stepHeight: 0.25,
  stepMinWidth: 0.2,
  maxSlopeDeg: 40,
  snapDistance: 0.3,
  coyoteTime: 0.12,
  jumpBuffer: 0.12,
  killPlaneY: -10,
  turnRate: 12,
} as const;

export const CAMERA = {
  distance: 4.5,
  minDistance: 0.8,
  shoulder: 0.4,
  pivotHeight: 0.6,
  pitchMinDeg: -20,
  pitchMaxDeg: 50,
  fov: 55,
  followK: 12,
  followKVertical: 6,
  restoreK: 4,
  probeRadius: 0.2,
  /** Radius of the thin line-of-sight probes from the avatar's torso and head to the camera. */
  losRadius: 0.03,
  /** Heights above the soles that must stay visible: torso and head centre. */
  losHeights: [1.2, 1.65] as readonly number[],
  /** Largest extra pitch the camera may add to keep minDistance next to a wall. */
  maxLiftDeg: 80,
  lookSensitivity: 0.004,
  entrySeconds: 1.5,
} as const;

// clipSpeed: ground speed of each shipped clip in m/s, scaled to the avatar by the
// pelvis-to-foot height ratio (`node scripts/measure-clips.mjs`: Hips-free stance-foot
// slide, walk 1.535, run 4.858). hardLandSpeed: downward speed at touchdown (m/s) that
// triggers the hard landing; free fall under MOVEMENT.gravity reaches it after about
// 1.06 m, above the 0.9 m jump height, so a normal jump lands softly.
export const ANIMATION = {
  idleMaxSpeed: 0.15,
  runEnter: 2.6,
  runExit: 2.3,
  fallDelay: 0.15,
  hardLandSpeed: 6.5,
  landLock: 0.12,
  clipSpeed: { walk: 1.54, run: 4.86 },
  timeScaleMin: 0.75,
  timeScaleMax: 1.8,
  fade: { loco: 0.25, jump: 0.1, fall: 0.2, land: 0.15 },
} as const;

/** The existing gesture (lib/gestures.ts) the avatar performs at the beacon, and how long of it plays (s). */
export const CELEBRATION = { gesture: "dance", maxSeconds: 3.6, noClipSeconds: 2.2, reducedSeconds: 1.0 } as const;
export const CELEBRATION_GESTURE = CELEBRATION.gesture;

export const INPUT = { joystickRunThreshold: 0.85 } as const;

export type QualityPreset = {
  maxDpr: number;
  shadows: boolean;
  shadowMapSize: number;
};
export const QUALITY: Record<"low" | "high", QualityPreset> = {
  low: { maxDpr: 1, shadows: false, shadowMapSize: 0 },
  high: { maxDpr: 1.75, shadows: true, shadowMapSize: 1024 },
};
export type QualitySetting = "auto" | "low" | "high";

/** auto = low on a coarse pointer or 4 or fewer cores. */
export function resolveQuality(setting: QualitySetting): QualityPreset {
  if (setting === "low" || setting === "high") return QUALITY[setting];
  const coarse =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const cores =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 8 : 8;
  return coarse || cores <= 4 ? QUALITY.low : QUALITY.high;
}

export const CLIP_URLS: Record<ClipName, string> = {
  idle: "/game/clips/idle.glb",
  walk: "/game/clips/walk.glb",
  run: "/game/clips/run.glb",
  jump: "/game/clips/jump.glb",
  fall: "/game/clips/fall.glb",
  land: "/game/clips/land.glb",
  celebrate: "/game/clips/celebrate.glb",
};
/**
 * Clips that ship Hips tracks on purpose (see scripts/strip-clips.mjs groundHips and
 * plantHips): the land crouch and the fall pose both need a pelvis height so the feet stay
 * on the capsule bottom. Every other clip is Hips-free.
 */
export const HIPS_MOTION_CLIPS: readonly ClipName[] = ["fall", "land"];
/** The asset list: clips fetched before the game is ready. A clip that fails to load is skipped and the animator falls back (design 5.1). */
export const FIRST_PLAY_CLIPS: readonly ClipName[] = ["idle", "walk", "run", "jump", "fall", "land"];

export type MotorConfig = typeof MOVEMENT & { capsule: typeof CAPSULE };
export type CameraConfig = typeof CAMERA;
export type AnimationConfig = typeof ANIMATION;

export const MOTOR_CONFIG: MotorConfig = { ...MOVEMENT, capsule: CAPSULE };

/** Distance from the soles to the capsule centre. */
export const FEET_TO_CENTER = CAPSULE.halfHeight + CAPSULE.radius + CAPSULE.skin;
