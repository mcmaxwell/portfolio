// Interaction system (design 9, M3): radius, nearest, front preference, unavailable items skipped,
// stickiness at the edges, and E opening the panel of the focused item only while playing.
import { describe, expect, it, vi } from "vitest";
import type { Interactable, Vec3 } from "../config";
import { createInteractionSystem, pickFocus, REACH_Y } from "../interactions";
import { createGame, createValueStore, createSessionStore } from "../session";
import { CAMPUS } from "../world/layout";

const item = (id: string, x: number, z: number, o: Partial<Interactable> = {}): Interactable => ({
  id,
  kind: "skills",
  position: { x, y: 0, z },
  radius: 2,
  prompt: id,
  panel: { kind: "skills" },
  ...o,
});
const at = (x: number, z: number, y = 0): Vec3 => ({ x, y, z });
const all = () => true;

describe("pickFocus", () => {
  it("returns nothing when no item is in reach", () => {
    expect(pickFocus(at(0, 0), 0, [item("a", 5, 0)], all)).toBeNull();
    expect(pickFocus(at(0, 0), 0, [], all)).toBeNull();
  });

  it("returns an item within its own radius, and not one just outside it", () => {
    expect(pickFocus(at(0, 0), 0, [item("a", 0, 1.9)], all)?.id).toBe("a");
    expect(pickFocus(at(0, 0), 0, [item("a", 0, 2.1)], all)).toBeNull();
    // Each item has its own radius.
    expect(pickFocus(at(0, 0), 0, [item("small", 0, 1.5, { radius: 1 }), item("big", 0, 2.5, { radius: 3 })], all)?.id).toBe("big");
  });

  it("the nearest item wins", () => {
    const items = [item("far", 0, 1.8), item("near", 0, 0.6), item("mid", 0, 1.2)];
    expect(pickFocus(at(0, 0), 0, items, all)?.id).toBe("near");
  });

  it("an item in front beats a nearer item behind (the character faces +z at yaw 0)", () => {
    const items = [item("behind", 0, -0.5), item("front", 0, 1.5)];
    expect(pickFocus(at(0, 0), 0, items, all)?.id).toBe("front");
    // Turn around: now the other one is in front.
    expect(pickFocus(at(0, 0), Math.PI, items, all)?.id).toBe("behind");
  });

  it("falls back to the nearest item behind when nothing is in front", () => {
    const items = [item("b1", 0, -1.5), item("b2", 0, -0.8)];
    expect(pickFocus(at(0, 0), 0, items, all)?.id).toBe("b2");
  });

  it("the facing yaw convention is (sin, cos): yaw 90 degrees faces +x", () => {
    const items = [item("east", 1.5, 0), item("west", -1.0, 0), item("north", -0.2, 1.2)];
    expect(pickFocus(at(0, 0), Math.PI / 2, items, all)?.id).toBe("east"); // west is nearer but behind
    expect(pickFocus(at(0, 0), -Math.PI / 2, items, all)?.id).toBe("west");
    expect(pickFocus(at(0, 0), 0, items, all)?.id).toBe("north");
  });

  it("an item underfoot counts as in front", () => {
    expect(pickFocus(at(1, 1), 1.234, [item("here", 1, 1), item("other", 1.5, 1.2)], all)?.id).toBe("here");
  });

  it("skips unavailable items, even the nearest, and falls through to the next", () => {
    const items = [item("done", 0, 0.5), item("open", 0, 1.5)];
    expect(pickFocus(at(0, 0), 0, items, (i) => i.id !== "done")?.id).toBe("open");
    expect(pickFocus(at(0, 0), 0, items, () => false)).toBeNull();
  });

  it("ignores items on another floor (more than REACH_Y above or below the feet)", () => {
    const upstairs = item("up", 0, 0.5, { position: { x: 0, y: REACH_Y + 0.5, z: 0.5 } });
    expect(pickFocus(at(0, 0), 0, [upstairs], all)).toBeNull();
    expect(pickFocus(at(0, 0, REACH_Y + 0.5), 0, [upstairs], all)?.id).toBe("up");
  });

  it("ties go to the first item in the list", () => {
    expect(pickFocus(at(0, 0), 0, [item("first", 1, 0.0001), item("second", -1, 0.0001)], all)?.id).toBe("first");
  });
});

describe("interaction system", () => {
  const rig = (items: Interactable[], available?: (i: Interactable) => boolean) => {
    const session = createSessionStore();
    session.dispatch({ type: "ENTRY_DONE" });
    const focus = createValueStore<Interactable | null>(null);
    const system = createInteractionSystem(items, { session, focus }, available);
    return { session, focus, system };
  };

  it("sets the focus only while playing and clears it in every other mode", () => {
    const r = rig([item("a", 0, 1)]);
    r.system.update(at(0, 0), 0, false);
    expect(r.focus.getState()?.id).toBe("a");
    r.session.dispatch({ type: "PAUSE", reason: "user" });
    r.system.update(at(0, 0), 0, false);
    expect(r.focus.getState()).toBeNull();
    r.session.dispatch({ type: "RESUME" });
    r.system.update(at(0, 0), 0, false);
    expect(r.focus.getState()?.id).toBe("a");
    r.session.dispatch({ type: "OPEN_PANEL", panel: { kind: "skills" } });
    r.system.update(at(0, 0), 0, false);
    expect(r.focus.getState()).toBeNull();
  });

  it("notifies subscribers only when the focus changes", () => {
    const r = rig([item("a", 0, 1), item("b", 0, 9)]);
    const fn = vi.fn();
    r.focus.subscribe(fn);
    for (let i = 0; i < 20; i++) r.system.update(at(0, 0), 0, false);
    expect(fn).toHaveBeenCalledTimes(1);
    r.system.update(at(0, 9 - 1), 0, false); // walks to b
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("interact opens the panel of the focused item and nothing when there is none", () => {
    const r = rig([item("a", 0, 1, { panel: { kind: "contact" } })]);
    r.system.update(at(0, 8), 0, true);
    expect(r.session.getState().mode).toBe("playing");
    r.system.update(at(0, 0), 0, true);
    expect(r.session.getState().mode).toBe("panel");
    expect(r.session.getState().panel).toEqual({ kind: "contact" });
  });

  it("interact with an item that has no panel (a cell or the beacon, Milestone 4) opens nothing", () => {
    const r = rig([item("cell", 0, 1, { kind: "cell", panel: undefined, cellId: "lab" })]);
    r.system.update(at(0, 0), 0, true);
    expect(r.session.getState().mode).toBe("playing");
    expect(r.focus.getState()?.id).toBe("cell");
  });

  it("does not open a panel for an interact press while paused or in a panel", () => {
    const r = rig([item("a", 0, 1)]);
    r.system.update(at(0, 0), 0, false);
    r.session.dispatch({ type: "PAUSE", reason: "user" });
    r.system.update(at(0, 0), 0, true);
    expect(r.session.getState().mode).toBe("paused");
  });

  it("an unavailable item is neither focused nor opened", () => {
    const r = rig([item("a", 0, 1)], () => false);
    r.system.update(at(0, 0), 0, true);
    expect(r.focus.getState()).toBeNull();
    expect(r.session.getState().mode).toBe("playing");
  });

  it("keeps the focus at the edge of its radius (hysteresis) and between two close items (switch margin)", () => {
    const r = rig([item("a", 0, 2)]);
    r.system.update(at(0, 0.2), 0, false); // 1.8 from a: in
    expect(r.focus.getState()?.id).toBe("a");
    r.system.update(at(0, -0.1), 0, false); // 2.1: just outside the radius, still held
    expect(r.focus.getState()?.id).toBe("a");
    r.system.update(at(0, -0.5), 0, false); // 2.5: gone
    expect(r.focus.getState()).toBeNull();
    const q = rig([item("a", -0.6, 0), item("b", 0.6, 0)]);
    q.system.update(at(-0.5, 0), 0, false);
    expect(q.focus.getState()?.id).toBe("a");
    q.system.update(at(0.05, 0), 0, false); // b is nearer by only 0.1: no flip
    expect(q.focus.getState()?.id).toBe("a");
    q.system.update(at(0.6, 0), 0, false); // clearly nearer to b
    expect(q.focus.getState()?.id).toBe("b");
  });

  it("dispose clears the focus", () => {
    const r = rig([item("a", 0, 1)]);
    r.system.update(at(0, 0), 0, false);
    r.system.dispose();
    expect(r.focus.getState()).toBeNull();
  });

  it("is wired into createGame as game.focus", () => {
    const game = createGame({ reducedMotion: true });
    expect(game.focus.getState()).toBeNull();
    game.focus.set(item("a", 0, 0));
    expect(game.focus.getState()?.id).toBe("a");
    game.dispose();
  });
});

describe("the campus interactables", () => {
  it("each one is focused when the player stands on its position, facing it, and no other item steals it", () => {
    for (const i of CAMPUS.interactables) {
      const f = pickFocus(i.position, 0, CAMPUS.interactables, all);
      expect(f?.id, i.id).toBe(i.id);
    }
  });

  it("no two displays are within each other's reach from the spot in front of the other (no prompt ambiguity at the plinths)", () => {
    for (const a of CAMPUS.interactables) {
      for (const b of CAMPUS.interactables) {
        if (a === b) continue;
        const d = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
        expect(d, `${a.id} and ${b.id}`).toBeGreaterThan(Math.min(a.radius, b.radius) * 0.8);
      }
    }
  });
});
