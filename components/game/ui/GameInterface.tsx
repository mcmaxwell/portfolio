"use client";

// Game DOM overlay (design 2.10): HUD, pause menu, touch controls, Escape and visibility handlers.
// It subscribes to the session store only and never reads positions or velocities.
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameHandle } from "../session";
import { TIMING } from "../shell/transition";
import { ControlsHint, HudButtons } from "./Hud";
import { PauseMenu } from "./PauseMenu";
import { TouchControls } from "./TouchControls";
import { useSession } from "./useSession";

const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export function GameInterface({ game, onExit }: { game: GameHandle; onExit: () => void }) {
  const { session } = game;
  const state = useSession(session);
  const reduced = game.reducedMotion;
  const rootRef = useRef<HTMLDivElement>(null);
  const [coarse] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches
  );
  const [buttonsShown, setButtonsShown] = useState(false);
  const [touchShown, setTouchShown] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [hintGone, setHintGone] = useState(false);
  const [announce, setAnnounce] = useState("");

  // The overlay root takes focus when the game activates (the Exit button is the first tab stop).
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // Beat F staging, driven by timers that unmount clears. A skipped entry shows everything at once.
  const entering = state.mode === "entering" && !state.entrySkipped;
  useEffect(() => {
    const quick = reduced || !entering;
    const ids: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => {
      if (quick) fn();
      else ids.push(setTimeout(fn, ms));
    };
    at(TIMING.hud.buttonsStartMs, () => setButtonsShown(true));
    at(TIMING.hud.touchStartMs, () => setTouchShown(true));
    at(TIMING.hud.hintStartMs, () => setHintShown(true));
    return () => ids.forEach(clearTimeout);
    // The staging starts once, from mount; later mode changes only fast-forward it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entering]);

  // The controls hint fades out after 6 s or on the first movement key.
  useEffect(() => {
    if (!hintShown || hintGone) return;
    const id = setTimeout(() => setHintGone(true), TIMING.hud.hintHideAfterMs);
    const onKey = (e: KeyboardEvent) => {
      if (MOVE_KEYS.has(e.code)) setHintGone(true);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [hintShown, hintGone]);

  // Live region: announced once, at the end of the entry.
  const announcedRef = useRef(false);
  useEffect(() => {
    if (state.mode === "playing" && !announcedRef.current) {
      announcedRef.current = true;
      setAnnounce("Game started. Escape pauses.");
    }
  }, [state.mode]);

  const pause = useCallback(() => session.dispatch({ type: "PAUSE", reason: "user" }), [session]);
  const resume = useCallback(() => session.dispatch({ type: "RESUME" }), [session]);

  // Escape or P toggles pause. A dialog that handled Escape already prevented the event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.code !== "Escape" && e.code !== "KeyP") return;
      const mode = session.getState().mode;
      if (mode === "paused") {
        e.preventDefault();
        resume();
      } else if (mode === "entering" || mode === "playing" || mode === "celebrating") {
        e.preventDefault();
        pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, pause, resume]);

  // Tab hide and window blur pause; returning never resumes movement by itself.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) session.dispatch({ type: "PAUSE", reason: "hidden" });
    };
    const onBlur = () => session.dispatch({ type: "PAUSE", reason: "blur" });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [session]);

  const leaving = state.mode === "leaving";
  return (
    <div ref={rootRef} tabIndex={-1} className="pointer-events-none fixed inset-0 z-[60] outline-none" data-game-overlay>
      <HudButtons shown={buttonsShown} leaving={leaving} reduced={reduced} onPause={pause} onExit={onExit} />
      <ControlsHint shown={hintShown && !hintGone && !leaving} reduced={reduced} />
      {coarse && <TouchControls input={game.input} session={session} shown={touchShown && !leaving} />}
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
      {state.mode === "paused" && <PauseMenu reason={state.pauseReason} onResume={resume} onExit={onExit} />}
    </div>
  );
}
