// Challenge progress (design 2.11, ADR-005): one versioned JSON record in localStorage, with a safe
// in-memory fallback. Nothing here throws to a caller and nothing shows an error to the visitor:
// corrupt or foreign data resets to the default, unavailable storage keeps the loop working in memory.
// No React, no three, no DOM beyond the optional `window.localStorage` read.
import type { CellId } from "./config";
import type { Store } from "./session";

export const PROGRESS_KEY = "portfolio.game.progress";
export const PROGRESS_VERSION = 1;
export const CELL_IDS: readonly CellId[] = ["lab", "workshop", "tower"];

export type Settings = {
  soundOn: boolean;
  volume: number; // 0..1
  reducedMotion: "system" | "on" | "off";
  quality: "auto" | "low" | "high";
};
/**
 * `trophy` was added to version 1 without a version bump (ADR-005): a stored record without it is the
 * same record with no trophy, and an older build that reads a newer record simply ignores the field.
 */
export type ProgressV1 = { version: 1; collected: CellId[]; completed: boolean; trophy: boolean; settings: Settings };
export type ParseStatus = "ok" | "empty" | "invalid" | "migrated";

export const defaultSettings = (): Settings => ({ soundOn: true, volume: 0.6, reducedMotion: "system", quality: "auto" });
export const defaultProgress = (): ProgressV1 => ({ version: 1, collected: [], completed: false, trophy: false, settings: defaultSettings() });

/** Migration n -> n + 1 for a known older record. Version 1 is the first shipped shape, so there are none yet. */
export type Migrations = Readonly<Record<number, (old: Record<string, unknown>) => Record<string, unknown>>>;
const MIGRATIONS: Migrations = {};

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isCellId = (x: unknown): x is CellId => typeof x === "string" && (CELL_IDS as readonly string[]).includes(x);

/** The record when `x` has the current shape (settings clamped, cells de-duplicated and sorted), otherwise null. */
function validate(x: unknown): ProgressV1 | null {
  if (!isRecord(x) || x.version !== PROGRESS_VERSION) return null;
  if (!Array.isArray(x.collected) || !x.collected.every(isCellId)) return null;
  if (typeof x.completed !== "boolean") return null;
  // Absent in records saved before the trophy existed: no trophy yet. Present, it must be a boolean.
  if (x.trophy !== undefined && typeof x.trophy !== "boolean") return null;
  const s = x.settings;
  if (!isRecord(s)) return null;
  if (typeof s.soundOn !== "boolean") return null;
  if (typeof s.volume !== "number" || !Number.isFinite(s.volume)) return null;
  if (s.reducedMotion !== "system" && s.reducedMotion !== "on" && s.reducedMotion !== "off") return null;
  if (s.quality !== "auto" && s.quality !== "low" && s.quality !== "high") return null;
  const collected = normalizeCells(x.collected);
  // A completion without all three cells cannot happen through the game: treat it as a foreign record.
  if (x.completed && collected.length !== CELL_IDS.length) return null;
  return {
    version: 1,
    collected,
    completed: x.completed,
    trophy: x.trophy === true,
    settings: { soundOn: s.soundOn, volume: Math.min(1, Math.max(0, s.volume)), reducedMotion: s.reducedMotion, quality: s.quality },
  };
}

const normalizeCells = (cells: readonly CellId[]): CellId[] => CELL_IDS.filter((id) => cells.includes(id));

/**
 * Reads a stored string. `null` is "nothing stored" (status empty). Unparseable JSON, a wrong shape,
 * unknown cell ids and a missing, non-integer, unknown or newer version give the default record with
 * status invalid; the next save overwrites it. A known older version is migrated step by step.
 */
export function parseProgress(raw: string | null, migrations: Migrations = MIGRATIONS): { progress: ProgressV1; status: ParseStatus } {
  if (raw === null) return { progress: defaultProgress(), status: "empty" };
  const invalid = { progress: defaultProgress(), status: "invalid" as const };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return invalid;
  }
  if (!isRecord(data)) return invalid;
  let version = data.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > PROGRESS_VERSION) return invalid;
  let migrated = false;
  let current: Record<string, unknown> = data;
  try {
    while (version < PROGRESS_VERSION) {
      const step = migrations[version];
      if (!step) return invalid;
      current = { ...step(current), version: version + 1 };
      version += 1;
      migrated = true;
    }
  } catch {
    return invalid;
  }
  const progress = validate(current);
  if (!progress) return invalid;
  return { progress, status: migrated ? "migrated" : "ok" };
}

/** Idempotent: collecting a cell twice counts once. Returns the same object when nothing changes. */
export function collectCell(p: ProgressV1, id: CellId): ProgressV1 {
  if (p.collected.includes(id)) return p;
  return { ...p, collected: normalizeCells([...p.collected, id]) };
}

export const allCollected = (p: ProgressV1): boolean => CELL_IDS.every((id) => p.collected.includes(id));

/** The beacon answers only once all three cells are collected, and only until the challenge is completed. */
export const canActivateBeacon = (p: ProgressV1): boolean => allCollected(p) && !p.completed;

/** Completing needs all three cells; otherwise the record is returned unchanged. */
export function completeChallenge(p: ProgressV1): ProgressV1 {
  if (p.completed || !allCollected(p)) return p;
  return { ...p, completed: true };
}

/** Idempotent: the trophy is collected once. Returns the same object when it already is. */
export function collectTrophy(p: ProgressV1): ProgressV1 {
  return p.trophy ? p : { ...p, trophy: true };
}

/** Clears the cells, the completion and the trophy and keeps the settings. */
export function restartChallenge(p: ProgressV1): ProgressV1 {
  if (p.collected.length === 0 && !p.completed && !p.trophy) return p;
  return { ...p, collected: [], completed: false, trophy: false };
}

export interface ProgressStore extends Store<ProgressV1> {
  update(fn: (p: ProgressV1) => ProgressV1): void;
  /** False when storage is unavailable or the last read or write threw (the game runs from memory). */
  readonly persistent: boolean;
}

type StorageSource = Storage | null | undefined | (() => Storage | null | undefined);

/** `window.localStorage`, or null when the property getter throws (blocked site data) or it is absent. */
export function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage ?? null : null;
  } catch {
    return null;
  }
}

/**
 * A store over `source`: a Storage, nothing, or a function returning one (called inside a guard, so a
 * throwing getter is a missing storage). Every access is guarded; a failure keeps the in-memory state.
 */
export function createProgressStore(source: StorageSource): ProgressStore {
  let storage: Storage | null = null;
  try {
    storage = (typeof source === "function" ? source() : source) ?? null;
  } catch {
    storage = null;
  }
  let persistent = storage !== null;
  let state = defaultProgress();
  if (storage) {
    try {
      state = parseProgress(storage.getItem(PROGRESS_KEY)).progress;
    } catch {
      persistent = false;
    }
  }
  const subs = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    get persistent() {
      return persistent;
    },
    update(fn) {
      let next: ProgressV1;
      try {
        next = fn(state);
      } catch {
        return;
      }
      if (next === state) return;
      state = next;
      if (storage) {
        try {
          storage.setItem(PROGRESS_KEY, JSON.stringify(state));
          persistent = true;
        } catch {
          persistent = false; // quota or privacy mode: the memory state stays authoritative
        }
      }
      Array.from(subs).forEach((f) => f());
    },
  };
}

let singleton: ProgressStore | null = null;

/** The page-wide store: progress also survives Exit and re-entry within one visit. */
export function getProgressStore(storage?: StorageSource): ProgressStore {
  if (!singleton) singleton = createProgressStore(storage === undefined ? browserStorage : storage);
  return singleton;
}

/** For tests: forget the singleton. */
export function resetProgressStoreForTests(): void {
  singleton = null;
}
