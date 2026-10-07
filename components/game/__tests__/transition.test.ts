// The Play and Exit timelines as data: beat order, durations and the numbers of
// play-transition.md sections 2 to 5.
import { describe, expect, it } from "vitest";
import {
  CHROME,
  chromeTransition,
  chromeTranslate,
  EASE,
  EXIT_BEATS,
  experienceAttribute,
  NAV,
  PLAY_BEATS,
  TIMING,
  WARM_CLICK_TO_INPUT_MS,
  type Beat,
  type Phase,
} from "../shell/transition";

const beat = (list: readonly Beat[], id: string): Beat => {
  const b = list.find((x) => x.id === id);
  if (!b) throw new Error(`no beat ${id}`);
  return b;
};
/** Time of a beat edge in ms after the click, with S = C + chromeMs (the warm case). */
const sinceClick = (b: Beat, edge: "startMs" | "endMs") => (b.clock === "S" ? TIMING.chromeMs : 0) + b[edge];

describe("Play timeline (sections 2.1 to 2.6)", () => {
  it("lists the beats in the order A, B, C, D, E, F", () => {
    const letters = PLAY_BEATS.map((b) => b.id[0]);
    const firstIndex = (l: string) => letters.indexOf(l);
    const order = ["A", "B", "C", "D", "E", "F"].map(firstIndex);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("beat A: chrome exit runs C+0 to C+360 and nothing in the game starts before it ends", () => {
    const a = beat(PLAY_BEATS, "A.chrome-exit");
    expect([a.clock, a.startMs, a.endMs]).toEqual(["C", 0, 360]);
    for (const b of PLAY_BEATS.filter((x) => x.clock === "S")) expect(sinceClick(b, "startMs")).toBeGreaterThanOrEqual(a.endMs);
  });

  it("beat B: the canvas flip takes 400 ms from the click", () => {
    const b = beat(PLAY_BEATS, "B.canvas-flip");
    expect([b.clock, b.startMs, b.endMs]).toEqual(["C", 0, 400]);
  });

  it("beats C and D start together at the swap; the world reveal is 300 ms and the camera 1500 ms", () => {
    const c = beat(PLAY_BEATS, "C.world-reveal");
    const d = beat(PLAY_BEATS, "D.camera");
    expect(c.startMs).toBe(0);
    expect(d.startMs).toBe(0);
    expect(c.endMs - c.startMs).toBe(300);
    expect(d.endMs - d.startMs).toBe(1500);
  });

  it("beat E: turn S+150..570, walk fade from S+400, walk S+500..1500 (turn before the walk is over)", () => {
    const turn = beat(PLAY_BEATS, "E1.avatar-turn");
    const fade = beat(PLAY_BEATS, "E2.walk-fade");
    const walk = beat(PLAY_BEATS, "E3.walk");
    expect([turn.startMs, turn.endMs]).toEqual([150, 570]);
    expect(fade.startMs).toBe(400);
    expect(fade.startMs).toBeGreaterThan(turn.startMs); // feet start moving during the turn
    expect(fade.startMs).toBeLessThan(turn.endMs);
    expect([walk.startMs, walk.endMs]).toEqual([500, 1500]);
    expect(walk.startMs).toBeGreaterThan(fade.startMs);
    expect(walk.endMs).toBe(TIMING.entry.doneMs);
  });

  it("beat F: HUD buttons, touch controls and hint enter in that order, all before ENTRY_DONE + 300", () => {
    const buttons = beat(PLAY_BEATS, "F1.hud-buttons");
    const touch = beat(PLAY_BEATS, "F2.hud-touch");
    const hint = beat(PLAY_BEATS, "F3.hud-hint");
    expect([buttons.startMs, buttons.endMs]).toEqual([1000, 1300]);
    expect([touch.startMs, touch.endMs]).toEqual([1200, 1500]);
    expect([hint.startMs, hint.endMs]).toEqual([1500, 1800]);
    expect(buttons.startMs).toBeLessThan(touch.startMs);
    expect(touch.startMs).toBeLessThan(hint.startMs);
  });

  it("click to input enabled is 1860 ms warm, and the HUD is complete by C + 2160", () => {
    expect(WARM_CLICK_TO_INPUT_MS).toBe(1860);
    const lastEnd = Math.max(...PLAY_BEATS.map((b) => sinceClick(b, "endMs")));
    expect(lastEnd).toBe(2160);
    expect(WARM_CLICK_TO_INPUT_MS).toBeGreaterThanOrEqual(1500);
    expect(WARM_CLICK_TO_INPUT_MS).toBeLessThanOrEqual(2500);
  });

  it("every beat has a positive duration that fits its clock", () => {
    for (const b of PLAY_BEATS) {
      expect(b.endMs).toBeGreaterThan(b.startMs);
      expect(b.startMs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Exit timeline (sections 4.1 to 4.5)", () => {
  it("the 3D leg is 700 ms, the swap is at X+700, chrome is back at X+1100", () => {
    expect(beat(EXIT_BEATS, "X1.camera").endMs).toBe(700);
    expect(beat(EXIT_BEATS, "X2.swap").startMs).toBe(700);
    expect(beat(EXIT_BEATS, "X3.chrome-in").endMs).toBe(1100);
    expect(TIMING.exit.totalMs).toBe(TIMING.exit.swapMs + TIMING.exit.chromeBackMs);
  });

  it("HUD fades in 200 ms, the turn takes 420 ms, the world closes X+100..600", () => {
    expect(beat(EXIT_BEATS, "X1.hud-out").endMs).toBe(200);
    expect(beat(EXIT_BEATS, "X1.avatar-turn").endMs).toBe(420);
    const w = beat(EXIT_BEATS, "X1.world-close");
    expect([w.startMs, w.endMs]).toEqual([100, 600]);
  });

  it("everything of the 3D leg ends before the swap, and the canvas flip and chrome return follow it", () => {
    const swap = beat(EXIT_BEATS, "X2.swap").startMs;
    for (const id of ["X1.hud-out", "X1.avatar-turn", "X1.camera", "X1.world-close"]) expect(beat(EXIT_BEATS, id).endMs).toBeLessThanOrEqual(swap);
    expect(beat(EXIT_BEATS, "X2.canvas-flip").startMs).toBe(swap);
    expect(beat(EXIT_BEATS, "X3.chrome-in").startMs).toBe(swap);
  });

  it("the fallback is later than the leg so a late frame never races it", () => {
    expect(TIMING.exit.fallbackMs).toBeGreaterThan(TIMING.exit.cameraMs);
  });
});

describe("chrome stagger and easing (sections 2.1 and 4.3)", () => {
  const t = (id: keyof typeof CHROME, hidden: boolean, i = 0, reduced = false) => chromeTransition(CHROME[id], hidden, i, reduced);

  it("leaving elements use ease-in with the Beat A offsets", () => {
    expect(t("title", true)).toBe(`opacity 300ms ${EASE.in} 60ms, translate 300ms ${EASE.in} 60ms`);
    expect(t("hints", true)).toBe(`opacity 300ms ${EASE.in} 40ms, translate 300ms ${EASE.in} 40ms`);
    expect(t("status", true)).toBe(`opacity 120ms ${EASE.in} 0ms`);
  });

  it("arriving elements use ease-out with the Beat X3 offsets", () => {
    expect(t("title", false)).toBe(`opacity 300ms ${EASE.out} 0ms, translate 300ms ${EASE.out} 0ms`);
    expect(t("gestures", false)).toBe(`opacity 300ms ${EASE.out} 60ms, translate 300ms ${EASE.out} 60ms`);
    expect(t("hints", false)).toBe(`opacity 300ms ${EASE.out} 100ms, translate 300ms ${EASE.out} 100ms`);
    expect(t("status", false)).toBe(`opacity 180ms ${EASE.out} 120ms`);
  });

  it("children are staggered by 20 ms each way and still end together at the item's end", () => {
    expect(t("gestures", true, 0)).toBe(`opacity 300ms ${EASE.in} 0ms, translate 300ms ${EASE.in} 0ms`);
    expect(t("gestures", true, 3)).toBe(`opacity 240ms ${EASE.in} 60ms, translate 240ms ${EASE.in} 60ms`);
    expect(t("chips", false, 2)).toBe(`opacity 260ms ${EASE.out} 100ms, translate 260ms ${EASE.out} 100ms`);
  });

  it("no child of any item runs past the item's end, in either direction, for up to ten children", () => {
    const parse = (s: string) => {
      const m = /opacity (\d+)ms \S+ \S+ \S+ \S+ (\d+)ms/.exec(s) ?? /opacity (\d+)ms cubic-bezier\([^)]*\) (\d+)ms/.exec(s);
      return { dur: Number(m![1]), delay: Number(m![2]) };
    };
    for (const item of Object.values(CHROME)) {
      for (let i = 0; i < 10; i++) {
        const out = parse(chromeTransition(item, true, i, false));
        const back = parse(chromeTransition(item, false, i, false));
        expect(out.delay + out.dur).toBeLessThanOrEqual(item.outEndMs);
        expect(back.delay + back.dur).toBeLessThanOrEqual(item.inEndMs);
        expect(out.delay + out.dur).toBeLessThanOrEqual(TIMING.chromeMs); // gone when the chrome is removed
        expect(back.delay + back.dur).toBeLessThanOrEqual(TIMING.exit.chromeBackMs);
      }
    }
    expect(CHROME.title.outEndMs).toBe(360);
  });

  it("directions: gestures leave left, hints right, title and chips down", () => {
    expect(chromeTranslate(CHROME.gestures, true, false)).toBe("-24px 0px");
    expect(chromeTranslate(CHROME.hints, true, false)).toBe("24px 0px");
    expect(chromeTranslate(CHROME.title, true, false)).toBe("0px 32px");
    expect(chromeTranslate(CHROME.chips, true, false)).toBe("0px 24px");
    expect(chromeTranslate(CHROME.status, true, false)).toBeUndefined();
    expect(chromeTranslate(CHROME.title, false, false)).toBe("none");
    expect(NAV.distance).toBe(24);
  });

  it("reduced motion is a 150 ms opacity crossfade with no translation at all", () => {
    for (const id of Object.keys(CHROME) as Array<keyof typeof CHROME>) {
      for (const hidden of [true, false]) {
        expect(t(id, hidden, 4, true)).toBe(`opacity 150ms ${EASE.out}`);
        expect(chromeTranslate(CHROME[id], hidden, true) ?? "none").toBe("none");
      }
    }
  });
});

describe("experience attribute", () => {
  it.each([
    ["hero", "hero"],
    ["chrome-out", "leaving"],
    ["waiting", "leaving"],
    ["entering", "game"],
    ["game", "game"],
    ["leaving", "game"],
    ["returning", "returning"],
  ] as Array<[Phase, string]>)("%s -> %s", (phase, attr) => expect(experienceAttribute(phase)).toBe(attr));
});
