import type * as THREE from "three";
import type { AvatarRig } from "./avatar-rig.mjs";

export const LEAN_BONES: readonly string[];
export type PitchStats = { min: number; mean: number; max: number };
export function torsoPitchDeg(rig: AvatarRig, line?: readonly [string, string]): number;
export function clipPitchStats(
  rig: AvatarRig,
  clip: THREE.AnimationClip,
  samples?: number,
  line?: readonly [string, string],
  metric?: (rig: AvatarRig) => number
): PitchStats;
export function boneTiltDeg(rig: AvatarRig, name: string): number;
export const GAZE_BONES: readonly string[];
export function withLean(kept: { node: string; times: number[]; values: number[] }[], deg: number, gazeDeg?: number): { node: string; times: number[]; values: number[] }[];
export function solveLean(
  rig: AvatarRig,
  name: string,
  kept: { node: string; times: number[]; values: number[] }[],
  torsoMean: number,
  headMean: number
): { deg: number; gaze: number; stats: PitchStats; headStats: PitchStats; before: PitchStats; headBefore: PitchStats };
