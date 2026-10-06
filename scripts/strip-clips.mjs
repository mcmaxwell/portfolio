// Offline clip stripper (design 5.1, ADR-003).
// Reads Mixamo GLBs from assets-src/mixamo/<name>.glb and writes rotation-only,
// Hips-free, mesh-free clips to public/game/clips/<name>.glb.
// Sources that are not present yet (idle, jump, fall, land) are skipped, so new
// downloads drop in by adding the file and re-running `npm run strip-clips`.
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(root, "assets-src/mixamo");
const OUT = resolve(root, "public/game/clips");
const AVATAR = resolve(root, "public/avatar.glb");

// name -> options. trimLast removes the duplicated last keyframe of looping
// Mixamo clips (last key equals first key). The first key sits at 1/30 s, so after
// trimming the clip duration equals the true loop period (41 frames for walk,
// 22 for run). One-shot clips (jump, land) keep every key.
const CLIPS = {
  idle: { trimLast: true },
  walk: { trimLast: true },
  run: { trimLast: true },
  jump: {},
  fall: { trimLast: true },
  land: {},
};
const MIN_CHANNELS = 40;
const stripPrefix = (n) => n.replace(/^mixamorig:?/, "");

const io = new NodeIO();
const avatarDoc = await io.read(AVATAR);
const jointNames = new Set();
for (const skin of avatarDoc.getRoot().listSkins()) {
  for (const j of skin.listJoints()) jointNames.add(j.getName());
}
if (jointNames.size < 40) throw new Error(`avatar joint list too small: ${jointNames.size}`);

mkdirSync(OUT, { recursive: true });
let failed = false;

for (const name of Object.keys(CLIPS)) {
  const src = resolve(SRC, `${name}.glb`);
  if (!existsSync(src)) {
    console.log(`skip ${name}: no source at assets-src/mixamo/${name}.glb`);
    continue;
  }
  const doc = await io.read(src);
  const root_ = doc.getRoot();

  for (const node of root_.listNodes()) {
    node.setName(stripPrefix(node.getName()));
    node.setMesh(null);
    node.setSkin(null);
  }
  const anim = root_.listAnimations()[0];
  if (!anim) throw new Error(`${name}: no animation`);
  anim.setName(name);

  let kept = 0;
  const dropped = { path: 0, hips: 0, missing: 0 };
  for (const ch of anim.listChannels()) {
    const target = ch.getTargetNode();
    const tname = target ? target.getName() : "";
    if (ch.getTargetPath() !== "rotation") dropped.path++;
    else if (tname === "Hips") dropped.hips++;
    else if (!jointNames.has(tname)) dropped.missing++;
    else {
      kept++;
      continue;
    }
    ch.dispose();
  }
  for (const s of anim.listSamplers()) if (!anim.listChannels().some((c) => c.getSampler() === s)) s.dispose();

  // Trim only when every kept track really ends on its first value.
  let worst = 1;
  for (const s of anim.listSamplers()) {
    const o = s.getOutput();
    const arr = o.getArray();
    const w = o.getElementSize();
    const n = s.getInput().getCount();
    let dot = 0;
    for (let k = 0; k < w; k++) dot += arr[k] * arr[(n - 1) * w + k];
    worst = Math.min(worst, Math.abs(dot)); // quaternion dot, sign-insensitive
  }
  const closes = worst > 0.999;
  if (CLIPS[name].trimLast && !closes) console.log(`${name}: last key differs from first, not trimmed (worst dot ${worst.toFixed(5)})`);
  if (CLIPS[name].trimLast && closes) {
    // Samplers can share one time accessor, so every accessor is cut exactly once, and
    // the new length is derived from the accessor's own count before it is cut.
    const done = new Set();
    for (const s of anim.listSamplers()) {
      for (const acc of [s.getInput(), s.getOutput()]) {
        if (done.has(acc)) continue;
        done.add(acc);
        const n = acc.getCount();
        acc.setArray(acc.getArray().slice(0, (n - 1) * acc.getElementSize()));
      }
    }
  }

  for (const m of root_.listMeshes()) m.dispose();
  for (const s of root_.listSkins()) s.dispose();
  for (const m of root_.listMaterials()) m.dispose();
  for (const t of root_.listTextures()) t.dispose();
  await doc.transform(prune());

  const dst = resolve(OUT, `${name}.glb`);
  await io.write(dst, doc);
  const bytes = statSync(dst).size;
  console.log(`${name}: ${bytes} B, kept ${kept} rotation channels, dropped ${JSON.stringify(dropped)}`);
  if (kept < MIN_CHANNELS) {
    console.error(`${name}: fewer than ${MIN_CHANNELS} channels kept`);
    failed = true;
  }
  if (bytes > 100 * 1024) {
    console.error(`${name}: over 100 KB`);
    failed = true;
  }
}
if (failed) process.exit(1);
