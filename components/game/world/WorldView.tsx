"use client";

// World visuals built from the layout data (design 2.8). One shared box geometry,
// shared materials, created once per mount and disposed on unmount.
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { QualityPreset } from "../config";
import { blockQuaternion, type Block, type Layout } from "./layout";

const COLORS: Record<Block["material"], string> = {
  ground: "#16271d",
  path: "#24402f",
  stone: "#43524b",
  metal: "#5b6c72",
  "accent-green": "#2fe58a",
  "accent-cyan": "#35d0e8",
};

/** A 2 x 2 texel checker; with RepeatWrapping each texel pair is one metre. */
function checkerTexture(): THREE.DataTexture {
  const data = new Uint8Array([
    255, 255, 255, 255, 190, 190, 190, 255,
    190, 190, 190, 255, 255, 255, 255, 255,
  ]);
  const t = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function WorldView({ layout, quality }: { layout: Layout; quality: QualityPreset }) {
  const { scene } = useThree();

  const resources = useMemo(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const checker = checkerTexture();
    const shared = new Map<Block["material"], THREE.MeshStandardMaterial>();
    const textures: THREE.Texture[] = [checker];
    const materials: THREE.Material[] = [];
    const materialFor = (b: Block): THREE.MeshStandardMaterial => {
      if (b.kind === "ground") {
        // Ground blocks get their own texture clone so the repeat matches the block size.
        const map = checker.clone();
        map.needsUpdate = true;
        map.repeat.set(b.size.x / 2, b.size.z / 2);
        textures.push(map);
        const m = new THREE.MeshStandardMaterial({ color: COLORS[b.material], map, roughness: 1 });
        materials.push(m);
        return m;
      }
      let m = shared.get(b.material);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color: COLORS[b.material], roughness: 0.85, metalness: b.material === "metal" ? 0.3 : 0 });
        shared.set(b.material, m);
        materials.push(m);
      }
      return m;
    };
    const items = layout.blocks.map((b) => ({ block: b, material: materialFor(b), q: blockQuaternion(b) }));
    return { geometry, items, textures, materials };
  }, [layout]);

  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.materials.forEach((m) => m.dispose());
      resources.textures.forEach((t) => t.dispose());
    },
    [resources]
  );

  // Background and fog belong to the game while it is mounted.
  useEffect(() => {
    const prevBackground = scene.background;
    const prevFog = scene.fog;
    scene.background = new THREE.Color("#05080a");
    scene.fog = new THREE.Fog("#05080a", 22, 60);
    return () => {
      scene.background = prevBackground;
      scene.fog = prevFog;
    };
  }, [scene]);

  return (
    <group>
      <ambientLight intensity={0.8} />
      <hemisphereLight args={[0xffffff, 0x1a2a1f, 0.6]} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.5}
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMapSize || 1, quality.shadowMapSize || 1]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      {resources.items.map(({ block, material, q }) => (
        <mesh
          key={block.id}
          geometry={resources.geometry}
          material={material}
          position={[block.center.x, block.center.y, block.center.z]}
          quaternion={[q.x, q.y, q.z, q.w]}
          scale={[block.size.x, block.size.y, block.size.z]}
          castShadow={quality.shadows && block.kind !== "ground"}
          receiveShadow={quality.shadows}
        />
      ))}
    </group>
  );
}
