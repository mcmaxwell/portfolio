import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { toGameClip } from "../clips";
import { CLIP_URLS, FIRST_PLAY_CLIPS } from "../config";

const root = process.cwd();
const clipsDir = join(root, "public/game/clips");

type GltfJson = {
  nodes: { name?: string }[];
  skins?: { joints: number[] }[];
  animations?: { channels: { target: { node?: number; path: string } }[] }[];
  meshes?: unknown[];
  materials?: unknown[];
  textures?: unknown[];
};

/** Reads the JSON chunk of a GLB file. */
function readGlbJson(file: string): GltfJson {
  const buf = readFileSync(file);
  expect(buf.toString("utf8", 0, 4)).toBe("glTF");
  const len = buf.readUInt32LE(12);
  expect(buf.toString("utf8", 16, 20)).toBe("JSON");
  return JSON.parse(buf.toString("utf8", 20, 20 + len)) as GltfJson;
}

const avatar = readGlbJson(join(root, "public/avatar.glb"));
const avatarJoints = new Set(avatar.skins![0].joints.map((i) => avatar.nodes[i].name!));
const files = existsSync(clipsDir) ? readdirSync(clipsDir).filter((f) => f.endsWith(".glb")) : [];

describe("stripped clips in public/game/clips", () => {
  it("has the avatar joint list to check against", () => {
    expect(avatarJoints.size).toBe(54);
    expect(avatarJoints.has("Hips")).toBe(true);
  });

  it("includes every clip in the first-play asset list", () => {
    for (const name of FIRST_PLAY_CLIPS) {
      expect(files, `${name}.glb`).toContain(`${name}.glb`);
      expect(CLIP_URLS[name]).toBe(`/game/clips/${name}.glb`);
    }
  });

  it("ships exactly the six game clips idle, walk, run, jump, fall and land", () => {
    expect([...files].sort()).toEqual(["fall.glb", "idle.glb", "jump.glb", "land.glb", "run.glb", "walk.glb"]);
  });

  it.each(files)("%s: rotation-only, Hips only in land and fall, avatar joints only, small, no mesh data", (file) => {
    const path = join(clipsDir, file);
    expect(statSync(path).size).toBeLessThan(100 * 1024);
    const json = readGlbJson(path);
    expect(json.animations).toHaveLength(1);
    const channels = json.animations![0].channels;
    expect(channels.length).toBeGreaterThanOrEqual(40);
    const hipsChannels = channels.filter((c) => json.nodes[c.target.node!].name === "Hips");
    // Only land (pelvis pitch and drop for the crouch, QA F1) and fall (pelvis height so the feet
    // hang on the capsule bottom) carry Hips tracks; fall has no Hips rotation.
    const expectedHips: Record<string, string[]> = { "land.glb": ["rotation", "translation"], "fall.glb": ["translation"] };
    expect(hipsChannels.map((c) => c.target.path).sort(), file).toEqual(expectedHips[file] ?? []);
    expect(new Set(json.nodes.map((n) => n.name)).size, "node names are unique").toBe(json.nodes.length);
    for (const ch of channels) {
      const name = json.nodes[ch.target.node!].name!;
      if (name !== "Hips") expect(ch.target.path).toBe("rotation");
      expect(name.startsWith("mixamorig")).toBe(false);
      expect(avatarJoints.has(name), name).toBe(true);
    }
    expect(json.skins ?? []).toHaveLength(0);
    expect(json.meshes ?? []).toHaveLength(0);
    expect(json.materials ?? []).toHaveLength(0);
    expect(json.textures ?? []).toHaveLength(0);
  });
});

describe("stripped clips load through GLTFLoader", () => {
  // A keyframe-count bug in the strip script once produced files that passed the JSON
  // checks above but failed to parse; this runs the real loader the game uses.
  const parse = (file: string) =>
    new Promise<THREE.AnimationClip>((resolve, reject) => {
      const buf = readFileSync(join(clipsDir, file));
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      new GLTFLoader().parse(ab as ArrayBuffer, "", (g) => resolve(g.animations[0]), reject);
    });

  it.each(files)("%s parses with rotation tracks that have keyframes", async (file) => {
    const clip = await parse(file);
    expect(clip.tracks.length).toBeGreaterThanOrEqual(40);
    for (const t of clip.tracks) {
      const position = t.name === "Hips.position"; // land and fall only (checked above)
      expect(t.name.endsWith(".quaternion") || position, t.name).toBe(true);
      expect(t.times.length, t.name).toBeGreaterThanOrEqual(1); // constant tracks keep one key
      expect(t.values.length, t.name).toBe(t.times.length * (position ? 3 : 4)); // one value per key
      expect(Array.from(t.times).every((x, i, a) => i === 0 || x > a[i - 1]), t.name).toBe(true); // strictly increasing
      expect(avatarJoints.has(t.name.split(".")[0]), t.name).toBe(true);
    }
    expect(clip.duration).toBeGreaterThan(0.2);
  });

  // Looping clips: the duplicated last key is dropped and the keys are shifted one frame, so
  // the duration is the true loop period (source frames / 30). One-shot clips keep their
  // timing; jump is the airborne part of the source (source frames 21 to 39), land the touchdown to stand-up part (frames 2 to 58).
  const FPS = 30;
  const expected: Record<string, { frames: number; loop: boolean }> = {
    "idle.glb": { frames: 250, loop: true },
    "walk.glb": { frames: 31, loop: true },
    "run.glb": { frames: 19, loop: true },
    "fall.glb": { frames: 21, loop: true },
    "jump.glb": { frames: 18, loop: false },
    "land.glb": { frames: 56, loop: false }, // source frames 2 to 58
  };
  it.each(Object.keys(expected))("%s has the expected duration and key timing", async (file) => {
    const clip = await parse(file);
    const e = expected[file];
    expect(clip.duration).toBeCloseTo(e.frames / FPS, 3);
    const longest = clip.tracks.reduce((a, t) => (t.times.length > a.times.length ? t : a));
    expect(longest.times[0]).toBeCloseTo(e.loop ? 1 / FPS : 0, 4);
  });

  it("a looping clip ends one frame of motion before its first key (no pop at the wrap)", async () => {
    // The repeated last key was dropped, so the wrap goes from the last key to the first
    // key in one source frame; that jump must be no bigger than the clip's own frame steps.
    for (const file of ["walk.glb", "run.glb", "fall.glb"]) {
      // idle is excluded: it is resampled, so its keys are not one frame apart.
      const clip = await parse(file);
      for (const t of clip.tracks) {
        const n = t.times.length;
        if (n < 3 || !t.name.endsWith(".quaternion")) continue; // the planted Hips height is checked in stance.test.ts
        const q = (i: number) => new THREE.Quaternion().fromArray(t.values, i * 4);
        let maxStep = 0;
        for (let i = 1; i < n; i++) maxStep = Math.max(maxStep, q(i - 1).angleTo(q(i)));
        const wrap = q(n - 1).angleTo(q(0));
        expect(wrap, `${file} ${t.name}`).toBeLessThanOrEqual(maxStep * 1.5 + 1e-3);
      }
    }
  });
});

describe("toGameClip", () => {
  const q = (name: string) => new THREE.QuaternionKeyframeTrack(name, [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
  const v = (name: string) => new THREE.VectorKeyframeTrack(name, [0, 1], [0, 0, 0, 1, 1, 1]);
  const joints = new Set(["Spine", "Head", "Hips"]);

  it("keeps non-Hips quaternion tracks on known joints, strips the prefix, drops the rest", () => {
    const input = new THREE.AnimationClip("c", 1, [
      q("mixamorigSpine.quaternion"),
      q("mixamorig:Head.quaternion"),
      q("Hips.quaternion"),
      v("Spine.position"),
      v("Spine.scale"),
      q("HeadTop_End.quaternion"),
      new THREE.NumberKeyframeTrack("Head_Mesh.morphTargetInfluences[jawOpen]", [0, 1], [0, 1]),
    ]);
    const out = toGameClip(input, joints);
    expect(out.tracks.map((t) => t.name).sort()).toEqual(["Head.quaternion", "Spine.quaternion"]);
    expect(out.duration).toBe(1);
    expect(out.name).toBe("c");
  });

  it("keepHipsMotion keeps the Hips rotation and position and nothing else of the Hips", () => {
    const input = new THREE.AnimationClip("c", 1, [
      q("Hips.quaternion"),
      v("mixamorigHips.position"),
      v("Hips.scale"),
      q("mixamorigSpine.quaternion"),
    ]);
    expect(toGameClip(input, joints, true).tracks.map((t) => t.name).sort()).toEqual([
      "Hips.position",
      "Hips.quaternion",
      "Spine.quaternion",
    ]);
    expect(toGameClip(input, joints).tracks.map((t) => t.name)).toEqual(["Spine.quaternion"]);
  });

  it("does not mutate its input", () => {
    const track = q("mixamorigSpine.quaternion");
    const input = new THREE.AnimationClip("c", 1, [track, q("Hips.quaternion")]);
    const before = input.tracks.map((t) => t.name);
    const out = toGameClip(input, joints);
    expect(input.tracks.map((t) => t.name)).toEqual(before);
    expect(input.tracks).toHaveLength(2);
    expect(track.name).toBe("mixamorigSpine.quaternion");
    expect(out.tracks[0]).not.toBe(track);
    out.tracks[0].values[0] = 9;
    expect(track.values[0]).toBe(0);
  });
});
