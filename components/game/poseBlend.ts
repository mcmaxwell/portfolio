// Pose hand-over at the swap (play-transition.md 7.5 item 1). The hero Avatar and the game animator
// are different mixers: the hero idle is at some phase, with the head turned toward the pointer, while
// the game idle starts from its first frame. Capturing the skeleton as the hero left it and easing from
// that pose into whatever the game mixer produces makes the first game frame equal the last hero
// frame, and removes the pop within a quarter of a second.
import * as THREE from "three";
import { easeInOutCubic } from "./tween";

export type PoseBlend = {
  /** Call after the mixer has updated the skeleton for this frame. Returns true while still blending. */
  apply(dt: number): boolean;
  readonly done: boolean;
};

type BoneState = { bone: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };

/**
 * A bone the mixer does not animate (the Hips: the locomotion clips carry no Hips track) keeps whatever
 * this blend wrote last frame, so reading "the pose the mixer wrote" from the bone would make the blend
 * chase its own output and freeze part-way (the hero's pelvis twist stayed on the avatar for good).
 * The target of such a bone is therefore remembered: while the bone still holds exactly what the blend
 * wrote, it has not been touched, and its target is the value it had when the blend started.
 */
type Target = { q: THREE.Quaternion; p: THREE.Vector3; lastQ: THREE.Quaternion; lastP: THREE.Vector3 };

/** Snapshot of every bone's local transform, as the last hero frame left it. */
export function captureBones(root: THREE.Object3D): BoneState[] {
  const out: BoneState[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) out.push({ bone: o, position: o.position.clone(), quaternion: o.quaternion.clone(), scale: o.scale.clone() });
  });
  return out;
}

export function createPoseBlend(captured: BoneState[], durationSeconds: number): PoseBlend {
  let elapsed = 0;
  let done = captured.length === 0 || durationSeconds <= 0;
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const targets: (Target | undefined)[] = [];
  return {
    get done() {
      return done;
    },
    apply(dt) {
      if (done) return false;
      elapsed += dt;
      const k = easeInOutCubic(elapsed / durationSeconds);
      captured.forEach((s, i) => {
        // from the captured hero pose (k = 0) to the pose the mixer just wrote (k = 1)
        let t = targets[i];
        if (!t) {
          t = targets[i] = { q: s.bone.quaternion.clone(), p: s.bone.position.clone(), lastQ: s.bone.quaternion.clone(), lastP: s.bone.position.clone() };
        } else {
          if (!s.bone.quaternion.equals(t.lastQ)) t.q.copy(s.bone.quaternion); // the mixer wrote it this frame
          if (!s.bone.position.equals(t.lastP)) t.p.copy(s.bone.position);
        }
        q.copy(t.q);
        s.bone.quaternion.copy(s.quaternion).slerp(q, k);
        p.copy(t.p);
        s.bone.position.copy(s.position).lerp(p, k);
        t.lastQ.copy(s.bone.quaternion);
        t.lastP.copy(s.bone.position);
      });
      if (elapsed >= durationSeconds) done = true;
      return !done;
    },
  };
}
