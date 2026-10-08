// Geometry helpers shared by the follow camera tests (oriented layout blocks).
import * as THREE from "three";
import { blockQuaternion, type Block } from "../world/layout";

/** Signed distance from a point to a block's oriented box: negative inside, positive outside. */
export function signedDistance(b: Block, p: THREE.Vector3): number {
  const q = blockQuaternion(b);
  const local = p
    .clone()
    .sub(new THREE.Vector3(b.center.x, b.center.y, b.center.z))
    .applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w).invert());
  const d = new THREE.Vector3(Math.abs(local.x) - b.size.x / 2, Math.abs(local.y) - b.size.y / 2, Math.abs(local.z) - b.size.z / 2);
  const outside = new THREE.Vector3(Math.max(d.x, 0), Math.max(d.y, 0), Math.max(d.z, 0)).length();
  return outside + Math.min(Math.max(d.x, d.y, d.z), 0);
}

/** Segment a-b against an oriented block (slab method in the block's frame): true if it crosses the solid. */
export function segmentHitsBlock(b: Block, a: THREE.Vector3, c: THREE.Vector3): boolean {
  const q = blockQuaternion(b);
  const inv = new THREE.Quaternion(q.x, q.y, q.z, q.w).invert();
  const centre = new THREE.Vector3(b.center.x, b.center.y, b.center.z);
  const la = a.clone().sub(centre).applyQuaternion(inv);
  const lc = c.clone().sub(centre).applyQuaternion(inv);
  const d = lc.clone().sub(la);
  const half = [b.size.x / 2, b.size.y / 2, b.size.z / 2];
  let t0 = 0;
  let t1 = 1;
  const o = [la.x, la.y, la.z];
  const dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-12) {
      if (Math.abs(o[i]) >= half[i]) return false;
      continue;
    }
    let ta = (-half[i] - o[i]) / dd[i];
    let tb = (half[i] - o[i]) / dd[i];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 >= t1 - 1e-9) return false;
  }
  return t1 - t0 > 1e-6;
}

