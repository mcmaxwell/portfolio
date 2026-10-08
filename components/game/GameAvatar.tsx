"use client";

// Avatar primitive plus animator wiring (design 2.6). Reuses the useGLTF-cached
// avatar scene that the hero loaded; never disposes it.
import { useEffect, useLayoutEffect, type MutableRefObject } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { createCharacterAnimator, type CharacterAnimator } from "./animator";
import { createBodyClearance, sampleLandPose, type BodyClearance, type ClearanceOptions, type Solid } from "./bodyClearance";
import { jointNamesOf, toGameClip, type GameAssets } from "./clips";
import { ANIMATION, HIPS_MOTION_CLIPS, MOVEMENT, type ClipName } from "./config";
import { setGameHair } from "./hairMaterial";
import type { MotorState } from "./player";
import { captureBones, createPoseBlend, type PoseBlend } from "./poseBlend";
import { TIMING } from "./shell/transition";

/** A standing, grounded motor state: primes the animator so frame zero is the idle pose. */
const STANDING: MotorState = {
  position: { x: 0, y: 0, z: 0 },
  horizontalSpeed: 0,
  verticalVelocity: 0,
  grounded: true,
  airTime: 0,
  impactSpeed: 0,
  jumpedThisStep: false,
  landedThisStep: false,
  respawnedThisStep: false,
};

type Props = {
  url: string;
  assets: GameAssets | null;
  groupRef: MutableRefObject<THREE.Group | null>;
  animatorRef: MutableRefObject<CharacterAnimator | null>;
  /** The solids of the level and the pass that keeps the posed body out of them (frame driver applies it last). */
  solids: readonly Solid[];
  clearanceRef: MutableRefObject<BodyClearance | null>;
  /** Height of the floor under a point, for judging from the air whether a hard landing has room. */
  floorAt: NonNullable<ClearanceOptions["floorAt"]>;
  /** Receives the hand-over from the hero pose; the frame driver applies it after the mixer update. */
  poseBlendRef: MutableRefObject<PoseBlend | null>;
  /** False when reduced motion is on: no blending, the pose changes at once. */
  blendPose: boolean;
  castShadow: boolean;
};

export function GameAvatar({ url, assets, groupRef, animatorRef, poseBlendRef, solids, clearanceRef, floorAt, blendPose, castShadow }: Props) {
  // None of our GLBs use meshopt; the default decoder starts a WebAssembly instantiate nobody awaits,
  // which logs an uncaught rejection when WebAssembly is blocked.
  const { scene, animations } = useGLTF(url, true, false);

  const build = () => {
    const joints = jointNamesOf(scene);
    const clips: Partial<Record<ClipName, THREE.AnimationClip>> = {};
    for (const [name, clip] of Object.entries(assets?.clips ?? {})) {
      clips[name as ClipName] = toGameClip(clip, joints, HIPS_MOTION_CLIPS.includes(name as ClipName));
    }
    // Until the idle clip is supplied, the avatar's embedded idle (filtered) stands in.
    if (!clips.idle && animations[0]) clips.idle = toGameClip(animations[0], joints);
    const animator = createCharacterAnimator(scene, clips, ANIMATION);
    animatorRef.current = animator;
    // Idle is already at weight 1 (no fade-in from nothing); applying it once now puts the idle pose
    // on the skeleton before anything renders.
    animator.update(0, STANDING);
    return { animator, clips };
  };

  // A layout effect: the bind-pose reset, the idle action at weight 1 and mixer.update(0) all
  // happen before the first game render, so no T-pose frame can reach the screen.
  useLayoutEffect(() => {
    // The skeleton exactly as the hero left it, for the hand-over blend (before the reset below).
    if (blendPose) poseBlendRef.current = createPoseBlend(captureBones(scene), TIMING.entry.poseBlendMs / 1000);
    // The hero idle moved Hips and may have left mouth morphs open: start from bind pose.
    const flags: Array<[THREE.Mesh, boolean, boolean]> = [];
    scene.traverse((o) => {
      const sk = o as THREE.SkinnedMesh;
      if (sk.isSkinnedMesh) sk.skeleton.pose();
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        if (mesh.morphTargetInfluences) mesh.morphTargetInfluences.fill(0);
        flags.push([mesh, mesh.castShadow, mesh.receiveShadow]);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = castShadow;
      }
    });
    const restoreHair = setGameHair(scene);
    const { clips } = build();
    // The landing crouch is sampled on a copy of the bones, so the body pass can make room for it before touchdown.
    clearanceRef.current = createBodyClearance(scene, solids, {
      landPose: sampleLandPose(scene, clips, ANIMATION),
      floorAt,
      gravity: MOVEMENT.gravity,
      maxFallSpeed: MOVEMENT.maxFallSpeed,
      hardLandSpeed: ANIMATION.hardLandSpeed,
    });
    return () => {
      clearanceRef.current = null;
      animatorRef.current?.dispose();
      animatorRef.current = null;
      poseBlendRef.current = null;
      restoreHair();
      for (const [mesh, was, wasReceive] of flags) {
        mesh.castShadow = was;
        mesh.receiveShadow = wasReceive;
      }
    };
    // `build` closes over the same inputs as the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, animations, assets, animatorRef, poseBlendRef, clearanceRef, solids, floorAt, blendPose, castShadow]);

  // The hero Avatar's own cleanup (mixer.stopAllAction) runs after the layout effect above and puts the
  // bones back to the bind pose, and a mixer does not rewrite a value that has not changed since its last
  // apply. Passive mount effects run after every passive cleanup, so building the animator once more here
  // guarantees the idle pose is on the skeleton again, within the same task and before any frame.
  useEffect(() => {
    animatorRef.current?.dispose();
    build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, animations, assets, animatorRef]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}
