# ADR-004: Vitest as the unit test runner, with real Rapier in Node

- Status: Accepted (runner fixed by the Boss; setup proposed in TASK-002 design.md section 7.2)
- Date: 2026-10-06
- Work item: TASK-002

## Context

The project has no test runner or test script (`package.json:8-14`).
The spec requires focused automated tests for game-state transitions, load cancellation, input normalization, grounding and jump eligibility, collisions and slopes, collectibles, storage fallback, cleanup and panel focus (spec section 13).
three 0.163 and drei are ESM-only (audit testRunner.why), the stack is Next.js 14.1.4 with TypeScript strict, and the `@/*` path alias must resolve (`tsconfig.json:20-22`).
The audit verified candidate versions with `npm view` only.

## Decision

Use Vitest, installed with exact versions: `vitest@5.0.3`, `vite@8.3.3`, `@vitejs/plugin-react@6.1.2`, `vite-tsconfig-paths@6.1.1`, `jsdom@30.1.2`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `@testing-library/jest-dom@7.0.1`, and `@dimforge/rapier3d-compat@0.14.0`.
Configuration lives in `vitest.config.mts` with Node as the default environment and jsdom opted in per file; tests import Vitest APIs explicitly (no globals) and live under `components/game/__tests__/`.
Scripts: `"test": "vitest run"` and `"test:watch": "vitest"`.
Physics tests initialize the real Rapier compat build in Node and run the shipped motor and collider builder against shipped layout data.

## Consequences

- Tests run outside the Next build, so no Next, Babel or tsconfig change is needed.
- ESM-only three code runs without transform workarounds.
- Physics behavior (steps, slopes, jump grace) is verified against the real engine.
- jsdom 30.1.2 requires Node `^22.22.2`; older 22.x CI images need a fallback version, recorded when used.
- Visual quality, frame rate and real input devices remain manual browser checks; unit tests do not prove them.

## Alternatives

1. `next/jest` with Jest 29 and jsdom: officially documented for Next 14, but needs `transformIgnorePatterns` workarounds for ESM-only three and drei.
2. Playwright component or end-to-end tests only: closest to the user, but slow for logic coverage and needs a browser in every stage; suitable later for the full journey, not as the unit runner.
3. Node's built-in test runner: no dependencies, but no TSX transform, path aliases, or DOM environment without extra tooling.

## Rollback Plan

Tests and config are additive: removing `vitest.config.mts`, `vitest.setup.ts`, the test files and the devDependencies returns the repo to its prior state; game code has no runtime dependency on Vitest.
