# ADR-001: Physics with @react-three/rapier 1.5.0 and a game-owned fixed step

- Status: Accepted (engine choice fixed by the Boss; stepping model proposed in TASK-002 design.md section 4)
- Date: 2026-10-06
- Work item: TASK-002

## Context

The playable portfolio needs a capsule character with wall sliding, steps, slopes, ground snapping, gravity and a fixed 60 Hz simulation with capped catch-up and interpolation (spec section 5).
The stack is fixed at React 18, three 0.163 and @react-three/fiber 8.16 (`package.json:16-28`).
The M0 audit measured that `@react-three/rapier@1.5.0` accepts those peers, while 2.x requires React 19 and fiber 9, and that its WASM costs about 765 KB gzip, inside the 8 MB first-play budget.
The audit verified that `@dimforge/rapier3d-compat` 0.14.0 exposes `World.createCharacterController`.
The library's internal stepping loop has catch-up and interpolation behavior that this project has not verified.

## Decision

Install `@react-three/rapier` at exactly 1.5.0 and `@dimforge/rapier3d-compat` at exactly 0.14.0 (devDependency, for Node tests; it must equal the version 1.5.0 pins).
Use `<Physics paused>` only for WASM initialization, world creation and disposal, and the optional debug renderer.
The game steps the raw world itself from one frame driver: `dt = 1/60`, at most 4 steps per frame, frame delta clamped to 0.25 s, backlog dropped when the cap is hit, and the character position interpolated by `alpha = accumulator / dt`.
The character is a kinematic capsule (radius 0.3 m, half-height 0.6 m) moved by `KinematicCharacterController` with autostep, slope limits and snap-to-ground; coyote time and jump buffering are game logic.
World colliders are cuboids built imperatively from one layout data file through the injected `rapier` and `world`, so Vitest runs the same colliders and controller in Node.

## Consequences

- The catch-up cap and interpolation are explicit, unit-tested code rather than library internals.
- Physics tests exercise the real engine, not mocks.
- The project does not use the library's declarative `<RigidBody>` components or its collision events; interactions use distance checks.
- Bodies and the controller must be released before `<Physics>` frees the world; the game's explicit dispose order (design.md 3.4) handles this.
- Upgrading to React 19 later requires moving to @react-three/rapier 2.x and re-checking the `useRapier()` and `paused` behavior this design relies on.

## Alternatives

1. Let `<Physics>` step with `timeStep={1/60}` and its built-in interpolation: less code, but the catch-up cap is not configurable as needed and is unverified here.
2. Raw `@dimforge/rapier3d-compat` without the React wrapper: removes one dependency but re-implements Suspense-based init and disposal; the Boss fixed the wrapper as the engine choice.
3. A custom raycast-and-AABB controller without an engine: smallest download, but steps, slopes and sliding become bespoke code with high defect risk.
4. cannon-es or ammo.js: no maintained kinematic character controller comparable to Rapier's, and ammo.js is larger.

## Rollback Plan

All engine use is confined to `components/game/player.ts`, `components/game/world/colliders.ts` and `components/game/GameScene.tsx`.
To switch to the library's internal stepping, remove `paused` and the stepper call in the frame driver and drive the motor from the library's before-step hook.
To remove the engine, uninstall both packages and replace those three files; no other module imports Rapier (enforced by the shell lint rule in ADR-006).
