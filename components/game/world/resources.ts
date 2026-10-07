// World GPU resources, built once per layout and kept for the page's lifetime. Sharing them
// across game sessions has two effects: the world's shader programs compile only once (on
// the first hover on Play, see prewarmWorld), and repeated Play and Exit cycles do not allocate
// or leak. Three.js re-uploads the data by itself after a lost and restored WebGL context.
import * as THREE from "three";
import { blockQuaternion, resolveLayout, type Block, type Layout } from "./layout";

export const COLORS: Record<Block["material"], string> = {
  ground: "#16271d",
  path: "#24402f",
  stone: "#43524b",
  metal: "#5b6c72",
  "accent-green": "#2fe58a",
  "accent-cyan": "#35d0e8",
};

/** A 2 x 2 texel checker; with RepeatWrapping each texel pair is one metre. */
function checkerTexture(): THREE.DataTexture {
  const data = new Uint8Array([
    255, 255, 255, 255, 190, 190, 190, 255,
    190, 190, 190, 255, 255, 255, 255, 255,
  ]);
  const t = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Every world material is "transparent" (opacity 1 once revealed, depth still written, so it looks
 * and occludes exactly like an opaque one). The entry reveal fades `opacity` from 0: at 0 nothing of
 * the world is drawn, not even specular, so the first game frame has no ground, no pop. A colour
 * fade cannot do that (a dielectric ground still reflects the key light at a grazing angle, about
 * 6 to 8 levels brighter than the stage). One transparent variant for all materials is also a single
 * shader program to pre-compile.
 */
const REVEALABLE = { transparent: true, opacity: 1 } as const;

export type WorldItem = { block: Block; material: THREE.MeshStandardMaterial; q: { x: number; y: number; z: number; w: number } };
export type WorldResources = {
  geometry: THREE.BoxGeometry;
  items: WorldItem[];
  materials: THREE.MeshStandardMaterial[];
};

function createWorldResources(layout: Layout): WorldResources {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const checker = checkerTexture();
  const shared = new Map<Block["material"], THREE.MeshStandardMaterial>();
  const materials: THREE.MeshStandardMaterial[] = [];
  const materialFor = (b: Block): THREE.MeshStandardMaterial => {
    if (b.kind === "ground") {
      // Ground blocks get their own texture clone so the repeat matches the block size.
      const map = checker.clone();
      map.needsUpdate = true;
      map.repeat.set(b.size.x / 2, b.size.z / 2);
      const m = new THREE.MeshStandardMaterial({ color: COLORS[b.material], map, roughness: 1, ...REVEALABLE });
      materials.push(m);
      return m;
    }
    let m = shared.get(b.material);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: COLORS[b.material], roughness: 0.85, metalness: b.material === "metal" ? 0.3 : 0, ...REVEALABLE });
      shared.set(b.material, m);
      materials.push(m);
    }
    return m;
  };
  const items = layout.blocks.map((b) => ({ block: b, material: materialFor(b), q: blockQuaternion(b) }));
  return { geometry, items, materials };
}

const cache = new Map<Layout["name"], WorldResources>();

export function getWorldResources(layout: Layout): WorldResources {
  let r = cache.get(layout.name);
  if (!r) {
    r = createWorldResources(layout);
    cache.set(layout.name, r);
  }
  return r;
}

type Renderer = { compileAsync(scene: THREE.Object3D, camera: THREE.Camera): Promise<unknown> };

/**
 * Compile the world's shader programs against the live hero scene (same lights, same fog, so the
 * program keys equal the game's) without mounting anything: one representative mesh per material
 * is added for the synchronous collection step and removed again before any frame renders.
 * Called on the first hover or focus on Play; compiling is a GPU-process stall of a few hundred
 * milliseconds, which must not land inside the chrome exit animation.
 */
export function prewarmWorld(target: { gl: unknown; scene: unknown; camera: unknown }, layoutName?: Layout["name"]): Promise<void> {
  const gl = target.gl as Renderer;
  const scene = target.scene as THREE.Scene;
  const camera = target.camera as THREE.Camera;
  const res = getWorldResources(resolveLayout(layoutName));
  const group = new THREE.Group();
  const seen = new Set<THREE.Material>();
  for (const it of res.items) {
    if (seen.has(it.material)) continue;
    seen.add(it.material);
    const mesh = new THREE.Mesh(res.geometry, it.material);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  scene.add(group);
  let pending: Promise<unknown>;
  try {
    pending = gl.compileAsync(scene, camera);
  } finally {
    scene.remove(group);
  }
  return pending.then(
    () => undefined,
    () => undefined
  );
}
