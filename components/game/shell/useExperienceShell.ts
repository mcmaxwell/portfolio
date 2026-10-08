"use client";

// Experience shell: the Play and Exit state machine (play-transition.md, design 2.1). It owns the
// phase, voice stop on Play, scroll lock, canvas FLIP, focus return, the loading strip timing,
// failure state and the ordered dispose. It must stay tiny and never statically import game
// code; it only holds the dynamic-import result.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import {
  createGameLoader,
  type GameLoader,
  type GameModule,
  type LoadedAssets,
  type LoaderDeps,
  type LoadState,
} from "./gameLoader";
import { inertPageBehind } from "./pageInert";
import { experienceAttribute, TIMING, type Phase } from "./transition";

export type { GameModule, LoadState, Phase };
export type GameHandle = ReturnType<GameModule["createGame"]>;
export type ShellGame = { module: GameModule; handle: GameHandle; key: number };
export type StripState = "off" | "in" | "out";
export type ShellFailure = { kind: "load" | "context-lost" | "runtime"; title: string; message: string };
export type Flip = { y: number; animate: boolean };

/** The shipped world. */
const DEFAULT_LAYOUT = "campus" as const;

/** Dev and QA: `/?arena=test` selects the M1 test arena; anything else is the campus. */
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

export interface ExperienceShell {
  phase: Phase;
  load: LoadState;
  game: ShellGame | null;
  assets: LoadedAssets | null;
  layout: "test-arena" | "campus";
  /** Hero chrome (nav aside) is in the tree. */
  chromeMounted: boolean;
  /** Chrome is in its hidden (left) state: animating out, or waiting to animate in. */
  chromeHidden: boolean;
  /** The chrome exit has finished; the game may now do GPU-heavy warm-up without hurting it. */
  chromeDone: boolean;
  /** The canvas wrapper is fixed to the viewport (from the click until the swap back). */
  canvasFixed: boolean;
  /** The canvas wrapper is above the page, nav included (from the swap until the swap back). */
  canvasRaised: boolean;
  /** The game subtree is active (hero subtree unmounted). */
  inGame: boolean;
  /**
   * The session is paused or faulted: the canvas must stop rendering (design 2.3). It is a prop of
   * the R3F Canvas, not an imperative call, because Canvas re-applies its `frameloop` prop on every
   * re-render and would silently undo a `setFrameloop("never")`.
   */
  renderPaused: boolean;
  /** The hero's own scene (avatar included) has mounted: rendering may resume after an Exit. */
  heroReady(): void;
  flip: Flip;
  /**
   * The canvas wrapper needs an opaque stage colour: the hero was partly scrolled at the click, so
   * page content sits under the part of the viewport the fixed canvas is about to cover.
   */
  backdrop: boolean;
  strip: StripState;
  failure: ShellFailure | null;
  /** Reduced motion, read once at the click. */
  reduced: boolean;
  announce: string;
  play(): void;
  cancel(): void;
  retry(): void;
  /** Exit from the game (HUD, pause menu), or Cancel while loading. */
  exit(): void;
  /** Failure dialog: Back to portfolio. */
  back(): void;
  /** Hover, focus or pointerdown on Play. Hover and focus on a fine pointer also pre-compile shaders. */
  prefetch(trigger: "hover" | "focus" | "press"): void;
  /** R3F onCreated of the shared canvas: where the early shader compile runs. */
  onCanvasCreated(state: { gl: unknown; scene: unknown; camera: unknown }): void;
  reportPhysics(result: "ready" | Error): void;
  reportFault(kind: "context-lost" | "runtime"): void;
  exitLegDone(): void;
}

type Saved = {
  scrollY: number;
  top: number;
  htmlOverflow: string;
  htmlOverflowY: string;
  htmlGutter: string;
  body: { position: string; top: string; left: string; right: string };
};

/**
 * Lock page scrolling without moving anything. `overflow: hidden` on the root removes a classic
 * scrollbar and widens the page by its width (measured: 10 px in Chrome, and `scrollbar-gutter`
 * does not hold the width for the root), which would shift the whole hero sideways. Instead the
 * scrollbar track stays (`overflow-y: scroll`) and the body is pinned at the current offset.
 */
function lockPage(scrollY: number, top: number): Saved {
  const root = document.documentElement;
  const body = document.body;
  const saved: Saved = {
    scrollY,
    top,
    htmlOverflow: root.style.overflow,
    htmlOverflowY: root.style.overflowY,
    htmlGutter: root.style.scrollbarGutter,
    body: { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right },
  };
  root.style.overflowY = "scroll";
  body.style.position = "fixed";
  body.style.top = `${-scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  return saved;
}

function unlockPageStyles(s: Saved | null): void {
  const root = document.documentElement;
  const body = document.body;
  root.style.overflow = s ? s.htmlOverflow : "";
  root.style.overflowY = s ? s.htmlOverflowY : "";
  root.style.scrollbarGutter = s ? s.htmlGutter : "";
  body.style.position = s ? s.body.position : "";
  body.style.top = s ? s.body.top : "";
  body.style.left = s ? s.body.left : "";
  body.style.right = s ? s.body.right : "";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function currentTranslateY(el: Element | null): number {
  if (!el || typeof getComputedStyle !== "function") return 0;
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  const m = /matrix\(([^)]+)\)/.exec(t);
  if (!m) return 0;
  const n = m[1].split(",").map((x) => parseFloat(x));
  return n.length >= 6 && Number.isFinite(n[5]) ? n[5] : 0;
}

export function useExperienceShell(opts: {
  stopVoice: () => void;
  /** The Play button: focus returns here after Exit or Cancel. */
  returnFocusRef: RefObject<HTMLElement>;
  /** The hero section (`#talk`): its position is measured for the canvas FLIP. */
  stageRef?: RefObject<HTMLElement>;
  /** The canvas wrapper, to read its live translate when a FLIP is cut short. */
  canvasWrapRef?: RefObject<HTMLElement>;
  /** Test seam: replaces the dynamic import and timeouts. */
  loaderDeps?: Partial<LoaderDeps>;
}): ExperienceShell {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const loaderRef = useRef<GameLoader | null>(null);
  if (!loaderRef.current) loaderRef.current = createGameLoader(opts.loaderDeps);
  const loader = loaderRef.current;
  const load = useSyncExternalStore(loader.subscribe, loader.getState, loader.getState);

  const [phase, setPhaseState] = useState<Phase>("hero");
  const phaseRef = useRef<Phase>("hero");
  const [game, setGameState] = useState<ShellGame | null>(null);
  const gameRef = useRef<ShellGame | null>(null);
  const gameKey = useRef(0);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [chromeDoneState, setChromeDone] = useState(false);
  const [flip, setFlip] = useState<Flip>({ y: 0, animate: false });
  const [backdrop, setBackdrop] = useState(false);
  const [strip, setStrip] = useState<StripState>("off");
  const [fault, setFault] = useState<{ kind: "context-lost" | "runtime" } | null>(null);
  const [reduced, setReduced] = useState(false);
  const [renderPaused, setRenderPaused] = useState(false);
  // After the swap back, the hero Avatar mounts a frame after the lights; one render in between would
  // show a bare stage. Rendering is held (the canvas keeps the last game frame) until the hero reports in.
  const [heroHold, setHeroHold] = useState(false);
  const [announce, setAnnounce] = useState("");

  const saved = useRef<Saved | null>(null);
  const restoreInert = useRef<(() => void) | null>(null);
  const reducedRef = useRef(false);
  const chromeDone = useRef(false);
  const stripShownAt = useRef<number | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const frames = useRef(new Set<number>());
  const replayAfterReturn = useRef(false);
  const playId = useRef(0);
  const returnPending = useRef(false);
  const rendererRef = useRef<{ gl: unknown; scene: unknown; camera: unknown } | null>(null);
  const prewarmed = useRef(false);

  const ctl = useRef<{
    play(): void;
    cancel(): void;
    exit(): void;
    back(): void;
    retry(): void;
    tryEnter(): void;
    exitLegDone(): void;
    reportFault(kind: "context-lost" | "runtime"): void;
  } | null>(null);

  // ---- helpers (stable: they touch refs and state setters only) ----
  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
    frames.current.forEach((f) => cancelAnimationFrame(f));
    frames.current.clear();
  }, []);
  /** Run `fn` two animation frames from now, so a style written now has been painted first. */
  const nextFrame = useCallback((fn: () => void) => {
    const a = requestAnimationFrame(() => {
      frames.current.delete(a);
      const b = requestAnimationFrame(() => {
        frames.current.delete(b);
        fn();
      });
      frames.current.add(b);
    });
    frames.current.add(a);
  }, []);
  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    document.documentElement.dataset.experience = experienceAttribute(p);
    setPhaseState(p);
  }, []);
  const setGame = useCallback((g: ShellGame | null) => {
    gameRef.current = g;
    setGameState(g);
  }, []);

  const unlockPage = useCallback(() => {
    // The page behind the game is live again before focus goes back to Play.
    restoreInert.current?.();
    restoreInert.current = null;
    unlockPageStyles(saved.current);
  }, []);

  const disposeGame = useCallback(() => {
    gameRef.current?.handle.dispose();
    setGame(null);
  }, [setGame]);

  // ---- the controller: created once, reads everything through refs ----
  if (!ctl.current) {
    const stripOut = () => {
      if (stripShownAt.current === null) {
        setStrip("off");
        return;
      }
      setStrip("out");
      later(() => setStrip("off"), TIMING.stripFadeOutMs);
    };

    /** Leave the stage and return to the hero. `fromGame` is true after the 3D exit leg. */
    const completeReturn = (opts2: { replay?: boolean }) => {
      const wasChromeMounted = phaseRef.current === "hero" || phaseRef.current === "chrome-out";
      disposeGame();
      loader.cancel();
      setFault(null);
      replayAfterReturn.current = !!opts2.replay;
      stripOut();
      stripShownAt.current = null;
      chromeDone.current = false;
      setChromeDone(false);
      const s = saved.current;
      const cy = currentTranslateY(optsRef.current.canvasWrapRef?.current ?? null);
      unlockPage();
      if (s) window.scrollTo({ top: s.scrollY, behavior: "instant" });
      const topNow = optsRef.current.stageRef?.current?.getBoundingClientRect().top ?? s?.top ?? 0;
      const delta = cy - topNow;
      go("returning");
      if (wasChromeMounted) {
        setChromeHidden(false);
      } else {
        setChromeHidden(true);
        nextFrame(() => setChromeHidden(false));
      }
      if (!reducedRef.current && Math.abs(delta) >= 1) {
        setFlip({ y: delta, animate: false });
        nextFrame(() => setFlip({ y: 0, animate: true }));
      } else {
        setFlip({ y: 0, animate: false });
      }
      setAnnounce("Back to portfolio");
      later(
        () => {
          go("hero");
          setFlip({ y: 0, animate: false });
          setBackdrop(false);
          setAnnounce("");
          if (replayAfterReturn.current) {
            replayAfterReturn.current = false;
            ctl.current?.play();
          }
        },
        reducedRef.current ? TIMING.reduced.fadeMs : TIMING.exit.chromeBackMs
      );
    };

    const returnToHero = (opts2: { replay?: boolean } = {}) => {
      if (returnPending.current) return;
      const p = phaseRef.current;
      const fromGame = p === "entering" || p === "game" || p === "leaving";
      clearTimers();
      playId.current++; // a still-pending transition wait belongs to a dead play
      if (!fromGame) {
        completeReturn(opts2);
        return;
      }
      // The hero Avatar mounts a frame after its lights; a render in between would show a bare stage
      // for one frame. Rendering is held first (a held R3F canvas ignores invalidation and keeps the
      // last game frame, which already equals the hero framing), then the swap runs two frames later.
      returnPending.current = true;
      setHeroHold(true);
      later(() => setHeroHold(false), 800); // never hold longer than this
      nextFrame(() => {
        returnPending.current = false;
        completeReturn(opts2);
      });
    };

    const swap = () => {
      stripOut();
      // The strip is gone for this run: a later Exit must not mount it again (it would take focus).
      stripShownAt.current = null;
      go("entering");
    };

    const tryEnter = () => {
      const p = phaseRef.current;
      if (p !== "chrome-out" && p !== "waiting") return;
      if (!chromeDone.current || loader.getState().kind !== "ready" || !gameRef.current) return;
      if (stripShownAt.current !== null) {
        const left = TIMING.stripMinVisibleMs - (Date.now() - stripShownAt.current);
        if (left > 0) {
          later(tryEnter, left);
          return;
        }
      }
      swap();
    };

    const onCode = (mod: GameModule) => {
      gameRef.current?.handle.dispose();
      const handle = mod.createGame({ reducedMotion: reducedRef.current });
      setGame({ module: mod, handle, key: ++gameKey.current });
    };

    ctl.current = {
      play() {
        if (phaseRef.current !== "hero") return;
        optsRef.current.stopVoice(); // synchronous, before any state change (the mic goes off first)
        const reducedNow = prefersReducedMotion();
        reducedRef.current = reducedNow;
        setReduced(reducedNow);
        const top = optsRef.current.stageRef?.current?.getBoundingClientRect().top ?? 0;
        saved.current = lockPage(window.scrollY, top);
        restoreInert.current?.();
        restoreInert.current = inertPageBehind(optsRef.current.stageRef?.current ?? null);
        setBackdrop(Math.abs(top) >= 1);
        chromeDone.current = false;
        setChromeDone(false);
        stripShownAt.current = null;
        setFault(null);
        setAnnounce("");
        go("chrome-out");
        setChromeHidden(true);
        if (!reducedNow && Math.abs(top) >= 1) {
          setFlip({ y: top, animate: false });
          nextFrame(() => setFlip({ y: 0, animate: true }));
        } else {
          setFlip({ y: 0, animate: false });
        }
        // The chrome is removed (and the swap may happen) when both the nominal time has passed and the
        // chrome's own CSS transitions have really finished. The transitions start a frame or two
        // after the click (React commit, style recalculation), so on a slow frame they end after
        // C + 360 ms; removing the elements at the timer alone would cut a half-faded title.
        const id = ++playId.current;
        const minMs = reducedNow ? TIMING.reduced.fadeMs : TIMING.chromeMs;
        let minElapsed = false;
        let transitionsDone = false;
        let finished = false;
        const finishChrome = () => {
          if (finished || playId.current !== id) return;
          finished = true;
          chromeDone.current = true;
          setChromeDone(true);
          if (phaseRef.current === "chrome-out") go("waiting");
          ctl.current?.tryEnter();
        };
        later(() => {
          minElapsed = true;
          if (transitionsDone) finishChrome();
        }, minMs);
        later(finishChrome, minMs + TIMING.chromeMaxExtraMs); // never wait for a stuck transition
        nextFrame(() => {
          const stage = optsRef.current.stageRef?.current;
          const running =
            stage && typeof stage.getAnimations === "function"
              ? stage.getAnimations({ subtree: true }).filter((a) => typeof CSSTransition !== "undefined" && a instanceof CSSTransition)
              : [];
          if (running.length === 0) {
            transitionsDone = true;
            if (minElapsed) finishChrome();
            return;
          }
          Promise.allSettled(running.map((a) => a.finished)).then(() => {
            transitionsDone = true;
            if (minElapsed) finishChrome();
          });
        });
        later(() => {
          const p = phaseRef.current;
          if ((p === "chrome-out" || p === "waiting") && loader.getState().kind === "loading") {
            stripShownAt.current = Date.now();
            setStrip("in");
          }
        }, TIMING.stripDelayMs);
        loader.start(onCode);
      },
      tryEnter,
      cancel() {
        const p = phaseRef.current;
        if (p === "chrome-out" || p === "waiting") returnToHero();
      },
      back() {
        const p = phaseRef.current;
        if (p === "chrome-out" || p === "waiting" || p === "entering" || p === "game" || p === "leaving") returnToHero();
      },
      exit() {
        const p = phaseRef.current;
        if (p === "chrome-out" || p === "waiting") {
          returnToHero();
        } else if (p === "entering" || p === "game") {
          go("leaving");
          gameRef.current?.handle.session.dispatch({ type: "EXIT_BEGIN" });
          later(() => ctl.current?.exitLegDone(), TIMING.exit.fallbackMs);
        }
      },
      exitLegDone() {
        if (phaseRef.current === "leaving") returnToHero();
      },
      retry() {
        const p = phaseRef.current;
        const st = loader.getState();
        if (st.kind === "failed" && (p === "chrome-out" || p === "waiting")) {
          setFault(null);
          stripShownAt.current = Date.now();
          setStrip("in");
          loader.retry();
        } else if (p === "chrome-out" || p === "waiting" || p === "entering" || p === "game" || p === "leaving") {
          // A fault after the start: return to the hero, then play again.
          returnToHero({ replay: true });
        }
      },
      reportFault(kind) {
        const p = phaseRef.current;
        if (p === "hero" || p === "returning") return;
        gameRef.current?.handle.session.dispatch({ type: "FAULT", fault: kind });
        setFault({ kind });
        setStrip("off");
      },
    };
  }

  // ---- reactions ----

  // Loading finished: enter the game (once the chrome exit has also finished).
  useEffect(() => {
    const p = phaseRef.current;
    if (p !== "chrome-out" && p !== "waiting") return;
    if (load.kind === "ready") ctl.current?.tryEnter();
    else if (load.kind === "failed") setStrip("off");
  }, [load]);

  // Entering becomes game once the session leaves `entering`.
  useEffect(() => {
    if (phase !== "entering" || !game) return;
    const session = game.handle.session;
    const sync = () => {
      if (phaseRef.current === "entering" && session.getState().mode !== "entering") go("game");
    };
    sync();
    return session.subscribe(sync);
  }, [phase, game, go]);

  // Pause and fault stop rendering; the session is the single source of truth.
  useEffect(() => {
    if (!game) {
      setRenderPaused(false);
      return;
    }
    const session = game.handle.session;
    const sync = () => {
      const m = session.getState().mode;
      setRenderPaused(m === "paused" || m === "fault");
    };
    sync();
    const off = session.subscribe(sync);
    return () => {
      off();
      setRenderPaused(false);
    };
  }, [game]);

  // Escape cancels while loading (the failure dialog handles its own Escape).
  const failureActive = load.kind === "failed" || fault !== null;
  useEffect(() => {
    if ((phase !== "chrome-out" && phase !== "waiting") || failureActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        ctl.current?.cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, failureActive]);

  // Focus returns to Play once the chrome is back in the tree, without scrolling the page.
  useLayoutEffect(() => {
    if (phase === "returning") optsRef.current.returnFocusRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // Unmount of the hero page: no leaked handle, timer, in-flight load, lock or attribute.
  useEffect(
    () => () => {
      clearTimers();
      gameRef.current?.handle.dispose();
      loader.cancel();
      restoreInert.current?.();
      restoreInert.current = null;
      if (phaseRef.current !== "hero" && saved.current) {
        unlockPageStyles(saved.current);
        window.scrollTo({ top: saved.current.scrollY, behavior: "instant" });
      }
      delete document.documentElement.dataset.experience;
      phaseRef.current = "hero";
    },
    [loader, clearTimers]
  );

  let failure: ShellFailure | null = null;
  if (fault) {
    failure =
      fault.kind === "context-lost"
        ? {
            kind: "context-lost",
            title: "Graphics were interrupted",
            message: "The browser stopped the 3D graphics. Retry, or go back to the portfolio. If the avatar stays blank, reload the page.",
          }
        : { kind: "runtime", title: "The game hit an error", message: "Something went wrong inside the game. Retry, or go back to the portfolio." };
  } else if (load.kind === "failed" && (phase === "chrome-out" || phase === "waiting")) {
    failure = { kind: "load", title: "Could not start the game", message: load.message };
  }

  return {
    phase,
    load,
    game,
    assets: loader.getAssets(),
    layout: typeof window === "undefined" ? DEFAULT_LAYOUT : readLayoutParam(window.location.search),
    chromeMounted: phase === "hero" || phase === "chrome-out" || phase === "returning",
    chromeHidden,
    chromeDone: chromeDoneState,
    canvasFixed: phase !== "hero" && phase !== "returning",
    canvasRaised: phase === "entering" || phase === "game" || phase === "leaving",
    inGame: phase === "entering" || phase === "game" || phase === "leaving",
    renderPaused: renderPaused || heroHold,
    heroReady: () => setHeroHold(false),
    flip,
    backdrop,
    strip,
    failure,
    reduced,
    announce,
    play: () => ctl.current!.play(),
    cancel: () => ctl.current!.cancel(),
    retry: () => ctl.current!.retry(),
    exit: () => ctl.current!.exit(),
    back: () => ctl.current!.back(),
    prefetch: (trigger) => {
      const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
      const early = trigger !== "press" && !coarse;
      loader.prefetch((mod) => {
        // Start painting the world's textures at once, for every trigger: it runs in a worker, so the
        // page stays idle, and a press or a touch has the click's own dwell to get ahead.
        mod.prepareWorld(readLayoutParam(window.location.search));
        // Compile the world's shaders now, while the user is only hovering: the stall must not land
        // inside the chrome exit animation after the click.
        const target = rendererRef.current;
        if (!early || prewarmed.current || !target || phaseRef.current !== "hero") return;
        prewarmed.current = true;
        void mod.prewarmWorld(target, readLayoutParam(window.location.search));
      });
    },
    onCanvasCreated: (state) => {
      rendererRef.current = state;
    },
    reportPhysics: (r) => loader.reportPhysics(r),
    reportFault: (k) => ctl.current!.reportFault(k),
    exitLegDone: () => ctl.current!.exitLegDone(),
  };
}
