// Shrinks the GLBs the hero downloads on first paint, without any glTF extension (so three's
// GLTFLoader needs no decoder and the scripts' plain NodeIO still reads them). Idempotent.
//
//   npm run optimize-glb
//
// - public/avatar.glb: the Avaturn export carries 72 ARKit/viseme morph targets on the head (with
//   normals), about 9 MB of the 13 MB file. The hero lip sync drives only MOUTH_MORPHS (Avatar.tsx)
//   and the game none, so the other targets are dropped and the rest stored as sparse accessors.
//   Run after scripts/bake-avatar-look.mjs. Keep MOUTH_MORPHS in step with Avatar.tsx.
// - public/animations/*.glb: the gesture downloads are full Mixamo characters. Avatar.tsx keeps only
//   the rotation tracks of the first clip (retargetClip), so everything else is dropped: meshes,
//   skins, materials, textures and the translation and scale channels.
import { readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { prune, sparse } from "@gltf-transform/functions";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const io = new NodeIO();
// The morph targets Avatar.tsx animates (its MOUTH_MORPHS).
const MOUTH_MORPHS = ["jawOpen", "mouthOpen", "viseme_aa", "mouthFunnel"];
const kb = (path) => `${Math.round(statSync(path).size / 1024)} KB`;

async function optimizeAvatar(path) {
  const before = kb(path);
  const doc = await io.read(path);
  let kept = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    const names = mesh.getExtras()?.targetNames;
    if (!Array.isArray(names)) continue;
    const keep = names.map((n) => MOUTH_MORPHS.includes(n));
    for (const prim of mesh.listPrimitives()) {
      prim.listTargets().forEach((target, i) => {
        if (!keep[i]) prim.removeTarget(target);
      });
    }
    const weights = mesh.getWeights();
    if (weights.length) mesh.setWeights(weights.filter((_, i) => keep[i]));
    mesh.setExtras({ ...mesh.getExtras(), targetNames: names.filter((_, i) => keep[i]) });
    kept += keep.filter(Boolean).length;
  }
  if (!kept) throw new Error("avatar.glb has none of the lip sync morph targets");
  await doc.transform(prune({ keepLeaves: true, keepAttributes: true }), sparse({ ratio: 1 / 3 }));
  await io.write(path, doc);
  console.log("avatar", path, before, "->", kb(path));
}

async function stripGesture(path) {
  const before = kb(path);
  const doc = await io.read(path);
  const docRoot = doc.getRoot();
  for (const node of docRoot.listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  for (const mesh of docRoot.listMeshes()) mesh.dispose();
  for (const skin of docRoot.listSkins()) skin.dispose();
  const [clip, ...rest] = docRoot.listAnimations();
  for (const extra of rest) extra.dispose();
  for (const channel of clip?.listChannels() ?? []) {
    if (channel.getTargetPath() !== "rotation") channel.dispose();
  }
  await doc.transform(prune({ keepLeaves: true }));
  await io.write(path, doc);
  console.log("gesture", path, before, "->", kb(path));
}

await optimizeAvatar(resolve(root, "public/avatar.glb"));
const dir = resolve(root, "public/animations");
for (const file of readdirSync(dir).filter((f) => f.endsWith(".glb"))) {
  await stripGesture(resolve(dir, file));
}
