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
  return {
    get done() {
      return done;
    },
    apply(dt) {
      if (done) return false;
      elapsed += dt;
      const k = easeInOutCubic(elapsed / durationSeconds);
      for (const s of captured) {
        // from the captured hero pose (k = 0) to the pose the mixer just wrote (k = 1)
        q.copy(s.bone.quaternion);
        s.bone.quaternion.copy(s.quaternion).slerp(q, k);
        p.copy(s.bone.position);
        s.bone.position.copy(s.position).lerp(p, k);
      }
      if (elapsed >= durationSeconds) done = true;
      return !done;
    },
  };
}
