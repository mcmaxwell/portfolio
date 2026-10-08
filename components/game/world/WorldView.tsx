"use client";

// World visuals built from the layout data (design 2.8). Geometry, materials and textures come
// from world/resources.ts and outlive the mount (shared by every game session).
import { useLayoutEffect, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { QualityPreset } from "../config";
import { allCollected, type ProgressV1 } from "../progress";
import type { Store } from "../session";
import { HERO } from "../shell/transition";
import { lerp } from "../tween";
import type { Layout } from "./layout";
import { readWorldResources, warmId, warmPlan } from "./resources";
import { warmGameState } from "./warm";
import { SKY } from "./sky";

/** The world preset the entry tween ends on (k = 1); k = 0 is the hero look (HERO.lights). */
const WORLD_LOOK = {
  background: "#050807",
  fog: { near: 26, far: 100, color: SKY.horizon },
  fogHero: { near: 5.5, far: 7 },
  // Dusk: a low warm sun behind the spawn view, a cool sky fill from the opposite side.
  ambient: { intensity: 0.7, color: "#9db0d6" },
  hemisphere: { intensity: 0.65, sky: "#87a6dc", ground: "#1f3a2c" },
  key: { position: [-9, 10, -13] as const, intensity: 1.9, color: "#ffd8b6" },
  fill: { position: [11, 6, 9] as const, intensity: 0.55, color: "#6f94e8" },
  /** Half-extent of the shadow window around the player, in metres. */
  shadowHalf: 16,
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
  /** The player's ground position: the shadow window follows it (snapped to shadow texels). */
  follow(x: number, z: number): void;
  /** The beacon celebration: 0 is the normal light, 1 the full brightening and cyan tint. */
  setCelebration(level: number): void;
};

export function WorldView({
  layout,
  quality,
  active,
  handleRef,
  avatarUrl,
  challenge,
}: {
  layout: Layout;
  quality: QualityPreset;
  /** False while the game warms up behind the hero: the world is mounted but invisible. */
  active: boolean;
  handleRef: MutableRefObject<WorldHandle | null>;
  /** The avatar the game will show, so its shadow programs compile with the world's. */
  avatarUrl: string;
  /** The challenge visuals follow this progress (cells vanish when collected, the beam shows after the third). */
  challenge?: { progress: Store<ProgressV1>; reducedMotion: boolean };
}) {
  const { scene, gl, camera } = useThree();
  const avatar = useGLTF(avatarUrl, true, false).scene;
  const meshesRef = useRef<THREE.Group>(null);
  const lightsRef = useRef<THREE.Group>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const fillRef = useRef<THREE.DirectionalLight>(null);
  // Shadow window state: where the key light looks, and the direction toward it.
  const focus = useRef(new THREE.Vector3());
  const keyDir = useRef(new THREE.Vector3(0, 1, 0));

  // Shared for the page's lifetime (world/resources.ts): never disposed per mount.
  // Suspends (renders nothing, the hero stays) until the textures are drawn, in pieces.
  const resources = readWorldResources(layout);

  // Soft shadows (PCF soft) belong to the game; the renderer setting is restored on unmount. It is
  // switched on at mount, before the warm-up compile, so the programs compiled behind the hero are
  // the ones the game draws with and nothing recompiles at the swap.
  useLayoutEffect(() => {
    const key = keyRef.current;
    // The light target must be in the scene for the shadow window to follow it.
    if (key) scene.add(key.target);
    const was = { enabled: gl.shadowMap.enabled, type: gl.shadowMap.type };
    gl.shadowMap.enabled = quality.shadows;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    for (const b of resources.batches) {
      b.castShadow = quality.shadows && b.userData.cast === true;
      b.receiveShadow = quality.shadows && b.userData.receive === true;
    }
    return () => {
      if (key) scene.remove(key.target);
      gl.shadowMap.enabled = was.enabled;
      gl.shadowMap.type = was.type;
    };
  }, [gl, scene, quality.shadows, resources]);

  // Challenge visuals: set to the current progress on mount, then follow it each frame.
  const celebRef = useRef(0);
  const challengeCache = useRef<{ progress: ProgressV1 | null; collected: Set<string>; all: boolean; completed: boolean; trophy: boolean }>({
    progress: null,
    collected: new Set(),
    all: false,
    completed: false,
    trophy: false,
  });
  const frameOf = (time: number, dt: number) => {
    const p = challenge?.progress.getState();
    const c = challengeCache.current;
    if (p && c.progress !== p) {
      c.progress = p;
      c.collected = new Set(p.collected);
      c.all = allCollected(p);
      c.completed = p.completed;
      c.trophy = p.trophy;
    }
    // The beam shows from the third cell until the beacon is lit, and stays through the celebration.
    const beam = c.all && (!c.completed || celebRef.current > 0);
    return { time, dt, collected: c.collected, trophy: c.trophy, beam, glow: celebRef.current, reduced: challenge?.reducedMotion ?? false };
  };
  useLayoutEffect(() => {
    resources.challenge?.snap(frameOf(0, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, challenge]);

  // The dome follows the camera: it is the far backdrop, never reached.
  useFrame(({ camera: cam, clock }, dt) => {
    if (active) resources.challenge?.update(frameOf(clock.elapsedTime, Math.min(dt, 0.1)));
    resources.sky.position.copy(cam.position);
    // The Canvas re-applies its own (off) shadow setting whenever its props change, e.g. on a
    // pause or resize, so the game asserts its setting each frame; it is a plain assignment.
    if (gl.shadowMap.enabled !== quality.shadows) gl.shadowMap.enabled = quality.shadows;
    if (gl.shadowMap.type !== THREE.PCFSoftShadowMap) gl.shadowMap.type = THREE.PCFSoftShadowMap;
  });

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

  // The swap: three.js runs a scene's shadow pass with the light state of its previous frame, which
  // after the hero is the hero's (no shadow light). A compile of the live scene, in the commit that
  // turns the game on and before its first frame, sets the state the game draws with, so the
  // depth programs warmed in that state are the ones the first frame needs. Every program is
  // already built, so this only walks the scene (a millisecond or two).
  useLayoutEffect(() => {
    if (!active || !quality.shadows) return;
    // The Canvas resets the shadow setting whenever its props change, as they do at the swap; the
    // frame loop sets it again before each frame, and so does this, for the compile.
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.compile(scene, camera);
  }, [active, gl, scene, camera, quality.shadows]);

  useLayoutEffect(() => {
    const keyHero = new THREE.Vector3(...HERO.lights.key.position);
    const keyWorld = new THREE.Vector3(...WORLD_LOOK.key.position);
    const fillHero = new THREE.Vector3(...HERO.lights.fill.position);
    const fillWorld = new THREE.Vector3(...WORLD_LOOK.fill.position);
    const white = new THREE.Color(0xffffff);
    const heroGround = new THREE.Color(0x1a2a1f);
    const fogHeroColor = new THREE.Color(WORLD_LOOK.background);
    const fogWorldColor = new THREE.Color(WORLD_LOOK.fog.color);
    const cAmbient = new THREE.Color(WORLD_LOOK.ambient.color);
    const cSky = new THREE.Color(WORLD_LOOK.hemisphere.sky);
    const cGround = new THREE.Color(WORLD_LOOK.hemisphere.ground);
    const cKey = new THREE.Color(WORLD_LOOK.key.color);
    const cFill = new THREE.Color(WORLD_LOOK.fill.color);
    const tmp = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const look = new THREE.Vector3();
    const snapped = new THREE.Vector3();
    const texel = quality.shadows ? (2 * WORLD_LOOK.shadowHalf) / Math.max(1, quality.shadowMapSize) : 0.01;
    const placeKey = () => {
      const key = keyRef.current;
      if (!key) return;
      // Snap the window centre to whole shadow texels in light space, so shadows do not shimmer.
      look.copy(keyDir.current).negate();
      right.crossVectors(look, Y_AXIS);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      up.crossVectors(right, look).normalize();
      const f = focus.current;
      const pr = Math.round(f.dot(right) / texel) * texel;
      const pu = Math.round(f.dot(up) / texel) * texel;
      snapped.copy(right).multiplyScalar(pr).addScaledVector(up, pu).addScaledVector(look, f.dot(look));
      key.target.position.copy(snapped);
      key.position.copy(snapped).addScaledVector(keyDir.current, 36);
      key.target.updateMatrixWorld();
    };
    const cCyan = new THREE.Color("#7fe9ff");
    let lastK = 0;
    let lastYaw = 0;
    const handle: WorldHandle = {
      setCelebration(level) {
        celebRef.current = level;
        handle.apply(lastK, lastYaw);
      },
      apply(k, heroYaw) {
        lastK = k;
        lastYaw = heroYaw;
        const glow = celebRef.current;
        const fog = fogRef.current;
        if (fog) {
          fog.near = lerp(WORLD_LOOK.fogHero.near, WORLD_LOOK.fog.near, k);
          fog.far = lerp(WORLD_LOOK.fogHero.far, WORLD_LOOK.fog.far, k);
          fog.color.lerpColors(fogHeroColor, fogWorldColor, k);
        }
        if (active) gl.setClearAlpha(k);
        resources.reveal(k);
        const amb = ambientRef.current;
        if (amb) {
          amb.intensity = lerp(HERO.lights.ambient, WORLD_LOOK.ambient.intensity, k) + glow * 0.55;
          amb.color.lerpColors(white, cAmbient, k).lerp(cCyan, glow * 0.55);
        }
        const hemi = hemiRef.current;
        if (hemi) {
          hemi.intensity = lerp(HERO.lights.hemisphere, WORLD_LOOK.hemisphere.intensity, k) + glow * 0.4;
          hemi.color.lerpColors(white, cSky, k);
          hemi.groundColor.lerpColors(heroGround, cGround, k);
        }
        const key = keyRef.current;
        if (key) {
          key.intensity = lerp(HERO.lights.key.intensity, WORLD_LOOK.key.intensity, k) + glow * 0.9;
          key.color.lerpColors(white, cKey, k);
          // Hero key light carried into game coordinates, blended to the world key direction.
          tmp.copy(keyHero).applyAxisAngle(Y_AXIS, heroYaw).lerp(keyWorld, k);
          keyDir.current.copy(tmp).normalize();
          placeKey();
        }
        const fill = fillRef.current;
        if (fill) {
          fill.intensity = lerp(HERO.lights.fill.intensity, WORLD_LOOK.fill.intensity, k);
          fill.color.lerpColors(white, cFill, k);
          tmp.copy(fillHero).applyAxisAngle(Y_AXIS, heroYaw).lerp(fillWorld, k);
          fill.position.copy(tmp);
        }
      },
      follow(x, z) {
        focus.current.set(x, 0, z);
        placeKey();
      },
      async warm() {
        // Programs and textures are prepared in a private scene that mimics the game's state, in
        // small pieces over hero frames (world/warm.ts); the live scene is not touched. Capped
        // (play-transition.md 7.3): whatever is left then compiles later instead of holding the load.
        await warmGameState(gl, camera, warmId(layout.name, quality.shadows), warmPlan(resources, avatar), {
          shadows: quality.shadows,
          shadowMapSize: quality.shadowMapSize,
          capMs: 2000,
        });
      },
    };
    handleRef.current = handle;
    handle.apply(0, 0);
    return () => {
      celebRef.current = 0;
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [active, gl, camera, resources, handleRef, quality.shadows, quality.shadowMapSize, avatar, layout.name]);

  const half = WORLD_LOOK.shadowHalf;
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
          shadow-camera-left={-half}
          shadow-camera-right={half}
          shadow-camera-top={half}
          shadow-camera-bottom={-half}
          shadow-camera-near={1}
          shadow-camera-far={90}
          shadow-bias={-0.0004}
          shadow-normalBias={0.04}
        />
        <directionalLight ref={fillRef} position={[...HERO.lights.fill.position]} intensity={HERO.lights.fill.intensity} />
      </group>
      <group ref={meshesRef} visible={active}>
        <primitive object={resources.root} dispose={null} />
        <primitive object={resources.sky} dispose={null} />
      </group>
    </group>
  );
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
