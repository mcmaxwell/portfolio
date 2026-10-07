"use client";

// Touch controls: a left joystick, a right-half look area and a Jump button (design 2.10).
// Each control tracks its own pointer id, so stick and look work at the same time.
// A touch while the entry plays skips the rest of it and starts the stick at once.
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { InputController } from "../input";
import type { SessionStore } from "../session";

const STICK_RADIUS = 56;

export function TouchControls({
  input,
  session,
  shown,
}: {
  input: InputController;
  session: SessionStore;
  /** Fade state (beat F): the controls are visible. */
  shown: boolean;
}) {
  const stick = useRef<{ id: number; cx: number; cy: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);
  const knobRef = useRef<HTMLDivElement>(null);

  const skipEntry = () => {
    if (session.getState().mode === "entering") session.dispatch({ type: "ENTRY_SKIP" });
  };

  const setKnob = (x: number, y: number) => {
    if (knobRef.current) knobRef.current.style.transform = `translate(${x}px, ${y}px)`;
  };

  const stickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (!s || e.pointerId !== s.id) return;
    let dx = e.clientX - s.cx;
    let dy = e.clientY - s.cy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    setKnob(dx, dy);
    input.setTouchMove(dx / STICK_RADIUS, -dy / STICK_RADIUS); // up is forward
  };
  const stickEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = stick.current;
    if (!s || e.pointerId !== s.id) return;
    stick.current = null;
    setKnob(0, 0);
    input.setTouchMove(0, 0);
  };

  const fade = {
    opacity: shown ? 1 : 0,
    transition: "opacity 300ms cubic-bezier(0, 0, 0.2, 1)",
  } as const;

  return (
    <div className="pointer-events-none fixed inset-0 z-[61] select-none" style={{ touchAction: "none" }} data-touch-controls>
      {/* look area: right half, below the buttons */}
      <div
        className="pointer-events-auto absolute inset-y-0 right-0 w-1/2"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          skipEntry();
          if (look.current) return;
          look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const l = look.current;
          if (!l || e.pointerId !== l.id) return;
          input.addTouchLook(e.clientX - l.x, e.clientY - l.y);
          l.x = e.clientX;
          l.y = e.clientY;
        }}
        onPointerUp={(e) => {
          if (look.current?.id === e.pointerId) look.current = null;
        }}
        onPointerCancel={(e) => {
          if (look.current?.id === e.pointerId) look.current = null;
        }}
        onLostPointerCapture={(e) => {
          if (look.current?.id === e.pointerId) look.current = null;
        }}
      />
      {/* joystick */}
      <div
        className="pointer-events-auto absolute bottom-6 flex h-36 w-36 items-center justify-center rounded-full border border-term-green/60 bg-term-bg/50"
        style={{ left: "max(1rem, env(safe-area-inset-left))", marginBottom: "env(safe-area-inset-bottom)", touchAction: "none", ...fade }}
        data-joystick
        onPointerDown={(e) => {
          skipEntry();
          if (stick.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          stick.current = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
          e.currentTarget.setPointerCapture?.(e.pointerId);
          stickMove(e);
        }}
        onPointerMove={stickMove}
        onPointerUp={stickEnd}
        onPointerCancel={stickEnd}
        onLostPointerCapture={stickEnd}
      >
        <div ref={knobRef} className="h-14 w-14 rounded-full border border-term-green bg-term-green/20" />
      </div>
      {/* jump */}
      <button
        className="pointer-events-auto absolute bottom-10 h-16 w-16 rounded-full border border-term-cyan bg-term-bg/50 text-xs text-term-cyan"
        style={{ right: "max(1.5rem, env(safe-area-inset-right))", marginBottom: "env(safe-area-inset-bottom)", touchAction: "manipulation", ...fade }}
        aria-label="Jump"
        onPointerDown={(e) => {
          e.stopPropagation();
          skipEntry();
          input.pressTouch("jump");
        }}
      >
        jump
      </button>
    </div>
  );
}
