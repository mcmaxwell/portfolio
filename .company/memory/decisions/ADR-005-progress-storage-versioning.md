# ADR-005: Versioned local progress record with in-memory fallback

- Status: Accepted 2026-10-08 after TASK-002 QA approval and Codex cross-review (TASK-002 design.md section 2.11)
- Date: 2026-10-06
- Work item: TASK-002

## Context

The game must save challenge progress locally in a versioned format, offer Restart, reset safely when save data is invalid, and continue in memory when storage is unavailable (spec sections 8 and 9).
There is no backend game service or account (spec section 1).
Once shipped, the stored shape lives in visitors' browsers and cannot be changed retroactively, so the format is hard to reverse.

## Decision

Store one JSON record under the localStorage key `portfolio.game.progress`:
`{ "version": 1, "collected": CellId[], "completed": boolean, "settings": { "soundOn": boolean, "volume": number, "reducedMotion": "system" | "on" | "off", "quality": "auto" | "low" | "high" } }`, with `CellId` one of `"lab"`, `"workshop"`, `"tower"`.
`version` is a positive integer incremented on any incompatible change; `parseProgress` applies ordered migrations `n -> n+1` for known older versions and returns status `migrated`.
Unparseable JSON, a wrong shape, unknown cell ids, or a missing or unknown `version` (including a newer one) yield the default record with status `invalid`; the next save overwrites it.
`collected` is de-duplicated and sorted on every write; volume is clamped to `[0, 1]`.
Every storage access is wrapped: if `localStorage` is absent or any access throws (privacy mode, quota), the store keeps working in memory and reports `persistent: false`.
The store is a module-level singleton inside the game chunk, so progress also survives exit and re-entry within one page visit.
Restart clears `collected` and `completed` and keeps `settings`.
Validation is a hand-written type guard; no schema library is added.

## Consequences

- Corrupt or foreign data can never break the game; at worst progress resets.
- A visitor who later loads an older build after a newer one loses progress rather than crashing; acceptable for a short optional challenge.
- Settings share the record, so one write path and one version cover both.
- Any future field change must bump `version` and add a migration with a test.

## Alternatives

1. Unversioned record: simplest now, but no safe way to evolve the shape later.
2. Separate keys per field: avoids a migration for additive fields, but multiplies partial-write and validation cases.
3. IndexedDB: asynchronous and heavier for a few bytes, no benefit at this size.
4. A schema library such as zod: clearer validation, but a new runtime dependency for one small record.

## Rollback Plan

Remove the key from the code and stop reading it; stale records are harmless strings in visitors' storage.
To change format, bump `version` and add a migration rather than editing version 1 in place.

## Implementation Notes (TASK-002, Milestones 4 and 5)

- Milestone 4 tightened the invalid rule: a stored record with `completed` true and fewer than three cells is invalid and falls back to the default record.
- The storage key as implemented is `portfolio.game.progress`, and the record version is `1`.
- Restart clears `collected` and `completed` and keeps `settings`, as in the Decision section.
- Sound and quality-preset settings were deferred by user decision on 2026-10-07, so no UI for them ships; the settings fields remain part of the record shape above.
