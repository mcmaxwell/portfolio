import type * as THREE from "three";

export const FOOT_BONES: readonly string[];
export type AvatarRig = {
  root: THREE.Object3D;
  bone(name: string): THREE.Object3D;
  height(name: string): number;
  lowestFoot(): number;
};
export function buildAvatarRig(buf: Buffer): AvatarRig;
export function readAvatarRig(path: string): AvatarRig;
