import type { Shape } from "./shapes";

/**
 * The avatar as a point cloud: 16k surface samples of the hero model in four poses (idle and three
 * moments of the wave), baked from avatar.glb and animations/wave.glb and quantised to one byte per
 * axis inside a shared bounding box (192 KB for all four). The same sample points in every pose,
 * so the memory layer can morph between them and the figure appears to wave.
 */
export const AVATAR_CLOUD = {
  url: "/memory/avatar.bin",
  n: 16000,
  frames: ["idle", "a", "b", "c"] as const,
  min: [-0.3658759295940399, 0.0035929300356656313, -0.4382268488407135] as const,
  size: [0.6670992076396942, 1.8419561765622348, 1.1988947689533234] as const,
};
export type AvatarFrame = (typeof AVATAR_CLOUD.frames)[number];
export type AvatarFrames = Record<AvatarFrame, Float32Array>;

export type CloudMeta<F extends string> = {
  n: number;
  frames: readonly F[];
  min: readonly [number, number, number];
  size: readonly [number, number, number];
};

/** Byte triples back to metres in avatar space (feet at the origin, y up), one array per pose. */
export function decodeFrames<F extends string>(bytes: Uint8Array, meta: CloudMeta<F>): Record<F, Float32Array> {
  const per = meta.n * 3;
  if (bytes.length < per * meta.frames.length) throw new Error("avatar cloud: short file");
  const out = {} as Record<F, Float32Array>;
  meta.frames.forEach((name, f) => {
    const pts = new Float32Array(per);
    for (let i = 0; i < per; i++) pts[i] = meta.min[i % 3] + (bytes[f * per + i] / 255) * meta.size[i % 3];
    out[name] = pts;
  });
  return out;
}

export type Camera = {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
  /** World y of the avatar's feet. */
  feetY: number;
};

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Projects a pose through a camera into frame units: x and y in heights of the frame (y down,
 * centred), z the distance in front of the avatar's centre in the same unit. With the hero's
 * aspect ratio this is where the real avatar's surface is on screen.
 */
export function projectFrame(frame: Float32Array, aspect: number, cam: Camera): Float32Array {
  const pos = cam.position as V3;
  const f = norm(sub(cam.target as V3, pos));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const k = Math.tan((cam.fov * Math.PI) / 360);
  const camDist = Math.hypot(...sub(cam.target as V3, pos));
  const frameHeight = 2 * camDist * k;
  const out = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i += 3) {
    const d: V3 = [frame[i] - pos[0], frame[i + 1] + cam.feetY - pos[1], frame[i + 2] - pos[2]];
    const dist = Math.max(0.01, dot(d, f));
    out[i] = (dot(d, r) / (dist * k * aspect)) * (aspect / 2);
    out[i + 1] = -(dot(d, u) / (dist * k)) / 2;
    out[i + 2] = (camDist - dist) / frameHeight;
  }
  return out;
}

/** The hero pose: frame units, so it lands on the real avatar when scaled to the hero's height. */
export function heroShape(projected: Float32Array, n: number): Shape {
  return { id: "hero", family: "avatar", pts: projected.subarray(0, n * 3), aspect: 1 };
}

/** A projected pose re-centred and scaled so the body itself is one unit tall, for placing in a box. */
export function bodyShape(projected: Float32Array, n: number, id: string): Shape {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n * 3; i += 3) {
    minX = Math.min(minX, projected[i]);
    maxX = Math.max(maxX, projected[i]);
    minY = Math.min(minY, projected[i + 1]);
    maxY = Math.max(maxY, projected[i + 1]);
  }
  const height = maxY - minY || 1;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i += 3) {
    pts[i] = (projected[i] - cx) / height;
    pts[i + 1] = (projected[i + 1] - cy) / height;
    pts[i + 2] = projected[i + 2] / height;
  }
  return { id, family: "avatar", pts, aspect: (maxX - minX) / height };
}
