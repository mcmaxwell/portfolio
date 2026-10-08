# ADR-006: Working lint gate via .eslintrc.json and a lint-enforced game import boundary

- Status: Proposed (lint shape directed by the Boss; boundary rule proposed in TASK-002 design.md section 7.3)
- Date: 2026-10-06
- Work item: TASK-002

## Context

`npm run lint` runs `next lint` (`package.json:12`); the M0 audit found that with no `.eslintrc*` it opens an interactive prompt and exits 0 without linting.
The existing `eslint.config.mjs` extends `next/typescript` (`eslint.config.mjs:13`), which `eslint-config-next` 14.1.4 does not ship, so it fails under ESLint 8.57 and is ignored by `next lint` 14.1.4.
Game code, physics and world assets must stay out of the ordinary portfolio loading path, and testimonials in `data/index.ts` are placeholders that must never appear in the game (`data/index.ts:156-182`).

## Decision

Add `.eslintrc.json` extending `next/core-web-vitals` and delete `eslint.config.mjs`.
Add `no-restricted-imports` overrides: files in `app/`, `components/avatar/`, `components/site/`, `lib/` and `data/` may not statically import `@/components/game/*` except `components/game/shell/*`; files in `components/game/shell/` may not import other game modules, relative parents, `@react-three/rapier` or `@dimforge/*`; files in `components/game/` may not import `testimonials` from `@/data`.
The single allowed path into game code is `import("@/components/game/entry")` in `components/game/shell/gameLoader.ts`, which the rule does not check because it is an expression, not a declaration.
The exact JSON is in design.md section 7.3.

## Consequences

- `npm run lint` becomes a real gate, and `next build` also lints and fails on lint errors, so pre-existing violations must be fixed or reported in M1.
- An accidental static import that would pull Rapier or the world into the portfolio bundle fails lint before review.
- The testimonial ban is mechanical rather than a review convention.
- eslintrc override precedence means later matching overrides replace earlier options for the same rule; the shell override repeats the testimonial path for that reason.
- Moving to ESLint 9 flat config later requires porting these overrides.

## Alternatives

1. Fix `eslint.config.mjs` to extend only `next/core-web-vitals`: also works for raw ESLint, but `next lint` 14.1.4 does not read flat config, so `npm run lint` would still prompt.
2. Switch the script to `eslint .`: bypasses `next lint`, but changes the documented command and loses Next's file targeting.
3. Rely on review and a bundle check only for the boundary: catches violations later and less reliably.

## Rollback Plan

Delete `.eslintrc.json` and restore `eslint.config.mjs` from the base commit; the lint gate returns to its previous non-functional state and the build stops linting.
The boundary rule can be removed independently by deleting its override entries.
