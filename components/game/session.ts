// Game session: the state machine (design 2.3), a tiny store read with useSyncExternalStore,
// and the cleanup registry. It holds no positions or velocities and never touches React state.
import type { PanelId } from "./config";
import { createInputController, type InputController } from "./input";

export type SessionMode = "entering" | "playing" | "paused" | "panel" | "celebrating" | "leaving" | "fault";
export type PauseReason = "user" | "hidden" | "blur";
export type SessionState = {
  mode: SessionMode;
  resumeTo: "playing" | null; // set while paused
  pauseReason: PauseReason | null;
  panel: PanelId | null;
  fault: "context-lost" | "runtime" | null;
  /** True once the player skipped the rest of the entry (movement key or touch). */
  entrySkipped: boolean;
};
export type SessionEvent =
  | { type: "ENTRY_DONE" }
  | { type: "ENTRY_SKIP" }
  | { type: "PAUSE"; reason: PauseReason }
  | { type: "RESUME" }
  | { type: "OPEN_PANEL"; panel: PanelId }
  | { type: "CLOSE_PANEL" }
  | { type: "BEACON_ACTIVATED" }
  | { type: "CELEBRATION_DONE" }
  | { type: "EXIT_BEGIN" }
  | { type: "FAULT"; fault: "context-lost" | "runtime" };

export const INITIAL_SESSION: SessionState = {
  mode: "entering",
  resumeTo: null,
  pauseReason: null,
  panel: null,
  fault: null,
  entrySkipped: false,
};

/** Pure reducer. An illegal event returns the very same state object. */
export function reduceSession(s: SessionState, e: SessionEvent): SessionState {
  if (e.type === "FAULT") {
    return s.mode === "fault" ? s : { ...s, mode: "fault", resumeTo: null, pauseReason: null, panel: null, fault: e.fault };
  }
  if (s.mode === "fault") return s; // terminal: only Exit or reload leave it
  if (e.type === "EXIT_BEGIN") {
    return s.mode === "leaving" ? s : { ...s, mode: "leaving", resumeTo: null, pauseReason: null, panel: null };
  }
  switch (s.mode) {
    case "entering":
      if (e.type === "ENTRY_DONE") return { ...s, mode: "playing", entrySkipped: false };
      if (e.type === "ENTRY_SKIP") return s.entrySkipped ? s : { ...s, entrySkipped: true };
      if (e.type === "PAUSE") return { ...s, mode: "paused", resumeTo: "playing", pauseReason: e.reason };
      return s;
    case "playing":
      if (e.type === "PAUSE") return { ...s, mode: "paused", resumeTo: "playing", pauseReason: e.reason };
      if (e.type === "OPEN_PANEL") return { ...s, mode: "panel", panel: e.panel };
      if (e.type === "BEACON_ACTIVATED") return { ...s, mode: "celebrating" };
      return s;
    case "paused":
      if (e.type === "RESUME") return { ...s, mode: "playing", resumeTo: null, pauseReason: null, entrySkipped: false };
      return s;
    case "panel":
      // PAUSE is ignored: input is already stopped while a panel is open.
      if (e.type === "CLOSE_PANEL") return { ...s, mode: "playing", panel: null };
      if (e.type === "OPEN_PANEL") return { ...s, panel: e.panel };
      return s;
    case "celebrating":
      if (e.type === "PAUSE") return { ...s, mode: "paused", resumeTo: "playing", pauseReason: e.reason };
      if (e.type === "CELEBRATION_DONE") return { ...s, mode: "panel", panel: { kind: "completion" } };
      return s;
    case "leaving":
      return s;
  }
}

export interface Store<T> {
  getState(): T;
  subscribe(fn: () => void): () => void;
}
export interface SessionStore extends Store<SessionState> {
  dispatch(e: SessionEvent): void;
}

export function createSessionStore(initial: SessionState = INITIAL_SESSION): SessionStore {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    dispatch(e) {
      const next = reduceSession(state, e);
      if (next === state) return;
      state = next;
      // Copy: a subscriber may unsubscribe while being notified.
      Array.from(subs).forEach((fn) => fn());
    },
  };
}

/** Input is live while entering (to detect a skip) and playing; every other mode releases it. */
export function inputEnabledFor(mode: SessionMode): boolean {
  return mode === "entering" || mode === "playing";
}

export interface GameHandle {
  session: SessionStore;
  input: InputController;
  reducedMotion: boolean;
  readonly disposed: boolean;
  registerCleanup(fn: () => void): void; // run LIFO by dispose()
  dispose(): void; // idempotent
}

export function createGame(opts: { reducedMotion: boolean; storage?: Storage | null }): GameHandle {
  const input = createInputController();
  const session = createSessionStore();
  const cleanups: Array<() => void> = [];
  let disposed = false;
  let lastMode: SessionMode = session.getState().mode;
  // Entering paused, panel, leaving or fault stops input and releases held keys (design 2.3).
  const unsubscribe = session.subscribe(() => {
    const mode = session.getState().mode;
    if (mode === lastMode) return;
    lastMode = mode;
    input.setEnabled(inputEnabledFor(mode));
  });
  const handle: GameHandle = {
    session,
    input,
    reducedMotion: opts.reducedMotion,
    get disposed() {
      return disposed;
    },
    registerCleanup(fn) {
      if (disposed) fn();
      else cleanups.push(fn);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      while (cleanups.length) {
        try {
          cleanups.pop()!();
        } catch (err) {
          console.error("game cleanup failed", err);
        }
      }
      unsubscribe();
      input.detach();
    },
  };
  return handle;
}
