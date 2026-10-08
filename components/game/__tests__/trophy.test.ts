// The trophy cup on the highest terrace platform: placement, reachability by the existing jumps, collection by
// walking into it (once, no key), the dance hand-off through the session, and persistence through Restart.
import { describe, expect, it } from "vitest";
import { createChallenge } from "../challenge";
import { MOVEMENT, TROPHY, type Vec3 } from "../config";
import { REACH_Y } from "../interactions";
import { collectTrophy, createProgressStore, defaultProgress, restartChallenge } from "../progress";
import { createGame, type GameHandle } from "../session";
import { CAMPUS, getBlock, surfaceHeightAt, TEST_ARENA } from "../world/layout";

const trophy = CAMPUS.challenge.trophy!;
const terraces = [0, 1, 2].map((i) => getBlock(CAMPUS, `terrace-${i}`));
const top = (b: (typeof terraces)[number]) => b.center.y + b.size.y / 2;
const feet = (over: Partial<Vec3> = {}): Vec3 => ({ ...trophy.position, ...over });

function setup(storage: Storage | null = null) {
  const game: GameHandle = createGame({ reducedMotion: false, storage });
  game.session.dispatch({ type: "ENTRY_DONE" });
  return { game, challenge: createChallenge(CAMPUS.challenge, game) };
}

describe("placement", () => {
  it("the cup is on the highest terrace platform, centred on its top", () => {
    const highest = terraces.reduce((a, b) => (top(b) > top(a) ? b : a));
    expect(highest.id).toBe("terrace-2");
    expect(trophy).toMatchObject({ id: "trophy", kind: "trophy" });
    expect(trophy.position.x).toBeCloseTo(highest.center.x, 6);
    expect(trophy.position.z).toBeCloseTo(highest.center.z, 6);
    expect(trophy.position.y).toBeCloseTo(top(highest), 6);
    expect(top(highest)).toBeCloseTo(2.4, 6);
    expect(surfaceHeightAt(CAMPUS, trophy.position.x, trophy.position.z, { maxY: trophy.position.y + 0.05 })).toBeCloseTo(2.4, 3);
  });

  it("the reach covers the platform's middle but stays on the platform", () => {
    const half = terraces[2].size.x / 2;
    expect(trophy.radius).toBe(TROPHY.radius);
    expect(trophy.radius).toBeLessThan(half);
  });

  it("every step up to it is within one jump (0.9 m) and the gaps are short, so the existing jumps reach it", () => {
    for (let i = 1; i < terraces.length; i++) {
      expect(top(terraces[i]) - top(terraces[i - 1])).toBeLessThanOrEqual(MOVEMENT.jumpHeight);
      const gap = terraces[i].center.x - terraces[i].size.x / 2 - (terraces[i - 1].center.x + terraces[i - 1].size.x / 2);
      expect(gap).toBeLessThan(1);
    }
    expect(top(terraces[0])).toBeLessThanOrEqual(MOVEMENT.jumpHeight);
  });

  it("it is a reward, not an energy cell or a panel: the cell count, the prompts and the arena are untouched", () => {
    expect(CAMPUS.challenge.cells).toHaveLength(3);
    expect(CAMPUS.challenge.cells.every((c) => c.kind === "cell")).toBe(true);
    expect(CAMPUS.interactables.every((i) => i.kind !== "trophy")).toBe(true);
    expect(TEST_ARENA.challenge.trophy).toBeNull();
  });
});

describe("collection", () => {
  it("walking into it saves the trophy, starts the dance (celebrating for the trophy) and needs no key", () => {
    const { game, challenge } = setup();
    challenge.update(feet({ y: 0, x: trophy.position.x + 8 }));
    expect(game.progress.getState().trophy).toBe(false);
    expect(game.session.getState().mode).toBe("playing");
    challenge.update(feet());
    expect(game.progress.getState().trophy).toBe(true);
    expect(game.session.getState()).toMatchObject({ mode: "celebrating", celebration: "trophy" });
    expect(game.progress.getState().collected).toEqual([]); // not an energy cell
  });

  it("is collected only within its radius and on its own floor (the ground below does not count)", () => {
    const { game, challenge } = setup();
    challenge.update(feet({ x: trophy.position.x + trophy.radius + 0.1 }));
    challenge.update(feet({ y: 0 })); // under the platform
    challenge.update(feet({ y: trophy.position.y + REACH_Y + 0.2 }));
    expect(game.progress.getState().trophy).toBe(false);
    challenge.update(feet({ x: trophy.position.x + trophy.radius - 0.05 }));
    expect(game.progress.getState().trophy).toBe(true);
  });

  it("the middle of the platform below it (terrace-1, 0.8 m lower) is too far to the side to collect it", () => {
    const { game, challenge } = setup();
    const t1 = terraces[1];
    challenge.update({ x: t1.center.x, y: top(t1), z: t1.center.z });
    expect(game.progress.getState().trophy).toBe(false);
  });

  it("is collectible once: more frames in reach neither dance again nor notify again", () => {
    const { game, challenge } = setup();
    let notified = 0;
    let dances = 0;
    game.progress.subscribe(() => notified++);
    game.session.subscribe(() => {
      if (game.session.getState().mode === "celebrating") dances++;
    });
    for (let i = 0; i < 6; i++) challenge.update(feet());
    expect(notified).toBe(1);
    expect(dances).toBe(1);
    game.session.dispatch({ type: "CELEBRATION_DONE" });
    expect(game.session.getState().mode).toBe("playing"); // back to the game, no panel
    challenge.update(feet());
    expect(game.session.getState().mode).toBe("playing");
    expect(notified).toBe(1);
  });

  it("nothing is collected outside the playing mode (a pause, a panel, the dance itself)", () => {
    const { game, challenge } = setup();
    game.session.dispatch({ type: "PAUSE", reason: "user" });
    challenge.update(feet());
    expect(game.progress.getState().trophy).toBe(false);
    game.session.dispatch({ type: "RESUME" });
    game.session.dispatch({ type: "OPEN_PANEL", panel: { kind: "skills" } });
    challenge.update(feet());
    expect(game.progress.getState().trophy).toBe(false);
  });

  it("a restored trophy (reload) is not collected again and does not dance", () => {
    const store = createProgressStore(null);
    store.update(collectTrophy);
    const { game, challenge } = setup();
    game.progress.update(collectTrophy);
    challenge.update(feet());
    expect(game.session.getState().mode).toBe("playing");
    expect(store.getState().trophy).toBe(true);
  });

  it("Restart brings it back: it can be collected again", () => {
    const { game, challenge } = setup();
    challenge.update(feet());
    game.session.dispatch({ type: "CELEBRATION_DONE" });
    game.progress.update(restartChallenge);
    expect(game.progress.getState().trophy).toBe(false);
    challenge.update(feet());
    expect(game.progress.getState().trophy).toBe(true);
    expect(game.session.getState().mode).toBe("celebrating");
  });

  it("collecting it leaves the beacon challenge alone: gating, completion and the energy count are unchanged", () => {
    const { game, challenge } = setup();
    challenge.update(feet());
    game.session.dispatch({ type: "CELEBRATION_DONE" });
    expect(challenge.beaconReady()).toBe(false);
    expect(challenge.beaconWaiting()).toBe(true);
    expect(game.progress.getState()).toMatchObject({ ...defaultProgress(), trophy: true });
  });
});
