"use client";

// Experience shell: hero / loading / game mode, voice stop on Play, scroll lock,
// focus return and ordered dispose (design 2.1). Must stay tiny and never statically
// import game code; it only holds the dynamic-import result.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createGameLoader, type GameLoader, type GameModule, type LoadedAssets, type LoadState } from "./gameLoader";

export type { GameModule, LoadState };
export type ExperienceMode = "hero" | "loading" | "game";
export type GameHandle = ReturnType<GameModule["createGame"]>;
export type ShellGame = { module: GameModule; handle: GameHandle };

/** Switch to "campus" in M3 when it exists. */
const DEFAULT_LAYOUT = "test-arena" as const;

/** Dev and QA: `/?arena=test` selects the test arena explicitly (also the M1 default). */
export function readLayoutParam(search: string): "test-arena" | "campus" {
  const v = new URLSearchParams(search).get("arena");
  return v === "test" ? "test-arena" : DEFAULT_LAYOUT;
}

export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function useExperienceShell(opts: {
  stopVoice: () => void;
  returnFocusRef: RefObject<HTMLElement>;
}): {
  mode: ExperienceMode;
  load: LoadState;
  game: ShellGame | null;
  assets: LoadedAssets | null;
  layout: "test-arena" | "campus";
  play(): void;
  cancel(): void;
  retry(): void;
  exit(): void;
  reportPhysics(result: "ready" | Error): void;
} {
  const { stopVoice, returnFocusRef } = opts;
  const loaderRef = useRef<GameLoader | null>(null);
  if (!loaderRef.current) loaderRef.current = createGameLoader();
  const loader = loaderRef.current;
  const load = useSyncExternalStore(loader.subscribe, loader.getState, loader.getState);

  const [mode, setModeState] = useState<ExperienceMode>("hero");
  const modeRef = useRef<ExperienceMode>("hero");
  const setMode = useCallback((m: ExperienceMode) => {
    modeRef.current = m;
    setModeState(m);
  }, []);
  const [game, setGame] = useState<ShellGame | null>(null);
  const gameRef = useRef<ShellGame | null>(null);
  gameRef.current = game;
  const refocus = useRef(false);

  // Ordered teardown: dispose the handle first, then unmount the scene, then show the hero.
  const finish = useCallback(
    (keepLoadState: boolean) => {
      gameRef.current?.handle.dispose();
      if (!keepLoadState) loader.cancel();
      setGame(null);
      refocus.current = modeRef.current === "game";
      setMode("hero");
    },
    [loader, setMode]
  );

  const play = useCallback(() => {
    if (modeRef.current !== "hero") return;
    stopVoice(); // synchronous, before any state change (mic must be off first)
    const reducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMode("loading");
    loader.start((mod) => {
      setGame({ module: mod, handle: mod.createGame({ reducedMotion }) });
    });
  }, [loader, stopVoice, setMode]);

  // Loading finished: enter the game; failed while loading: back to the hero.
  useEffect(() => {
    if (modeRef.current !== "loading") return;
    if (load.kind === "ready") setMode("game");
    else if (load.kind === "failed") finish(true);
  }, [load, finish, setMode]);

  // Page scroll lock only while playing; always restored.
  useEffect(() => {
    if (mode !== "game") return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, [mode]);

  // Return focus to the Play button after leaving the game.
  useEffect(() => {
    if (mode === "hero" && refocus.current) {
      refocus.current = false;
      returnFocusRef.current?.focus();
    }
  }, [mode, returnFocusRef]);

  // Unmount of the hero page: no leaked handle or in-flight load.
  useEffect(
    () => () => {
      gameRef.current?.handle.dispose();
      loader.cancel();
    },
    [loader]
  );

  return {
    mode,
    load,
    game,
    assets: loader.getAssets(),
    layout: typeof window === "undefined" ? DEFAULT_LAYOUT : readLayoutParam(window.location.search),
    play,
    cancel: () => finish(false),
    retry: play,
    exit: () => finish(false),
    reportPhysics: (r) => loader.reportPhysics(r),
  };
}
