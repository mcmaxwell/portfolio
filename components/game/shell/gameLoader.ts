// Game loader: the ONE dynamic import of the game entry in the codebase (ADR-006).
// M1 scope: state, generation counter, physics timeout, cancel and retry; the
// progress UI (LoadingOverlay) arrives in M2.

// A type query is erased at build time and is not an import declaration, so the
// shell stays free of static game imports.
export type GameModule = typeof import("@/components/game/entry");
export type LoadedAssets = Awaited<ReturnType<GameModule["loadGameAssets"]>>;

export type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; step: "code" | "assets"; progress: number } // 0..1
  | { kind: "ready" }
  | { kind: "failed"; reason: "network" | "physics" | "timeout"; message: string };

export type LoaderDeps = {
  importGame: () => Promise<GameModule>;
  physicsTimeoutMs: number;
};

export interface GameLoader {
  start(onCode: (mod: GameModule) => void): void;
  reportPhysics(result: "ready" | Error): void;
  cancel(): void; // idempotent; clears timers; late results ignored
  retry(): void;
  getState(): LoadState;
  getAssets(): LoadedAssets | null;
  subscribe(fn: () => void): () => void;
}

const W_CODE = 0.2;
const W_ASSETS = 0.7;
const W_PHYSICS = 0.1;

export function createGameLoader(deps: Partial<LoaderDeps> = {}): GameLoader {
  const importGame = deps.importGame ?? (() => import("@/components/game/entry"));
  const physicsTimeoutMs = deps.physicsTimeoutMs ?? 20000;

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
  const progress = () =>
    (codeDone ? W_CODE : 0) + W_ASSETS * (assetsDone ? 1 : assetFraction) + (physicsDone ? W_PHYSICS : 0);
  const update = () => {
    if (codeDone && assetsDone && physicsDone) {
      clearTimer();
      set({ kind: "ready" });
    } else {
      set({ kind: "loading", step: codeDone ? "assets" : "code", progress: progress() });
    }
  };
  const fail = (reason: "network" | "physics" | "timeout", message: string) => {
    clearTimer();
    gen++; // ignore everything still in flight
    set({ kind: "failed", reason, message });
  };

  const run = (onCode: (mod: GameModule) => void) => {
    const mine = ++gen;
    lastOnCode = onCode;
    codeDone = assetsDone = physicsDone = false;
    assetFraction = 0;
    assets = null;
    clearTimer();
    set({ kind: "loading", step: "code", progress: 0 });
    importGame().then(
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
