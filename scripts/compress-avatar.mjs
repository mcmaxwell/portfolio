// Writes public/avatar.meshopt.glb: the hero avatar with its geometry and morph targets compressed
// by meshoptimizer (EXT_meshopt_compression). The site loads it where WebAssembly runs and falls
// back to public/avatar.glb elsewhere (lib/avatarSource.ts), so avatar.glb stays the source and
// the file the rig tests and scripts read. Re-run after avatar.glb changes:
//   node scripts/compress-avatar.mjs
import { statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "public/avatar.glb");
const out = join(root, "public/avatar.meshopt.glb");

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const doc = await io.read(src);
const count = (d) => {
  const r = d.getRoot();
  return {
    nodes: r.listNodes().length,
    skins: r.listSkins().length,
    joints: r.listSkins().reduce((n, s) => n + s.listJoints().length, 0),
    meshes: r.listMeshes().length,
    morphs: r.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + p.listTargets().length, 0), 0),
    animations: r.listAnimations().length,
  };
};
const before = count(doc);
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await io.write(out, doc);
const after = count(await io.read(out));
// Quantisation gives each skinned mesh its own skin (same joint nodes, adjusted inverse bind
// matrices), so skins and joint references may multiply; the nodes, meshes, morph targets and
// clips must not change.
for (const k of ["nodes", "meshes", "morphs", "animations"]) {
  if (before[k] !== after[k]) throw new Error(`compress-avatar: ${k} changed ${before[k]} -> ${after[k]}`);
}
const mb = (f) => `${(statSync(f).size / 1048576).toFixed(2)} MB`;
console.log(`avatar.glb ${mb(src)} -> avatar.meshopt.glb ${mb(out)}`, after);
