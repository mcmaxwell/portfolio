// @vitest-environment jsdom
// Touch controls: joystick vector, run range, two independent pointers, release paths.
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INPUT } from "../config";
import { createInputController, type InputController } from "../input";
import { createGame, type GameHandle } from "../session";
import { TouchControls } from "../ui/TouchControls";

let game: GameHandle;
let input: InputController;
let container: HTMLElement;

const stickEl = () => container.querySelector("[data-joystick]") as HTMLElement;
const lookEl = () => container.querySelector("[data-touch-controls] > div") as HTMLElement;
const move = () => input.sample().move;

function mount() {
  game = createGame({ reducedMotion: true });
  input = createInputController();
  act(() => game.session.dispatch({ type: "ENTRY_DONE" }));
  container = render(<TouchControls input={input} session={game.session} focus={game.focus} shown />).container;
}

// jsdom reports a zero rect, so the stick centre is (0, 0); offsets are relative to it.
const down = (el: HTMLElement, pointerId: number, x = 0, y = 0) => fireEvent.pointerDown(el, { pointerId, clientX: x, clientY: y });
const moveTo = (el: HTMLElement, pointerId: number, x: number, y: number) => fireEvent.pointerMove(el, { pointerId, clientX: x, clientY: y });

beforeEach(() => {
  Element.prototype.setPointerCapture = () => {};
  mount();
});
afterEach(() => {
  cleanup();
  game.dispose();
});

describe("joystick", () => {
  it("maps a drag to a forward-up vector and normalizes past the radius", () => {
    down(stickEl(), 1);
    moveTo(stickEl(), 1, 28, -28);
    const m = move();
    expect(m.x).toBeCloseTo(0.5, 5);
    expect(m.y).toBeCloseTo(0.5, 5);
    moveTo(stickEl(), 1, 300, -400);
    const far = move();
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(1, 5);
    expect(far.y).toBeGreaterThan(0);
  });

  it("walks inside the run range and runs beyond it", () => {
    down(stickEl(), 1);
    moveTo(stickEl(), 1, 0, -56 * (INPUT.joystickRunThreshold - 0.1));
    expect(input.sample().run).toBe(false);
    moveTo(stickEl(), 1, 0, -56 * (INPUT.joystickRunThreshold + 0.1));
    expect(input.sample().run).toBe(true);
  });

  it("pointerup releases the stick", () => {
    down(stickEl(), 1);
    moveTo(stickEl(), 1, 0, -56);
    expect(move().y).toBeCloseTo(1, 5);
    fireEvent.pointerUp(stickEl(), { pointerId: 1 });
    expect(move()).toEqual({ x: 0, y: 0 });
    expect(input.sample().run).toBe(false);
  });

  it("pointercancel releases the stick", () => {
    down(stickEl(), 1);
    moveTo(stickEl(), 1, 56, 0);
    fireEvent.pointerCancel(stickEl(), { pointerId: 1 });
    expect(move()).toEqual({ x: 0, y: 0 });
    moveTo(stickEl(), 1, 56, 0);
    expect(move()).toEqual({ x: 0, y: 0 });
  });
});

describe("two pointers", () => {
  it("tracks the stick and the look area independently", () => {
    down(stickEl(), 1);
    down(lookEl(), 2, 100, 100);
    moveTo(stickEl(), 1, 0, -56);
    moveTo(lookEl(), 2, 130, 90);
    const snap = input.sample();
    expect(snap.move.y).toBeCloseTo(1, 5);
    expect(snap.look).toEqual({ dx: 30, dy: -10 });
    // Lifting the look finger keeps walking.
    fireEvent.pointerUp(lookEl(), { pointerId: 2 });
    moveTo(stickEl(), 1, 0, -56);
    expect(move().y).toBeCloseTo(1, 5);
    // A foreign pointer id does not steer either control.
    moveTo(stickEl(), 9, 56, 0);
    expect(move().x).toBeCloseTo(0, 5);
  });

  it("cancelling the look pointer does not stop the stick, and vice versa", () => {
    down(stickEl(), 1);
    down(lookEl(), 2, 0, 0);
    fireEvent.pointerCancel(lookEl(), { pointerId: 2 });
    moveTo(lookEl(), 2, 50, 50);
    expect(input.sample().look).toEqual({ dx: 0, dy: 0 });
    moveTo(stickEl(), 1, 0, -56);
    expect(move().y).toBeCloseTo(1, 5);
    fireEvent.pointerCancel(stickEl(), { pointerId: 1 });
    expect(move()).toEqual({ x: 0, y: 0 });
  });

  it("a second finger on the stick is ignored while the first holds it", () => {
    down(stickEl(), 1);
    down(stickEl(), 2);
    moveTo(stickEl(), 2, 56, 0);
    expect(move()).toEqual({ x: 0, y: 0 });
  });
});

describe("blur and mode changes release everything", () => {
  it("window blur releases the stick and the look pointer", () => {
    down(stickEl(), 1);
    down(lookEl(), 2, 0, 0);
    moveTo(stickEl(), 1, 0, -56);
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(move()).toEqual({ x: 0, y: 0 });
    moveTo(lookEl(), 2, 40, 40);
    expect(input.sample().look).toEqual({ dx: 0, dy: 0 });
  });

  it("pausing releases the stick", () => {
    down(stickEl(), 1);
    moveTo(stickEl(), 1, 0, -56);
    act(() => game.session.dispatch({ type: "PAUSE", reason: "user" }));
    expect(move()).toEqual({ x: 0, y: 0 });
  });
});

describe("buttons", () => {
  it("Jump latches one jump edge and is at least 44 px by class", () => {
    const jump = container.querySelector('button[aria-label="Jump"]') as HTMLElement;
    fireEvent.pointerDown(jump, { pointerId: 3 });
    expect(input.sample().jump).toBe(true);
    expect(input.sample().jump).toBe(false);
    expect(jump.className).toContain("h-16");
    expect(jump.className).toContain("w-16");
  });

  it("Interact shows only with a focused interactable and latches one interact edge", () => {
    expect(container.querySelector("[data-interact-button]")).toBeNull();
    act(() => game.focus.set({ id: "p", kind: "project", position: [0, 0, 0], radius: 1, prompt: "View project", panel: "projects" } as never));
    const btn = container.querySelector("[data-interact-button]") as HTMLElement;
    expect(btn).not.toBeNull();
    fireEvent.pointerDown(btn, { pointerId: 4 });
    expect(input.sample().interact).toBe(true);
    expect(input.sample().interact).toBe(false);
    act(() => game.focus.set(null));
    expect(container.querySelector("[data-interact-button]")).toBeNull();
  });
});
