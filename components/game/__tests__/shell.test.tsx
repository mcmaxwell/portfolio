// @vitest-environment jsdom
// Experience shell (jsdom, a fake GameModule): Play, loading, swap, Exit, Cancel, failures,
// faults, reduced motion, prefetch, and that repeated cycles leave no listener, timer or style behind.
import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGame } from "../session";
import type { GameModule, LoaderDeps } from "../shell/gameLoader";
import { LoadingStrip } from "../shell/LoadingOverlay";
import { readLayoutParam, useExperienceShell, type ExperienceShell } from "../shell/useExperienceShell";

type Rig = {
  shell: () => ExperienceShell;
  stopVoice: ReturnType<typeof vi.fn>;
  mod: GameModule & { createGame: ReturnType<typeof vi.fn>; loadGameAssets: ReturnType<typeof vi.fn>; prewarmWorld: ReturnType<typeof vi.fn>; prepareWorld: ReturnType<typeof vi.fn> };
  importGame: ReturnType<typeof vi.fn>;
  play: HTMLButtonElement;
  stage: HTMLElement;
  setStageTop(n: number): void;
  unmount(): void;
};

let reducedMotion = false;
let coarse = false;
let scrollY = 0;
let importFails = 0;
let assetsFail = false;

function fakeModule() {
  return {
    createGame: vi.fn((o: { reducedMotion: boolean }) => createGame(o)),
    loadGameAssets: vi.fn(async (cb: (l: number, t: number) => void) => {
      if (assetsFail) throw new Error("clips 503");
      cb(1, 1);
      return { clips: {} };
    }),
    prewarmWorld: vi.fn(async () => {}),
    prepareWorld: vi.fn(),
  } as unknown as Rig["mod"];
}

function setup(): Rig {
  const mod = fakeModule();
  const importGame = vi.fn(async () => {
    if (importFails > 0) {
      importFails--;
      throw new Error("offline");
    }
    return mod;
  });
  const stopVoice = vi.fn();
  let latest!: ExperienceShell;
  let stageTop = 0;
  let stageEl!: HTMLElement;
  let playEl!: HTMLButtonElement;
  function Harness() {
    const playRef = useRef<HTMLButtonElement | null>(null);
    const stageRef = useRef<HTMLElement | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const shell = useExperienceShell({
      stopVoice: () => {
        stopVoice(latest?.phase);
      },
      returnFocusRef: playRef,
      stageRef,
      canvasWrapRef: wrapRef,
      loaderDeps: { importGame, physicsTimeoutMs: 20000, prefetchMode: () => (coarse ? "code" : "code+assets") } as unknown as Partial<LoaderDeps>,
    });
    latest = shell;
    return (
      <>
      <nav data-testid="nav"><a href="#projects">Projects</a></nav>
      <section
        ref={(el) => {
          stageRef.current = el;
          stageEl = el as HTMLElement;
          if (el) el.getBoundingClientRect = () => ({ top: stageTop, left: 0, width: 1000, height: 800, right: 1000, bottom: stageTop + 800, x: 0, y: stageTop, toJSON() {} });
        }}
      >
        <div ref={wrapRef} />
        <div data-testid="gestures">
          <button data-xfade>wave</button>
        </div>
        <div data-xfade data-testid="chrome">
          <button
            ref={(el) => {
              playRef.current = el;
              playEl = el as HTMLButtonElement;
            }}
          >
            play
          </button>
        </div>
        {shell.strip !== "off" && <LoadingStrip progress={0.5} visible={shell.strip === "in"} reduced={false} onCancel={shell.cancel} />}
      </section>
      <footer data-testid="footer"><a href="#top">Top</a></footer>
      </>
    );
  }
  const r = render(<Harness />);
  return {
    shell: () => latest,
    stopVoice,
    mod,
    importGame,
    play: playEl,
    stage: stageEl,
    setStageTop: (n) => (stageTop = n),
    unmount: () => r.unmount(),
  };
}

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
};
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await flush();
};
const root = document.documentElement;

/** Click Play, let the (instant) fake load finish except physics, then report physics ready. */
async function play(rig: Rig, { physicsAfterMs = 0 }: { physicsAfterMs?: number } = {}) {
  act(() => rig.shell().play());
  await flush();
  if (physicsAfterMs > 0) await advance(physicsAfterMs);
  act(() => rig.shell().reportPhysics("ready"));
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date", "requestAnimationFrame", "cancelAnimationFrame"] });
  reducedMotion = false;
  coarse = false;
  scrollY = 0;
  importFails = 0;
  assetsFail = false;
  window.scrollTo = vi.fn() as never;
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
  window.matchMedia = ((q: string) => ({
    matches: q.includes("reduce") ? reducedMotion : q.includes("coarse") ? coarse : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as never;
  root.removeAttribute("style");
  document.body.removeAttribute("style");
  delete root.dataset.experience;
});
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Play", () => {
  it("stops the voice session synchronously, before any phase change, and exactly once", async () => {
    const rig = setup();
    act(() => rig.shell().play());
    expect(rig.stopVoice).toHaveBeenCalledTimes(1);
    expect(rig.stopVoice).toHaveBeenCalledWith("hero"); // phase was still hero when the mic was cut
    expect(rig.shell().phase).toBe("chrome-out");
    act(() => rig.shell().play()); // a second click cannot happen
    expect(rig.stopVoice).toHaveBeenCalledTimes(1);
    await flush();
    expect(rig.importGame).toHaveBeenCalledTimes(1);
  });

  it("locks scroll at the click without moving anything and marks the experience attribute", async () => {
    scrollY = 300;
    root.style.overflowY = "auto";
    document.body.style.position = "relative";
    const rig = setup();
    rig.setStageTop(-300);
    act(() => rig.shell().play());
    expect(root.dataset.experience).toBe("leaving");
    expect(root.style.overflowY).toBe("scroll"); // the scrollbar track stays: no sideways shift
    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-300px");
    expect(rig.shell().canvasFixed).toBe(true);
    expect(rig.shell().canvasRaised).toBe(false); // still under the chrome until the swap
    expect(rig.shell().chromeMounted).toBe(true);
    expect(rig.shell().chromeHidden).toBe(true);
    expect(rig.shell().backdrop).toBe(true); // scrolled: opaque stage behind the fixed canvas
    expect(rig.shell().flip).toEqual({ y: -300, animate: false });
    await advance(40); // two animation frames
    expect(rig.shell().flip).toEqual({ y: 0, animate: true });
  });

  it("does not translate the canvas when the hero is not scrolled", () => {
    const rig = setup();
    act(() => rig.shell().play());
    expect(rig.shell().flip).toEqual({ y: 0, animate: false });
    expect(rig.shell().backdrop).toBe(false);
  });

  it("warm: enters exactly at C + 360 ms, not before", async () => {
    const rig = setup();
    await play(rig);
    await advance(359);
    expect(rig.shell().phase).toBe("chrome-out");
    expect(rig.shell().chromeMounted).toBe(true);
    await advance(1);
    expect(rig.shell().phase).toBe("entering");
    expect(rig.shell().chromeMounted).toBe(false);
    expect(rig.shell().inGame).toBe(true);
    expect(rig.shell().canvasRaised).toBe(true);
    expect(root.dataset.experience).toBe("game");
    expect(rig.shell().strip).toBe("off"); // a warm start never flashes the strip
    expect(rig.shell().chromeDone).toBe(true);
  });

  describe("waits for the chrome's own transitions", () => {
    class FakeTransition {
      finished: Promise<unknown>;
      end!: () => void;
      constructor() {
        this.finished = new Promise((r) => (this.end = () => r(undefined)));
      }
    }
    beforeEach(() => {
      (globalThis as unknown as { CSSTransition: unknown }).CSSTransition = FakeTransition;
    });
    afterEach(() => {
      delete (globalThis as unknown as { CSSTransition?: unknown }).CSSTransition;
    });

    it("a transition that outlasts C + 360 (slow first frame) delays the removal and the swap until it ends", async () => {
      const rig = setup();
      const slow = new FakeTransition();
      (rig.stage as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [slow];
      await play(rig);
      await advance(500);
      expect(rig.shell().phase).toBe("chrome-out"); // nominal time passed, the title is still fading
      expect(rig.shell().chromeMounted).toBe(true);
      slow.end();
      await flush();
      expect(rig.shell().phase).toBe("entering");
      expect(rig.shell().chromeMounted).toBe(false);
    });

    it("never waits more than 300 ms beyond the nominal time for a stuck transition", async () => {
      const rig = setup();
      (rig.stage as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [new FakeTransition()];
      await play(rig);
      await advance(659);
      expect(rig.shell().phase).toBe("chrome-out");
      await advance(1);
      expect(rig.shell().phase).toBe("entering");
    });

    it("a Cancel while waiting for a transition is not overtaken by it finishing later", async () => {
      const rig = setup();
      const slow = new FakeTransition();
      (rig.stage as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [slow];
      await play(rig);
      await advance(400);
      act(() => rig.shell().cancel());
      slow.end();
      await advance(1200);
      expect(rig.shell().phase).toBe("hero");
      expect(rig.shell().chromeDone).toBe(false);
    });
  });

  it("the game handle is created once the code arrives, with the reduced-motion flag read at the click", async () => {
    reducedMotion = true;
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    expect(rig.mod.createGame).toHaveBeenCalledWith({ reducedMotion: true });
    expect(rig.shell().game?.handle.reducedMotion).toBe(true);
    expect(rig.shell().reduced).toBe(true);
  });

  it("entering becomes game when the session leaves entering", async () => {
    const rig = setup();
    await play(rig);
    await advance(360);
    expect(rig.shell().phase).toBe("entering");
    act(() => rig.shell().game!.handle.session.dispatch({ type: "ENTRY_DONE" }));
    expect(rig.shell().phase).toBe("game");
    expect(root.dataset.experience).toBe("game");
  });
});

describe("loading case (no blocking screen)", () => {
  it("shows the inline strip only after 400 ms, and only while loading", async () => {
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    await advance(399);
    expect(rig.shell().strip).toBe("off");
    await advance(1);
    expect(rig.shell().strip).toBe("in");
    expect(rig.shell().phase).toBe("waiting"); // the chrome is gone, the stage is not blocked
  });

  it("resumes into the entry when the assets arrive, without replaying the chrome exit", async () => {
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    await advance(700);
    expect(rig.shell().phase).toBe("waiting");
    const hiddenBefore = rig.shell().chromeHidden;
    act(() => rig.shell().reportPhysics("ready"));
    await flush();
    expect(rig.shell().phase).toBe("entering");
    expect(rig.shell().chromeHidden).toBe(hiddenBefore); // not toggled back and forth
    expect(rig.shell().strip).toBe("out");
    await advance(150);
    expect(rig.shell().strip).toBe("off");
  });

  it("keeps the strip visible for at least 300 ms once shown", async () => {
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    await advance(400); // strip appears
    expect(rig.shell().strip).toBe("in");
    await advance(50);
    act(() => rig.shell().reportPhysics("ready")); // ready 50 ms after the strip appeared
    await flush();
    expect(rig.shell().phase).toBe("waiting");
    await advance(249);
    expect(rig.shell().phase).toBe("waiting");
    await advance(1);
    expect(rig.shell().phase).toBe("entering");
  });

  it("Escape cancels while loading and restores the hero", async () => {
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    await advance(500);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    });
    expect(rig.shell().phase).toBe("returning");
    await advance(400);
    expect(rig.shell().phase).toBe("hero");
  });

  it("Cancel during loading disposes the handle, restores page and focus, and focuses Play without scrolling", async () => {
    scrollY = 300;
    const rig = setup();
    rig.setStageTop(-300);
    const focus = vi.spyOn(rig.play, "focus");
    act(() => rig.shell().play());
    await flush();
    await advance(500);
    const handle = rig.shell().game!.handle;
    expect(handle.disposed).toBe(false);
    act(() => rig.shell().cancel());
    expect(handle.disposed).toBe(true);
    expect(rig.shell().game).toBeNull();
    expect(rig.shell().load.kind).toBe("idle");
    expect(root.style.overflowY).toBe("");
    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 300, behavior: "instant" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(rig.play).toHaveFocus();
    expect(rig.shell().chromeMounted).toBe(true);
    expect(rig.shell().canvasFixed).toBe(false);
    expect(rig.shell().flip).toEqual({ y: 300, animate: false }); // reverse FLIP starts where the fixed canvas was
    await advance(40);
    expect(rig.shell().flip).toEqual({ y: 0, animate: true });
    await advance(400);
    expect(rig.shell().phase).toBe("hero");
    expect(root.dataset.experience).toBe("hero");
    expect(rig.shell().backdrop).toBe(false);
    expect(rig.shell().flip).toEqual({ y: 0, animate: false });
  });

  it("Cancel in the middle of the chrome exit brings the same chrome back without remounting it", async () => {
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    await advance(150);
    expect(rig.shell().chromeHidden).toBe(true);
    act(() => rig.shell().cancel());
    expect(rig.shell().phase).toBe("returning");
    expect(rig.shell().chromeMounted).toBe(true);
    expect(rig.shell().chromeHidden).toBe(false); // transitions straight back
  });

  it("a load that finishes after Cancel never enters the game", async () => {
    const rig = setup();
    act(() => rig.shell().play());
    act(() => rig.shell().cancel());
    await flush();
    act(() => rig.shell().reportPhysics("ready"));
    await advance(2000);
    expect(rig.shell().phase).toBe("hero");
    expect(rig.shell().game).toBeNull();
  });
});

describe("failures", () => {
  it("a failed download shows the failure state (Retry, Back) and leaves the page usable after Back", async () => {
    importFails = 1;
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    expect(rig.shell().failure).toMatchObject({ kind: "load", title: "Could not start the game", message: expect.stringContaining("could not be downloaded") });
    expect(rig.shell().failure?.message).not.toContain("offline");
    expect(rig.shell().strip).toBe("off");
    act(() => rig.shell().back());
    await advance(40);
    expect(rig.shell().failure).toBeNull();
    expect(rig.shell().phase).toBe("returning");
    await advance(400);
    expect(rig.shell().phase).toBe("hero");
    expect(document.body.style.position).toBe("");
    expect(root.style.overflowY).toBe("");
  });

  it("Retry after a failed download loads the game and enters it", async () => {
    importFails = 1;
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    await advance(500);
    expect(rig.shell().failure).not.toBeNull();
    act(() => rig.shell().retry());
    await flush();
    expect(rig.shell().failure).toBeNull();
    expect(rig.importGame).toHaveBeenCalledTimes(2);
    act(() => rig.shell().reportPhysics("ready"));
    await flush();
    expect(rig.shell().phase).toBe("waiting"); // the strip reappeared with Retry: it stays 300 ms
    await advance(300);
    expect(rig.shell().phase).toBe("entering");
  });

  it("an asset download failure is a failure too, with a fresh game handle after Retry", async () => {
    assetsFail = true;
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    expect(rig.shell().failure).toMatchObject({ kind: "load", message: expect.stringContaining("could not be downloaded") });
    const first = rig.shell().game!.handle;
    assetsFail = false;
    act(() => rig.shell().retry());
    await flush();
    expect(first.disposed).toBe(true); // no leaked handle from the failed run
    expect(rig.shell().game!.handle).not.toBe(first);
  });

  it("a physics failure while loading is a failure", async () => {
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    act(() => rig.shell().reportPhysics(new Error("wasm failed")));
    expect(rig.shell().failure).toMatchObject({ kind: "load", message: expect.stringContaining("engine could not start") });
  });

  it("a lost graphics context after the start shows the fault dialog, stops the session, and Back cleans up", async () => {
    const rig = setup();
    await play(rig);
    await advance(360);
    const handle = rig.shell().game!.handle;
    act(() => rig.shell().reportFault("context-lost"));
    expect(rig.shell().failure).toMatchObject({ kind: "context-lost", title: "Graphics were interrupted" });
    expect(handle.session.getState()).toMatchObject({ mode: "fault", fault: "context-lost" });
    act(() => rig.shell().back());
    await advance(40);
    expect(handle.disposed).toBe(true);
    expect(rig.shell().failure).toBeNull();
    expect(rig.shell().phase).toBe("returning");
    await advance(400);
    expect(rig.shell().phase).toBe("hero");
  });

  it("Retry after a fault returns to the hero and plays again", async () => {
    const rig = setup();
    await play(rig);
    await advance(360);
    act(() => rig.shell().reportFault("runtime"));
    expect(rig.shell().failure).toMatchObject({ kind: "runtime" });
    act(() => rig.shell().retry());
    await advance(40);
    expect(rig.shell().phase).toBe("returning");
    await advance(400);
    await flush();
    expect(rig.shell().phase).toBe("chrome-out"); // the replay started
    expect(rig.stopVoice).toHaveBeenCalledTimes(2);
  });

  it("a fault before the hero is left is ignored", () => {
    const rig = setup();
    act(() => rig.shell().reportFault("context-lost"));
    expect(rig.shell().failure).toBeNull();
  });
});

describe("Exit", () => {
  async function toGame(rig: Rig) {
    await play(rig);
    await advance(360);
    act(() => rig.shell().game!.handle.session.dispatch({ type: "ENTRY_DONE" }));
  }

  it("starts the 3D leg, swaps when the game reports the leg done, and restores page, scroll and focus", async () => {
    scrollY = 300;
    const rig = setup();
    rig.setStageTop(-300);
    await toGame(rig);
    expect(document.body.style.top).toBe("-300px");
    const handle = rig.shell().game!.handle;
    act(() => rig.shell().exit());
    expect(rig.shell().phase).toBe("leaving");
    expect(handle.session.getState().mode).toBe("leaving");
    expect(rig.shell().inGame).toBe(true); // the game is still on screen during the leg
    act(() => rig.shell().exitLegDone());
    await advance(40); // the swap back waits two frames (rendering is held first)
    expect(handle.disposed).toBe(true);
    expect(rig.shell().phase).toBe("returning");
    expect(root.dataset.experience).toBe("returning");
    expect(rig.shell().inGame).toBe(false);
    expect(rig.shell().chromeMounted).toBe(true);
    expect(rig.shell().chromeHidden).toBe(true); // mounted hidden, then animates in
    expect(rig.shell().canvasFixed).toBe(false);
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 300, behavior: "instant" });
    expect(root.style.overflowY).toBe("");
    expect(document.body.style.position).toBe("");
    expect(rig.play).toHaveFocus();
    await advance(40);
    expect(rig.shell().chromeHidden).toBe(false);
    await advance(400);
    expect(rig.shell().phase).toBe("hero");
    expect(rig.shell().announce).toBe("");
  });

  it("swaps by itself if the game never reports the end of the leg", async () => {
    const rig = setup();
    await toGame(rig);
    act(() => rig.shell().exit());
    await advance(2499);
    expect(rig.shell().phase).toBe("leaving");
    await advance(1);
    await advance(40);
    expect(rig.shell().phase).toBe("returning");
  });

  it("announces the return in a polite live region", async () => {
    const rig = setup();
    await toGame(rig);
    act(() => rig.shell().exit());
    act(() => rig.shell().exitLegDone());
    await advance(40); // the swap back waits two frames (rendering is held first)
    expect(rig.shell().announce).toBe("Back to portfolio");
  });

  it("Exit is ignored while loading beyond Cancel semantics and twice in a row", async () => {
    const rig = setup();
    await toGame(rig);
    act(() => rig.shell().exit());
    act(() => rig.shell().exit());
    expect(rig.shell().phase).toBe("leaving");
    act(() => rig.shell().exitLegDone());
    await advance(40); // the swap back waits two frames (rendering is held first)
    act(() => rig.shell().exitLegDone());
    await advance(40); // the swap back waits two frames (rendering is held first) // a second report changes nothing
    expect(rig.shell().phase).toBe("returning");
  });

  it("Exit during the entry works (the leg starts from wherever the entry was)", async () => {
    const rig = setup();
    await play(rig);
    await advance(360);
    expect(rig.shell().phase).toBe("entering");
    act(() => rig.shell().exit());
    expect(rig.shell().phase).toBe("leaving");
    expect(rig.shell().game!.handle.session.getState().mode).toBe("leaving");
  });

  it("can Play again after an Exit", async () => {
    const rig = setup();
    await toGame(rig);
    act(() => rig.shell().exit());
    act(() => rig.shell().exitLegDone());
    await advance(40); // the swap back waits two frames (rendering is held first)
    await advance(400);
    expect(rig.shell().phase).toBe("hero");
    await play(rig);
    await advance(360);
    expect(rig.shell().phase).toBe("entering");
    expect(rig.mod.createGame).toHaveBeenCalledTimes(2);
  });
});

describe("focus after Exit when the loading strip was shown (F-M2-1)", () => {
  async function toGameAfterStrip(rig: Rig) {
    act(() => rig.shell().play());
    await flush();
    await advance(400); // slow load: the strip is shown
    expect(rig.shell().strip).toBe("in");
    expect(document.activeElement).toBe(screen.getByText("[ cancel ]"));
    act(() => rig.shell().reportPhysics("ready"));
    await flush();
    await advance(400);
    act(() => rig.shell().game!.handle.session.dispatch({ type: "ENTRY_DONE" }));
  }
  async function exitAndCheck(rig: Rig) {
    act(() => rig.shell().exit());
    act(() => rig.shell().exitLegDone());
    for (let i = 0; i < 12; i++) {
      await advance(40);
      expect(rig.shell().strip).toBe("off"); // the strip never comes back during Exit
      expect(screen.queryByText("[ cancel ]")).toBeNull();
    }
    await advance(600);
    expect(rig.shell().phase).toBe("hero");
    expect(rig.play).toHaveFocus();
  }

  it("slow load, enter, Exit: the strip is not remounted and focus ends on Play", async () => {
    const rig = setup();
    await toGameAfterStrip(rig);
    await exitAndCheck(rig);
  });

  it("Retry after a failure, enter, Exit: focus ends on Play", async () => {
    importFails = 1;
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    await advance(500);
    act(() => rig.shell().retry());
    await flush();
    await advance(400);
    act(() => rig.shell().reportPhysics("ready"));
    await flush();
    await advance(400);
    act(() => rig.shell().game!.handle.session.dispatch({ type: "ENTRY_DONE" }));
    await exitAndCheck(rig);
  });

  it("a strip that mounts already faded out never takes focus", async () => {
    render(<LoadingStrip progress={0} visible={false} reduced={false} onCancel={() => {}} />);
    expect(document.activeElement).toBe(document.body);
  });
});

describe("rendering pause (design 2.3)", () => {
  it("renderPaused is true exactly while the session is paused or faulted, and false again after the game is gone", async () => {
    const rig = setup();
    await play(rig);
    await advance(360);
    const session = rig.shell().game!.handle.session;
    expect(rig.shell().renderPaused).toBe(false);
    act(() => session.dispatch({ type: "PAUSE", reason: "user" }));
    expect(rig.shell().renderPaused).toBe(true);
    act(() => session.dispatch({ type: "RESUME" }));
    expect(rig.shell().renderPaused).toBe(false);
    act(() => session.dispatch({ type: "PAUSE", reason: "hidden" }));
    expect(rig.shell().renderPaused).toBe(true);
    act(() => rig.shell().exit()); // exiting from the pause menu: rendering must run for the leg
    expect(rig.shell().renderPaused).toBe(false);
    act(() => rig.shell().exitLegDone());
    expect(rig.shell().renderPaused).toBe(true); // held: the hero Avatar mounts a frame after its lights
    await advance(40);
    act(() => rig.shell().heroReady());
    expect(rig.shell().renderPaused).toBe(false);
  });

  it("the hold after the swap back never lasts longer than 800 ms even if the hero never reports", async () => {
    const rig = setup();
    await play(rig);
    await advance(360);
    act(() => rig.shell().exit());
    act(() => rig.shell().exitLegDone());
    await advance(799);
    expect(rig.shell().renderPaused).toBe(true);
    await advance(1);
    expect(rig.shell().renderPaused).toBe(false);
  });

  it("a fault stops rendering until Back", async () => {
    const rig = setup();
    await play(rig);
    await advance(360);
    act(() => rig.shell().reportFault("context-lost"));
    expect(rig.shell().renderPaused).toBe(true);
    act(() => rig.shell().back());
    await advance(40);
    act(() => rig.shell().heroReady());
    expect(rig.shell().renderPaused).toBe(false);
  });
});

describe("reduced motion", () => {
  it("the chrome crossfade is 150 ms, the canvas does not translate, and Exit has no 3D wait beyond the leg report", async () => {
    reducedMotion = true;
    scrollY = 300;
    const rig = setup();
    rig.setStageTop(-300);
    act(() => rig.shell().play());
    expect(rig.shell().flip).toEqual({ y: 0, animate: false });
    act(() => rig.shell().reportPhysics("ready"));
    await flush();
    await advance(149);
    expect(rig.shell().phase).toBe("chrome-out");
    await advance(1);
    expect(rig.shell().phase).toBe("entering"); // 150 ms, not 360
    act(() => rig.shell().exit());
    act(() => rig.shell().exitLegDone());
    await advance(40); // the swap back waits two frames (rendering is held first)
    await advance(40);
    expect(rig.shell().flip).toEqual({ y: 0, animate: false }); // no reverse FLIP either
    await advance(150);
    expect(rig.shell().phase).toBe("hero");
  });
});

describe("prefetch and early shader compile", () => {
  const canvasState = { gl: {}, scene: {}, camera: {} };

  it("the campus is the default world and ?arena=test selects the M1 test arena", () => {
    expect(readLayoutParam("")).toBe("campus");
    expect(readLayoutParam("?arena=campus")).toBe("campus");
    expect(readLayoutParam("?x=1&arena=test")).toBe("test-arena");
  });

  it("hover imports the game once, then compiles the world once on a fine pointer", async () => {
    const rig = setup();
    rig.shell().onCanvasCreated(canvasState);
    rig.shell().prefetch("hover");
    rig.shell().prefetch("focus");
    rig.shell().prefetch("press");
    await flush();
    expect(rig.importGame).toHaveBeenCalledTimes(1);
    expect(rig.mod.prewarmWorld).toHaveBeenCalledTimes(1);
    expect(rig.mod.prewarmWorld).toHaveBeenCalledWith(canvasState, "campus");
    expect(rig.mod.loadGameAssets).toHaveBeenCalled(); // fine pointer: clips too
    expect(rig.shell().load.kind).toBe("idle"); // nothing shown
    expect(rig.shell().game).toBeNull(); // nothing mounted
    act(() => rig.shell().play());
    await flush();
    expect(rig.importGame).toHaveBeenCalledTimes(1); // Play does not download twice
  });

  it("pointerdown alone fetches but does not compile (the compile would land inside the chrome exit)", async () => {
    const rig = setup();
    rig.shell().onCanvasCreated(canvasState);
    rig.shell().prefetch("press");
    await flush();
    expect(rig.importGame).toHaveBeenCalledTimes(1);
    expect(rig.mod.prewarmWorld).not.toHaveBeenCalled();
  });

  it("a coarse pointer fetches only the code and never compiles early", async () => {
    coarse = true;
    const rig = setup();
    rig.shell().onCanvasCreated(canvasState);
    rig.shell().prefetch("hover");
    await flush();
    expect(rig.importGame).toHaveBeenCalledTimes(1);
    expect(rig.mod.loadGameAssets).not.toHaveBeenCalled();
    expect(rig.mod.prewarmWorld).not.toHaveBeenCalled();
  });

  it("does not compile before the canvas exists", async () => {
    const rig = setup();
    rig.shell().prefetch("hover");
    await flush();
    expect(rig.mod.prewarmWorld).not.toHaveBeenCalled();
  });

  it("starts painting the world textures for every trigger, a coarse pointer and a missing canvas included", async () => {
    for (const trigger of ["hover", "focus", "press"] as const) {
      cleanup();
      coarse = trigger === "press";
      const rig = setup();
      rig.shell().prefetch(trigger); // no canvas yet
      await flush();
      expect(rig.mod.prepareWorld).toHaveBeenCalledWith("campus");
      expect(rig.mod.prewarmWorld).not.toHaveBeenCalled();
    }
  });
});

describe("repeated cycles leave nothing behind", () => {
  function listenerBalance() {
    const counts = new Map<string, number>();
    const spy = (target: EventTarget, label: string) => {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      const live = new Map<string, Set<unknown>>();
      target.addEventListener = ((type: string, fn: unknown, opts?: unknown) => {
        const key = `${label}:${type}:${typeof opts === "object" && opts ? !!(opts as { capture?: boolean }).capture : !!opts}`;
        (live.get(key) ?? live.set(key, new Set()).get(key)!).add(fn);
        return add(type, fn as never, opts as never);
      }) as never;
      target.removeEventListener = ((type: string, fn: unknown, opts?: unknown) => {
        const key = `${label}:${type}:${typeof opts === "object" && opts ? !!(opts as { capture?: boolean }).capture : !!opts}`;
        live.get(key)?.delete(fn);
        return remove(type, fn as never, opts as never);
      }) as never;
      return () => {
        live.forEach((set, key) => counts.set(key, set.size));
        return new Map(Array.from(live.entries()).map(([k, s]) => [k, s.size] as const).filter(([, n]) => n > 0));
      };
    };
    const w = spy(window, "window");
    const d = spy(document, "document");
    return () => new Map(Array.from(w().entries()).concat(Array.from(d().entries())));
  }

  it("5 Play and Exit cycles: listeners balance, no timer is left, styles and attribute are restored", async () => {
    const original = { overflow: "auto", gutter: "stable" };
    root.style.overflow = original.overflow;
    root.style.scrollbarGutter = original.gutter;
    const rig = setup();
    const snapshot = listenerBalance();
    const before = snapshot();
    for (let i = 0; i < 5; i++) {
      await play(rig);
      await advance(360);
      act(() => rig.shell().game!.handle.session.dispatch({ type: "ENTRY_DONE" }));
      act(() => rig.shell().exit());
      act(() => rig.shell().exitLegDone());
    await advance(40); // the swap back waits two frames (rendering is held first)
      await advance(1200);
      expect(rig.shell().phase).toBe("hero");
      expect(rig.play).toHaveFocus();
      expect(root.style.overflow).toBe(original.overflow);
      expect(root.style.scrollbarGutter).toBe(original.gutter);
      expect(root.style.overflowY).toBe("");
      expect(document.body.getAttribute("style") ?? "").toBe("");
      expect(root.dataset.experience).toBe("hero");
      expect(vi.getTimerCount()).toBe(0);
    }
    expect(snapshot()).toEqual(before);
    expect(rig.mod.createGame).toHaveBeenCalledTimes(5);
  });

  it("5 Play and Cancel cycles, cancelling at different moments, leave nothing behind", async () => {
    const rig = setup();
    const snapshot = listenerBalance();
    const before = snapshot();
    const moments = [0, 150, 359, 450, 900];
    for (const ms of moments) {
      act(() => rig.shell().play());
      await flush();
      await advance(ms);
      act(() => rig.shell().cancel());
      await advance(1200);
      expect(rig.shell().phase).toBe("hero");
      expect(rig.play).toHaveFocus();
      expect(rig.shell().game).toBeNull();
      expect(rig.shell().load.kind).toBe("idle");
      expect(document.body.getAttribute("style") ?? "").toBe("");
      expect(vi.getTimerCount()).toBe(0);
    }
    expect(snapshot()).toEqual(before);
  });

  it("unmounting the page mid-game disposes the handle, cancels the load and restores everything", async () => {
    scrollY = 120;
    const rig = setup();
    await play(rig);
    await advance(360);
    const handle = rig.shell().game!.handle;
    rig.unmount();
    expect(handle.disposed).toBe(true);
    expect(document.body.getAttribute("style") ?? "").toBe("");
    expect(root.style.overflowY).toBe("");
    expect(root.dataset.experience).toBeUndefined();
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 120, behavior: "instant" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unmounting during the chrome exit leaves no timer or in-flight load", async () => {
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    rig.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(root.dataset.experience).toBeUndefined();
  });
});

describe("the page behind the game is inert while playing", () => {
  async function toGame(rig: Rig) {
    await play(rig);
    await advance(360);
    act(() => rig.shell().game!.handle.session.dispatch({ type: "ENTRY_DONE" }));
  }
  const behind = () => [screen.getByTestId("nav"), screen.getByTestId("chrome"), screen.getByTestId("gestures"), screen.getByTestId("footer")];
  const expectInert = () => {
    for (const el of behind()) {
      expect(el).toHaveAttribute("inert");
      expect(el).toHaveAttribute("aria-hidden", "true");
    }
  };
  const expectLive = () => {
    for (const el of behind()) {
      expect(el).not.toHaveAttribute("inert");
      expect(el).not.toHaveAttribute("aria-hidden");
    }
  };

  it("is inert from the click, through loading and the game, and keeps the stage itself live", async () => {
    const rig = setup();
    expectLive();
    act(() => rig.shell().play());
    expectInert();
    await flush();
    await advance(500); // the loading strip is up
    expectInert();
    expect(rig.stage).not.toHaveAttribute("inert");
    expect(rig.stage).not.toHaveAttribute("aria-hidden");
    act(() => rig.shell().reportPhysics("ready"));
    await flush();
    await advance(1000);
    expectInert();
  });

  it("Exit restores every attribute and focuses Play", async () => {
    const rig = setup();
    await toGame(rig);
    expectInert();
    act(() => rig.shell().exit());
    act(() => rig.shell().exitLegDone());
    await advance(40);
    expectLive();
    expect(rig.play).toHaveFocus();
  });

  it("Cancel while loading restores every attribute and focuses Play", async () => {
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    await advance(500);
    act(() => rig.shell().cancel());
    expectLive();
    expect(rig.play).toHaveFocus();
  });

  it("a load failure keeps the page inert behind its dialog and restores it on Back", async () => {
    importFails = 1;
    const rig = setup();
    act(() => rig.shell().play());
    await flush();
    expect(rig.shell().failure).not.toBeNull();
    expectInert();
    act(() => rig.shell().back());
    await advance(40);
    expectLive();
    expect(rig.play).toHaveFocus();
  });

  it("a lost graphics context restores the page on Back", async () => {
    const rig = setup();
    await play(rig);
    await advance(360);
    act(() => rig.shell().reportFault("context-lost"));
    expectInert();
    act(() => rig.shell().back());
    await advance(40);
    expectLive();
    expect(rig.play).toHaveFocus();
  });

  it("keeps an aria-hidden or inert the page already had, and unmounting mid-game leaves nothing behind", async () => {
    const rig = setup();
    const nav = screen.getByTestId("nav");
    nav.setAttribute("aria-hidden", "false");
    const footer = screen.getByTestId("footer");
    footer.setAttribute("inert", "");
    await toGame(rig);
    rig.unmount();
    expect(nav).toHaveAttribute("aria-hidden", "false");
    expect(nav).not.toHaveAttribute("inert");
    expect(footer).toHaveAttribute("inert");
    expect(footer).not.toHaveAttribute("aria-hidden");
  });
});
