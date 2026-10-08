// Game loader: state, progress, cancel at every step (no timer left behind), retry, timeout,
// late results ignored, and the Play prefetch.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGameLoader, prefetchModeFor, type GameModule, type LoadState } from "../shell/gameLoader";

type Deferred<T> = { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

type Rig = {
  imports: Array<Deferred<GameModule>>;
  assetsCalls: Array<{ done: Deferred<{ clips: object }>; onProgress: (l: number, t: number) => void }>;
  importGame: ReturnType<typeof vi.fn>;
  mod: GameModule;
};
function rig(): Rig {
  const r = { imports: [], assetsCalls: [] } as unknown as Rig;
  r.mod = {
    loadGameAssets: vi.fn((onProgress: (l: number, t: number) => void) => {
      const done = deferred<{ clips: object }>();
      r.assetsCalls.push({ done, onProgress });
      return done.promise;
    }),
  } as unknown as GameModule;
  r.importGame = vi.fn(() => {
    const d = deferred<GameModule>();
    r.imports.push(d);
    return d.promise;
  });
  return r;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const loader = (r: Rig, over: { prefetchMode?: () => "code" | "code+assets" } = {}) =>
  createGameLoader({ importGame: r.importGame as never, physicsTimeoutMs: 20000, ...over });

describe("progress and readiness", () => {
  it("is ready only after code, assets and physics, with weighted progress that never goes back", async () => {
    const r = rig();
    const l = loader(r);
    const seen: LoadState[] = [];
    l.subscribe(() => seen.push(l.getState()));
    const onCode = vi.fn();
    l.start(onCode);
    expect(l.getState()).toEqual({ kind: "loading", step: "code", progress: 0 });
    r.imports[0].resolve(r.mod);
    await flush();
    expect(onCode).toHaveBeenCalledWith(r.mod);
    expect(l.getState()).toMatchObject({ kind: "loading", step: "assets" });
    r.assetsCalls[0].onProgress(5, 10);
    r.assetsCalls[0].onProgress(2, 10); // a total discovered later makes the raw fraction drop
    const progresses = seen.filter((s) => s.kind === "loading").map((s) => (s as { progress: number }).progress);
    expect(progresses[progresses.length - 1]).toBeCloseTo(0.2 + 0.7 * 0.5, 5);
    expect([...progresses].sort((a, b) => a - b)).toEqual(progresses); // monotonic
    r.assetsCalls[0].done.resolve({ clips: {} });
    await flush();
    expect(l.getState()).toMatchObject({ kind: "loading", progress: expect.closeTo(0.9, 5) });
    expect(l.getAssets()).toEqual({ clips: {} });
    l.reportPhysics("ready");
    expect(l.getState()).toEqual({ kind: "ready" });
    expect(vi.getTimerCount()).toBe(0); // the physics timeout is cleared on ready
  });

  it("physics ready before the assets does not finish the load early", async () => {
    const r = rig();
    const l = loader(r);
    l.start(() => {});
    r.imports[0].resolve(r.mod);
    await flush();
    l.reportPhysics("ready");
    expect(l.getState().kind).toBe("loading");
    r.assetsCalls[0].done.resolve({ clips: {} });
    await flush();
    expect(l.getState()).toEqual({ kind: "ready" });
  });

  it("a second start while loading does not import again", () => {
    const r = rig();
    const l = loader(r);
    l.start(() => {});
    l.start(() => {});
    expect(r.importGame).toHaveBeenCalledTimes(1);
  });
});

describe("cancel at every step leaves idle and no timer", () => {
  it("during the code step: a late module never reaches onCode", async () => {
    const r = rig();
    const l = loader(r);
    const onCode = vi.fn();
    l.start(onCode);
    l.cancel();
    expect(l.getState()).toEqual({ kind: "idle" });
    expect(vi.getTimerCount()).toBe(0);
    r.imports[0].resolve(r.mod);
    await flush();
    expect(onCode).not.toHaveBeenCalled();
    expect(l.getState()).toEqual({ kind: "idle" });
    expect(r.mod.loadGameAssets).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("during the assets step: late assets and late progress are ignored", async () => {
    const r = rig();
    const l = loader(r);
    l.start(() => {});
    r.imports[0].resolve(r.mod);
    await flush();
    expect(vi.getTimerCount()).toBe(1); // the physics timeout runs from the code step
    l.cancel();
    expect(l.getState()).toEqual({ kind: "idle" });
    expect(vi.getTimerCount()).toBe(0);
    r.assetsCalls[0].onProgress(9, 10);
    r.assetsCalls[0].done.resolve({ clips: {} });
    await flush();
    expect(l.getState()).toEqual({ kind: "idle" });
    expect(l.getAssets()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("during the physics step: late physics results are ignored", async () => {
    const r = rig();
    const l = loader(r);
    l.start(() => {});
    r.imports[0].resolve(r.mod);
    await flush();
    r.assetsCalls[0].done.resolve({ clips: {} });
    await flush();
    expect(l.getState()).toMatchObject({ kind: "loading" });
    l.cancel();
    expect(l.getState()).toEqual({ kind: "idle" });
    expect(vi.getTimerCount()).toBe(0);
    l.reportPhysics("ready");
    l.reportPhysics(new Error("late"));
    expect(l.getState()).toEqual({ kind: "idle" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("after ready, and when already idle: idempotent", async () => {
    const r = rig();
    const l = loader(r);
    l.cancel();
    l.cancel();
    expect(l.getState()).toEqual({ kind: "idle" });
    l.start(() => {});
    r.imports[0].resolve(r.mod);
    await flush();
    r.assetsCalls[0].done.resolve({ clips: {} });
    await flush();
    l.reportPhysics("ready");
    l.cancel();
    l.cancel();
    expect(l.getState()).toEqual({ kind: "idle" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancel notifies subscribers once with idle", () => {
    const r = rig();
    const l = loader(r);
    l.start(() => {});
    const fn = vi.fn();
    l.subscribe(fn);
    l.cancel();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("failure, retry and timeout", () => {
  it("a failed code download is failed/network; retry loads again with the same onCode", async () => {
    const r = rig();
    const l = loader(r);
    const onCode = vi.fn();
    l.start(onCode);
    r.imports[0].reject(new Error("offline"));
    await flush();
    expect(l.getState()).toEqual({ kind: "failed", reason: "network", message: expect.not.stringContaining("offline"), detail: "offline" });
    expect(vi.getTimerCount()).toBe(0);
    l.retry();
    expect(r.importGame).toHaveBeenCalledTimes(2); // the rejected import is forgotten (A6)
    expect(l.getState()).toMatchObject({ kind: "loading", step: "code" });
    r.imports[1].resolve(r.mod);
    await flush();
    expect(onCode).toHaveBeenCalledTimes(1);
    r.assetsCalls[0].done.resolve({ clips: {} });
    await flush();
    l.reportPhysics("ready");
    expect(l.getState()).toEqual({ kind: "ready" });
  });

  it("a failed asset download is failed/network and Retry fetches the assets again", async () => {
    const r = rig();
    const l = loader(r);
    l.start(() => {});
    r.imports[0].resolve(r.mod);
    await flush();
    r.assetsCalls[0].done.reject(new Error("clips 503"));
    await flush();
    expect(l.getState()).toEqual({ kind: "failed", reason: "network", message: expect.not.stringContaining("clips 503"), detail: "clips 503" });
    expect(vi.getTimerCount()).toBe(0);
    l.retry();
    await flush();
    expect(r.mod.loadGameAssets).toHaveBeenCalledTimes(2);
  });

  it("retry does nothing unless the load failed", () => {
    const r = rig();
    const l = loader(r);
    l.retry();
    expect(r.importGame).not.toHaveBeenCalled();
    l.start(() => {});
    l.retry();
    expect(r.importGame).toHaveBeenCalledTimes(1);
  });

  it("the dialog text is a plain sentence: no chunk number or URL, the technical text goes to detail and the console", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = "Loading chunk 186 failed. (error: http://localhost:3100/_next/static/chunks/entry_ts.js)";
    const r = rig();
    const l = loader(r);
    l.start(() => {});
    r.imports[0].reject(new Error(raw));
    await flush();
    const st = l.getState();
    expect(st.kind).toBe("failed");
    if (st.kind === "failed") {
      expect(st.message).not.toMatch(/chunk|http|\d{3}/i);
      expect(st.detail).toBe(raw);
    }
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(raw));
    warn.mockRestore();
  });

  it("a physics error is failed/physics and clears the timeout", async () => {
    const r = rig();
    const l = loader(r);
    l.start(() => {});
    r.imports[0].resolve(r.mod);
    await flush();
    l.reportPhysics(new Error("wasm"));
    expect(l.getState()).toEqual({ kind: "failed", reason: "physics", message: expect.not.stringContaining("wasm"), detail: "wasm" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("no physics signal within the timeout is failed/timeout, and later results are ignored", async () => {
    const r = rig();
    const l = loader(r);
    l.start(() => {});
    r.imports[0].resolve(r.mod);
    await flush();
    vi.advanceTimersByTime(19999);
    expect(l.getState().kind).toBe("loading");
    vi.advanceTimersByTime(1);
    expect(l.getState()).toMatchObject({ kind: "failed", reason: "timeout" });
    expect(vi.getTimerCount()).toBe(0);
    r.assetsCalls[0].done.resolve({ clips: {} });
    l.reportPhysics("ready");
    await flush();
    expect(l.getState()).toMatchObject({ kind: "failed", reason: "timeout" });
  });

  it("results of a failed run never leak into the retried run", async () => {
    const r = rig();
    const l = loader(r);
    l.start(() => {});
    r.imports[0].resolve(r.mod);
    await flush();
    l.reportPhysics(new Error("first"));
    l.retry();
    await flush();
    // the first run's assets resolve now: they belong to a dead generation
    r.assetsCalls[0].done.resolve({ clips: { stale: true } });
    await flush();
    expect(l.getAssets()).toBeNull();
    expect(l.getState()).toMatchObject({ kind: "loading" });
    r.assetsCalls[1].done.resolve({ clips: {} });
    await flush();
    expect(l.getAssets()).toEqual({ clips: {} });
  });

  it("unsubscribe stops notifications", () => {
    const r = rig();
    const l = loader(r);
    const fn = vi.fn();
    const off = l.subscribe(fn);
    off();
    l.start(() => {});
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("prefetch (play-transition.md 3.3)", () => {
  it("starts the same import that start() later awaits: one download", async () => {
    const r = rig();
    const l = loader(r, { prefetchMode: () => "code" });
    l.prefetch();
    expect(r.importGame).toHaveBeenCalledTimes(1);
    expect(l.getState()).toEqual({ kind: "idle" }); // nothing shown, nothing mounted
    const onCode = vi.fn();
    l.start(onCode);
    expect(r.importGame).toHaveBeenCalledTimes(1);
    r.imports[0].resolve(r.mod);
    await flush();
    expect(onCode).toHaveBeenCalledTimes(1);
  });

  it("is idempotent across hover, focus and press", () => {
    const r = rig();
    const l = loader(r, { prefetchMode: () => "code" });
    l.prefetch();
    l.prefetch();
    l.prefetch();
    expect(r.importGame).toHaveBeenCalledTimes(1);
  });

  it("code mode (touch or Save-Data) never requests the clips; code+assets does", async () => {
    const codeOnly = rig();
    loader(codeOnly, { prefetchMode: () => "code" }).prefetch();
    codeOnly.imports[0].resolve(codeOnly.mod);
    await flush();
    expect(codeOnly.mod.loadGameAssets).not.toHaveBeenCalled();

    const both = rig();
    loader(both, { prefetchMode: () => "code+assets" }).prefetch();
    both.imports[0].resolve(both.mod);
    await flush();
    expect(both.mod.loadGameAssets).toHaveBeenCalledTimes(1);
  });

  it("swallows a failed prefetch (no state change, no throw) and the real click retries", async () => {
    const r = rig();
    const l = loader(r, { prefetchMode: () => "code+assets" });
    l.prefetch();
    r.imports[0].reject(new Error("offline"));
    await flush();
    expect(l.getState()).toEqual({ kind: "idle" });
    l.start(() => {});
    expect(r.importGame).toHaveBeenCalledTimes(2);
    expect(l.getState()).toMatchObject({ kind: "loading" });
  });

  it("swallows a failed clip prefetch and a throwing afterCode callback", async () => {
    const r = rig();
    const l = loader(r, { prefetchMode: () => "code+assets" });
    l.prefetch(() => {
      throw new Error("prewarm failed");
    });
    r.imports[0].resolve(r.mod);
    await flush();
    r.assetsCalls[0].done.reject(new Error("503"));
    await flush();
    expect(l.getState()).toEqual({ kind: "idle" });
  });

  it("calls afterCode with the module once the code has loaded", async () => {
    const r = rig();
    const l = loader(r, { prefetchMode: () => "code" });
    const after = vi.fn();
    l.prefetch(after);
    expect(after).not.toHaveBeenCalled();
    r.imports[0].resolve(r.mod);
    await flush();
    expect(after).toHaveBeenCalledWith(r.mod);
  });

  it("prefetchModeFor: fine pointer without Save-Data fetches clips too", () => {
    expect(prefetchModeFor({ coarsePointer: false, saveData: false })).toBe("code+assets");
    expect(prefetchModeFor({ coarsePointer: true, saveData: false })).toBe("code");
    expect(prefetchModeFor({ coarsePointer: false, saveData: true })).toBe("code");
  });
});
