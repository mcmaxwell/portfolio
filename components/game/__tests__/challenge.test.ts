// The exploration challenge: the cells' placement in the campus, collection by proximity (once each),
// beacon gating, completion and restart, wired through the real session, progress and interaction systems.
import { describe, expect, it } from "vitest";
import { createChallenge } from "../challenge";
import type { Vec3 } from "../config";
import { createInteractionSystem } from "../interactions";
import { defaultProgress, restartChallenge } from "../progress";
import { createGame, type GameHandle } from "../session";
import { CAMPUS, surfaceHeightAt, type Block } from "../world/layout";

const { cells, beacon } = CAMPUS.challenge;
const cell = (id: string) => cells.find((c) => c.cellId === id)!;
const feetOf = (c: { position: Vec3 }): Vec3 => ({ ...c.position });
const away: Vec3 = { x: 0, y: 0, z: -6 };

function setup() {
  const game: GameHandle = createGame({ reducedMotion: true, storage: null });
  game.session.dispatch({ type: "ENTRY_DONE" });
  const challenge = createChallenge(CAMPUS.challenge, game);
  const items = [...CAMPUS.interactables, beacon!];
  const interactions = createInteractionSystem(items, game, (i) => i.kind !== "beacon" || challenge.beaconReady(), challenge.activate, (i) => i.kind === "beacon" && challenge.beaconWaiting());
  return { game, challenge, interactions };
}

describe("campus layout: cells and beacon", () => {
  it("has exactly one cell per destination, near it, with unique ids", () => {
    expect(cells.map((c) => c.cellId).sort()).toEqual(["lab", "tower", "workshop"]);
    expect(new Set(cells.map((c) => c.id)).size).toBe(3);
    for (const d of CAMPUS.destinations) {
      const c = cell(d.id);
      expect(Math.hypot(c.position.x - d.entrance.x, c.position.z - d.entrance.z)).toBeLessThan(5);
    }
  });

  it("each cell spot is a walkable surface at the cell's height with open space above it", () => {
    for (const c of cells) {
      const floor = surfaceHeightAt(CAMPUS, c.position.x, c.position.z, { maxY: c.position.y + 0.05 });
      expect(floor).not.toBeNull();
      expect(Math.abs(floor! - c.position.y)).toBeLessThan(0.05);
      // No collidable non-ground block occupies the standing column (a capsule radius around the spot, 0.1 to 1.8 m).
      const solids = CAMPUS.blocks.filter((b: Block) => b.collide !== false && b.kind !== "ground" && b.route !== "main" && !/^(step|ramp)/.test(b.kind));
      for (const b of solids) {
        const yaw = ((b.yawDeg ?? 0) * Math.PI) / 180;
        const dx = c.position.x - b.center.x;
        const dz = c.position.z - b.center.z;
        const lx = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
        const lz = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
        const inside = Math.abs(lx) < b.size.x / 2 + 0.35 && Math.abs(lz) < b.size.z / 2 + 0.35;
        const overlapsY = b.center.y + b.size.y / 2 > c.position.y + 0.1 && b.center.y - b.size.y / 2 < c.position.y + 1.8;
        expect(inside && overlapsY, `${c.id} inside ${b.id}`).toBe(false);
      }
    }
  });

  it("the beacon stands at the plaza beacon and is reachable", () => {
    expect(beacon).toMatchObject({ kind: "beacon" });
    expect(beacon!.position).toMatchObject({ x: CAMPUS.beacon!.x, z: CAMPUS.beacon!.z });
  });

  it("cells and the beacon are not in the panel interactables (the prompts stay panel-only)", () => {
    expect(CAMPUS.interactables.every((i) => i.kind !== "cell" && i.kind !== "beacon")).toBe(true);
  });
});

describe("collection", () => {
  it("walking into a cell collects it; walking away leaves it collected", () => {
    const { game, challenge } = setup();
    challenge.update(away);
    expect(game.progress.getState().collected).toEqual([]);
    challenge.update(feetOf(cell("workshop")));
    expect(game.progress.getState().collected).toEqual(["workshop"]);
    challenge.update(away);
    expect(game.progress.getState().collected).toEqual(["workshop"]);
  });

  it("a cell is collected only within its radius and its floor (another floor does not count)", () => {
    const { game, challenge } = setup();
    const c = cell("tower");
    challenge.update({ x: c.position.x + c.radius + 0.1, y: c.position.y, z: c.position.z });
    challenge.update({ x: c.position.x, y: c.position.y + 3, z: c.position.z });
    expect(game.progress.getState().collected).toEqual([]);
    challenge.update({ x: c.position.x + c.radius - 0.05, y: c.position.y, z: c.position.z });
    expect(game.progress.getState().collected).toEqual(["tower"]);
  });

  it("collecting twice counts once and notifies once", () => {
    const { game, challenge } = setup();
    let notified = 0;
    game.progress.subscribe(() => notified++);
    for (let i = 0; i < 5; i++) challenge.update(feetOf(cell("lab")));
    expect(game.progress.getState().collected).toEqual(["lab"]);
    expect(notified).toBe(1);
  });

  it("nothing is collected outside the playing mode (a panel, a pause)", () => {
    const { game, challenge } = setup();
    game.session.dispatch({ type: "PAUSE", reason: "user" });
    challenge.update(feetOf(cell("lab")));
    expect(game.progress.getState().collected).toEqual([]);
  });
});

describe("beacon gating, completion and restart", () => {
  const stand = { ...beacon!.position };
  const press = (interactions: ReturnType<typeof setup>["interactions"]) => interactions.update(stand, 0, true);

  it("the beacon does nothing before the third cell, and is not even focused", () => {
    const { game, challenge, interactions } = setup();
    challenge.update(feetOf(cell("lab")));
    challenge.update(feetOf(cell("workshop")));
    press(interactions);
    expect(game.session.getState().mode).toBe("playing");
    expect(game.focus.getState()).toBeNull();
    expect(game.progress.getState().completed).toBe(false);
  });

  it("next to the beacon before three cells there is a hint, not a prompt, and E still does nothing", () => {
    const { game, challenge, interactions } = setup();
    interactions.update(away, 0, false);
    expect(game.hint.getState()).toBeNull();
    interactions.update(stand, 0, false);
    expect(game.hint.getState()?.id).toBe("beacon");
    expect(game.focus.getState()).toBeNull();
    challenge.update(feetOf(cell("lab")));
    press(interactions);
    expect(game.session.getState().mode).toBe("playing");
    expect(game.progress.getState().completed).toBe(false);
    interactions.update(stand, Math.PI, false); // facing away still hints
    expect(game.hint.getState()?.id).toBe("beacon");
    interactions.update(away, 0, false);
    expect(game.hint.getState()).toBeNull();
  });

  it("the hint is gone once the beacon is ready (it becomes the prompt) and after completion, and outside the playing mode", () => {
    const { game, challenge, interactions } = setup();
    for (const id of ["lab", "workshop", "tower"]) challenge.update(feetOf(cell(id)));
    interactions.update(stand, 0, false);
    expect(game.hint.getState()).toBeNull();
    expect(game.focus.getState()?.id).toBe("beacon");
    press(interactions);
    game.session.dispatch({ type: "CELEBRATION_DONE" });
    game.session.dispatch({ type: "CLOSE_PANEL" });
    interactions.update(stand, 0, false);
    expect(game.hint.getState()).toBeNull();
    game.progress.update(restartChallenge);
    interactions.update(stand, 0, false);
    expect(game.hint.getState()?.id).toBe("beacon");
    game.session.dispatch({ type: "PAUSE", reason: "user" });
    interactions.update(stand, 0, false);
    expect(game.hint.getState()).toBeNull();
  });

  it("after the third cell the beacon is focused and E starts the celebration and saves completion", () => {
    const { game, challenge, interactions } = setup();
    for (const id of ["lab", "workshop", "tower"]) challenge.update(feetOf(cell(id)));
    expect(challenge.beaconReady()).toBe(true);
    interactions.update(stand, 0, false);
    expect(game.focus.getState()?.id).toBe("beacon");
    press(interactions);
    expect(game.session.getState().mode).toBe("celebrating");
    expect(game.progress.getState().completed).toBe(true);
    expect(challenge.beaconReady()).toBe(false);
  });

  it("the celebration ends in the completion panel, which closes back to playing", () => {
    const { game, challenge, interactions } = setup();
    for (const id of ["tower", "lab", "workshop"]) challenge.update(feetOf(cell(id)));
    press(interactions);
    game.session.dispatch({ type: "CELEBRATION_DONE" });
    expect(game.session.getState()).toMatchObject({ mode: "panel", panel: { kind: "completion" } });
    game.session.dispatch({ type: "CLOSE_PANEL" });
    expect(game.session.getState().mode).toBe("playing");
  });

  it("the beacon cannot be lit twice", () => {
    const { game, challenge, interactions } = setup();
    for (const id of ["lab", "workshop", "tower"]) challenge.update(feetOf(cell(id)));
    press(interactions);
    game.session.dispatch({ type: "CELEBRATION_DONE" });
    game.session.dispatch({ type: "CLOSE_PANEL" });
    press(interactions);
    expect(game.session.getState().mode).toBe("playing");
  });

  it("activate ignores non-beacon items and a beacon outside the playing mode", () => {
    const { game, challenge } = setup();
    for (const id of ["lab", "workshop", "tower"]) challenge.update(feetOf(cell(id)));
    challenge.activate(cell("lab"));
    expect(game.session.getState().mode).toBe("playing");
    game.session.dispatch({ type: "PAUSE", reason: "user" });
    challenge.activate(beacon!);
    expect(game.session.getState().mode).toBe("paused");
    expect(game.progress.getState().completed).toBe(false);
  });

  it("restart clears the cells and the completion, keeps settings, and the loop can be played again", () => {
    const { game, challenge, interactions } = setup();
    game.progress.update((p) => ({ ...p, settings: { ...p.settings, quality: "low" } }));
    for (const id of ["lab", "workshop", "tower"]) challenge.update(feetOf(cell(id)));
    press(interactions);
    game.session.dispatch({ type: "CELEBRATION_DONE" });
    game.session.dispatch({ type: "CLOSE_PANEL" });
    game.progress.update(restartChallenge);
    expect(game.progress.getState()).toEqual({ ...defaultProgress(), settings: { ...defaultProgress().settings, quality: "low" } });
    expect(challenge.beaconReady()).toBe(false);
    for (const id of ["lab", "workshop", "tower"]) challenge.update(feetOf(cell(id)));
    press(interactions);
    expect(game.session.getState().mode).toBe("celebrating");
  });

  it("the full loop completes with storage unavailable (in-memory fallback)", () => {
    const game = createGame({ reducedMotion: true, storage: createProgressStoreSource() });
    expect(game.progress.persistent).toBe(false);
    game.session.dispatch({ type: "ENTRY_DONE" });
    const challenge = createChallenge(CAMPUS.challenge, game);
    for (const c of cells) challenge.update(feetOf(c));
    expect(challenge.beaconReady()).toBe(true);
    challenge.activate(beacon!);
    expect(game.session.getState().mode).toBe("celebrating");
    expect(game.progress.getState().completed).toBe(true);
  });
});

// A storage whose every access throws, as in a browser with site data blocked.
function createProgressStoreSource(): Storage {
  const boom = () => {
    throw new DOMException("denied", "SecurityError");
  };
  return { length: 0, clear: boom, getItem: boom, key: boom, removeItem: boom, setItem: boom } as unknown as Storage;
}
