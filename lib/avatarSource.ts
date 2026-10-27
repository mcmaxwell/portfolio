import { useGLTF } from "@react-three/drei";

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
  return useGLTF(url, true, usesMeshopt(url));
}
