// Game loader: the ONE dynamic import of the game entry in the codebase (ADR-006).
// State, generation counter, physics timeout, cancel, retry, and the Play prefetch.

// A type query is erased at build time and is not an import declaration, so the
// shell stays free of static game imports.
export type GameModule = typeof import("@/components/game/entry");
export type LoadedAssets = Awaited<ReturnType<GameModule["loadGameAssets"]>>;

export type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; step: "code" | "assets"; progress: number } // 0..1
  | { kind: "ready" }
  // `message` is a plain sentence for the user; `detail` is the technical text, for developers.
  | { kind: "failed"; reason: "network" | "physics" | "timeout"; message: string; detail: string };

export type PrefetchMode = "code" | "code+assets";

export type LoaderDeps = {
  importGame: () => Promise<GameModule>;
  physicsTimeoutMs: number;
  prefetchMode: () => PrefetchMode;
};

/**
 * Touch devices and Save-Data connections prefetch only the game code; a fine pointer on an
 * unrestricted connection also prefetches the first-play clips (play-transition.md 3.3).
 */
export function prefetchModeFor(env: { coarsePointer: boolean; saveData: boolean }): PrefetchMode {
  return env.coarsePointer || env.saveData ? "code" : "code+assets";
}

function detectPrefetchMode(): PrefetchMode {
  if (typeof window === "undefined") return "code";
  const coarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return prefetchModeFor({ coarsePointer, saveData: !!conn?.saveData });
}

export interface GameLoader {
  /**
   * Hover, focus or pointerdown on Play: fetch bytes, mount nothing, show nothing, swallow errors.
   * `afterCode` runs once the game module has loaded (the shell uses it to compile shaders early).
   */
  prefetch(afterCode?: (mod: GameModule) => void): void;
  start(onCode: (mod: GameModule) => void): void;
  reportPhysics(result: "ready" | Error): void;
  cancel(): void; // idempotent; clears timers; late results ignored
  retry(): void;
  getState(): LoadState;
  getAssets(): LoadedAssets | null;
  subscribe(fn: () => void): () => void;
}

const FAILURE_COPY = {
  network: "The game could not be downloaded. Check your connection, then retry, or go back to the portfolio.",
  physics: "The game engine could not start in this browser. Retry, or go back to the portfolio.",
  timeout: "The game took too long to start. Retry, or go back to the portfolio.",
} as const;

const W_CODE = 0.2;
const W_ASSETS = 0.7;
const W_PHYSICS = 0.1;

export function createGameLoader(deps: Partial<LoaderDeps> = {}): GameLoader {
  const importGame = deps.importGame ?? (() => import("@/components/game/entry"));
  const physicsTimeoutMs = deps.physicsTimeoutMs ?? 20000;
  const prefetchMode = deps.prefetchMode ?? detectPrefetchMode;

  // One import promise shared by prefetch() and start(), so Play never downloads twice. A
  // rejected import is forgotten so the next call (Retry, or the real click) tries again.
  let codePromise: Promise<GameModule> | null = null;
  const loadCode = (): Promise<GameModule> => {
    if (!codePromise) {
      const p = importGame();
      codePromise = p;
      p.catch(() => {
        if (codePromise === p) codePromise = null;
      });
    }
    return codePromise;
  };

  let state: LoadState = { kind: "idle" };
  const subs = new Set<() => void>();
  let gen = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastOnCode: ((mod: GameModule) => void) | null = null;
  let assets: LoadedAssets | null = null;
  let codeDone = false;
  let assetsDone = false;
  let physicsDone = false;
  let assetFraction = 0;
  let peak = 0; // the reported progress never goes backwards within a run

  const set = (next: LoadState) => {
    state = next;
    subs.forEach((fn) => fn());
  };
  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const progress = () => {
    const raw = (codeDone ? W_CODE : 0) + W_ASSETS * (assetsDone ? 1 : assetFraction) + (physicsDone ? W_PHYSICS : 0);
    peak = Math.max(peak, raw);
    return peak;
  };
  const update = () => {
    if (codeDone && assetsDone && physicsDone) {
      clearTimer();
      set({ kind: "ready" });
    } else {
      set({ kind: "loading", step: codeDone ? "assets" : "code", progress: progress() });
    }
  };
  const fail = (reason: "network" | "physics" | "timeout", detail: string) => {
    clearTimer();
    gen++; // ignore everything still in flight
    // The technical text (a chunk URL, a WebAssembly error) is for the console, never the dialog.
    console.warn(`[game] load failed (${reason}): ${detail}`);
    set({ kind: "failed", reason, message: FAILURE_COPY[reason], detail });
  };

  const run = (onCode: (mod: GameModule) => void) => {
    const mine = ++gen;
    lastOnCode = onCode;
    codeDone = assetsDone = physicsDone = false;
    assetFraction = 0;
    peak = 0;
    assets = null;
    clearTimer();
    set({ kind: "loading", step: "code", progress: 0 });
    loadCode().then(
      (mod) => {
        if (mine !== gen) return;
        codeDone = true;
        update();
        onCode(mod); // the shell mounts the warm-up scene, which starts physics init
        timer = setTimeout(() => {
          if (mine === gen) fail("timeout", "The game engine took too long to start.");
        }, physicsTimeoutMs);
        mod
          .loadGameAssets((loaded, total) => {
            if (mine !== gen) return;
            assetFraction = total > 0 ? Math.min(loaded / total, 1) : 0;
            update();
          })
          .then(
            (a) => {
              if (mine !== gen) return;
              assets = a;
              assetsDone = true;
              update();
            },
            (err: unknown) => {
              if (mine === gen) fail("network", err instanceof Error ? err.message : "Could not load game assets.");
            }
          );
      },
      (err: unknown) => {
        if (mine === gen) fail("network", err instanceof Error ? err.message : "Could not load the game.");
      }
    );
  };

  return {
    prefetch(afterCode) {
      const mode = prefetchMode();
      loadCode().then(
        (mod) => {
          if (mode === "code+assets") mod.loadGameAssets(() => {}).catch(() => {});
          try {
            afterCode?.(mod);
          } catch {
            // a failed pre-warm must never surface; the real click retries everything
          }
        },
        () => {}
      );
    },
    start(onCode) {
      if (state.kind === "loading") return;
      run(onCode);
    },
    reportPhysics(result) {
      if (state.kind !== "loading" || physicsDone) return;
      if (result === "ready") {
        physicsDone = true;
        update();
      } else {
        fail("physics", result.message || "The physics engine failed to start.");
      }
    },
    cancel() {
      gen++;
      clearTimer();
      codeDone = assetsDone = physicsDone = false;
      assets = null;
      if (state.kind !== "idle") set({ kind: "idle" });
    },
    retry() {
      if (state.kind === "failed" && lastOnCode) run(lastOnCode);
    },
    getState: () => state,
    getAssets: () => assets,
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}
