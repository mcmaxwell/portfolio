// Offline ground-speed and loop-period measurement of the Mixamo source clips.
// Usage: node scripts/measure-clips.mjs
// Poses the FBX skeleton with the same filter the game applies (rotation only, no Hips
// translation, no Hips rotation), then follows the stance foot (the lower of the two
// feet) along the travel axis: ground speed = how fast the stance foot slides backward
// relative to the pelvis. It is also compared with the Hips root motion of the source.
// Speeds are scaled to the avatar by the pelvis-to-foot height ratio.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = { walk: "Walking.fbx", run: "Running.fbx" };
const FPS = 30;
const CONTACT_BAND = 0.03; // m above the lowest foot height that still counts as ground contact

const avatar = await new NodeIO().read(resolve(root, "public/avatar.glb"));
const byName = (n) => avatar.getRoot().listNodes().find((x) => x.getName() === n);
const avHips = byName("Hips").getWorldTranslation();
const avFoot = byName("LeftFoot").getWorldTranslation();
const avatarHeight = avHips[1] - avFoot[1];

function load(file) {
  const buf = readFileSync(resolve(root, "assets-src/mixamo", file));
  const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  return fbx;
}

for (const [name, file] of Object.entries(FILES)) {
  const fbx = load(file);
  fbx.updateMatrixWorld(true);
  const bone = (n) => fbx.getObjectByName(`mixamorig${n}`);
  const hips = bone("Hips");
  const hipsRest = new THREE.Vector3().setFromMatrixPosition(hips.matrixWorld);
  const footRest = new THREE.Vector3().setFromMatrixPosition(bone("LeftFoot").matrixWorld);
  const scale = avatarHeight / (hipsRest.y - footRest.y); // avatar metres per source unit

  const clip = fbx.animations[0];
  const keep = new THREE.AnimationClip(
    name,
    clip.duration,
    clip.tracks.filter((t) => t.name.endsWith(".quaternion") && !t.name.includes("Hips."))
  );
  const mixer = new THREE.AnimationMixer(fbx);
  mixer.clipAction(keep).play();
  const n = Math.round(clip.duration * FPS); // frames in the cycle (last key repeats the first)
  const sample = [];
  for (let f = 0; f <= n; f++) {
    mixer.setTime(f / FPS);
    fbx.updateMatrixWorld(true);
    const l = new THREE.Vector3().setFromMatrixPosition(bone("LeftFoot").matrixWorld);
    const r = new THREE.Vector3().setFromMatrixPosition(bone("RightFoot").matrixWorld);
    const stance = l.y <= r.y ? l : r;
    sample.push({ z: stance.z, x: stance.x, y: stance.y, left: l.y <= r.y });
  }
  // Backward slide of the stance foot between frames, only while the stance foot is the
  // same foot (a foot swap would add a jump).
  // The stance foot is planted only part of the cycle (a run has a flight phase), so the
  // mean over all frames underestimates. Take the frames where the stance foot is within
  // CONTACT_BAND of the lowest foot height of the cycle and use their median slide speed.
  const minY = Math.min(...sample.map((s) => s.y));
  const slides = [];
  let slide = 0;
  let sideways = 0;
  let used = 0;
  for (let f = 1; f <= n; f++) {
    if (sample[f].left !== sample[f - 1].left) continue;
    if (sample[f].y > minY + CONTACT_BAND / scale || sample[f - 1].y > minY + CONTACT_BAND / scale) continue;
    const d = sample[f - 1].z - sample[f].z;
    slides.push(d);
    slide += d;
    sideways += sample[f - 1].x - sample[f].x;
    used++;
  }
  slides.sort((a, b) => a - b);
  const footSpeed = slides[Math.floor(slides.length / 2)] * FPS * scale;
  const hipsPos = clip.tracks.find((t) => t.name === "mixamorigHips.position");
  const k = hipsPos.times.length - 1;
  const dz = hipsPos.values[3 * k + 2] - hipsPos.values[2];
  const dx = hipsPos.values[3 * k] - hipsPos.values[0];
  const rootSpeed = (Math.hypot(dx, dz) / clip.duration) * scale;
  const heading = (Math.atan2(dx, dz) * 180) / Math.PI;
  console.log(
    `${name}: loop period ${clip.duration.toFixed(4)} s (${n} frames), ` +
      `foot-contact ground speed ${footSpeed.toFixed(3)} m/s (median of ${used}/${n} contact frames), ` +
      `Hips root-motion speed ${rootSpeed.toFixed(3)} m/s, root heading ${heading.toFixed(1)} deg off +Z, ` +
      `stance-foot sideways drift ${((sideways / Math.max(slide, 1e-9)) * 100).toFixed(1)}% of slide, ` +
      `rest pelvis ${hipsRest.y.toFixed(1)} and foot ${footRest.y.toFixed(1)} source units, scale ${scale.toFixed(5)} (avatar pelvis-to-foot ${avatarHeight.toFixed(3)} m)`
  );
}
