import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("avatar source", () => {
  it("takes the compressed model where WebAssembly runs, the plain one after a failure", async () => {
    const m = await import("./avatarSource");
    expect(m.avatarUrl()).toBe(m.AVATAR_COMPRESSED);
    expect(m.usesMeshopt(m.avatarUrl())).toBe(true);
    m.markMeshoptBroken();
    expect(m.avatarUrl()).toBe("/avatar.glb");
    expect(m.usesMeshopt("/avatar.glb")).toBe(false);
  });

  it("takes the plain model without WebAssembly", async () => {
    vi.stubGlobal("WebAssembly", undefined);
    const m = await import("./avatarSource");
    expect(m.avatarUrl()).toBe("/avatar.glb");
  });

  it("lets NEXT_PUBLIC_AVATAR_URL win", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_URL", "/custom.glb");
    const m = await import("./avatarSource");
    expect(m.avatarUrl()).toBe("/custom.glb");
  });
});

describe("bind pose reset", () => {
  it("puts the bones back as loaded, where Skeleton.pose() would bake a mesh's dequantization in", async () => {
    const THREE = await import("three");
    const { captureRest, resetToRest } = await import("./avatarSource");
    const scene = new THREE.Group();
    const hips = new THREE.Bone();
    const spine = new THREE.Bone();
    hips.position.set(0, 1, 0);
    spine.position.set(0, 0.2, 0);
    hips.add(spine);
    scene.add(hips);
    scene.updateMatrixWorld(true);
    // As in the compressed file: the inverse bind matrices also carry the quantized mesh's scale.
    const dequant = new THREE.Matrix4().makeScale(0.5, 0.5, 0.5);
    const inverses = [hips, spine].map((b) => b.matrixWorld.clone().invert().multiply(dequant));
    const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    mesh.bind(new THREE.Skeleton([hips, spine], inverses), new THREE.Matrix4());
    scene.add(mesh);
    captureRest(scene);

    hips.position.y = 0.4;
    spine.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1);
    resetToRest(scene);
    expect(hips.position.toArray()).toEqual([0, 1, 0]);
    expect(spine.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0);
    expect(hips.scale.toArray()).toEqual([1, 1, 1]);

    mesh.skeleton.pose();
    expect(hips.scale.x).toBeCloseTo(2);
  });
});
