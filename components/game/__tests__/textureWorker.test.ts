// @vitest-environment jsdom
// The texture worker client: textures arrive from workers as bitmaps (not flipped again by the upload),
// every name is painted exactly once across the workers, and a missing, failing or silent worker
// resolves to null so the caller paints on the main thread instead. A real worker is covered by the
// browser run in the M5 report; here the Worker is a stub.
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTexturesInWorker } from "../world/textures";
import { PAINTERS } from "../world/texturePaint";

type Msg = { names: string[] };
const NAMES = Object.keys(PAINTERS);
const created: FakeWorker[] = [];

class FakeWorker {
  static mode: "ok" | "error-message" | "throw" | "silent" = "ok";
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminated = false;
  names: string[] = [];
  constructor() {
    if (FakeWorker.mode === "throw") throw new Error("blocked");
    created.push(this);
  }
  postMessage(m: Msg) {
    this.names = m.names;
    if (FakeWorker.mode === "silent") return;
    setTimeout(() => {
      if (this.terminated) return;
      for (const name of m.names) {
        if (FakeWorker.mode === "error-message") this.onmessage?.({ data: { name, error: "boom" } });
        else this.onmessage?.({ data: { name, bitmap: Object.assign(new (globalThis as unknown as { ImageBitmap: new () => object }).ImageBitmap(), { close: vi.fn() }) } });
      }
    }, 0);
  }
  terminate() {
    this.terminated = true;
  }
}

function stubBrowser() {
  vi.stubGlobal("Worker", FakeWorker);
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal("createImageBitmap", vi.fn());
  vi.stubGlobal("ImageBitmap", class {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  created.length = 0;
  FakeWorker.mode = "ok";
});

describe("buildTexturesInWorker", () => {
  it("resolves null where there is no Worker, OffscreenCanvas or createImageBitmap", async () => {
    expect(await buildTexturesInWorker(8)).toBeNull();
  });

  it("deals every texture name to exactly one worker and returns them all, with the workers terminated", async () => {
    stubBrowser();
    const out = await buildTexturesInWorker(8);
    expect(out).not.toBeNull();
    expect(Object.keys(out!).sort()).toEqual([...NAMES].sort());
    const dealt = created.flatMap((w) => w.names);
    expect([...dealt].sort()).toEqual([...NAMES].sort());
    expect(created.length).toBeGreaterThanOrEqual(1);
    expect(created.length).toBeLessThanOrEqual(3);
    expect(created.every((w) => w.terminated)).toBe(true);
    // A bitmap is not flipped by the upload, so the worker flips it and the texture must not flip again.
    for (const t of Object.values(out!)) expect(t.flipY).toBe(false);
  });

  it("resolves null, and stops the workers, when a worker reports an error", async () => {
    stubBrowser();
    FakeWorker.mode = "error-message";
    expect(await buildTexturesInWorker(8)).toBeNull();
    expect(created.every((w) => w.terminated)).toBe(true);
  });

  it("resolves null when a worker cannot be created (a blocked worker-src)", async () => {
    stubBrowser();
    FakeWorker.mode = "throw";
    expect(await buildTexturesInWorker(8)).toBeNull();
  });

  it("resolves null after the timeout when a worker never answers", async () => {
    vi.useFakeTimers();
    stubBrowser();
    FakeWorker.mode = "silent";
    const p = buildTexturesInWorker(8, 5000);
    await vi.advanceTimersByTimeAsync(5001);
    expect(await p).toBeNull();
    expect(created.every((w) => w.terminated)).toBe(true);
  });
});
