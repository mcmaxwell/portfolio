"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Avatar, type GestureTrigger } from "@/components/avatar/Avatar";
import { RetryBoundary } from "@/components/avatar/LoadBoundary";
import { HERO } from "@/components/game/shell/transition";
import { isWebGLAvailable } from "@/components/game/shell/useExperienceShell";
import type { GestureName } from "@/lib/gestures";
import { avatarUrl, markMeshoptBroken, usesMeshopt } from "@/lib/avatarSource";

// The 404 avatar only ever shrugs, so it fetches that one clip instead of all nine.
const MOVES: readonly GestureName[] = ["defeated"];
const SHRUG_EVERY_MS = 7000;
const target = new THREE.Vector3(...HERO.cameraTarget);

function Look() {
  const { camera } = useThree();
  useFrame(() => camera.lookAt(target));
  return null;
}

/**
 * The hero avatar, lost on the 404 page: same camera and lights as the hero, the eyes and head still
 * follow the pointer, and every few seconds it gives up and shrugs. Without WebGL it renders nothing
 * and the page reads fine on its own.
 */
export function LostAvatar() {
  const [webgl, setWebgl] = useState(false);
  useEffect(() => setWebgl(isWebGLAvailable()), []);
  const volumeRef = useRef(0);
  const gestureRef = useRef<GestureTrigger>({ seq: 0, name: null });
  const gesturingRef = useRef(false);
  const [src, setSrc] = useState(avatarUrl);
  const clear = () => {
    useGLTF.clear(src);
    if (usesMeshopt(src)) {
      markMeshoptBroken();
      setSrc(avatarUrl());
    }
  };

  useEffect(() => {
    if (!webgl || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (!gesturingRef.current) gestureRef.current = { seq: gestureRef.current.seq + 1, name: "defeated" };
    }, SHRUG_EVERY_MS);
    return () => clearInterval(id);
  }, [webgl]);

  if (!webgl) return null;
  return (
    <Canvas camera={{ position: [...HERO.cameraPosition], fov: HERO.fov }} dpr={[1, 1.5]}>
      <ambientLight intensity={HERO.lights.ambient} />
      <hemisphereLight args={[0xffffff, 0x2a2520, HERO.lights.hemisphere]} />
      <directionalLight position={[...HERO.lights.key.position]} intensity={HERO.lights.key.intensity} />
      <directionalLight position={[...HERO.lights.fill.position]} intensity={HERO.lights.fill.intensity} />
      <RetryBoundary clear={clear} retryDelaysMs={[1500]}>
        <Suspense fallback={null}>
          <Avatar
            url={src}
            volumeRef={volumeRef}
            gestureRef={gestureRef}
            gesturingRef={gesturingRef}
            gestures={MOVES}
            position={[0, HERO.feetY, 0]}
          />
        </Suspense>
      </RetryBoundary>
      <Look />
    </Canvas>
  );
}
