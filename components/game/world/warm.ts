// Shader and texture pre-warm for the game state (entry smoothness). Every program the game draws
// with is compiled, and every texture uploaded, before the hero hands over to the world, in small
// pieces spread over hero frames, so no single frame stalls for more than a few milliseconds.
//
// The work happens in a private scene that mimics the game's state exactly (a fog, the same four
// lights with one shadow-casting directional light, shadow map on, PCF soft), because three.js keys
// its programs on that state. It never touches the live scene, so it can run on hover (before the
// game is mounted) as well as in the load phase.
//
// The one non-obvious case is the shadow-depth programs. three.js runs a scene's shadow pass before
// it sets up that frame's lights, so it sees the previous frame's light state. WorldView therefore
// primes the live scene's light state with a compile at the swap (the game's four lights, one of
// them casting), and this module compiles the depth programs in exactly that state.
import * as THREE from "three";

export type WarmProbe = { object: THREE.Object3D; cast: boolean };
export type WarmPlan = {
  /** One representative one-instance mesh per world program (see WorldResources.probes). */
  probes: WarmProbe[];
  textures: THREE.Texture[];
  /** Meshes of the avatar as the hero holds it; stand-ins sharing their geometry, materials and skeleton are warmed. */
  avatar: THREE.SkinnedMesh[];
};
export type WarmOptions = { shadows: boolean; shadowMapSize: number; capMs?: number };

/** Work is run in pieces until this much time has passed, then a frame is let through. */
const FRAME_BUDGET_MS = 5;

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/** Skinned meshes under `root`, outside any world or warm-up helper. */
export function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) out.push(m);
  });
  return out;
}

function standIn(src: THREE.SkinnedMesh): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(src.geometry, src.material);
  mesh.bind(src.skeleton, src.bindMatrix);
  // The stand-in sits at the origin under the light; a fixed sphere keeps the culling test independent of the hero's pose.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
  mesh.castShadow = true;
  mesh.frustumCulled = true;
  return mesh;
}

type Lazy = { getUniforms(): unknown; getAttributes(): unknown };

type Unit = { label: string; run: () => Promise<unknown> | void };

type Run = { promise: Promise<void>; cancel: () => void };
const runs = new WeakMap<object, Map<string, Run>>();

/**
 * Warm the game state. Runs started for the same renderer and the same `id` are shared: the second
 * caller (the load phase after a hover) just waits for the first. Resolves when everything is
 * compiled and uploaded, or after `capMs` (the remaining work is then dropped, and costs a hitch
 * later instead of delaying the entry further).
 */
export function warmGameState(gl: THREE.WebGLRenderer, camera: THREE.Camera, id: string, plan: WarmPlan, opts: WarmOptions): Promise<void> {
  let byId = runs.get(gl);
  if (!byId) {
    byId = new Map();
    runs.set(gl, byId);
  }
  let run = byId.get(id);
  if (!run) {
    run = start(gl, camera, plan, opts);
    byId.set(id, run);
  }
  const shared = run;
  if (opts.capMs === undefined) return shared.promise;
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      shared.cancel();
      resolve();
    }, opts.capMs);
    shared.promise.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function start(gl: THREE.WebGLRenderer, camera: THREE.Camera, plan: WarmPlan, opts: WarmOptions): Run {
  let cancelled = false;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 10, 100);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.castShadow = opts.shadows;
  key.shadow.mapSize.set(Math.max(1, opts.shadowMapSize), Math.max(1, opts.shadowMapSize));
  key.position.set(0, 20, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1), new THREE.HemisphereLight(0xffffff, 0x222222, 1), key, new THREE.DirectionalLight(0xffffff, 1));
  // Looks away from everything: the shadow pass draws the casters, the colour pass culls them.
  const away = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  away.position.set(0, 0, -400);
  away.lookAt(0, 0, -500);
  away.updateMatrixWorld();
  let target = null as THREE.WebGLRenderTarget | null;

  /** Run `fn` with the renderer in the game's shadow state, then put the live setting back. */
  const inGameState = <T>(fn: () => T): T => {
    const was = { enabled: gl.shadowMap.enabled, type: gl.shadowMap.type };
    gl.shadowMap.enabled = opts.shadows;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    try {
      return fn();
    } finally {
      gl.shadowMap.enabled = was.enabled;
      gl.shadowMap.type = was.type;
    }
  };

  const depthPass = () =>
    inGameState(() => {
      target ??= new THREE.WebGLRenderTarget(4, 4);
      const prev = gl.getRenderTarget();
      gl.setRenderTarget(target);
      try {
        // The compile just before set this scene's light state to the game's, which is what this
        // shadow pass sees.
        gl.render(scene, away);
      } finally {
        gl.setRenderTarget(prev);
      }
    });

  // three.js reads a program's uniform and attribute layout, and checks its link, on the program's
  // first draw: a round trip to the GPU process per program, about 0.4 ms each. Doing it here moves
  // that out of the first game frame.
  const primed = new WeakSet<object>();
  const primePrograms = () => {
    for (const p of (gl.info.programs ?? []) as unknown as Lazy[]) {
      if (primed.has(p)) continue;
      primed.add(p);
      p.getUniforms();
      p.getAttributes();
    }
  };

  const units: Unit[] = [];
  for (const t of plan.textures) units.push({ label: "texture", run: () => gl.initTexture(t) });
  const meshUnit = (label: string, object: THREE.Object3D, cast: boolean): Unit => ({
    label,
    run: () => {
      scene.add(object);
      let pending: Promise<unknown>;
      try {
        // The colour programs: collected synchronously, linked in parallel when the browser supports it.
        pending = inGameState(() => gl.compileAsync(scene, camera));
        if (opts.shadows && cast) {
          object.traverse((o) => {
            o.frustumCulled = true;
            o.castShadow = true;
          });
          depthPass();
        }
      } finally {
        scene.remove(object);
      }
      return pending.catch(() => undefined);
    },
  });
  for (const p of plan.probes) units.push(meshUnit(p.object.name || "probe", p.object, p.cast));
  for (const m of plan.avatar) units.push(meshUnit("avatar", standIn(m), true));

  const promise = (async () => {
    const t0 = performance.now();
    let sliceStart = t0;
    try {
      // The colour programs of every unit link in parallel in the GPU process: a unit only starts its
      // compile here (the synchronous part), and the links are awaited together at the end, then the
      // layouts are read. Waiting for each unit's link before starting the next one serialised them.
      const links: Array<Promise<unknown>> = [];
      for (const u of units) {
        if (cancelled) break;
        const s = performance.now();
        const pending = u.run();
        if (pending) links.push(pending);
        if (typeof performance.measure === "function") performance.measure(`warm:${u.label}`, { start: s, end: performance.now() });
        if (performance.now() - sliceStart > FRAME_BUDGET_MS) {
          await nextFrame();
          sliceStart = performance.now();
        }
      }
      await Promise.all(links);
      primePrograms();
    } catch {
      // A failed pre-compile only costs a hitch later; it must not fail the load.
    } finally {
      key.dispose();
      target?.dispose();
      if (typeof performance.measure === "function") performance.measure("warm:total", { start: t0, end: performance.now() });
    }
  })();
  return { promise, cancel: () => (cancelled = true) };
}
