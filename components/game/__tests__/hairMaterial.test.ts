import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HAIR_ALPHA_CUTOFF, setGameHair } from "../hairMaterial";

// The glTF loader leaves blended materials with depthWrite off; the game turns it on for the hair
// cards (no pale layered halo) and the hero gets the loader's state back.
function avatar() {
  const make = (name: string, blend: boolean) => {
    const m = new THREE.MeshStandardMaterial({ name, transparent: blend });
    m.depthWrite = !blend;
    return new THREE.Mesh(new THREE.BufferGeometry(), m);
  };
  const root = new THREE.Group();
  const hair = make("avaturn_hair_0_material", true);
  const lash = make("Eyelash", true);
  const body = make("Body", false);
  root.add(hair, lash, body);
  return { root, hair: hair.material as THREE.MeshStandardMaterial, lash: lash.material as THREE.MeshStandardMaterial, body: body.material as THREE.MeshStandardMaterial };
}

describe("setGameHair", () => {
  it("writes depth for the hair cards only, with a small alpha cutoff", () => {
    const { root, hair, lash, body } = avatar();
    setGameHair(root);
    expect(hair.depthWrite).toBe(true);
    expect(hair.alphaTest).toBe(HAIR_ALPHA_CUTOFF);
    expect(hair.transparent).toBe(true);
    expect(lash.depthWrite).toBe(false);
    expect(lash.alphaTest).toBe(0);
    expect(body.depthWrite).toBe(true);
    expect(body.alphaTest).toBe(0);
  });

  it("restores the loader state for the hero, and can be applied again", () => {
    const { root, hair } = avatar();
    const restore = setGameHair(root);
    restore();
    expect(hair.depthWrite).toBe(false);
    expect(hair.alphaTest).toBe(0);
    setGameHair(root)();
    expect(hair.depthWrite).toBe(false);
  });

  it("is a no-op for a scene without blended hair", () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ name: "Body" })));
    expect(() => setGameHair(root)()).not.toThrow();
  });
});
