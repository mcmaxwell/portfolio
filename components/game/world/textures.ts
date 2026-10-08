// Procedural world textures (visual pass), built from the painters in texturePaint.ts. They are drawn
// once, at prefetch time, in a worker (OffscreenCanvas) so the hero's main thread is never busy; where
// a worker is not available, or fails, they are painted on the main thread in paced slices instead.
// Browser only: callers guard on `document`.
import * as THREE from "three";
import { PAINTERS, css, hex, mix, rng, type Canvas2D, type Pause, type RGB, type TexName } from "./texturePaint";

function finish(source: Canvas2D | ImageBitmap, maxAniso: number): THREE.Texture {
  const t = new THREE.Texture(source as unknown as TexImageSource);
  // A canvas is flipped by the upload; an ImageBitmap is not, and arrives already flipped.
  t.flipY = !(typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap);
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, maxAniso);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

const NAMES = Object.keys(PAINTERS) as TexName[];

/** Workers used for painting: a few, but never more than half the cores (the page keeps the rest). */
function workerCount(): number {
  const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
  return Math.max(1, Math.min(3, Math.floor(cores / 2)));
}

/**
 * The world textures painted in workers (the names dealt out round-robin, so the heavy ones spread).
 * Resolves to null when the browser has no worker or OffscreenCanvas, a worker fails, or it takes
 * longer than `timeoutMs`; the caller then paints on the main thread. Nothing is left running
 * either way.
 */
export function buildTexturesInWorker(maxAniso: number, timeoutMs = 20000): Promise<Record<TexName, THREE.Texture> | null> {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined" || typeof createImageBitmap === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const workers: Worker[] = [];
    const out = {} as Record<TexName, THREE.Texture>;
    const t0 = performance.now();
    let count = 0;
    let settled = false;
    const settle = (value: Record<TexName, THREE.Texture> | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      workers.forEach((w) => w.terminate());
      if (!value) {
        for (const name of Object.keys(out) as TexName[]) {
          (out[name].image as ImageBitmap).close?.();
          out[name].dispose();
        }
      }
      resolve(value);
    };
    const timer = setTimeout(() => settle(null), timeoutMs);
    const n = workerCount();
    try {
      for (let i = 0; i < n; i++) {
        const worker = new Worker(new URL("./textureWorker.ts", import.meta.url));
        workers.push(worker);
        worker.onmessage = (e: MessageEvent<{ name: TexName; bitmap?: ImageBitmap; error?: string }>) => {
          const { name, bitmap, error } = e.data;
          if (error || !bitmap) return settle(null);
          if (settled) {
            bitmap.close();
            return;
          }
          out[name] = finish(bitmap, maxAniso);
          if (++count === NAMES.length) {
            performance.measure("tex:worker", { start: t0, end: performance.now() });
            settle(out);
          }
        };
        worker.onerror = () => settle(null);
        worker.postMessage({ names: NAMES.filter((_, k) => k % n === i) });
      }
    } catch {
      settle(null);
    }
  });
}

/**
 * The world textures, painted on the main thread in slices: `pause` is awaited between slices (it
 * returns at once until a frame's worth of time has been used), so the caller can hand the main
 * thread back to the hero's render loop instead of freezing it for the whole set. The fallback of
 * buildTexturesInWorker.
 */
export async function buildTextures(maxAniso: number, pause: Pause): Promise<Record<TexName, THREE.Texture>> {
  const out = {} as Record<TexName, THREE.Texture>;
  for (const name of NAMES) {
    const t0 = performance.now();
    out[name] = finish(await PAINTERS[name](pause), maxAniso);
    performance.measure(`tex:${name}`, { start: t0, end: performance.now() });
    await pause();
  }
  return out;
}

export { hex, css, mix, rng };
export type { RGB, TexName };
