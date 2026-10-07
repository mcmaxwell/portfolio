"use client";

// Game DOM overlay (design 2.10): HUD, pause menu, touch controls, Escape and visibility handlers.
// It subscribes to the session store only and never reads positions or velocities.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PanelId } from "../config";
import type { GameHandle } from "../session";
import { TIMING } from "../shell/transition";
import { ControlsHint, HudButtons, InteractionPrompt } from "./Hud";
import { PauseMenu } from "./PauseMenu";
import { PortfolioPanel } from "./panels";
import { TouchControls } from "./TouchControls";
import { useSession } from "./useSession";

const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export function GameInterface({ game, onExit }: { game: GameHandle; onExit: () => void }) {
  const { session } = game;
  const state = useSession(session);
  const focused = useSyncExternalStore(game.focus.subscribe, game.focus.getState, game.focus.getState);
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
  const closePanel = useCallback(() => session.dispatch({ type: "CLOSE_PANEL" }), [session]);
  const openPanel = useCallback((panel: PanelId) => session.dispatch({ type: "OPEN_PANEL", panel }), [session]);

  // Closing a panel returns focus to the game overlay (the dialog also restores the opener, which
  // is the page body when the panel was opened with the key), and says so for screen readers.
  const panelOpenRef = useRef(false);
  useEffect(() => {
    const open = state.mode === "panel";
    if (panelOpenRef.current && !open && state.mode === "playing") {
      rootRef.current?.focus({ preventScroll: true });
      setAnnounce("Panel closed. Back in the game.");
    }
    panelOpenRef.current = open;
  }, [state.mode]);

  // Escape or P toggles pause. A dialog that handled Escape already prevented the event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (e.code !== "Escape" && e.code !== "KeyP") return;
      const mode = session.getState().mode;
      if (mode === "paused") {
        e.preventDefault();
        resume();
      } else if (mode === "panel") {
        // Focus left the dialog (a click on the backdrop): Escape still closes it.
        e.preventDefault();
        closePanel();
      } else if (mode === "entering" || mode === "playing" || mode === "celebrating") {
        e.preventDefault();
        pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, pause, resume, closePanel]);

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
      <div role="status" aria-live="polite" className="sr-only" data-game-announce>
        {announce}
      </div>
      <HudButtons shown={buttonsShown} leaving={leaving} blocked={state.mode === "panel"} reduced={reduced} onPause={pause} onExit={onExit} />
      <ControlsHint shown={hintShown && !hintGone && !leaving} reduced={reduced} />
      <InteractionPrompt item={state.mode === "playing" ? focused : null} touch={coarse} />
      {coarse && <TouchControls input={game.input} session={session} focus={game.focus} shown={touchShown && !leaving} />}
      {state.mode === "paused" && <PauseMenu reason={state.pauseReason} onResume={resume} onExit={onExit} />}
      {state.mode === "panel" && state.panel && <PortfolioPanel panel={state.panel} onClose={closePanel} onOpen={openPanel} />}
    </div>
  );
}
