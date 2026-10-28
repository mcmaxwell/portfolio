import { useGLTF } from "@react-three/drei";
import type * as THREE from "three";

/**
 * Which file the avatar loads from. public/avatar.meshopt.glb (scripts/compress-avatar.mjs) is the
 * same model at about half the size, but it needs the meshopt decoder, which is WebAssembly; where
 * WebAssembly is missing (iOS Lockdown Mode) or fails (some strict browser modes), the plain
 * public/avatar.glb is used instead. NEXT_PUBLIC_AVATAR_URL, when set, always wins.
 */
const OVERRIDE = process.env.NEXT_PUBLIC_AVATAR_URL;
export const AVATAR_PLAIN = OVERRIDE || "/avatar.glb";
export const AVATAR_COMPRESSED = "/avatar.meshopt.glb";

let meshoptBroken = false;

export function avatarUrl(): string {
  if (OVERRIDE || meshoptBroken || typeof WebAssembly !== "object") return AVATAR_PLAIN;
  return AVATAR_COMPRESSED;
}

export const usesMeshopt = (url: string) => url.endsWith(".meshopt.glb");

/** After a compressed load failed: every later load, and the retry, takes the plain file. */
export function markMeshoptBroken() {
  meshoptBroken = true;
}

/**
 * useGLTF for the avatar: the meshopt decoder only for the compressed file, since starting it
 * begins a WebAssembly instantiate that logs an uncaught rejection where WebAssembly is blocked.
 */
export function useAvatarGLTF(url: string) {
  const gltf = useGLTF(url, true, usesMeshopt(url));
  captureRest(gltf.scene);
  return gltf;
}

type Rest = { bone: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }[];
const rests = new WeakMap<THREE.Object3D, Rest>();

/**
 * The bones exactly as loaded, before anything animates them: in this model each bone's own transform
 * is its bind pose (checked against the inverse bind matrices). Taken on the first render that sees
 * the scene, which is always before the first animation frame.
 */
export function captureRest(scene: THREE.Object3D) {
  if (rests.has(scene)) return;
  const rest: Rest = [];
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) rest.push({ bone: o, position: o.position.clone(), quaternion: o.quaternion.clone(), scale: o.scale.clone() });
  });
  rests.set(scene, rest);
}

/**
 * Puts the avatar back in its bind pose. Used instead of Skeleton.pose(), which rebuilds the bones from
 * the inverse bind matrices: in the compressed file those also carry each mesh's dequantization
 * (quantized positions), so pose() would scale and shift the whole body.
 */
export function resetToRest(scene: THREE.Object3D) {
  for (const r of rests.get(scene) ?? []) {
    r.bone.position.copy(r.position);
    r.bone.quaternion.copy(r.quaternion);
    r.bone.scale.copy(r.scale);
  }
}
