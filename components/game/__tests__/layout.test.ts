// Campus layout invariants (design section 9, M3): data sanity, main-route slope and step limits,
// interactables on walkable ground, handedness, and the destinations being recognisable from spawn.
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { CAMERA, FEET_TO_CENTER, MOVEMENT } from "../config";
import { createFollowCamera } from "../followCamera";
import { CAMPUS, TEST_ARENA, resolveLayout, surfaceHeightAt, type Block, type Layout } from "../world/layout";
import { rotateXZ } from "../world/builders";

const feet = (layout: Layout) => layout.spawn;

describe("campus data", () => {
  it("has unique block ids with positive sizes", () => {
    const ids = new Set<string>();
    for (const b of CAMPUS.blocks) {
      expect(ids.has(b.id), `duplicate ${b.id}`).toBe(false);
      ids.add(b.id);
      expect(b.size.x).toBeGreaterThan(0);
      expect(b.size.y).toBeGreaterThan(0);
      expect(b.size.z).toBeGreaterThan(0);
    }
    expect(CAMPUS.blocks.length).toBeLessThan(250);
  });

  it("resolves by name, the campus being the default", () => {
    expect(resolveLayout()).toBe(CAMPUS);
    expect(resolveLayout("campus")).toBe(CAMPUS);
    expect(resolveLayout("test-arena")).toBe(TEST_ARENA);
  });

  it("spawns on the plaza ground at the origin side, facing the garden path (+z)", () => {
    expect(surfaceHeightAt(CAMPUS, feet(CAMPUS).x, feet(CAMPUS).z)).toBeCloseTo(0, 6);
    expect(CAMPUS.spawnYawDeg).toBe(0);
    expect(Math.hypot(CAMPUS.spawn.x, CAMPUS.spawn.z)).toBeLessThan(8); // inside the 16 m plaza
    expect(CAMPUS.beacon).not.toBeNull();
    expect(Math.hypot(CAMPUS.beacon!.x, CAMPUS.beacon!.z)).toBeLessThan(4); // the beacon pad is on the plaza
  });

  it("is about 60 x 60 m: nothing standing outside the boundary walls", () => {
    for (const b of CAMPUS.blocks) {
      if (b.kind === "wall") continue;
      expect(Math.abs(b.center.x) + b.size.x / 2, b.id).toBeLessThanOrEqual(32.01);
      expect(Math.abs(b.center.z) + b.size.z / 2, b.id).toBeLessThanOrEqual(32.01);
    }
    const edges = CAMPUS.blocks.filter((b) => b.kind === "wall");
    expect(edges.length).toBe(4);
  });
});

describe("main route", () => {
  const main = CAMPUS.blocks.filter((b) => b.route === "main");

  it("every main-route ramp is at or under 40 degrees (and there is one)", () => {
    const ramps = main.filter((b) => b.kind === "ramp");
    expect(ramps.length).toBeGreaterThanOrEqual(1);
    for (const r of ramps) expect(r.pitchDeg ?? 0, r.id).toBeLessThanOrEqual(40);
  });

  it("every main-route ramp is also under the motor's slope limit", () => {
    for (const r of main.filter((b) => b.kind === "ramp")) expect(r.pitchDeg ?? 0).toBeLessThanOrEqual(MOVEMENT.maxSlopeDeg);
  });

  /** The surface in front of a step's riser, measured from the geometry and not from the `rise` field. */
  const frontOf = (b: Block): number => {
    const dir = rotateXZ(0, -1, b.yawDeg ?? 0); // the step faces local -z
    const px = b.center.x + dir.x * (b.size.z / 2 + 0.08);
    const pz = b.center.z + dir.z * (b.size.z / 2 + 0.08);
    return surfaceHeightAt(CAMPUS, px, pz, { exclude: (o) => o.id === b.id, maxY: b.center.y + b.size.y / 2 - 0.01 }) ?? -10;
  };

  it("every main-route step rises at most 0.25 m over what is in front of it (measured from the geometry)", () => {
    const steps = main.filter((b) => b.kind === "step");
    expect(steps.length).toBeGreaterThanOrEqual(3);
    for (const s of steps) {
      const top = s.center.y + s.size.y / 2;
      expect(top - frontOf(s), s.id).toBeLessThanOrEqual(MOVEMENT.stepHeight + 1e-6);
      expect(top - frontOf(s), s.id).toBeGreaterThan(0.05);
      if (s.rise !== undefined) expect(s.rise).toBeLessThanOrEqual(MOVEMENT.stepHeight);
    }
  });

  it("the walkable entry to every destination is flush, a ramp or steps, never a ledge", () => {
    for (const d of CAMPUS.destinations) {
      const h = surfaceHeightAt(CAMPUS, d.entrance.x, d.entrance.z, { maxY: d.entrance.y + 0.3 });
      expect(h, d.id).not.toBeNull();
      expect(Math.abs(h! - d.entrance.y), d.id).toBeLessThan(0.05);
    }
  });
});

describe("destinations, signs and interactables", () => {
  it("has the three destinations in the spec placement (handedness: camera looks along +z, screen-left is +x)", () => {
    const by = Object.fromEntries(CAMPUS.destinations.map((d) => [d.id, d]));
    expect(Object.keys(by).sort()).toEqual(["lab", "tower", "workshop"]);
    expect(by.lab.centre.x).toBeGreaterThan(6); // left of the plaza as seen from spawn
    expect(by.workshop.centre.x).toBeLessThan(-6); // right
    expect(by.tower.centre.z).toBeGreaterThan(by.lab.centre.z + 3); // beyond the plaza and the halls
    expect(Math.abs(by.tower.centre.x)).toBeLessThan(2);
  });

  it("every interactable stands on a walkable surface, with a panel, and every destination has some", () => {
    expect(CAMPUS.interactables.length).toBeGreaterThanOrEqual(7);
    for (const i of CAMPUS.interactables) {
      const h = surfaceHeightAt(CAMPUS, i.position.x, i.position.z, { maxY: i.position.y + 0.3 });
      expect(h, i.id).not.toBeNull();
      expect(Math.abs(h! - i.position.y), i.id).toBeLessThan(0.06);
      expect(i.panel, i.id).toBeDefined();
      expect(i.prompt.length).toBeGreaterThan(3);
      expect(i.radius).toBeGreaterThan(1);
      expect(i.radius).toBeLessThan(3);
    }
    for (const d of CAMPUS.destinations) {
      const near = CAMPUS.interactables.filter((i) => Math.hypot(i.position.x - d.centre.x, i.position.z - d.centre.z) < 8);
      expect(near.length, d.id).toBeGreaterThanOrEqual(1);
    }
    const ids = CAMPUS.interactables.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offers the three featured projects and the All projects display in the lab, skills and experience in the workshop, contact in the tower", () => {
    const panels = CAMPUS.interactables.map((i) => (i.panel!.kind === "project" ? `project:${i.panel!.projectId}` : i.panel!.kind));
    expect(panels.sort()).toEqual(["all-projects", "contact", "experience", "project:1", "project:2", "project:3", "skills"]);
  });

  it("every sign faces the spawn and its whole board is inside the follow camera's view from spawn at 16:9 and 16:10 (its centre at 4:3)", () => {
    expect(CAMPUS.signs.map((s) => s.text).sort()).toEqual(["CONTACT TOWER", "PROJECT LAB", "SKILLS WORKSHOP"]);
    const spawnCenter = { x: CAMPUS.spawn.x, y: CAMPUS.spawn.y + FEET_TO_CENTER, z: CAMPUS.spawn.z };
    for (const aspect of [16 / 9, 16 / 10, 4 / 3]) {
      const cam = new THREE.PerspectiveCamera(CAMERA.fov, aspect, 0.1, 200);
      // The pose after the entry walk: about 1.5 m forward of the spawn.
      createFollowCamera(cam, null, CAMERA).snapTo({ ...spawnCenter, z: spawnCenter.z + 1.5 }, 0);
      cam.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      for (const s of CAMPUS.signs) {
        const yaw = (s.yawDeg * Math.PI) / 180;
        const faces = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const toSpawn = new THREE.Vector3(CAMPUS.spawn.x - s.center.x, 0, CAMPUS.spawn.z - s.center.z).normalize();
        expect(faces.dot(toSpawn), s.id).toBeGreaterThan(0.7);
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); // the plane's +x
        const points = aspect >= 1.5 ? [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]] : [[0, 0]];
        for (const [sx, sy] of points) {
          const corner = new THREE.Vector3(s.center.x, s.center.y, s.center.z).addScaledVector(right, (sx * s.width) / 2);
          corner.y += (sy * s.height) / 2;
          expect(frustum.containsPoint(corner), `${s.id} at aspect ${aspect.toFixed(2)}, corner ${sx},${sy}`).toBe(true);
        }
        // Big enough to read: the board is at least 24 px tall at 1280x720.
        const c = new THREE.Vector3(s.center.x, s.center.y, s.center.z);
        const px = ((s.height / c.distanceTo(cam.position)) * 720) / (2 * Math.tan((CAMERA.fov * Math.PI) / 360));
        expect(px, `${s.id} height in px`).toBeGreaterThan(24);
      }
    }
  });

  it("has a ravine that is a real void (a fall reaches the kill plane) crossed by stepping stones", () => {
    expect(surfaceHeightAt(CAMPUS, 16, -22)).toBeCloseTo(0, 6); // a stone top
    expect(surfaceHeightAt(CAMPUS, 14.2, -22)).toBeNull(); // between two stones
    expect(surfaceHeightAt(CAMPUS, 16, -19)).toBeNull(); // off the stones
    expect(CAMPUS.killPlaneY).toBeLessThan(-5);
  });

  it("keeps rooms defined for the lab, the workshop and the tower passage", () => {
    expect(CAMPUS.rooms.map((r) => r.id).sort()).toEqual(["lab", "tower-passage", "workshop"]);
  });
});
