// World GPU resources, built once per layout and kept for the page's lifetime. Sharing them
// across game sessions has two effects: the world's shader programs compile only once (on
// the first hover on Play, see prewarmWorld), and repeated Play and Exit cycles do not allocate
// or leak. Three.js re-uploads the data by itself after a lost and restored WebGL context.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { blockQuaternion, resolveLayout, type Block, type Layout, type Sign } from "./layout";
import { buildDecor, type Shape } from "./decor";
import { createMaterials } from "./materials";
import { createSky } from "./sky";
import { buildTextures, buildTexturesInWorker, type TexName } from "./textures";
import { nextFrame, skinnedMeshes, warmGameState, type WarmPlan, type WarmProbe } from "./warm";
import { resolveQuality } from "../config";

const SIGN_ACCENT: Record<Sign["accent"], string> = { green: "#2fe58a", cyan: "#35d0e8" };

/** The sign face: dark panel, accent border, accent letters scaled to fit. Browser only. */
function signTexture(sign: Sign): THREE.CanvasTexture {
  const w = 1024;
  const h = Math.max(64, Math.round((w * sign.height) / sign.width));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const accent = SIGN_ACCENT[sign.accent];
  ctx.fillStyle = "#04100b";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.round(h * 0.05);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  let size = Math.round(h * 0.56);
  const family = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
  ctx.font = `700 ${size}px ${family}`;
  const maxW = w * 0.88;
  const measured = ctx.measureText(sign.text).width;
  if (measured > maxW) {
    size = Math.floor((size * maxW) / measured);
    ctx.font = `700 ${size}px ${family}`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = accent;
  ctx.fillText(sign.text, w / 2, h / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Every world material is "transparent" (opacity 1 once revealed, depth still written, so it looks
 * and occludes exactly like an opaque one). The entry reveal fades `opacity` from 0: at 0 nothing of
 * the world is drawn, not even specular, so the first game frame has no ground, no pop. A colour
 * fade cannot do that (a dielectric ground still reflects the key light at a grazing angle, about
 * 6 to 8 levels brighter than the stage). Materials differ only in their uniforms, so the world is
 * a handful of shader programs to pre-compile.
 */
const REVEALABLE = { transparent: true, opacity: 1 } as const;

/** Per-frame state of the challenge visuals (cells and the beacon beam). */
export type ChallengeFrame = {
  time: number; // seconds, any monotonic clock
  dt: number;
  collected: ReadonlySet<string>; // cell ids
  beam: boolean; // all three collected, beacon not yet lit
  glow: number; // 0..1 celebration level
  reduced: boolean;
};
export type ChallengeVisuals = {
  update(f: ChallengeFrame): void;
  /** Jump to the target state at once (no shrink or grow): on mount and after a restart. */
  snap(f: ChallengeFrame): void;
};
export type SignItem = { sign: Sign; material: THREE.MeshStandardMaterial; mesh: THREE.Mesh };
export type WorldResources = {
  /** Every world mesh: instanced batches and sign planes. Built once, shared by every mount. */
  root: THREE.Group;
  /** The sky dome; the view moves it with the camera. */
  sky: THREE.Mesh;
  batches: THREE.InstancedMesh[];
  signs: SignItem[];
  /** Entry reveal: `k` = 0 draws nothing of the world, 1 is fully shown. */
  reveal(k: number): void;
  /** Fresh one-instance meshes, one per program the world draws with, for shader pre-compilation. */
  probes(): WarmProbe[];
  /** Every texture the world samples, for uploading before the first game frame. */
  textures: THREE.Texture[];
  stats: { instances: number; batches: number };
  /** Energy cells and the beacon beam; null where the layout has no challenge or there is no DOM. */
  challenge: ChallengeVisuals | null;
};

type Inst = { shape: Shape; mat: string; px: number; py: number; pz: number; q: THREE.Quaternion; sx: number; sy: number; sz: number; tint: number };

/** Material key of a layout block, or null when the decor replaces it (trees, shrubs). */
export function blockMaterial(b: Block): string | null {
  if (/^tree-\d+-(trunk|crown)$/.test(b.id) || /^planter-\d+-shrub$/.test(b.id)) return null;
  const screen = /(?:^|-)screen-(xecsuite|newsstocks|apex|skills|experience|contact)$/.exec(b.id);
  if (screen) return `screen:${screen[1]}`;
  if (b.id.endsWith("kiosk-screen")) return "glass-cyan";
  if (b.id === "beacon-pad") return "pad";
  if (b.id.endsWith("sign-board")) return "trim";
  if (/sign-post/.test(b.id)) return "pole";
  if (/^stone-\d$/.test(b.id)) return "stone";
  if (b.id.startsWith("edge-")) return "hedge";
  switch (b.material) {
    case "ground":
      return "grass";
    case "path":
      return "path";
    case "paving":
      return "paving";
    case "stone":
      return b.kind === "building" ? "wall" : "stone";
    case "metal":
      return b.id.includes("roof") ? "roof" : "steel";
    case "wood":
      return "wood";
    case "foliage":
      return "hedge";
    case "accent-green":
    case "glow-green":
      return "neon-green";
    case "accent-cyan":
    case "glow-cyan":
      return "neon-cyan";
  }
}

const NO_CAST = new Set(["grass", "path", "paving", "floor", "curb", "decal-cyan", "decal-green", "decal-warm", "decal-white", "ring-cyan", "panel-light", "pad"]);
const NO_RECEIVE = new Set(["decal-cyan", "decal-green", "decal-warm", "decal-white", "ring-cyan"]);
const TINTS: Record<string, [string, string]> = {
  leaves: ["#86a883", "#d8dc9a"],
  hedge: ["#c9d8c4", "#e6efd2"],
  rock: ["#8a8a88", "#c8c2b4"],
};

function buildGeometries(): Record<Shape, THREE.BufferGeometry> {
  const orb = new THREE.IcosahedronGeometry(0.5, 2);
  {
    const pos = orb.attributes.position as THREE.BufferAttribute;
    const nrm = orb.attributes.normal as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const n = 1 + 0.09 * Math.sin(v.x * 7.1 + 1.3) * Math.sin(v.y * 6.3 + 0.4) + 0.06 * Math.sin(v.z * 9.7 + v.x * 3.1);
      nrm.setXYZ(i, v.x, v.y, v.z);
      pos.setXYZ(i, v.x * 0.5 * n, v.y * 0.5 * n, v.z * 0.5 * n);
    }
  }
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.rotateX(-Math.PI / 2);
  const pineParts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.07, 0.1, 1.1, 6);
  trunk.translate(0, 0.55, 0);
  pineParts.push(trunk);
  for (const [r, h, y] of [[0.95, 1.9, 0.9], [0.72, 1.7, 1.9], [0.5, 1.5, 3.0]] as const) {
    const cone = new THREE.ConeGeometry(r, h, 9);
    cone.translate(0, y + h / 2, 0);
    pineParts.push(cone);
  }
  const pine = mergeGeometries(pineParts)!;
  // Unit dims: the instance scale is the final size (pine: uniform, 4.5 units tall at scale 1).
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
    orb,
    cone: new THREE.ConeGeometry(0.5, 1, 10),
    quad,
    pine,
  };
}

function createWorldResources(layout: Layout, prebuilt: Record<TexName, THREE.Texture> | null): WorldResources {
  const geos = buildGeometries();
  const hasDom = typeof document !== "undefined";
  const mats = hasDom && prebuilt ? createMaterials(prebuilt) : null;
  const root = new THREE.Group();
  root.name = "world";
  const batches: THREE.InstancedMesh[] = [];
  const signs: SignItem[] = [];

  if (mats) {
    const insts: Inst[] = [];
    const qid = new THREE.Quaternion();
    for (const b of layout.blocks) {
      const mat = blockMaterial(b);
      if (!mat) continue;
      const q = blockQuaternion(b);
      insts.push({ shape: "box", mat, px: b.center.x, py: b.center.y, pz: b.center.z, q: new THREE.Quaternion(q.x, q.y, q.z, q.w), sx: b.size.x, sy: b.size.y, sz: b.size.z, tint: 0.5 });
    }
    for (const d of buildDecor(layout)) {
      insts.push({ shape: d.shape, mat: d.mat, px: d.x, py: d.y, pz: d.z, q: qid.clone().setFromAxisAngle(Y_UP, (d.yawDeg * Math.PI) / 180), sx: d.sx, sy: d.sy, sz: d.sz, tint: d.tint });
    }
    const groups = new Map<string, Inst[]>();
    for (const i of insts) {
      const key = `${i.shape}|${i.mat}`;
      const g = groups.get(key);
      if (g) g.push(i);
      else groups.set(key, [i]);
    }
    const m4 = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    const colB = new THREE.Color();
    for (const [key, list] of Array.from(groups.entries())) {
      const [shape, mat] = key.split("|") as [Shape, string];
      const mesh = new THREE.InstancedMesh(geos[shape], mats.get(mat), list.length);
      mesh.name = key;
      const tint = TINTS[mat];
      list.forEach((i, n) => {
        m4.compose(pos.set(i.px, i.py, i.pz), i.q, scl.set(i.sx, i.sy, i.sz));
        mesh.setMatrixAt(n, m4);
        if (tint) mesh.setColorAt(n, col.set(tint[0]).lerp(colB.set(tint[1]), i.tint));
      });
      mesh.instanceMatrix.needsUpdate = true;
      // Light pools and rings are additive and unlit: draw them after every surface they lie on.
      if (NO_RECEIVE.has(mat)) mesh.renderOrder = 5;
      mesh.userData.cast = !NO_CAST.has(mat);
      mesh.userData.receive = !NO_RECEIVE.has(mat);
      root.add(mesh);
      batches.push(mesh);
    }
    const plane = new THREE.PlaneGeometry(1, 1);
    for (const sign of layout.signs) {
      const t = signTexture(sign);
      const material = new THREE.MeshStandardMaterial({ color: "#ffffff", map: t, emissive: "#ffffff", emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.6, ...REVEALABLE });
      material.userData.base = 1;
      const mesh = new THREE.Mesh(plane, material);
      mesh.position.set(sign.center.x, sign.center.y, sign.center.z);
      mesh.rotation.y = (sign.yawDeg * Math.PI) / 180;
      mesh.scale.set(sign.width, sign.height, 1);
      mesh.name = sign.id;
      root.add(mesh);
      signs.push({ sign, material, mesh });
    }
  }
  const challenge = mats ? createChallengeVisuals(layout, geos, mats.get("neon-cyan"), root, batches) : null;
  const { mesh: sky, material: skyMat } = createSky();
  const all = [...(mats?.all ?? []), ...signs.map((s) => s.material)];
  return {
    root,
    sky,
    batches,
    signs,
    reveal(k) {
      // The tween that drives k eases out (cubic: fast first, slow last). A dusk world is far brighter
      // than the hero stage, so on a fast start that shows as one large brightness step. The inverse
      // of the ease turns the opacity into a straight line in time: the same small step every frame.
      const o = 1 - Math.cbrt(1 - Math.min(1, Math.max(0, k)));
      for (const m of all) m.opacity = (m.userData.base as number) * o;
      skyMat.uniforms.uOpacity.value = o;
    },
    probes() {
      const out: WarmProbe[] = [];
      for (const b of batches) {
        const p = new THREE.InstancedMesh(b.geometry, b.material, 1);
        if (b.instanceColor) p.setColorAt(0, new THREE.Color());
        p.frustumCulled = false;
        p.name = b.name;
        out.push({ object: p, cast: b.userData.cast === true });
      }
      for (const s of signs) {
        const p = new THREE.Mesh(s.mesh.geometry, s.material);
        p.frustumCulled = false;
        p.name = s.sign.id;
        out.push({ object: p, cast: false });
      }
      const sp = new THREE.Mesh(sky.geometry, sky.material);
      sp.frustumCulled = false;
      sp.name = "sky";
      out.push({ object: sp, cast: false });
      return out;
    },
    textures: collectTextures(all),
    challenge,
    stats: { instances: batches.reduce((n, b) => n + b.count, 0), batches: batches.length },
  };
}

const Y_UP = new THREE.Vector3(0, 1, 0);

/** Height of a cell's glow above the floor spot it is collected from (m): chest height. */
export const CELL_LIFT = 1.15;
const CELL_SIZE = 0.5;
const BEAM = { height: 18, radius: 0.14 } as const;

/**
 * The energy cells (spinning, bobbing crystals) and the beacon beam, as two small instanced meshes that
 * share the neon-cyan material of the world's trim, so they add no shader program. They are listed in
 * `batches` so the quality settings and the warm-up probes treat them like every other batch.
 */
function createChallengeVisuals(
  layout: Layout,
  geos: Record<Shape, THREE.BufferGeometry>,
  material: THREE.Material,
  root: THREE.Group,
  batches: THREE.InstancedMesh[]
): ChallengeVisuals | null {
  const cells = layout.challenge.cells;
  const beacon = layout.challenge.beacon;
  if (cells.length === 0 && !beacon) return null;
  const cellMesh = new THREE.InstancedMesh(geos.box, material, Math.max(1, cells.length));
  cellMesh.name = "box|neon-cyan|cells";
  const beamMesh = new THREE.InstancedMesh(geos.cyl, material, 1);
  beamMesh.name = "cyl|neon-cyan|beam";
  for (const m of [cellMesh, beamMesh]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.userData.cast = false;
    m.userData.receive = true;
    root.add(m);
    batches.push(m);
  }
  const scale = cells.map(() => 1);
  let beamK = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const lerpTo = (cur: number, target: number, dt: number, rate: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
  const write = (f: ChallengeFrame) => {
    cells.forEach((c, i) => {
      const bob = f.reduced ? 0 : Math.sin(f.time * 2 + i * 2.1) * 0.08;
      const spin = f.reduced ? Math.PI / 4 : f.time * 1.1 + i;
      // A cube stood on a corner: a crystal, turning about the vertical.
      e.set(Math.atan(Math.SQRT1_2), spin, Math.PI / 4, "YXZ");
      q.setFromEuler(e);
      const s = CELL_SIZE * Math.max(0.0001, scale[i]);
      m4.compose(p.set(c.position.x, c.position.y + CELL_LIFT + bob, c.position.z), q, sc.set(s, s, s));
      cellMesh.setMatrixAt(i, m4);
    });
    cellMesh.instanceMatrix.needsUpdate = true;
    if (beacon) {
      const w = Math.max(0.0001, beamK) * (1 + f.glow * 0.7);
      const h = BEAM.height * (0.15 + 0.85 * beamK) * (1 + f.glow * 0.3);
      m4.compose(p.set(beacon.position.x, beacon.position.y + h / 2, beacon.position.z), QID, sc.set(BEAM.radius * 2 * w, beamK < 0.01 ? 0.0001 : h, BEAM.radius * 2 * w));
      beamMesh.setMatrixAt(0, m4);
      beamMesh.instanceMatrix.needsUpdate = true;
    }
  };
  const target = (f: ChallengeFrame, i: number) => (f.collected.has(cells[i].cellId ?? "") ? 0 : 1);
  return {
    snap(f) {
      cells.forEach((_, i) => (scale[i] = target(f, i)));
      beamK = f.beam ? 1 : 0;
      write(f);
    },
    update(f) {
      cells.forEach((_, i) => (scale[i] = f.reduced ? target(f, i) : lerpTo(scale[i], target(f, i), f.dt, 9)));
      beamK = f.reduced ? (f.beam ? 1 : 0) : lerpTo(beamK, f.beam ? 1 : 0, f.dt, 3);
      write(f);
    },
  };
}
const QID = new THREE.Quaternion();

const cache = new Map<Layout["name"], WorldResources>();
const pending = new Map<Layout["name"], Promise<WorldResources>>();

/** Every texture a set of materials samples, once each. */
function collectTextures(materials: THREE.Material[]): THREE.Texture[] {
  const set = new Set<THREE.Texture>();
  for (const m of materials) {
    const std = m as THREE.MeshStandardMaterial;
    if (std.map) set.add(std.map);
    if (std.emissiveMap) set.add(std.emissiveMap);
    for (const t of (m.userData.extraMaps as THREE.Texture[] | undefined) ?? []) set.add(t);
  }
  return Array.from(set);
}

/** Between two pieces of work, give the main thread back once a frame's worth has been used. */
function pacer(budgetMs: number): () => Promise<void> {
  let since = performance.now();
  return async () => {
    if (performance.now() - since < budgetMs) return;
    await nextFrame();
    since = performance.now();
  };
}

/**
 * Build the world's resources without freezing the page: the textures (the bulk of the work, drawn
 * pixel by pixel) are made one at a time with the main thread handed back between them. Resolves to
 * the cached set when it exists already.
 */
export function loadWorldResources(layout: Layout): Promise<WorldResources> {
  const have = cache.get(layout.name);
  if (have) return Promise.resolve(have);
  let p = pending.get(layout.name);
  if (!p) {
    p = (async () => {
      const t0 = performance.now();
      // Off the main thread first (a worker), so neither the hero nor the loading strip competes with the
      // painting; paced slices on the main thread when there is no worker or it fails.
      const prebuilt = typeof document !== "undefined" ? (await buildTexturesInWorker(8)) ?? (await buildTextures(8, pacer(9))) : null;
      await nextFrame();
      const t1 = performance.now();
      const r = createWorldResources(layout, prebuilt);
      performance.measure("world:build", { start: t1, end: performance.now() });
      cache.set(layout.name, r);
      pending.delete(layout.name);
      performance.measure("world:resources", { start: t0, end: performance.now() });
      return r;
    })();
    pending.set(layout.name, p);
    // A failed build is forgotten, so the next call (the click's own load) tries again.
    p.catch(() => {
      if (pending.get(layout.name) === p) pending.delete(layout.name);
    });
  }
  return p;
}

/**
 * Start building the world's resources (the textures, in a worker) without waiting for anything else.
 * The shell calls this when Play is hovered, focused or pressed, as soon as the game code is in, so
 * the result is usually ready before the click. Never rejects; a failure surfaces on the real load.
 */
export function prepareWorld(layoutName?: Layout["name"]): void {
  loadWorldResources(resolveLayout(layoutName)).catch(() => {
    // the click's own load tries again
  });
}

/** For React Suspense: the resources, or throws the promise that finishes building them. */
export function readWorldResources(layout: Layout): WorldResources {
  const have = cache.get(layout.name);
  if (have) return have;
  throw loadWorldResources(layout);
}

/** What to warm for a layout and an avatar: the world's programs and textures plus stand-ins for the avatar. */
export function warmPlan(res: WorldResources, avatarRoot: THREE.Object3D): WarmPlan {
  return { probes: res.probes(), textures: res.textures, avatar: skinnedMeshes(avatarRoot) };
}

/** The identity of a warm-up for one renderer: runs with the same id are shared. */
export const warmId = (layout: Layout["name"], shadows: boolean) => `${layout}|${shadows ? "shadow" : "plain"}`;

/**
 * Pre-warm the game's shader programs and textures while the user is only hovering on Play, so the
 * load phase after the click finds everything ready. The work is cut into pieces spread over hero
 * frames and runs in a private scene that mimics the game's state (see world/warm.ts); the live
 * hero scene is only read, to find the avatar's meshes.
 */
export async function prewarmWorld(target: { gl: unknown; scene: unknown; camera: unknown }, layoutName?: Layout["name"]): Promise<void> {
  const gl = target.gl as THREE.WebGLRenderer;
  const scene = target.scene as THREE.Scene;
  const camera = target.camera as THREE.Camera;
  const layout = resolveLayout(layoutName);
  try {
    const res = await loadWorldResources(layout);
    const quality = resolveQuality("auto");
    await warmGameState(gl, camera, warmId(layout.name, quality.shadows), warmPlan(res, scene), { shadows: quality.shadows, shadowMapSize: quality.shadowMapSize });
  } catch {
    // A failed pre-compile only costs a hitch later.
  }
}
