// Offline leg fix for the land clip: lowers a raised foot onto the ground plane with a
// two-bone IK solve on the thigh and shin (hip and knee rotations), keeping the foot's world
// orientation. The Mixamo Hard Landing is a one-knee "superhero" landing whose trailing toe
// hangs up to 0.13 m above the ground; the acceptance rule for the game is that both feet
// stay within 0.05 m, so the trailing foot is brought down to the stance foot's height.
// The hip joint stays where the animation puts it, so the knee takes up the difference.
import * as THREE from "three";

const SIDES = ["Left", "Right"];
const wp = (o) => o.getWorldPosition(new THREE.Vector3());
const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());

/** Local quaternion that gives `bone` the world quaternion `q` under its current parent. */
function setWorldQuaternion(bone, q) {
  const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parentQ.invert().multiply(q));
  bone.updateMatrixWorld(true);
}

/** Rotates `bone` so that the direction bone -> child, currently `from`, points along `to`. */
function aim(bone, from, to) {
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  setWorldQuaternion(bone, delta.multiply(wq(bone)));
}

/**
 * Lowers each raised foot of the rig's current pose so its toe joint sits `slack` above the
 * lower toe joint. Returns the number of feet that were moved and the largest drop (m).
 * Writes the new local quaternions into the UpLeg, Leg and Foot bones of `rig`.
 */
export function plantRaisedFeet(rig, slack = 0.005) {
  rig.root.updateMatrixWorld(true);
  const toeY = Object.fromEntries(SIDES.map((s) => [s, rig.height(`${s}ToeBase`)]));
  const floor = Math.min(toeY.Left, toeY.Right);
  let moved = 0;
  let maxDrop = 0;
  for (const side of SIDES) {
    const drop = toeY[side] - floor - slack;
    if (drop <= 1e-4) continue;
    const up = rig.bone(`${side}UpLeg`);
    const knee = rig.bone(`${side}Leg`);
    const foot = rig.bone(`${side}Foot`);
    const footQ = wq(foot);
    const H = wp(up);
    const K = wp(knee);
    const A = wp(foot);
    const L1 = H.distanceTo(K);
    const L2 = K.distanceTo(A);
    const target = A.clone().setY(A.y - drop);
    const toTarget = target.clone().sub(H);
    const d = Math.min(Math.max(toTarget.length(), Math.abs(L1 - L2) + 1e-4), L1 + L2 - 1e-4);
    const u = toTarget.normalize();
    // Keep the knee on the side it is on now (pole = current knee direction off the hip-ankle axis).
    const hk = K.clone().sub(H);
    const pole = hk.clone().sub(u.clone().multiplyScalar(hk.dot(u)));
    if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1);
    pole.normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(L1 * L1 - a * a, 0));
    const K2 = H.clone().add(u.clone().multiplyScalar(a)).add(pole.multiplyScalar(h));
    const A2 = H.clone().add(u.clone().multiplyScalar(d));

    aim(up, hk.clone().normalize(), K2.clone().sub(H).normalize());
    const kNow = wp(knee);
    const aNow = wp(foot);
    aim(knee, aNow.clone().sub(kNow).normalize(), A2.clone().sub(kNow).normalize());
    setWorldQuaternion(foot, footQ);
    moved++;
    maxDrop = Math.max(maxDrop, drop);
  }
  return { moved, maxDrop };
}
