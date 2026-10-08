// The avatar's hair material state while the game shows it (the hero shares the material).
import * as THREE from "three";

/** Alpha cutoff for the hair cards: only texels that are effectively empty are dropped, the soft edge stays. */
export const HAIR_ALPHA_CUTOFF = 0.04;

/**
 * The avatar's hair is a stack of overlapping alpha-blended cards that the glTF loader leaves with
 * `depthWrite` off. Without depth writes the cards are drawn in index order, so a card behind
 * repaints the front one and, seen from above, the outer layer shows as a pale grey halo around
 * the hair. Writing depth makes the nearest card win; the small cutoff keeps empty texels from
 * writing depth. Returns the restore for the hero, which shares the material.
 */
export function setGameHair(scene: THREE.Object3D): () => void {
  const saved: Array<[THREE.Material, boolean, number]> = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!/hair/i.test(m.name) || !m.transparent || m.depthWrite || saved.some(([s]) => s === m)) continue;
      saved.push([m, m.depthWrite, m.alphaTest]);
      m.depthWrite = true;
      m.alphaTest = HAIR_ALPHA_CUTOFF;
      m.needsUpdate = true;
    }
  });
  return () => {
    for (const [m, depthWrite, alphaTest] of saved) {
      m.depthWrite = depthWrite;
      m.alphaTest = alphaTest;
      m.needsUpdate = true;
    }
  };
}
