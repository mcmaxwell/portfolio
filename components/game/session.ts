// Game session: the state machine (design 2.3), a tiny store read with useSyncExternalStore,
// and the cleanup registry. It holds no positions or velocities and never touches React state.
import type { Interactable, PanelId } from "./config";
import { createInputController, type InputController } from "./input";
import { createProgressStore, getProgressStore, type ProgressStore } from "./progress";

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
  /** What the "celebrating" mode is for: the beacon (then the completion panel) or the trophy dance (then back to play). */
  celebration: "beacon" | "trophy" | null;
};
export type SessionEvent =
  | { type: "ENTRY_DONE" }
  | { type: "ENTRY_SKIP" }
  | { type: "PAUSE"; reason: PauseReason }
  | { type: "RESUME" }
  | { type: "OPEN_PANEL"; panel: PanelId }
  | { type: "CLOSE_PANEL" }
  | { type: "BEACON_ACTIVATED" }
  | { type: "TROPHY_COLLECTED" }
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
  celebration: null,
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
      if (e.type === "BEACON_ACTIVATED") return { ...s, mode: "celebrating", celebration: "beacon" };
      if (e.type === "TROPHY_COLLECTED") return { ...s, mode: "celebrating", celebration: "trophy" };
      return s;
    case "paused":
      if (e.type === "RESUME") return { ...s, mode: "playing", resumeTo: null, pauseReason: null, entrySkipped: false, celebration: null };
      return s;
    case "panel":
      // PAUSE is ignored: input is already stopped while a panel is open.
      if (e.type === "CLOSE_PANEL") return { ...s, mode: "playing", panel: null };
      if (e.type === "OPEN_PANEL") return { ...s, panel: e.panel };
      return s;
    case "celebrating":
      if (e.type === "PAUSE") return { ...s, mode: "paused", resumeTo: "playing", pauseReason: e.reason };
      if (e.type === "CELEBRATION_DONE") {
        // The trophy dance ends where it began: the game goes on. The beacon celebration opens the completion panel.
        if (s.celebration === "trophy") return { ...s, mode: "playing", celebration: null };
        return { ...s, mode: "panel", panel: { kind: "completion" }, celebration: null };
      }
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

/** A store with one value that the game writes and the interface reads. */
export interface ValueStore<T> extends Store<T> {
  set(value: T): void;
}

export function createValueStore<T>(initial: T): ValueStore<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    getState: () => value,
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      Array.from(subs).forEach((fn) => fn());
    },
  };
}

export interface GameHandle {
  session: SessionStore;
  /** The interactable the player is near and facing (the prompt), written by the interaction system. */
  focus: ValueStore<Interactable | null>;
  /** An interactable the player is next to that cannot answer yet (the beacon before three cells): a hint, never a prompt. */
  hint: ValueStore<Interactable | null>;
  input: InputController;
  /** Challenge progress and settings: versioned, saved locally, in memory when storage is unavailable. */
  progress: ProgressStore;
  reducedMotion: boolean;
  readonly disposed: boolean;
  registerCleanup(fn: () => void): void; // run LIFO by dispose()
  dispose(): void; // idempotent
}

export function createGame(opts: { reducedMotion: boolean; storage?: Storage | null }): GameHandle {
  const input = createInputController();
  // An explicit storage (tests) gets its own store; otherwise the page-wide store, so progress also
  // survives Exit and re-entry within one visit.
  const progress = opts.storage !== undefined ? createProgressStore(opts.storage) : getProgressStore();
  const session = createSessionStore();
  const focus = createValueStore<Interactable | null>(null);
  const hint = createValueStore<Interactable | null>(null);
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
    focus,
    hint,
    input,
    progress,
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
