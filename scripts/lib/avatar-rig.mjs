// The avatar skeleton as a plain three.js bone tree, read from the GLB JSON chunk only (no
// textures, no mesh data, so it works in Node and in tests). Used by the clip stripper to
// derive the land clip's Hips height and by the stance tests to evaluate clips on the rig.
import { readFileSync } from "node:fs";
import * as THREE from "three";

/** Bones whose lowest world height stands for "the feet" (ankle and toe joints). */
export const FOOT_BONES = ["LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"];

/** @param {Buffer} buf contents of a GLB file */
export function buildAvatarRig(buf) {
  if (buf.toString("utf8", 0, 4) !== "glTF") throw new Error("not a GLB file");
  const json = JSON.parse(buf.toString("utf8", 20, 20 + buf.readUInt32LE(12)));
  const joints = new Set(json.skins[0].joints);
  const objs = json.nodes.map((n, i) => {
    const o = joints.has(i) ? new THREE.Bone() : new THREE.Object3D();
    o.name = n.name ?? "";
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => objs[i].add(objs[c])));
  const root = objs[json.scenes[0].nodes[0]];
  root.updateMatrixWorld(true);
  const tmp = new THREE.Vector3();
  const bone = (name) => {
    const b = root.getObjectByName(name);
    if (!b) throw new Error(`avatar has no bone ${name}`);
    return b;
  };
  return {
    root,
    bone,
    /** World height (m) of a bone; call root.updateMatrixWorld(true) after posing. */
    height: (name) => bone(name).getWorldPosition(tmp).y,
    /** Lowest world height over FOOT_BONES (the rig's feet stand on y = 0 plus the bone offset). */
    lowestFoot() {
      root.updateMatrixWorld(true);
      return Math.min(...FOOT_BONES.map((n) => bone(n).getWorldPosition(tmp).y));
    },
  };
}

export function readAvatarRig(path) {
  return buildAvatarRig(readFileSync(path));
}
