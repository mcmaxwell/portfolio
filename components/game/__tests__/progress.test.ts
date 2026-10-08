// @vitest-environment jsdom
// Progress record (ADR-005): round trip, every invalid input, migrations, and storage failures.
import { describe, expect, it, vi } from "vitest";
import {
  PROGRESS_KEY,
  allCollected,
  browserStorage,
  canActivateBeacon,
  collectCell,
  completeChallenge,
  createProgressStore,
  defaultProgress,
  parseProgress,
  restartChallenge,
  type ProgressV1,
} from "../progress";

function memoryStorage(initial: Record<string, string> = {}): Storage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get length() {
      return Object.keys(data).length;
    },
    clear: () => Object.keys(data).forEach((k) => delete data[k]),
    getItem: (k) => (k in data ? data[k] : null),
    key: (i) => Object.keys(data)[i] ?? null,
    removeItem: (k) => void delete data[k],
    setItem: (k, v) => void (data[k] = String(v)),
  };
}
const full = (over: Partial<ProgressV1> = {}): ProgressV1 => ({ ...defaultProgress(), collected: ["lab", "workshop", "tower"], ...over });

describe("parseProgress", () => {
  it("nothing stored gives the default with status empty", () => {
    expect(parseProgress(null)).toEqual({ progress: defaultProgress(), status: "empty" });
  });

  it("round trips a record, normalising the cells (sorted, de-duplicated) and clamping the volume", () => {
    const raw = JSON.stringify({ ...full({ completed: true }), collected: ["tower", "lab", "lab", "workshop"], settings: { ...defaultProgress().settings, volume: 7 } });
    const r = parseProgress(raw);
    expect(r.status).toBe("ok");
    expect(r.progress.collected).toEqual(["lab", "workshop", "tower"]);
    expect(r.progress.completed).toBe(true);
    expect(r.progress.settings.volume).toBe(1);
    expect(parseProgress(JSON.stringify(r.progress)).progress).toEqual(r.progress);
  });

  it.each([
    ["corrupt JSON", "{not json"],
    ["an empty string", ""],
    ["a JSON array", "[1,2]"],
    ["a JSON number", "42"],
    ["null", "null"],
    ["a missing version", JSON.stringify({ collected: [], completed: false, settings: defaultProgress().settings })],
    ["a string version", JSON.stringify({ ...defaultProgress(), version: "1" })],
    ["a fractional version", JSON.stringify({ ...defaultProgress(), version: 1.5 })],
    ["version 0", JSON.stringify({ ...defaultProgress(), version: 0 })],
    ["an unknown newer version", JSON.stringify({ ...defaultProgress(), version: 2 })],
    ["collected of the wrong type", JSON.stringify({ ...defaultProgress(), collected: "lab" })],
    ["an unknown cell id", JSON.stringify({ ...defaultProgress(), collected: ["lab", "moon"] })],
    ["a non-boolean completed", JSON.stringify({ ...defaultProgress(), completed: "yes" })],
    ["completed without all three cells", JSON.stringify({ ...defaultProgress(), completed: true, collected: ["lab"] })],
    ["missing settings", JSON.stringify({ version: 1, collected: [], completed: false })],
    ["a settings array", JSON.stringify({ ...defaultProgress(), settings: [] })],
    ["a non-numeric volume", JSON.stringify({ ...defaultProgress(), settings: { ...defaultProgress().settings, volume: "loud" } })],
    ["an unknown quality", JSON.stringify({ ...defaultProgress(), settings: { ...defaultProgress().settings, quality: "ultra" } })],
    ["an unknown reducedMotion", JSON.stringify({ ...defaultProgress(), settings: { ...defaultProgress().settings, reducedMotion: 1 } })],
  ])("%s gives the default with status invalid", (_name, raw) => {
    expect(parseProgress(raw)).toEqual({ progress: defaultProgress(), status: "invalid" });
  });
});

describe("pure progress transitions", () => {
  it("collecting the same cell twice counts once and returns the same object", () => {
    const a = collectCell(defaultProgress(), "lab");
    const b = collectCell(a, "lab");
    expect(b).toBe(a);
    expect(b.collected).toEqual(["lab"]);
  });

  it("cells are kept sorted whatever the collection order", () => {
    const p = collectCell(collectCell(collectCell(defaultProgress(), "tower"), "lab"), "workshop");
    expect(p.collected).toEqual(["lab", "workshop", "tower"]);
    expect(allCollected(p)).toBe(true);
  });

  it("the beacon is gated: not with 0, 1 or 2 cells, yes with 3, not again once completed", () => {
    let p = defaultProgress();
    expect(canActivateBeacon(p)).toBe(false);
    p = collectCell(p, "lab");
    expect(canActivateBeacon(p)).toBe(false);
    p = collectCell(p, "workshop");
    expect(canActivateBeacon(p)).toBe(false);
    p = collectCell(p, "tower");
    expect(canActivateBeacon(p)).toBe(true);
    p = completeChallenge(p);
    expect(p.completed).toBe(true);
    expect(canActivateBeacon(p)).toBe(false);
  });

  it("completing without all three cells changes nothing", () => {
    const p = collectCell(defaultProgress(), "lab");
    expect(completeChallenge(p)).toBe(p);
  });

  it("restart clears the cells and the completion and keeps the settings", () => {
    const settings = { soundOn: false, volume: 0.2, reducedMotion: "on" as const, quality: "low" as const };
    const r = restartChallenge(full({ completed: true, settings }));
    expect(r.collected).toEqual([]);
    expect(r.completed).toBe(false);
    expect(r.settings).toEqual(settings);
    const fresh = defaultProgress();
    expect(restartChallenge(fresh)).toBe(fresh);
  });
});

describe("createProgressStore", () => {
  it("saves every change under the versioned key and a new store restores it (reload)", () => {
    const storage = memoryStorage();
    const store = createProgressStore(storage);
    expect(store.persistent).toBe(true);
    store.update((p) => collectCell(p, "workshop"));
    store.update((p) => collectCell(p, "lab"));
    expect(JSON.parse(storage.data[PROGRESS_KEY])).toMatchObject({ version: 1, collected: ["lab", "workshop"], completed: false });
    const reloaded = createProgressStore(storage);
    expect(reloaded.getState().collected).toEqual(["lab", "workshop"]);
    reloaded.update((p) => completeChallenge(collectCell(p, "tower")));
    expect(createProgressStore(storage).getState()).toMatchObject({ completed: true, collected: ["lab", "workshop", "tower"] });
  });

  it("notifies subscribers once per change and not for a no-op", () => {
    const store = createProgressStore(memoryStorage());
    const fn = vi.fn();
    const off = store.subscribe(fn);
    store.update((p) => collectCell(p, "lab"));
    store.update((p) => collectCell(p, "lab"));
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    store.update((p) => collectCell(p, "tower"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("Restart through the store clears progress, keeps the settings and saves", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: JSON.stringify(full({ completed: true, settings: { soundOn: false, volume: 0.1, reducedMotion: "off", quality: "high" } })) });
    const store = createProgressStore(storage);
    expect(store.getState().completed).toBe(true);
    store.update(restartChallenge);
    expect(JSON.parse(storage.data[PROGRESS_KEY])).toMatchObject({ collected: [], completed: false, settings: { soundOn: false, quality: "high" } });
  });

  it("corrupt stored data starts from the default without throwing, and the next save overwrites it", () => {
    const storage = memoryStorage({ [PROGRESS_KEY]: "{{{" });
    const store = createProgressStore(storage);
    expect(store.getState()).toEqual(defaultProgress());
    store.update((p) => collectCell(p, "lab"));
    expect(JSON.parse(storage.data[PROGRESS_KEY]).collected).toEqual(["lab"]);
  });

  it("no storage at all: works in memory, persistent false", () => {
    const store = createProgressStore(null);
    expect(store.persistent).toBe(false);
    store.update((p) => collectCell(p, "lab"));
    expect(store.getState().collected).toEqual(["lab"]);
  });

  it("a throwing storage getter falls back to memory without an error", () => {
    const store = createProgressStore(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(store.persistent).toBe(false);
    store.update((p) => collectCell(p, "tower"));
    expect(store.getState().collected).toEqual(["tower"]);
  });

  it("a throwing getItem falls back to memory", () => {
    const storage = memoryStorage();
    storage.getItem = () => {
      throw new Error("blocked");
    };
    const store = createProgressStore(storage);
    expect(store.persistent).toBe(false);
    store.update((p) => collectCell(p, "lab"));
    expect(store.getState().collected).toEqual(["lab"]);
  });

  it("a setItem quota error keeps the memory state and reports not persistent; a later success recovers", () => {
    const storage = memoryStorage();
    let fail = true;
    const set = storage.setItem;
    storage.setItem = (k, v) => {
      if (fail) throw new DOMException("full", "QuotaExceededError");
      set(k, v);
    };
    const store = createProgressStore(storage);
    store.update((p) => collectCell(p, "lab"));
    expect(store.getState().collected).toEqual(["lab"]);
    expect(store.persistent).toBe(false);
    fail = false;
    store.update((p) => collectCell(p, "workshop"));
    expect(store.persistent).toBe(true);
    expect(JSON.parse(storage.data[PROGRESS_KEY]).collected).toEqual(["lab", "workshop"]);
  });

  it("a throwing update function leaves the state alone", () => {
    const store = createProgressStore(memoryStorage());
    store.update(() => {
      throw new Error("bug");
    });
    expect(store.getState()).toEqual(defaultProgress());
  });
});

describe("browserStorage", () => {
  it("returns null when the localStorage getter throws", () => {
    const spy = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(browserStorage()).toBeNull();
    spy.mockRestore();
  });
});
