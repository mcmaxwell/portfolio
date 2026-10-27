// One-off asset diet for the hero, already applied to the files in public/. Re-run it
// (`node scripts/optimize-assets.mjs`) only on fresh source exports: it re-encodes in place.
//
// - public/animations/*.glb: the gesture clips were full Mixamo exports, each carrying the Mixamo
//   character mesh (~1.6 MB) that the site never renders: Avatar.tsx and the game only read
//   gltf.animations[0]. Meshes, skins and materials are dropped and the keys resampled; the
//   animation channels and the bone nodes they target stay as they were.
// - public/avatar.glb: the 72 face morph targets are mostly (near) zeros, so they are stored as
//   sparse accessors (read natively by GLTFLoader), and textures are re-encoded as WebP
//   (EXT_texture_webp, also native). Nodes and the skeleton are untouched, so the rig tests and
//   scripts that read the bind pose see the same file.
// - public/proj-*.png: case-study screenshots re-encoded as WebP (data/index.ts points at the .webp).
import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { EXTTextureWebP } from "@gltf-transform/extensions";
import { dedup, prune, resample, sparse, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const io = new NodeIO().registerExtensions([EXTTextureWebP]).registerDependencies({ sharp });
const kb = (f) => `${(statSync(f).size / 1024).toFixed(0)} KB`;

async function clips() {
  const dir = join(pub, "animations");
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".glb"))) {
    const file = join(dir, name);
    const before = kb(file);
    const doc = await io.read(file);
    const r = doc.getRoot();
    for (const node of r.listNodes()) {
      node.setMesh(null);
      node.setSkin(null);
    }
    r.listMeshes().forEach((m) => m.dispose());
    r.listSkins().forEach((s) => s.dispose());
    await doc.transform(resample(), prune({ keepLeaves: true }), dedup());
    await io.write(file, doc);
    console.log(`animations/${name}: ${before} -> ${kb(file)}`);
  }
}

async function avatar() {
  const file = join(pub, "avatar.glb");
  const before = kb(file);
  const doc = await io.read(file);
  // Morph deltas under 0.3 mm (normals: 0.003) are noise from the export; zeroing them lets the
  // sparse pass skip about three quarters of the morph data.
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const target of prim.listTargets()) {
        for (const semantic of target.listSemantics()) {
          const eps = semantic === "POSITION" ? 3e-4 : 3e-3;
          const arr = target.getAttribute(semantic).getArray();
          for (let i = 0; i < arr.length; i += 3) {
            if (Math.abs(arr[i]) + Math.abs(arr[i + 1]) + Math.abs(arr[i + 2]) < eps) {
              arr[i] = arr[i + 1] = arr[i + 2] = 0;
            }
          }
        }
      }
    }
  }
  await doc.transform(
    sparse({ ratio: 1 / 2 }),
    textureCompress({ encoder: sharp, targetFormat: "webp", quality: 88 }),
    prune({ keepLeaves: true }),
  );
  await io.write(file, doc);
  console.log(`avatar.glb: ${before} -> ${kb(file)}`);
}

async function screenshots() {
  for (const name of readdirSync(pub).filter((f) => /^proj-.*\.png$/.test(f))) {
    const out = join(pub, name.replace(/\.png$/, ".webp"));
    await sharp(join(pub, name)).webp({ quality: 82 }).toFile(out);
    console.log(`${name} -> ${kb(out)}`);
  }
}

await clips();
await avatar();
await screenshots();
