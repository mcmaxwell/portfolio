// Character animator assets: clip loading and the runtime filter (design 2.6, 5.2).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CLIP_URLS, FIRST_PLAY_CLIPS, type ClipName } from "./config";

export type GameAssets = { clips: Partial<Record<ClipName, THREE.AnimationClip>> };

const stripPrefix = (n: string) => n.replace(/^mixamorig:?/, "");

/**
 * Returns a new rotation-only clip without Hips tracks, bound to names in
 * `jointNames`. Never mutates the input clip. Used for the stripped clips (defensive:
 * no binding warnings even if a source changes) and for the avatar's embedded idle.
 *
 * `keepHipsMotion` opts in to the Hips tracks (rotation and position) of a clip that ships
 * them on purpose: the land clip, whose crouch needs the pelvis to drop and pitch (its Hips
 * translation is authored small, a pelvis shift over planted feet). Every other clip, and the
 * avatar's embedded hero idle, stay Hips-free: the capsule owns the root.
 */
export function toGameClip(
  clip: THREE.AnimationClip,
  jointNames: ReadonlySet<string>,
  keepHipsMotion = false
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf(".");
    if (dot < 0) continue;
    const node = stripPrefix(t.name.slice(0, dot));
    const prop = t.name.slice(dot + 1);
    const hips = node === "Hips";
    if (hips && keepHipsMotion && (prop === "position" || prop === "quaternion")) {
      const copy = t.clone();
      copy.name = `Hips.${prop}`;
      tracks.push(copy);
      continue;
    }
    if (prop !== "quaternion" || hips || !jointNames.has(node)) continue;
    const copy = t.clone();
    copy.name = `${node}.quaternion`;
    tracks.push(copy);
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** Names of every bone under `root`; the live skeleton is the authority for clip binding. */
export function jointNamesOf(root: THREE.Object3D): Set<string> {
  const names = new Set<string>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) names.add(o.name);
  });
  return names;
}

// Module-level cache: the stripped clips are tiny and shared by every game session.
let cache: Promise<GameAssets> | null = null;

/**
 * Loads the first-play clips. A clip that fails to load is skipped and the animator
 * falls back (design 5.1).
 * `onProgress(loaded, total)` reports bytes when the server sends a length.
 */
export function loadGameAssets(onProgress: (loaded: number, total: number) => void): Promise<GameAssets> {
  if (cache) {
    return cache.then((a) => {
      onProgress(1, 1);
      return a;
    });
  }
  const loader = new GLTFLoader();
  const loaded = new Map<string, number>();
  const totals = new Map<string, number>();
  const report = () => {
    let l = 0;
    let t = 0;
    totals.forEach((v) => (t += v));
    loaded.forEach((v) => (l += v));
    onProgress(l, Math.max(t, l, 1));
  };
  const pending = FIRST_PLAY_CLIPS.map(async (name) => {
    try {
      const gltf = await loader.loadAsync(CLIP_URLS[name], (e) => {
        if (e.lengthComputable) {
          loaded.set(name, e.loaded);
          totals.set(name, e.total);
          report();
        }
      });
      const clip = gltf.animations[0];
      return clip ? ([name, clip] as const) : null;
    } catch {
      return null; // clip unavailable: fall back at runtime
    }
  });
  const p = Promise.all(pending).then((entries) => {
    const clips: Partial<Record<ClipName, THREE.AnimationClip>> = {};
    for (const e of entries) if (e) clips[e[0]] = e[1];
    if (!clips.walk && !clips.run) throw new Error("no locomotion clips could be loaded");
    onProgress(1, 1);
    return { clips };
  });
  cache = p;
  p.catch(() => {
    if (cache === p) cache = null; // allow Retry after a failure
  });
  return p;
}
