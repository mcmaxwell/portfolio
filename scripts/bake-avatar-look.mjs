// One-time clothing bake for public/avatar.glb (TASK-002). See scripts/lib/avatar-bake.mjs.
//
//   node scripts/bake-avatar-look.mjs [--original <path to the original avatar.glb>] [--out <path>]
//
// Reads the recorded ORIGINAL avatar (never the baked output) and writes public/avatar.glb.
// The original is public/avatar.glb itself when it is still the original, otherwise pass it
// with --original, for example: git show a891bc4:public/avatar.glb > /some/dir/avatar.original.glb
// The input must match ORIGINAL_SHA256; an already baked file (marker avatarLookBake) is
// refused, so the bake cannot compound. The output is deterministic (same bytes every run).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { bakeAvatarLook, isBaked } from "./lib/avatar-bake.mjs";

/** sha256 of public/avatar.glb as committed in a891bc4 (before the bake). */
export const ORIGINAL_SHA256 = "d8d0a77ef9fe8db121440647bcc40239d0be0e27d4c6f7aba83116ba299fef0c";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? resolve(args[i + 1]) : null;
};
const OUT = opt("--out") ?? resolve(root, "public/avatar.glb");
const input = opt("--original") ?? resolve(root, "public/avatar.glb");

const bytes = readFileSync(input);
const io = new NodeIO();
const doc = await io.readBinary(new Uint8Array(bytes));
if (isBaked(doc)) {
  console.error("refusing to re-bake: the input already carries the avatarLookBake marker.");
  console.error("Pass the recorded original with --original (see the header of this script).");
  process.exit(1);
}
const sha = createHash("sha256").update(bytes).digest("hex");
if (sha !== ORIGINAL_SHA256) {
  console.error(`input is not the recorded original avatar (sha256 ${sha}, expected ${ORIGINAL_SHA256}).`);
  process.exit(1);
}

const stats = bakeAvatarLook(doc);
const out = await io.writeBinary(doc);
writeFileSync(OUT, out);
console.log("baked", OUT, `${out.byteLength} bytes`, JSON.stringify(stats));
