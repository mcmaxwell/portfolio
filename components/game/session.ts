// Game session: M1 holds createGame and the cleanup registry only.
// The state machine and store arrive in M2 (design 2.3).
import { createInputController, type InputController } from "./input";

export interface GameHandle {
  input: InputController;
  reducedMotion: boolean;
  readonly disposed: boolean;
  registerCleanup(fn: () => void): void; // run LIFO by dispose()
  dispose(): void; // idempotent
}

export function createGame(opts: { reducedMotion: boolean; storage?: Storage | null }): GameHandle {
  const input = createInputController();
  const cleanups: Array<() => void> = [];
  let disposed = false;
  const handle: GameHandle = {
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
      input.detach();
    },
  };
  return handle;
}
