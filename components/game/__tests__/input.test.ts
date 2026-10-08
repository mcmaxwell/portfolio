// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInputController, normalizeMove, type InputController } from "../input";

let canvas: HTMLElement;
let input: InputController;

function setup() {
  canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  input = createInputController();
  input.attach(canvas);
}
const key = (type: "keydown" | "keyup", code: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent(type, { code, cancelable: true, ...init }));

afterEach(() => {
  input?.detach();
  canvas?.remove();
  vi.restoreAllMocks();
});

describe("normalizeMove", () => {
  it("clamps the length to 1 and leaves shorter vectors alone", () => {
    const d = normalizeMove(1, 1);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 10);
    expect(normalizeMove(0.3, 0.4)).toEqual({ x: 0.3, y: 0.4 });
    expect(normalizeMove(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("input controller", () => {
  it("normalizes diagonals so speed equals forward speed", () => {
    setup();
    key("keydown", "KeyW");
    const forward = input.sample().move;
    key("keydown", "KeyD");
    const diagonal = input.sample().move;
    expect(Math.hypot(forward.x, forward.y)).toBeCloseTo(1, 10);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 10);
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2, 10);
    expect(diagonal.y).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it("cancels opposite keys", () => {
    setup();
    key("keydown", "KeyA");
    key("keydown", "KeyD");
    key("keydown", "ArrowUp");
    key("keydown", "ArrowDown");
    expect(input.sample().move).toEqual({ x: 0, y: 0 });
  });

  it("maps run, jump (edge) and interact (edge)", () => {
    setup();
    key("keydown", "ShiftLeft");
    key("keydown", "Space");
    key("keydown", "Space", { repeat: true }); // auto-repeat must not re-latch
    key("keydown", "KeyE");
    const a = input.sample();
    expect(a.run).toBe(true);
    expect(a.jump).toBe(true);
    expect(a.interact).toBe(true);
    const b = input.sample(); // edges are consumed
    expect(b.jump).toBe(false);
    expect(b.interact).toBe(false);
    expect(b.run).toBe(true);
  });

  it("calls preventDefault only for mapped keys", () => {
    setup();
    const mapped = new KeyboardEvent("keydown", { code: "Space", cancelable: true });
    const other = new KeyboardEvent("keydown", { code: "KeyQ", cancelable: true });
    window.dispatchEvent(mapped);
    window.dispatchEvent(other);
    expect(mapped.defaultPrevented).toBe(true);
    expect(other.defaultPrevented).toBe(false);
  });

  it("releases everything on window blur", () => {
    setup();
    key("keydown", "KeyW");
    key("keydown", "ShiftLeft");
    key("keydown", "Space");
    window.dispatchEvent(new Event("blur"));
    const s = input.sample();
    expect(s.move).toEqual({ x: 0, y: 0 });
    expect(s.run).toBe(false);
    expect(s.jump).toBe(false);
  });

  it("accumulates drag look between samples", () => {
    setup();
    const down = new Event("pointerdown") as PointerEvent;
    Object.assign(down, { pointerId: 1 });
    canvas.dispatchEvent(down);
    for (const dx of [3, 4]) {
      const mv = new Event("pointermove") as PointerEvent;
      Object.assign(mv, { pointerId: 1, movementX: dx, movementY: 1 });
      canvas.dispatchEvent(mv);
    }
    expect(input.sample().look).toEqual({ dx: 7, dy: 2 });
    expect(input.sample().look).toEqual({ dx: 0, dy: 0 });
  });

  it("detach removes every listener that attach added", () => {
    const winAdd = vi.spyOn(window, "addEventListener");
    const winRemove = vi.spyOn(window, "removeEventListener");
    canvas = document.createElement("canvas");
    const cAdd = vi.spyOn(canvas, "addEventListener");
    const cRemove = vi.spyOn(canvas, "removeEventListener");
    input = createInputController();
    input.attach(canvas);
    input.attach(canvas); // idempotent
    expect(winAdd.mock.calls.length).toBe(3);
    expect(cAdd.mock.calls.length).toBe(4);
    input.detach();
    input.detach(); // idempotent
    const pairs = (adds: unknown[][], removes: unknown[][]) =>
      adds.map((c) => `${String(c[0])}`).sort().join() === removes.map((c) => `${String(c[0])}`).sort().join();
    expect(winRemove.mock.calls.length).toBe(winAdd.mock.calls.length);
    expect(cRemove.mock.calls.length).toBe(cAdd.mock.calls.length);
    expect(pairs(winAdd.mock.calls, winRemove.mock.calls)).toBe(true);
    expect(pairs(cAdd.mock.calls, cRemove.mock.calls)).toBe(true);
    // After detach a key press has no effect.
    key("keydown", "KeyW");
    expect(input.sample().move).toEqual({ x: 0, y: 0 });
  });

  it("ignores keys while disabled and drops held state", () => {
    setup();
    key("keydown", "KeyW");
    input.setEnabled(false);
    expect(input.sample().move).toEqual({ x: 0, y: 0 });
    key("keydown", "KeyD");
    expect(input.sample().move).toEqual({ x: 0, y: 0 });
    input.setEnabled(true);
    key("keydown", "KeyD");
    expect(input.sample().move.x).toBe(1);
  });
});

describe("input controller while disabled (session paused, leaving or fault)", () => {
  it("ignores keys, pointer drags, touch stick, touch look and touch buttons, and keeps nothing latched", () => {
    setup();
    input.setEnabled(false);
    key("keydown", "KeyW");
    key("keydown", "Space");
    input.setTouchMove(1, 1);
    input.addTouchLook(10, 10);
    input.pressTouch("jump");
    input.pressTouch("interact");
    canvas.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1 }));
    canvas.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, movementX: 5, movementY: 5 }));
    const s = input.sample();
    expect(s.move).toEqual({ x: 0, y: 0 });
    expect(s.jump).toBe(false);
    expect(s.interact).toBe(false);
    expect(s.look).toEqual({ dx: 0, dy: 0 });
    input.setEnabled(true);
    key("keydown", "KeyW");
    expect(input.sample().move.y).toBe(1); // live again after resume
  });

  it("does not call preventDefault on mapped keys while disabled (the browser keeps Space and arrows)", () => {
    setup();
    input.setEnabled(false);
    const e = new KeyboardEvent("keydown", { code: "Space", cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
