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

// R1 decision (M1): walk and run speeds are tuned toward the measured clip ground
// speeds instead of the spec defaults (2.2 and 4.8), which would need a 2.2x and
// 2.0x playback rate (above the 1.8 cap) and make the feet slide visibly.
// With walk 1.6 and run 3.8 the playback rates are about 1.63 and 1.30.
export const MOVEMENT = {
  walkSpeed: 1.6,
  runSpeed: 3.8,
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
  lookSensitivity: 0.004,
  entrySeconds: 1.5,
} as const;

// clipSpeed: ground speed of each stripped clip in m/s, scaled to the avatar
// (Hips-free foot-contact measurement in Node, times 1.03; see ASSETS.md and the M1
// report). Walk about 0.95 * 1.03, run about 2.84 * 1.03.
export const ANIMATION = {
  idleMaxSpeed: 0.15,
  runEnter: 2.6,
  runExit: 2.3,
  fallDelay: 0.15,
  hardLandAirTime: 0.35,
  landLock: 0.12,
  clipSpeed: { walk: 0.98, run: 2.93 },
  timeScaleMin: 0.75,
  timeScaleMax: 1.8,
  fade: { loco: 0.25, jump: 0.1, fall: 0.2, land: 0.1 },
} as const;

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
 * The asset list: clips fetched before the game is ready. Add "idle", "jump", "fall"
 * and "land" here when their stripped files exist in public/game/clips (owner action
 * pending); until then the animator uses the design 5.1 fallbacks.
 */
export const FIRST_PLAY_CLIPS: readonly ClipName[] = ["walk", "run"];

export type MotorConfig = typeof MOVEMENT & { capsule: typeof CAPSULE };
export type CameraConfig = typeof CAMERA;
export type AnimationConfig = typeof ANIMATION;

export const MOTOR_CONFIG: MotorConfig = { ...MOVEMENT, capsule: CAPSULE };

/** Distance from the soles to the capsule centre. */
export const FEET_TO_CENTER = CAPSULE.halfHeight + CAPSULE.radius + CAPSULE.skin;
