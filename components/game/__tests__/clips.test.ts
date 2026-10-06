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

  it("has at least walk and run", () => {
    expect(files).toEqual(expect.arrayContaining(["walk.glb", "run.glb"]));
  });

  it.each(files)("%s: rotation-only, no Hips, avatar joints only, small, no mesh data", (file) => {
    const path = join(clipsDir, file);
    expect(statSync(path).size).toBeLessThan(100 * 1024);
    const json = readGlbJson(path);
    expect(json.animations).toHaveLength(1);
    const channels = json.animations![0].channels;
    expect(channels.length).toBeGreaterThanOrEqual(40);
    for (const ch of channels) {
      expect(ch.target.path).toBe("rotation");
      const name = json.nodes[ch.target.node!].name!;
      expect(name).not.toBe("Hips");
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
      expect(t.name.endsWith(".quaternion"), t.name).toBe(true);
      expect(t.times.length, t.name).toBeGreaterThanOrEqual(1); // constant tracks keep one key
      expect(t.values.length, t.name).toBe(t.times.length * 4); // one quaternion per key
      expect(Array.from(t.times).every((x, i, a) => i === 0 || x > a[i - 1]), t.name).toBe(true); // strictly increasing
      expect(avatarJoints.has(t.name.split(".")[0]), t.name).toBe(true);
    }
    expect(clip.duration).toBeGreaterThan(0.2);
  });

  it("walk and run durations equal the loop period (duplicated last frame trimmed)", async () => {
    expect((await parse("walk.glb")).duration).toBeCloseTo(41 / 30, 3);
    expect((await parse("run.glb")).duration).toBeCloseTo(22 / 30, 3);
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
