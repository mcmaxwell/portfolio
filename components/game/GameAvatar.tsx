"use client";

// Avatar primitive plus animator wiring (design 2.6). Reuses the useGLTF-cached
// avatar scene that the hero loaded; never disposes it.
import { useEffect, type MutableRefObject } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { createCharacterAnimator, type CharacterAnimator } from "./animator";
import { jointNamesOf, toGameClip, type GameAssets } from "./clips";
import { ANIMATION, type ClipName } from "./config";

type Props = {
  url: string;
  assets: GameAssets | null;
  groupRef: MutableRefObject<THREE.Group | null>;
  animatorRef: MutableRefObject<CharacterAnimator | null>;
  castShadow: boolean;
};

export function GameAvatar({ url, assets, groupRef, animatorRef, castShadow }: Props) {
  const { scene, animations } = useGLTF(url);

  useEffect(() => {
    // The hero idle moved Hips and may have left mouth morphs open: start from bind pose.
    const flags: Array<[THREE.Mesh, boolean]> = [];
    scene.traverse((o) => {
      const sk = o as THREE.SkinnedMesh;
      if (sk.isSkinnedMesh) sk.skeleton.pose();
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.fill(0);
        flags.push([mesh, mesh.castShadow]);
        mesh.castShadow = castShadow;
      }
    });

    const joints = jointNamesOf(scene);
    const clips: Partial<Record<ClipName, THREE.AnimationClip>> = {};
    for (const [name, clip] of Object.entries(assets?.clips ?? {})) {
      clips[name as ClipName] = toGameClip(clip, joints);
    }
    // Until the idle clip is supplied, the avatar's embedded idle (filtered) stands in.
    if (!clips.idle && animations[0]) clips.idle = toGameClip(animations[0], joints);

    const animator = createCharacterAnimator(scene, clips, ANIMATION);
    animatorRef.current = animator;
    return () => {
      animator.dispose();
      if (animatorRef.current === animator) animatorRef.current = null;
      for (const [mesh, was] of flags) mesh.castShadow = was;
    };
  }, [scene, animations, assets, animatorRef, castShadow]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}
