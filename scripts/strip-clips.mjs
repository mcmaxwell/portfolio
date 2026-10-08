// Offline clip converter and stripper (design 5.1, ADR-003).
// Reads the Mixamo FBX downloads in assets-src/mixamo with three's FBXLoader and writes
// rotation-only, Hips-free, mesh-free clips to public/game/clips/<name>.glb.
// Run with `npm run strip-clips`. Sources that are missing are skipped with a message.
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Accessor, Document, NodeIO } from "@gltf-transform/core";
import { dedup, resample } from "@gltf-transform/functions";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { buildAvatarRig } from "./lib/avatar-rig.mjs";
import { plantRaisedFeet } from "./lib/plant-feet.mjs";
import { solveLean, withLean } from "./lib/posture.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(root, "assets-src/mixamo");
const OUT = resolve(root, "public/game/clips");
const AVATAR = resolve(root, "public/avatar.glb");
const FPS = 30;

// name -> source file and options. loop: the clip is a cycle whose last key repeats the
// first; the repeated key is dropped and the keys are shifted by one frame so the clip
// duration equals the true loop period (the Mixamo FBX keys start at t = 0, so without
// the shift the duration would be one frame short and the loop would hitch).
// One-shot clips (jump, land) keep their original timing. frames: [first, last] keeps only
// that source frame range, rebased to start at t = 0. The Mixamo Jump clip has half a
// second of crouch before take-off, but the motor leaves the ground the instant the key is
// pressed, so only the airborne part is shipped (foot-lift-off at source frame 23, touchdown
// at frame 39 by forward kinematics of the Hips-included pose; frame 21 keeps the push-off).
// groundHips: the clip also keeps the Hips rotation and ships a Hips translation track. The
// Hips tracks of the other clips are stripped (the capsule owns the root), but the Hard
// Landing is a crouch: with the Hips stuck at standing height the folded legs leave the feet
// 0.85 m in the air (QA round 2, F1). The Hips rotation (pelvis pitch and twist) is kept as
// authored (its rest rotation matches the avatar's, both about identity). The translation is
// the source Hips travel scaled to the avatar for x and z (the pelvis moves over planted feet),
// and for y it is derived per frame so that the avatar's lowest foot or toe joint, posed with
// the shipped rotations, stands on the ground (the rest-stance toe height). So the feet are
// planted by construction and the crouch depth follows the source. plantRaisedFoot: the
// trailing foot of that one-knee landing hangs up to 0.13 m high, so it is lowered to the
// stance foot with a two-bone IK on the leg (scripts/lib/plant-feet.mjs). The source Hard
// Landing frame 0 is still airborne (feet 0.4 m up), frame 60 repeats frame 0 and frame 59
// already starts the wrap back, so frames 2 to 58 are kept: touchdown, crouch, rise.
// plantHips: only the vertical Hips translation, derived the same way. The Falling Idle pose
// has bent legs: with the Hips stuck at standing height its feet hang 0.4 m above the capsule
// bottom, so every touchdown would start with the feet 0.4 m in the air.
// leanMean: the mean forward pitch (degrees from vertical, Hips to Head) the torso should have over
// the clip. The Hips tracks are stripped, so the pelvis pitch the source authored (walk about +2, run
// about +10 degrees) is lost and the chest ends up behind vertical (walk -6, run -1, idle -1 measured
// in the game, TASK-003). The script solves a constant forward pitch on Spine, Spine1 and Spine2 that
// hits the target; the legs are untouched, so the feet stay planted. Targets: run 7 (the Mixamo run
// itself leans 10 to 16 degrees), walk 3.3 (the Mixamo walk is near upright), idle 2.2 (a relaxed stand).
// headMean: the mean forward tilt of the Head bone; the Neck and Head are counter-pitched so the gaze
// stays level instead of dropping with the chest (the old Hips-free run threw the head back 18 degrees).
const CLIPS = {
  idle: { file: "Idle.fbx", loop: true, resample: 0.0005, leanMean: 2.2, headMean: 0 },
  walk: { file: "Walking.fbx", loop: true, leanMean: 3.3, headMean: 0 },
  run: { file: "Running.fbx", loop: true, leanMean: 7, headMean: -2 },
  jump: { file: "Jump.fbx", frames: [21, 39] },
  fall: { file: "Falling Idle.fbx", loop: true, plantHips: true },
  land: { file: "Hard Landing.fbx", frames: [2, 58], groundHips: true, plantRaisedFoot: true },
};
const MIN_CHANNELS = 40;
const MAX_BYTES = 100 * 1024;
const stripPrefix = (n) => n.replace(/^mixamorig:?/, "");

const io = new NodeIO();
const avatarDoc = await io.read(AVATAR);
const rig = buildAvatarRig(readFileSync(AVATAR));
const avatarRest = { hips: rig.height("Hips"), foot: rig.height("LeftFoot") };
const hipsRest = rig.bone("Hips").position.toArray();
const avatarRestLow = rig.lowestFoot();
const jointNames = new Set();
for (const skin of avatarDoc.getRoot().listSkins()) {
  for (const j of skin.listJoints()) jointNames.add(j.getName());
}
if (jointNames.size < 40) throw new Error(`avatar joint list too small: ${jointNames.size}`);

mkdirSync(OUT, { recursive: true });
let failed = false;

for (const [name, opt] of Object.entries(CLIPS)) {
  const src = resolve(SRC, opt.file);
  if (!existsSync(src)) {
    console.log(`skip ${name}: no source at assets-src/mixamo/${opt.file}`);
    continue;
  }
  const buf = readFileSync(src);
  const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  const clip = fbx.animations.find((a) => a.tracks.length > 0);
  if (!clip) throw new Error(`${name}: no animation in ${opt.file}`);

  // Source Hips travel per frame (Hips included), relative to the standing rest pose, in avatar
  // metres (scaled by the hips-to-foot height ratio, as measure-clips.mjs does).
  let srcHipsTravel = null;
  if (opt.groundHips) {
    fbx.updateMatrixWorld(true);
    const wy = (n) => new THREE.Vector3().setFromMatrixPosition(fbx.getObjectByName(`mixamorig${n}`).matrixWorld).y;
    const scale = (avatarRest.hips - avatarRest.foot) / (wy("Hips") - wy("LeftFoot"));
    const hipsAt = () => new THREE.Vector3().setFromMatrixPosition(fbx.getObjectByName("mixamorigHips").matrixWorld);
    const restHips = hipsAt();
    const mixer = new THREE.AnimationMixer(fbx);
    mixer.clipAction(clip).play();
    srcHipsTravel = new Map();
    for (let f = 0; f <= Math.round(clip.duration * FPS); f++) {
      mixer.setTime(f / FPS);
      fbx.updateMatrixWorld(true);
      srcHipsTravel.set(f, hipsAt().sub(restHips).multiplyScalar(scale));
    }
  }

  const dropped = { path: 0, hips: 0, missing: 0 };
  const kept = [];
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf(".");
    const node = stripPrefix(t.name.slice(0, dot));
    if (t.name.slice(dot + 1) !== "quaternion") dropped.path++;
    else if (node === "Hips" && !opt.groundHips) dropped.hips++;
    else if (!jointNames.has(node)) dropped.missing++;
    else kept.push({ node, times: Array.from(t.times), values: Array.from(t.values) });
  }

  if (opt.frames) {
    const [f0, f1] = opt.frames;
    for (const k of kept) {
      if (k.times.length === 1) continue; // a constant track keeps its single key
      const idx = k.times.map((t, i) => [Math.round(t * FPS), i]).filter(([f]) => f >= f0 && f <= f1);
      if (idx.length === 0) throw new Error(`${name}: ${k.node} has no keys in frames ${f0}-${f1}`);
      k.values = idx.flatMap(([, i]) => k.values.slice(4 * i, 4 * i + 4));
      k.times = idx.map(([f]) => (f - f0) / FPS);
    }
  }

  // Trim only when every kept track really ends on its first value.
  let worst = 1;
  for (const k of kept) {
    const n = k.times.length;
    let d = 0;
    for (let c = 0; c < 4; c++) d += k.values[c] * k.values[(n - 1) * 4 + c];
    worst = Math.min(worst, Math.abs(d)); // quaternion dot, sign-insensitive
  }
  const closes = worst > 0.999;
  if (opt.loop && !closes) console.log(`${name}: last key differs from first, not trimmed (worst dot ${worst.toFixed(5)})`);
  if (opt.loop && closes) {
    for (const k of kept) {
      if (k.times.length < 3) continue; // a constant track keeps its single key
      k.times = k.times.slice(0, -1).map((x) => x + 1 / FPS);
      k.values = k.values.slice(0, -4);
    }
  }

  if (opt.leanMean !== undefined) {
    const r = solveLean(rig, name, kept, opt.leanMean, opt.headMean);
    const leaned = withLean(kept, r.deg, r.gaze);
    kept.forEach((k, i) => (k.values = leaned[i].values));
    const f = (v) => v.toFixed(2);
    console.log(
      `${name}: forward lean ${r.deg.toFixed(2)} degrees on the spine, ${r.gaze.toFixed(2)} on neck and head (head tilt mean ${r.headBefore.mean.toFixed(1)} -> ${r.headStats.mean.toFixed(1)}); torso pitch ${f(r.before.min)}/${f(r.before.mean)}/${f(r.before.max)} -> ${f(r.stats.min)}/${f(r.stats.mean)}/${f(r.stats.max)} (min/mean/max)`
    );
  }

  // Vertical Hips offset dy: moving the Hips by dy lifts the whole posed avatar by dy, so
  // dy = (rest-stance foot height + source rise) - (lowest foot with the Hips at rest).
  let hipsTrack = null;
  if (opt.groundHips || opt.plantHips) {
    const [f0] = opt.frames ?? [0];
    if (opt.plantRaisedFoot) {
      // Pose every key, lower a raised foot with a leg IK solve, write the leg rotations back.
      const legBones = ["Left", "Right"].flatMap((s) => [`${s}UpLeg`, `${s}Leg`, `${s}Foot`]);
      const longest = kept.reduce((a, k) => (k.times.length > a.times.length ? k : a));
      const trackOf = Object.fromEntries(legBones.map((n) => [n, kept.find((k) => k.node === n)]));
      for (const n of legBones) if (trackOf[n].times.length !== longest.times.length) throw new Error(`${name}: ${n} is not keyed on every frame`);
      const poseClip = new THREE.AnimationClip(
        name,
        -1,
        kept.map((k) => new THREE.QuaternionKeyframeTrack(`${k.node}.quaternion`, k.times, k.values))
      );
      const m0 = new THREE.AnimationMixer(rig.root);
      m0.clipAction(poseClip).play();
      let movedFrames = 0;
      let maxDrop = 0;
      for (let i = 0; i < longest.times.length; i++) {
        m0.setTime(longest.times[i]);
        const r = plantRaisedFeet(rig);
        if (r.moved) movedFrames++;
        maxDrop = Math.max(maxDrop, r.maxDrop);
        for (const n of legBones) rig.bone(n).quaternion.toArray(trackOf[n].values, i * 4);
      }
      m0.stopAllAction();
      m0.uncacheRoot(rig.root);
      console.log(`${name}: raised foot lowered on ${movedFrames} of ${longest.times.length} frames, largest drop ${maxDrop.toFixed(3)} m`);
    }
    const rotClip = new THREE.AnimationClip(
      name,
      -1,
      kept.map((k) => new THREE.QuaternionKeyframeTrack(`${k.node}.quaternion`, k.times, k.values))
    );
    const mixer = new THREE.AnimationMixer(rig.root);
    mixer.clipAction(rotClip).play();
    const times = [];
    const values = [];
    const dys = [];
    const srcYs = [];
    const longest = kept.reduce((a, k) => (k.times.length > a.times.length ? k : a));
    for (const t of longest.times) {
      mixer.setTime(t);
      const f = f0 + Math.round(t * FPS);
      const dy = avatarRestLow - rig.lowestFoot();
      times.push(t);
      const travel = srcHipsTravel ? srcHipsTravel.get(f) : { x: 0, y: 0, z: 0 };
      values.push(hipsRest[0] + travel.x, hipsRest[1] + dy, hipsRest[2] + travel.z);
      dys.push(dy);
      srcYs.push(travel.y);
    }
    // Evidence line: derived pelvis height versus the source pelvis height (avatar metres).
    if (process.env.DEBUG_HIPS) console.log(dys.map((d, i) => `${i}:${(hipsRest[1] + d).toFixed(2)}/${(hipsRest[1] + srcYs[i]).toFixed(2)}`).join(" "));
    const maxDiff = opt.plantHips ? 0 : Math.max(...dys.map((d, i) => Math.abs(hipsRest[1] + d - (hipsRest[1] + srcYs[i]))));
    console.log(`${name}: Hips height min ${Math.min(...values.filter((_, i) => i % 3 === 1)).toFixed(3)} m, max difference to the source pelvis height ${opt.plantHips ? "n/a (planted)" : maxDiff.toFixed(3) + " m"}`);
    hipsTrack = { times, values };
  }

  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("clip");
  const anim = doc.createAnimation(name);
  for (const k of kept) {
    const node = doc.createNode(k.node);
    scene.addChild(node);
    const input = doc.createAccessor().setType(Accessor.Type.SCALAR).setArray(new Float32Array(k.times)).setBuffer(buffer);
    const output = doc.createAccessor().setType(Accessor.Type.VEC4).setArray(new Float32Array(k.values)).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
    const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath("rotation").setSampler(sampler);
    anim.addSampler(sampler).addChannel(channel);
  }
  if (hipsTrack) {
    // Reuse the Hips node that carries the rotation channel: node names must stay unique.
    let node = scene.listChildren().find((n) => n.getName() === "Hips");
    if (!node) {
      node = doc.createNode("Hips");
      scene.addChild(node);
    }
    const input = doc.createAccessor().setType(Accessor.Type.SCALAR).setArray(new Float32Array(hipsTrack.times)).setBuffer(buffer);
    const output = doc.createAccessor().setType(Accessor.Type.VEC3).setArray(new Float32Array(hipsTrack.values)).setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation("LINEAR");
    const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath("translation").setSampler(sampler);
    anim.addSampler(sampler).addChannel(channel);
  }
  if (opt.resample) await doc.transform(resample({ tolerance: opt.resample }));
  await doc.transform(dedup());

  const dst = resolve(OUT, `${name}.glb`);
  await io.write(dst, doc);
  const bytes = statSync(dst).size;
  const dur = Math.max(...doc.getRoot().listAccessors().filter((a) => a.getType() === "SCALAR").map((a) => a.getMax([])[0]));
  console.log(`${name}: ${bytes} B, ${kept.length} rotation channels, duration ${dur.toFixed(4)} s, dropped ${JSON.stringify(dropped)}`);
  if (kept.length < MIN_CHANNELS) {
    console.error(`${name}: fewer than ${MIN_CHANNELS} channels kept`);
    failed = true;
  }
  if (bytes > MAX_BYTES) {
    console.error(`${name}: over 100 KB`);
    failed = true;
  }
}
if (failed) process.exit(1);
