// Input controller: keyboard and pointer-drag look (touch API arrives in M4).
// Owns every listener it adds; detach() removes all of them (design 2.4).
import { INPUT } from "./config";

export type InputSnapshot = {
  move: { x: number; y: number }; // x right, y forward, |move| <= 1
  run: boolean;
  jump: boolean; // edge, latched until sampled
  interact: boolean; // edge, latched until sampled
  recenter: boolean; // edge
  look: { dx: number; dy: number }; // accumulated pixels since last sample
};

/** Clamp the vector length to 1 so diagonals are not faster than straight. */
export function normalizeMove(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= 1) return { x, y };
  return { x: x / len, y: y / len };
}

export interface InputController {
  attach(canvas: HTMLElement): void;
  detach(): void;
  setEnabled(on: boolean): void;
  releaseAll(): void;
  sample(): InputSnapshot;
  setTouchMove(x: number, y: number): void;
  addTouchLook(dx: number, dy: number): void;
  pressTouch(action: "jump" | "interact"): void;
}

const MAPPED = new Set([
  "KeyW", "ArrowUp", "KeyS", "ArrowDown", "KeyA", "ArrowLeft", "KeyD", "ArrowRight",
  "ShiftLeft", "ShiftRight", "Space", "KeyE", "KeyR",
]);

export function createInputController(): InputController {
  const held = new Set<string>();
  let enabled = true;
  let jump = false;
  let interact = false;
  let recenter = false;
  let lookDx = 0;
  let lookDy = 0;
  let touchMove = { x: 0, y: 0 };
  let touchRun = false;
  let dragPointer: number | null = null;
  let canvasEl: HTMLElement | null = null;
  let attached = false;

  const releaseAll = () => {
    held.clear();
    jump = false;
    interact = false;
    recenter = false;
    lookDx = 0;
    lookDy = 0;
    touchMove = { x: 0, y: 0 };
    touchRun = false;
    dragPointer = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!enabled || !MAPPED.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (!held.has(e.code)) {
      if (e.code === "Space") jump = true;
      else if (e.code === "KeyE") interact = true;
      else if (e.code === "KeyR") recenter = true;
    }
    held.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!enabled || !MAPPED.has(e.code)) return;
    e.preventDefault();
    held.delete(e.code);
  };
  const onBlur = () => releaseAll();

  const onPointerDown = (e: PointerEvent) => {
    if (!enabled || dragPointer !== null) return;
    dragPointer = e.pointerId;
    try {
      canvasEl?.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer already gone */
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!enabled || e.pointerId !== dragPointer) return;
    lookDx += e.movementX || 0;
    lookDy += e.movementY || 0;
  };
  const onPointerEnd = (e: PointerEvent) => {
    if (e.pointerId === dragPointer) dragPointer = null;
  };

  return {
    attach(canvas) {
      if (attached) return;
      attached = true;
      canvasEl = canvas;
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      window.addEventListener("blur", onBlur);
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerEnd);
      canvas.addEventListener("pointercancel", onPointerEnd);
    },
    detach() {
      if (!attached) return;
      attached = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      canvasEl?.removeEventListener("pointerdown", onPointerDown);
      canvasEl?.removeEventListener("pointermove", onPointerMove);
      canvasEl?.removeEventListener("pointerup", onPointerEnd);
      canvasEl?.removeEventListener("pointercancel", onPointerEnd);
      canvasEl = null;
      releaseAll();
    },
    setEnabled(on) {
      enabled = on;
      if (!on) releaseAll();
    },
    releaseAll,
    sample() {
      const kx =
        (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0) -
        (held.has("KeyA") || held.has("ArrowLeft") ? 1 : 0);
      const ky =
        (held.has("KeyW") || held.has("ArrowUp") ? 1 : 0) -
        (held.has("KeyS") || held.has("ArrowDown") ? 1 : 0);
      const move = normalizeMove(kx + touchMove.x, ky + touchMove.y);
      const snap: InputSnapshot = {
        move,
        run: held.has("ShiftLeft") || held.has("ShiftRight") || touchRun,
        jump,
        interact,
        recenter,
        look: { dx: lookDx, dy: lookDy },
      };
      jump = false;
      interact = false;
      recenter = false;
      lookDx = 0;
      lookDy = 0;
      return snap;
    },
    setTouchMove(x, y) {
      if (!enabled) return;
      touchMove = normalizeMove(x, y);
      touchRun = Math.hypot(touchMove.x, touchMove.y) > INPUT.joystickRunThreshold;
    },
    addTouchLook(dx, dy) {
      if (!enabled) return;
      lookDx += dx;
      lookDy += dy;
    },
    pressTouch(action) {
      if (!enabled) return;
      if (action === "jump") jump = true;
      else interact = true;
    },
  };
}
