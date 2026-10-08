// Torso posture of a posed avatar rig: the forward pitch of the Hips-to-Head line and the offline
// lean that gives the Hips-free locomotion clips an upright to forward-leaning torso.
//
// The locomotion clips are shipped without their Hips tracks (ADR-003), so the pelvis pitch the
// source authored (about +2 degrees walking, +10 degrees running) is gone and the spine, which
// was keyed against that pelvis, leaves the chest behind vertical. `solveLean` puts a constant
// forward pitch back on the Spine, Spine1 and Spine2 rotations so the mean torso pitch of the
// clip hits a target, and counter-pitches the Neck and Head so the gaze stays level; the legs are
// not touched, so the feet stay exactly where they were.
import * as THREE from "three";

/** The avatar faces +z at the bind pose; a positive pitch leans the torso toward +z (forward). */
const HEAD_LINE = ["Hips", "Head"];
export const LEAN_BONES = ["Spine", "Spine1", "Spine2"];
export const GAZE_BONES = ["Neck", "Head"];

const a = new THREE.Vector3();
const b = new THREE.Vector3();

/**
 * Forward pitch (degrees from vertical) of the line from the Hips to the Head joint, in the avatar's own
 * forward direction (the Hips-free pose keeps the pelvis at the root heading, so +z). 0 is upright,
 * positive is a forward lean, negative is behind vertical. Call `rig.root.updateMatrixWorld(true)` first.
 */
export function torsoPitchDeg(rig, [from, to] = HEAD_LINE) {
  rig.bone(from).getWorldPosition(a);
  rig.bone(to).getWorldPosition(b);
  return (Math.atan2(b.z - a.z, b.y - a.y) * 180) / Math.PI;
}

/** Torso pitch at `samples` evenly spaced times of `clip` evaluated on `rig`: { min, mean, max }. */
export function clipPitchStats(rig, clip, samples = 60, line, metric = (r) => torsoPitchDeg(r, line)) {
  const mixer = new THREE.AnimationMixer(rig.root);
  mixer.clipAction(clip).play();
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    mixer.setTime((clip.duration * i) / samples);
    rig.root.updateMatrixWorld(true);
    const p = metric(rig);
    min = Math.min(min, p);
    max = Math.max(max, p);
    sum += p;
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(rig.root);
  return { min, mean: sum / samples, max };
}

/** Forward tilt (degrees) of a bone's own up axis: how far the chest or head is pitched, whatever its position. */
export function boneTiltDeg(rig, name) {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.bone(name).getWorldQuaternion(new THREE.Quaternion()));
  return (Math.atan2(up.z, up.y) * 180) / Math.PI;
}

const qx = (deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (deg * Math.PI) / 180);

/**
 * Returns new track values with `deg` of forward pitch spread evenly over LEAN_BONES and `gazeDeg`
 * spread evenly over GAZE_BONES (negative lifts the head back up). `kept` is the stripper's list of
 * { node, times, values }; the input is not mutated.
 */
export function withLean(kept, deg, gazeDeg = 0) {
  const spine = qx(deg / LEAN_BONES.length);
  const gaze = qx(gazeDeg / GAZE_BONES.length);
  const q = new THREE.Quaternion();
  return kept.map((k) => {
    const by = LEAN_BONES.includes(k.node) ? spine : GAZE_BONES.includes(k.node) ? gaze : null;
    if (!by) return k;
    const values = k.values.slice();
    for (let i = 0; i < values.length; i += 4) {
      q.fromArray(values, i);
      q.premultiply(by).normalize();
      q.toArray(values, i);
    }
    return { ...k, values };
  });
}

const asClip = (name, kept) =>
  new THREE.AnimationClip(
    name,
    Math.max(...kept.map((k) => k.times[k.times.length - 1])),
    kept.map((k) => new THREE.QuaternionKeyframeTrack(`${k.node}.quaternion`, k.times, k.values))
  );

const bisect = (f, target) => {
  let lo = -40;
  let hi = 60;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};

/**
 * Solves the forward lean (degrees, on the spine) at which the clip's mean Hips-to-Head pitch equals
 * `torsoMean`, and the Neck and Head pitch (degrees) at which the mean head tilt equals `headMean`.
 * The two interact slightly, so they are solved alternately.
 */
export function solveLean(rig, name, kept, torsoMean, headMean) {
  const stats = (deg, gaze, metric) => clipPitchStats(rig, asClip(name, withLean(kept, deg, gaze)), 60, undefined, metric);
  let deg = 0;
  let gaze = 0;
  for (let it = 0; it < 3; it++) {
    deg = bisect((d) => stats(d, gaze).mean, torsoMean);
    gaze = bisect((g) => stats(deg, g, (r) => boneTiltDeg(r, "Head")).mean, headMean);
  }
  const head = (d, g) => stats(d, g, (r) => boneTiltDeg(r, "Head"));
  return { deg, gaze, stats: stats(deg, gaze), headStats: head(deg, gaze), before: stats(0, 0), headBefore: head(0, 0) };
}
