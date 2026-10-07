"use client";

// World visuals built from the layout data (design 2.8). Geometry, materials and textures come
// from world/resources.ts and outlive the mount (shared by every game session).
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { QualityPreset } from "../config";
import { HERO } from "../shell/transition";
import { lerp } from "../tween";
import type { Layout } from "./layout";
import { getWorldResources } from "./resources";

/** The world preset the entry tween ends on (k = 1); k = 0 is the hero look (HERO.lights). */
const WORLD_LOOK = {
  background: "#050807",
  fog: { near: 20, far: 60 },
  fogHero: { near: 5.5, far: 7 },
  ambient: 0.8,
  hemisphere: 0.6,
  key: { position: [8, 14, 6] as const, intensity: 1.5 },
  fill: { intensity: 0 },
} as const;

/**
 * Imperative handle for the entry and exit legs. `apply(k, heroYaw)` blends the whole look from
 * the hero stage (k = 0) to the world (k = 1): fog, lights, ground reveal and canvas clear
 * alpha. The ground reveal is the material opacity. `heroYaw` is the facing of the avatar, so the hero light rig keeps its direction
 * relative to the avatar (the avatar is lit the same way as in the hero scene).
 */
export type WorldHandle = {
  apply(k: number, heroYaw: number): void;
  /** Compile every world shader program once, off screen, so the first visible frame does not hitch. */
  warm(): Promise<void>;
};

export function WorldView({
  layout,
  quality,
  active,
  handleRef,
}: {
  layout: Layout;
  quality: QualityPreset;
  /** False while the game warms up behind the hero: the world is mounted but invisible. */
  active: boolean;
  handleRef: MutableRefObject<WorldHandle | null>;
}) {
  const { scene, gl, camera } = useThree();
  const meshesRef = useRef<THREE.Group>(null);
  const lightsRef = useRef<THREE.Group>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);

  // Shared for the page's lifetime (world/resources.ts): never disposed per mount.
  const resources = useMemo(() => getWorldResources(layout), [layout]);

  // Fog and the canvas clear colour belong to the game while it is active. Layout effects, so the
  // cleanup runs in the same commit as the hero remount and before the hero fog attaches again.
  const fogRef = useRef<THREE.Fog | null>(null);
  useLayoutEffect(() => {
    if (!active) return;
    const prevFog = scene.fog;
    const prevColor = new THREE.Color();
    gl.getClearColor(prevColor);
    const prevAlpha = gl.getClearAlpha();
    const fog = new THREE.Fog(WORLD_LOOK.background, WORLD_LOOK.fogHero.near, WORLD_LOOK.fogHero.far);
    fogRef.current = fog;
    scene.fog = fog;
    gl.setClearColor(WORLD_LOOK.background, 0);
    return () => {
      fogRef.current = null;
      scene.fog = prevFog;
      gl.setClearColor(prevColor, prevAlpha);
    };
  }, [active, scene, gl]);

  useLayoutEffect(() => {
    const keyHero = new THREE.Vector3(...HERO.lights.key.position);
    const keyWorld = new THREE.Vector3(...WORLD_LOOK.key.position);
    const fillHero = new THREE.Vector3(...HERO.lights.fill.position);
    const tmp = new THREE.Vector3();
    const handle: WorldHandle = {
      apply(k, heroYaw) {
        const fog = fogRef.current;
        if (fog) {
          fog.near = lerp(WORLD_LOOK.fogHero.near, WORLD_LOOK.fog.near, k);
          fog.far = lerp(WORLD_LOOK.fogHero.far, WORLD_LOOK.fog.far, k);
        }
        if (active) gl.setClearAlpha(k);
        for (const m of resources.materials) m.opacity = k;
        if (ambientRef.current) ambientRef.current.intensity = lerp(HERO.lights.ambient, WORLD_LOOK.ambient, k);
        if (hemiRef.current) hemiRef.current.intensity = lerp(HERO.lights.hemisphere, WORLD_LOOK.hemisphere, k);
        const key = keyRef.current;
        if (key) {
          key.intensity = lerp(HERO.lights.key.intensity, WORLD_LOOK.key.intensity, k);
          // Hero key light carried into game coordinates, blended to the world key direction.
          tmp.copy(keyHero).applyAxisAngle(Y_AXIS, heroYaw).lerp(keyWorld, k);
          key.position.copy(tmp);
        }
        const fill = fillRef.current;
        if (fill) {
          fill.intensity = lerp(HERO.lights.fill.intensity, WORLD_LOOK.fill.intensity, k);
          fill.position.copy(fillHero).applyAxisAngle(Y_AXIS, heroYaw);
        }
      },
      async warm() {
        const group = meshesRef.current;
        if (!group) return;
        // Compile with the meshes visible for the synchronous collection step only; the scene
        // never renders in between, so nothing shows.
        group.visible = true;
        const done = gl.compileAsync(scene, camera);
        group.visible = false;
        // Cap the wait (play-transition.md 7.3); the timer is cleared as soon as the compile ends.
        let cap: ReturnType<typeof setTimeout> | undefined;
        const capped = new Promise((r) => {
          cap = setTimeout(r, 2000);
        });
        try {
          await Promise.race([done, capped]);
        } finally {
          clearTimeout(cap);
        }
      },
    };
    handleRef.current = handle;
    handle.apply(0, 0);
    return () => {
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [active, gl, scene, camera, resources, handleRef]);

  return (
    <group>
      {/* Same four-light structure as the hero scene (ambient, hemisphere, two directional), so the
          avatar's shader programs are identical in both scenes and nothing recompiles at the swap. */}
      <group ref={lightsRef} visible={active}>
        <ambientLight ref={ambientRef} intensity={HERO.lights.ambient} />
        <hemisphereLight ref={hemiRef} args={[0xffffff, 0x1a2a1f, HERO.lights.hemisphere]} />
        <directionalLight
          ref={keyRef}
          position={[...HERO.lights.key.position]}
          intensity={HERO.lights.key.intensity}
          castShadow={quality.shadows}
          shadow-mapSize={[quality.shadowMapSize || 1, quality.shadowMapSize || 1]}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <directionalLight ref={fillRef} position={[...HERO.lights.fill.position]} intensity={HERO.lights.fill.intensity} />
      </group>
      <group ref={meshesRef} visible={active}>
      {resources.items.map(({ block, material, q }) => (
        <mesh
          key={block.id}
          geometry={resources.geometry}
          material={material}
          position={[block.center.x, block.center.y, block.center.z]}
          quaternion={[q.x, q.y, q.z, q.w]}
          scale={[block.size.x, block.size.y, block.size.z]}
          castShadow={quality.shadows && block.kind !== "ground"}
          receiveShadow={quality.shadows}
        />
      ))}
      </group>
    </group>
  );
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
