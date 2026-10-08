// Session state machine: every legal row of design 2.3, representative illegal events, the store,
// and the createGame wiring (input release, cleanup order).
import { describe, expect, it, vi } from "vitest";
import {
  createGame,
  createSessionStore,
  INITIAL_SESSION,
  inputEnabledFor,
  reduceSession,
  type SessionEvent,
  type SessionMode,
  type SessionState,
} from "../session";

const at = (mode: SessionMode, over: Partial<SessionState> = {}): SessionState => ({ ...INITIAL_SESSION, mode, ...over });
const paused = (reason: "user" | "hidden" | "blur" = "user") => at("paused", { resumeTo: "playing", pauseReason: reason });
const PANEL = { kind: "skills" } as const;

describe("reduceSession: every legal row", () => {
  it("entering + ENTRY_DONE -> playing", () => {
    const s = reduceSession(at("entering"), { type: "ENTRY_DONE" });
    expect(s.mode).toBe("playing");
    expect(s.entrySkipped).toBe(false);
  });

  it("entering + ENTRY_SKIP -> entering with entrySkipped (and the same object when repeated)", () => {
    const a = reduceSession(at("entering"), { type: "ENTRY_SKIP" });
    expect(a.mode).toBe("entering");
    expect(a.entrySkipped).toBe(true);
    expect(reduceSession(a, { type: "ENTRY_SKIP" })).toBe(a);
  });

  it.each(["entering", "playing", "celebrating"] as const)("%s + PAUSE -> paused, resumeTo playing", (mode) => {
    const s = reduceSession(at(mode), { type: "PAUSE", reason: "hidden" });
    expect(s).toMatchObject({ mode: "paused", resumeTo: "playing", pauseReason: "hidden" });
  });

  it("paused + RESUME -> playing and clears the pause bookkeeping", () => {
    const s = reduceSession(paused("blur"), { type: "RESUME" });
    expect(s).toMatchObject({ mode: "playing", resumeTo: null, pauseReason: null });
  });

  it("playing + OPEN_PANEL -> panel", () => {
    expect(reduceSession(at("playing"), { type: "OPEN_PANEL", panel: PANEL })).toMatchObject({ mode: "panel", panel: PANEL });
  });

  it("panel + CLOSE_PANEL -> playing", () => {
    expect(reduceSession(at("panel", { panel: PANEL }), { type: "CLOSE_PANEL" })).toMatchObject({ mode: "playing", panel: null });
  });

  it("panel + OPEN_PANEL -> panel with swapped content", () => {
    const s = reduceSession(at("panel", { panel: PANEL }), { type: "OPEN_PANEL", panel: { kind: "contact" } });
    expect(s).toMatchObject({ mode: "panel", panel: { kind: "contact" } });
  });

  it("playing + BEACON_ACTIVATED -> celebrating", () => {
    expect(reduceSession(at("playing"), { type: "BEACON_ACTIVATED" }).mode).toBe("celebrating");
  });

  it("playing + TROPHY_COLLECTED -> celebrating for the trophy; the dance ends back in playing, not in a panel", () => {
    const dancing = reduceSession(at("playing"), { type: "TROPHY_COLLECTED" });
    expect(dancing).toMatchObject({ mode: "celebrating", celebration: "trophy" });
    expect(reduceSession(dancing, { type: "CELEBRATION_DONE" })).toMatchObject({ mode: "playing", panel: null, celebration: null });
    expect(reduceSession(at("entering"), { type: "TROPHY_COLLECTED" }).mode).toBe("entering");
    expect(reduceSession(at("panel", { panel: PANEL }), { type: "TROPHY_COLLECTED" }).mode).toBe("panel");
  });

  it("a pause during the trophy dance resumes to playing and forgets the dance", () => {
    const dancing = reduceSession(at("playing"), { type: "TROPHY_COLLECTED" });
    const paused = reduceSession(dancing, { type: "PAUSE", reason: "user" });
    expect(reduceSession(paused, { type: "RESUME" })).toMatchObject({ mode: "playing", celebration: null });
  });

  it("celebrating + CELEBRATION_DONE -> panel (completion)", () => {
    expect(reduceSession(at("celebrating"), { type: "CELEBRATION_DONE" })).toMatchObject({ mode: "panel", panel: { kind: "completion" } });
  });

  it.each(["entering", "playing", "paused", "panel", "celebrating"] as const)("%s + FAULT -> fault (terminal)", (mode) => {
    const s = reduceSession(at(mode), { type: "FAULT", fault: "context-lost" });
    expect(s).toMatchObject({ mode: "fault", fault: "context-lost", resumeTo: null, panel: null });
  });

  it.each(["entering", "playing", "paused", "panel", "celebrating"] as const)("%s + EXIT_BEGIN -> leaving", (mode) => {
    const s = reduceSession(at(mode, { panel: mode === "panel" ? PANEL : null }), { type: "EXIT_BEGIN" });
    expect(s).toMatchObject({ mode: "leaving", panel: null, resumeTo: null });
  });
});

describe("reduceSession: illegal events return the same object", () => {
  const cases: Array<[string, SessionState, SessionEvent]> = [
    ["entering + RESUME", at("entering"), { type: "RESUME" }],
    ["entering + OPEN_PANEL", at("entering"), { type: "OPEN_PANEL", panel: PANEL }],
    ["entering + BEACON_ACTIVATED", at("entering"), { type: "BEACON_ACTIVATED" }],
    ["playing + ENTRY_DONE", at("playing"), { type: "ENTRY_DONE" }],
    ["playing + RESUME", at("playing"), { type: "RESUME" }],
    ["playing + CLOSE_PANEL", at("playing"), { type: "CLOSE_PANEL" }],
    ["playing + CELEBRATION_DONE", at("playing"), { type: "CELEBRATION_DONE" }],
    ["paused + PAUSE", paused(), { type: "PAUSE", reason: "user" }],
    ["paused + OPEN_PANEL", paused(), { type: "OPEN_PANEL", panel: PANEL }],
    ["paused + ENTRY_DONE", paused(), { type: "ENTRY_DONE" }],
    ["panel + PAUSE (input already stopped)", at("panel", { panel: PANEL }), { type: "PAUSE", reason: "hidden" }],
    ["panel + BEACON_ACTIVATED", at("panel", { panel: PANEL }), { type: "BEACON_ACTIVATED" }],
    ["celebrating + OPEN_PANEL", at("celebrating"), { type: "OPEN_PANEL", panel: PANEL }],
    ["celebrating + RESUME", at("celebrating"), { type: "RESUME" }],
    ["leaving + PAUSE", at("leaving"), { type: "PAUSE", reason: "user" }],
    ["leaving + RESUME", at("leaving"), { type: "RESUME" }],
    ["leaving + EXIT_BEGIN", at("leaving"), { type: "EXIT_BEGIN" }],
    ["leaving + ENTRY_DONE", at("leaving"), { type: "ENTRY_DONE" }],
    ["fault + RESUME", at("fault", { fault: "runtime" }), { type: "RESUME" }],
    ["fault + PAUSE", at("fault", { fault: "runtime" }), { type: "PAUSE", reason: "user" }],
    ["fault + EXIT_BEGIN (only a reload or the shell's direct exit leave a fault)", at("fault", { fault: "runtime" }), { type: "EXIT_BEGIN" }],
    ["fault + FAULT", at("fault", { fault: "runtime" }), { type: "FAULT", fault: "context-lost" }],
  ];
  it.each(cases)("%s", (_name, state, event) => {
    expect(reduceSession(state, event)).toBe(state);
  });
});

describe("session store", () => {
  it("notifies subscribers only for real changes and stops after unsubscribe", () => {
    const store = createSessionStore();
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.dispatch({ type: "RESUME" }); // illegal in entering
    expect(fn).not.toHaveBeenCalled();
    store.dispatch({ type: "ENTRY_DONE" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.getState().mode).toBe("playing");
    off();
    store.dispatch({ type: "PAUSE", reason: "user" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("a subscriber may unsubscribe while being notified", () => {
    const store = createSessionStore();
    const calls: string[] = [];
    const offA = store.subscribe(() => {
      calls.push("a");
      offA();
    });
    store.subscribe(() => calls.push("b"));
    store.dispatch({ type: "ENTRY_DONE" });
    store.dispatch({ type: "PAUSE", reason: "user" });
    expect(calls).toEqual(["a", "b", "b"]);
  });
});

describe("inputEnabledFor", () => {
  it.each([
    ["entering", true],
    ["playing", true],
    ["paused", false],
    ["panel", false],
    ["celebrating", false],
    ["leaving", false],
    ["fault", false],
  ] as const)("%s -> %s", (mode, on) => expect(inputEnabledFor(mode)).toBe(on));
});

describe("createGame", () => {
  it("starts in entering with input live, releases input on pause and restores it on resume", () => {
    const game = createGame({ reducedMotion: false });
    const enable = vi.spyOn(game.input, "setEnabled");
    expect(game.session.getState().mode).toBe("entering");
    game.session.dispatch({ type: "ENTRY_DONE" });
    expect(enable).toHaveBeenLastCalledWith(true); // entering -> playing: input stays live
    game.session.dispatch({ type: "PAUSE", reason: "user" });
    expect(enable).toHaveBeenLastCalledWith(false);
    game.session.dispatch({ type: "RESUME" });
    expect(enable).toHaveBeenLastCalledWith(true);
    game.session.dispatch({ type: "EXIT_BEGIN" });
    expect(enable).toHaveBeenLastCalledWith(false);
    game.dispose();
  });

  it("runs cleanups last-in first-out, exactly once, and runs late registrations at once", () => {
    const game = createGame({ reducedMotion: true });
    const order: number[] = [];
    game.registerCleanup(() => order.push(1));
    game.registerCleanup(() => order.push(2));
    game.dispose();
    game.dispose();
    expect(order).toEqual([2, 1]);
    expect(game.disposed).toBe(true);
    game.registerCleanup(() => order.push(3));
    expect(order).toEqual([2, 1, 3]);
  });

  it("a throwing cleanup does not stop the others", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const game = createGame({ reducedMotion: false });
    const ran: string[] = [];
    game.registerCleanup(() => ran.push("first"));
    game.registerCleanup(() => {
      throw new Error("boom");
    });
    game.dispose();
    expect(ran).toEqual(["first"]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("dispose detaches the session subscription: later events no longer touch input", () => {
    const game = createGame({ reducedMotion: false });
    const enable = vi.spyOn(game.input, "setEnabled");
    game.dispose();
    game.session.dispatch({ type: "PAUSE", reason: "user" });
    expect(enable).not.toHaveBeenCalled();
  });
});
