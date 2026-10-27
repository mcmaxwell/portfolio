// The story of the memory layer, scroll position by scroll position, without a browser.
import { describe, expect, it } from "vitest";
import { Choreographer, WAVE_CYCLE, WORD_HOLD, WORD_RELEASE, smooth, waveFrame, type Rect, type Scene } from "./choreography";

const rect = (top: number, height: number, left = 0, width = 1000): Rect => ({
  top,
  bottom: top + height,
  left,
  right: left + width,
  width,
  height,
});
const base = (over: Partial<Scene> = {}): Scene => ({ vw: 1440, vh: 900, scrollY: 0, t: 0, hero: null, anchors: [], ...over });

describe("choreography", () => {
  it("is formed on the avatar but invisible at rest, then lights it up and dissolves it", () => {
    const c = new Choreographer();
    const hero = (y: number) => rect(-y, 900, 0, 1440);
    const rest = c.cue(base({ hero: hero(0) }));
    expect(rest.layer).toBe(0);
    expect(rest.want?.id).toBe("hero");
    expect(rest.scatter).toBe(0);
    expect(rest.dissolve).toBe(0);

    const lit = c.cue(base({ scrollY: 200, hero: hero(200) }));
    expect(lit.want?.id).toBe("hero");
    expect(lit.want?.cy).toBe(250);
    expect(lit.want?.fitH).toBe(900);
    expect(lit.layer).toBe(1);
    expect(lit.scatter).toBe(0);

    const gone = c.cue(base({ scrollY: 880, hero: hero(880) }));
    expect(gone.want?.id).toBe("hero");
    expect(gone.scatter).toBeGreaterThan(0.9);
    expect(gone.dissolve).toBe(1);
  });

  it("puts the core beside the statement when there is room, faintly behind it when not", () => {
    const c = new Choreographer();
    const wide = c.cue(base({ scrollY: 2000, anchors: [{ kind: "statement", id: "statement", rect: rect(200, 300, 40, 700) }] }));
    expect(wide.want?.id).toBe("core");
    expect(wide.want?.cx).toBeGreaterThan(740);
    expect(wide.want?.alpha).toBe(0.9);
    const narrow = c.cue(base({ vw: 390, scrollY: 2000, anchors: [{ kind: "statement", id: "statement", rect: rect(200, 300, 20, 350) }] }));
    expect(narrow.want?.id).toBe("core");
    expect(narrow.want?.cx).toBe(195);
    expect(narrow.want?.alpha).toBeLessThan(0.3);
  });

  it("spells a project's name as its card arrives and lets go once it has settled", () => {
    const c = new Choreographer();
    const word = (top: number, t: number) =>
      c.cue(base({ scrollY: 3000, t, anchors: [{ kind: "word", id: "xecsuite", rect: rect(top, 500, 100, 800) }] }));
    expect(word(900, 0).want).toBeNull();
    const arriving = word(650, 1);
    expect(arriving.want?.id).toBe("word:xecsuite");
    expect(arriving.want!.weight).toBeGreaterThan(0.2);
    expect(arriving.want!.weight).toBeLessThan(1);
    const settled = word(200, 2);
    expect(settled.want?.weight).toBeCloseTo(1, 5);
    expect(settled.scatter).toBeLessThan(0.01);
    expect(word(200, 2 + WORD_HOLD * 0.9).want?.weight).toBeCloseTo(1, 5);
    const released = word(200, 2 + WORD_HOLD + WORD_RELEASE + 0.1);
    expect(released.want).toBeNull();
    expect(released.scatter).toBe(1);
    // Scrolling back up and down again spells it again.
    word(900, 10);
    expect(word(200, 11).want?.id).toBe("word:xecsuite");
  });

  it("lets only the front card of a stack spell its name", () => {
    const c = new Choreographer();
    // The first card is stuck at the top, the second has slid over it.
    const cue = c.cue(
      base({
        scrollY: 4000,
        t: 1,
        anchors: [
          { kind: "word", id: "xecsuite", rect: rect(150, 500, 100, 700) },
          { kind: "word", id: "newsstocks", rect: rect(200, 500, 640, 700) },
        ],
      })
    );
    expect(cue.want?.id).toBe("word:newsstocks");
  });

  it("gathers into the avatar at contact and cycles the wave", () => {
    const c = new Choreographer();
    const wave = (t: number) => c.cue(base({ scrollY: 9000, t, anchors: [{ kind: "wave", id: "wave", rect: rect(100, 600, 900, 400) }] }));
    expect(wave(5).want?.id).toBe("wave:idle");
    expect(wave(5 + 2.25).want?.id).toBe("wave:c");
    expect(wave(5 + WAVE_CYCLE + 0.5).want?.id).toBe("wave:idle");
    expect(waveFrame(1.7)).toBe("wave:a");
    expect(waveFrame(2.6)).toBe("wave:b");
  });

  it("prefers the strongest want and ignores anchors that are not laid out", () => {
    const c = new Choreographer();
    const cue = c.cue(
      base({
        scrollY: 1170,
        hero: rect(-1170, 900, 0, 1440),
        anchors: [
          { kind: "statement", id: "statement", rect: rect(200, 300, 40, 700) },
          { kind: "wave", id: "wave", rect: rect(0, 0, 0, 0) },
        ],
      })
    );
    expect(cue.want?.id).toBe("core");
  });

  it("smooth clamps and eases", () => {
    expect(smooth(-1, 0, 1)).toBe(0);
    expect(smooth(2, 0, 1)).toBe(1);
    expect(smooth(0.5, 0, 1)).toBe(0.5);
  });
});
