// @vitest-environment jsdom
// Game overlay: pause by Escape or P, Resume, tab-hide and blur auto-pause, Exit, HUD staging.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createGame, type GameHandle } from "../session";
import { GameInterface } from "../ui/GameInterface";

let game: GameHandle;
let onExit: Mock<() => void>;
const key = (code: string, init: KeyboardEventInit = {}) => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code === "Escape" ? "Escape" : code, cancelable: true, ...init }));
  });
};
const mode = () => game.session.getState().mode;

function mount(reducedMotion = false) {
  game = createGame({ reducedMotion });
  onExit = vi.fn<() => void>();
  return render(<GameInterface game={game} onExit={onExit} />);
}

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
});
afterEach(() => {
  cleanup();
  game?.dispose();
  vi.useRealTimers();
});

describe("pause and resume (design 2.3 and 2.10)", () => {
  it("Escape pauses and shows Resume; Escape again resumes", () => {
    mount();
    act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
    key("Escape");
    expect(mode()).toBe("paused");
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeInTheDocument();
    expect(screen.getByText("[ resume ]")).toHaveFocus();
    key("Escape");
    expect(mode()).toBe("playing");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("P toggles pause too, and a repeated key event does not toggle twice", () => {
    mount();
    act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
    key("KeyP");
    expect(mode()).toBe("paused");
    key("KeyP", { repeat: true });
    expect(mode()).toBe("paused");
    key("KeyP");
    expect(mode()).toBe("playing");
  });

  it("Escape inside the pause dialog resumes exactly once (the dialog handles it, the page handler does not also toggle)", () => {
    mount();
    act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
    key("Escape");
    fireEvent.keyDown(screen.getByText("[ resume ]"), { key: "Escape", code: "Escape" });
    expect(mode()).toBe("playing"); // not paused again by the window handler
  });

  it("Resume and Exit buttons work", () => {
    mount();
    act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
    key("Escape");
    fireEvent.click(screen.getByText("[ resume ]"));
    expect(mode()).toBe("playing");
    key("Escape");
    fireEvent.click(screen.getByText("[ exit to portfolio ]"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("the Pause button pauses", () => {
    mount();
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByText("[ pause ]"));
    expect(mode()).toBe("paused");
  });

  it("Escape during the entry pauses it (the entry is skipped on resume)", () => {
    mount();
    expect(mode()).toBe("entering");
    key("Escape");
    expect(mode()).toBe("paused");
    key("Escape");
    expect(mode()).toBe("playing");
  });

  it("does nothing while leaving or in a fault", () => {
    mount();
    act(() => game.session.dispatch({ type: "EXIT_BEGIN" }));
    key("Escape");
    expect(mode()).toBe("leaving");
    cleanup();
    mount();
    act(() => game.session.dispatch({ type: "FAULT", fault: "runtime" }));
    key("KeyP");
    expect(mode()).toBe("fault");
  });

  it("tab hide pauses with reason hidden and shows Resume; coming back does not resume", () => {
    mount();
    act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(game.session.getState()).toMatchObject({ mode: "paused", pauseReason: "hidden" });
    expect(screen.getByText(/lost focus/)).toBeInTheDocument();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(mode()).toBe("paused"); // never resumes movement by itself
    expect(screen.getByText("[ resume ]")).toBeInTheDocument();
  });

  it("window blur pauses with reason blur", () => {
    mount();
    act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(game.session.getState()).toMatchObject({ mode: "paused", pauseReason: "blur" });
  });

  it("input is released on pause and live again on resume", () => {
    mount();
    act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
    game.input.attach(document.body);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", cancelable: true }));
    expect(game.input.sample().move.y).toBe(1);
    key("Escape");
    expect(game.input.sample().move.y).toBe(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", cancelable: true }));
    expect(game.input.sample().move.y).toBe(0); // ignored while paused
    key("Escape");
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW", cancelable: true }));
    expect(game.input.sample().move.y).toBe(1);
  });

  it("removes its window and document listeners on unmount", () => {
    const addW = vi.spyOn(window, "addEventListener");
    const remW = vi.spyOn(window, "removeEventListener");
    const addD = vi.spyOn(document, "addEventListener");
    const remD = vi.spyOn(document, "removeEventListener");
    const r = mount();
    r.unmount();
    const net = (add: typeof addW, rem: typeof remW) => {
      const live = new Map<string, number>();
      add.mock.calls.forEach(([t]) => live.set(String(t), (live.get(String(t)) ?? 0) + 1));
      rem.mock.calls.forEach(([t]) => live.set(String(t), (live.get(String(t)) ?? 0) - 1));
      return Array.from(live.entries()).filter(([, n]) => n !== 0);
    };
    expect(net(addW, remW)).toEqual([]);
    expect(net(addD, remD)).toEqual([]);
  });
});

describe("HUD staging (play-transition.md 2.6)", () => {
  it("the buttons are not reachable until S+1000 and then fade in; a skip shows them at once", () => {
    mount();
    const buttons = () => screen.getByText("[ pause ]").parentElement!;
    expect(buttons()).toHaveAttribute("inert");
    expect(buttons().style.opacity).toBe("0");
    act(() => vi.advanceTimersByTime(999));
    expect(buttons()).toHaveAttribute("inert");
    act(() => vi.advanceTimersByTime(1));
    expect(buttons()).not.toHaveAttribute("inert");
    expect(buttons().style.opacity).toBe("1");
    cleanup();
    game.dispose();
    mount();
    act(() => game.session.dispatch({ type: "ENTRY_SKIP" }));
    expect(screen.getByText("[ pause ]").parentElement!.style.opacity).toBe("1");
  });

  it("the hint appears at S+1500 and fades after 6 s or on the first movement key", () => {
    mount();
    const hint = () => screen.getByText(/WASD move/);
    expect(hint().style.opacity).toBe("0");
    act(() => vi.advanceTimersByTime(1500));
    expect(hint().style.opacity).toBe("1");
    act(() => vi.advanceTimersByTime(6000));
    expect(hint().style.opacity).toBe("0");
    cleanup();
    game.dispose();
    mount();
    act(() => vi.advanceTimersByTime(1500));
    key("KeyW");
    expect(screen.getByText(/WASD move/).style.opacity).toBe("0");
  });

  it("reduced motion shows everything at once with no translate", () => {
    mount(true);
    expect(screen.getByText("[ pause ]").parentElement!.style.opacity).toBe("1");
    expect(screen.getByText("[ pause ]").parentElement!.style.translate).toBe("0px 0px");
  });

  it("the buttons fade out in 200 ms when leaving", () => {
    mount();
    act(() => vi.advanceTimersByTime(1000));
    act(() => game.session.dispatch({ type: "EXIT_BEGIN" }));
    const b = screen.getByText("[ pause ]").parentElement!;
    expect(b.style.opacity).toBe("0");
    expect(b.style.transition).toContain("200ms");
    expect(b).toHaveAttribute("inert");
  });

  it("announces the start once, at the end of the entry, and takes focus on mount", () => {
    mount();
    expect(document.activeElement).toBe(document.querySelector("[data-game-overlay]"));
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
    expect(screen.getByRole("status").textContent).toBe("Game started. Escape pauses.");
  });

  it("renders no touch controls on a fine pointer", () => {
    mount();
    expect(document.querySelector("[data-touch-controls]")).toBeNull();
  });
});

describe("touch controls (coarse pointer)", () => {
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("coarse"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  });

  it("fade in at S+1200 and a touch during the entry skips it and starts the stick", () => {
    mount();
    const stick = () => document.querySelector("[data-joystick]") as HTMLElement;
    expect(stick()).not.toBeNull();
    expect(stick().style.opacity).toBe("0");
    act(() => vi.advanceTimersByTime(1200));
    expect(stick().style.opacity).toBe("1");
    cleanup();
    game.dispose();
    mount();
    expect(mode()).toBe("entering");
    stick().getBoundingClientRect = () => ({ left: 0, top: 0, width: 144, height: 144, right: 144, bottom: 144, x: 0, y: 0, toJSON() {} });
    const spy = vi.spyOn(game.input, "setTouchMove");
    fireEvent.pointerDown(stick(), { pointerId: 1, clientX: 72 + 40, clientY: 72 - 20 });
    expect(game.session.getState().entrySkipped).toBe(true); // the first gesture is not wasted
    expect(spy).toHaveBeenCalled();
    const [x, y] = spy.mock.calls[0];
    expect(x).toBeGreaterThan(0.5);
    expect(y).toBeGreaterThan(0.2);
    fireEvent.pointerUp(stick(), { pointerId: 1 });
    expect(spy).toHaveBeenLastCalledWith(0, 0);
  });

  it("the stick tracks its own pointer id and releases on cancel", () => {
    mount();
    act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
    const stick = document.querySelector("[data-joystick]") as HTMLElement;
    stick.getBoundingClientRect = () => ({ left: 0, top: 0, width: 144, height: 144, right: 144, bottom: 144, x: 0, y: 0, toJSON() {} });
    const spy = vi.spyOn(game.input, "setTouchMove");
    fireEvent.pointerDown(stick, { pointerId: 7, clientX: 72, clientY: 72 - 56 });
    expect(spy).toHaveBeenLastCalledWith(0, 1);
    fireEvent.pointerMove(stick, { pointerId: 9, clientX: 0, clientY: 0 }); // another finger: ignored
    expect(spy).toHaveBeenLastCalledWith(0, 1);
    fireEvent.pointerCancel(stick, { pointerId: 7 });
    expect(spy).toHaveBeenLastCalledWith(0, 0);
  });

  it("the jump button is at least 48 px and presses jump", () => {
    mount();
    act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
    const jump = screen.getByLabelText("Jump");
    expect(jump.className).toMatch(/h-16 w-16/); // 64 px
    const spy = vi.spyOn(game.input, "pressTouch");
    fireEvent.pointerDown(jump, { pointerId: 2 });
    expect(spy).toHaveBeenCalledWith("jump");
  });
});
