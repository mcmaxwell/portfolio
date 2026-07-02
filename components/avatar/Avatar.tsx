"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GESTURES, GESTURE_URLS } from "@/lib/gestures";

// If the model HAS facial blendshapes (Ready Player Me / ARKit), we move the
// mouth directly. This Avaturn model has none, so we drive head motion.
const MOUTH_MORPHS = ["jawOpen", "mouthOpen", "viseme_aa", "mouthFunnel"];

// Resting downward tilt of the head (radians). Increase to look further down.
const HEAD_DOWN_TILT = 0.18;

// Reused scratch objects for composing the head-look offset (avoids per-frame
// allocation and the gimbal-flip "spin" that Euler += can cause).
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();

export type GestureTrigger = { seq: number; name: string | null };

type AvatarProps = {
  url: string;
  volumeRef: React.MutableRefObject<number>;
  /** Bumped by the chat hook to trigger a gesture. */
  gestureRef: React.MutableRefObject<GestureTrigger>;
  /** Set true while a gesture is playing so the camera can pull back. */
  gesturingRef?: React.MutableRefObject<boolean>;
  position?: [number, number, number];
  scale?: number;
};

// Mixamo clips use "mixamorig:" bone names; our avatar's bones aren't prefixed.
// Strip the prefix and drop the root translation so the avatar stays centered.
function retargetClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks
    .map((t) => {
      const copy = t.clone();
      // three sanitizes "mixamorig:Hips" -> "mixamorigHips" (colon removed),
      // so strip the prefix with the colon optional.
      copy.name = t.name.replace(/^mixamorig:?/, "");
      return copy;
    })
    // Retarget by ROTATION only, and EXCLUDE the root Hips bone. Mixamo bone
    // offsets differ from this avatar's (position/scale tracks would stretch
    // the mesh), and many clips carry a big Hips rotation that tips the whole
    // body over. Keeping only non-root quaternion tracks reuses the pose on the
    // avatar's own bone lengths while staying upright and centered.
    .filter((t) => t.name.endsWith(".quaternion") && !t.name.startsWith("Hips"));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export function Avatar({
  url,
  volumeRef,
  gestureRef,
  gesturingRef,
  position = [0, 0, 0],
  scale = 1,
}: AvatarProps) {
  const { scene, animations } = useGLTF(url);
  const gestureGltfs = useGLTF(GESTURE_URLS);

  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);

  // Build the idle action + one action per gesture clip.
  const { idleAction, gestureActions } = useMemo(() => {
    const idle = animations.length ? mixer.clipAction(animations[0]) : null;
    const map: Record<string, THREE.AnimationAction> = {};
    GESTURES.forEach((name, i) => {
      const clip = gestureGltfs[i]?.animations?.[0];
      if (clip) map[name] = mixer.clipAction(retargetClip(clip));
    });
    return { idleAction: idle, gestureActions: map };
  }, [mixer, animations, gestureGltfs]);

  const activeAction = useRef<THREE.AnimationAction | null>(null);
  const lastSeq = useRef(0);

  // Crossfade to an action, always keeping exactly one driving the skeleton.
  const fadeTo = (next: THREE.AnimationAction | null, dur: number) => {
    if (!next || activeAction.current === next) return;
    const prev = activeAction.current;
    if (prev) prev.fadeOut(dur);
    next.reset();
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    next.fadeIn(dur);
    next.play();
    activeAction.current = next;
  };

  // Start idle, and return to idle whenever a gesture finishes.
  useEffect(() => {
    if (idleAction) {
      idleAction.reset().setEffectiveWeight(1).play();
      activeAction.current = idleAction;
    }
    const onFinished = () => {
      if (gesturingRef) gesturingRef.current = false;
      fadeTo(idleAction, 0.4);
    };
    mixer.addEventListener("finished", onFinished);
    return () => {
      mixer.removeEventListener("finished", onFinished);
      mixer.stopAllAction();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixer, idleAction]);

  const mouthTargets = useMemo(() => {
    const targets: { mesh: THREE.Mesh; indices: number[] }[] = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
        const indices = MOUTH_MORPHS.map(
          (n) => mesh.morphTargetDictionary![n]
        ).filter((i): i is number => i !== undefined);
        if (indices.length) targets.push({ mesh, indices });
      }
    });
    return targets;
  }, [scene]);

  const hasMouth = mouthTargets.length > 0;

  const bones = useMemo(() => {
    const find = (name: string) => {
      let b: THREE.Object3D | null = null;
      scene.traverse((o) => {
        if (o.name === name) b = o;
      });
      return b as THREE.Object3D | null;
    };
    return { head: find("Head"), neck: find("Neck") };
  }, [scene]);

  const off = useRef({ hx: 0, hy: 0, ny: 0 });

  useFrame((state, delta) => {
    // Trigger a gesture when the hook bumps the sequence number.
    if (gestureRef.current.seq !== lastSeq.current) {
      lastSeq.current = gestureRef.current.seq;
      const g = gestureRef.current.name
        ? gestureActions[gestureRef.current.name]
        : null;
      if (g) {
        if (gesturingRef) gesturingRef.current = true;
        g.setLoop(THREE.LoopOnce, 1);
        g.clampWhenFinished = true;
        fadeTo(g, 0.3);
      }
    }

    mixer.update(delta); // advance animation before applying head offsets

    const v = volumeRef.current;
    const t = state.clock.elapsedTime;
    const mx = state.pointer.x;
    const my = state.pointer.y;

    if (hasMouth) {
      for (const { mesh, indices } of mouthTargets) {
        const inf = mesh.morphTargetInfluences!;
        indices.forEach((idx, n) => {
          const target = n === 0 ? v : v * 0.4;
          inf[idx] = THREE.MathUtils.lerp(inf[idx], target, 0.5);
        });
      }
    }

    // Head follows the mouse (+ down tilt + speaking nod), added on top — but
    // only when NOT mid-gesture, so the clip fully controls the head then.
    const gesturing = gesturingRef?.current;
    const o = off.current;
    const targetHy = gesturing ? 0 : mx * 0.45 + Math.sin(t * 7) * 0.04 * v;
    const targetHx = gesturing
      ? 0
      : HEAD_DOWN_TILT - my * 0.3 + Math.sin(t * 9) * 0.05 * v;
    o.hy = THREE.MathUtils.lerp(o.hy, targetHy, 0.1);
    o.hx = THREE.MathUtils.lerp(o.hx, targetHx, 0.1);
    o.ny = THREE.MathUtils.lerp(o.ny, gesturing ? 0 : mx * 0.2, 0.08);

    // Compose the look offset as a quaternion on top of the animated pose.
    // The mixer overwrites the bone quaternion each frame, so this can't
    // accumulate (unlike Euler += which could gimbal-flip into a fast spin).
    if (bones.head) {
      _quat.setFromEuler(_euler.set(o.hx, o.hy, 0, "XYZ"));
      bones.head.quaternion.multiply(_quat);
    }
    if (bones.neck) {
      _quat.setFromEuler(_euler.set(0, o.ny, 0, "XYZ"));
      bones.neck.quaternion.multiply(_quat);
    }
  });

  return (
    <group position={position} scale={scale}>
      <primitive object={scene} />
    </group>
  );
}

export function preloadAvatar(url: string) {
  useGLTF.preload(url);
  GESTURE_URLS.forEach((u) => useGLTF.preload(u));
}
