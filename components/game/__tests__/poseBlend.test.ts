import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { captureBones, createPoseBlend } from "../poseBlend";

function rig() {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  const head = new THREE.Bone();
  hips.add(head);
  root.add(hips);
  const notBone = new THREE.Mesh();
  root.add(notBone);
  return { root, hips, head };
}
const q = (deg: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);

describe("pose blend", () => {
  it("captures only bones, as they are", () => {
    const { root, hips, head } = rig();
    head.quaternion.copy(q(30));
    hips.position.set(0, 0.97, 0);
    const c = captureBones(root);
    expect(c.map((s) => s.bone)).toEqual([hips, head]);
    head.quaternion.copy(q(0));
    expect(c[1].quaternion.angleTo(q(30))).toBeLessThan(1e-9); // a copy, not a reference
  });

  it("frame zero is the hero pose, the end is the mixer pose, the middle is in between and never overshoots", () => {
    const { root, hips, head } = rig();
    head.quaternion.copy(q(40)); // hero: head turned toward the pointer
    hips.position.set(0, 1.0, 0);
    const blend = createPoseBlend(captureBones(root), 0.4);
    const mixerHead = q(0);
    const mixerHipsY = 0.95;
    let last = Infinity;
    const angleToMixer: number[] = [];
    for (let i = 0; i <= 30; i++) {
      head.quaternion.copy(mixerHead); // the mixer writes its pose every frame
      hips.position.set(0, mixerHipsY, 0);
      blend.apply(i === 0 ? 0 : 1 / 60);
      const a = head.quaternion.angleTo(mixerHead);
      angleToMixer.push(a);
      expect(a).toBeLessThanOrEqual(last + 1e-9);
      last = a;
    }
    expect(angleToMixer[0]).toBeCloseTo((40 * Math.PI) / 180, 6); // first frame equals the hero pose
    expect(angleToMixer[angleToMixer.length - 1]).toBeLessThan(1e-9);
    expect(blend.done).toBe(true);
    expect(hips.position.y).toBeCloseTo(mixerHipsY, 9);
  });

  it("after it is done it leaves the skeleton alone", () => {
    const { root, head } = rig();
    head.quaternion.copy(q(40));
    const blend = createPoseBlend(captureBones(root), 0.1);
    head.quaternion.copy(q(0));
    for (let i = 0; i < 20; i++) blend.apply(1 / 60);
    expect(blend.done).toBe(true);
    head.quaternion.copy(q(10));
    expect(blend.apply(1 / 60)).toBe(false);
    expect(head.quaternion.angleTo(q(10))).toBeLessThan(1e-12);
  });

  it("an empty skeleton or a zero duration is done at once", () => {
    expect(createPoseBlend([], 0.4).done).toBe(true);
    const { root } = rig();
    expect(createPoseBlend(captureBones(root), 0).done).toBe(true);
  });
});
