# TASK-002 design: playable 3D portfolio

Stage: 02-architect.
Inputs: `spec-implementation-plan.md` (the spec), `reports/01-game-dev-audit.json` (the M0 audit, cited as "audit").
Lasting decisions are recorded in `.company/memory/decisions/ADR-001` to `ADR-006`.
Every claim about current code cites `file:line` at base commit 710f034.
Statements marked **Assumption** (A1-A7 in section 10) are not verified and name the milestone that verifies them.

## 0. Design summary

- One canvas, one avatar, mode-exclusive ownership (ADR-002).
  The hero `<Canvas>` in `components/avatar/TalkingAvatar.tsx:56-82` stays the only canvas.
  In game mode the hero subtree (lights, `Avatar`, `CameraRig`) unmounts and the game subtree mounts in the same canvas, reusing the `useGLTF` cached avatar scene.
- Physics is `@react-three/rapier@1.5.0` used for WASM init and world lifecycle only; the game steps the raw Rapier world itself at a fixed 60 Hz with a capped catch-up and its own interpolation (ADR-001).
- Character movement is a pure TypeScript "motor" on Rapier's `KinematicCharacterController`; colliders are built imperatively from one layout data file, so the Vitest physics tests run the exact shipped geometry and controller in Node (ADR-001, ADR-004).
- Locomotion clips are stripped offline into tiny rotation-only GLBs under `public/game/clips/`; physics owns world position, animation owns pose only (ADR-003).
- Everything except a tiny shell (Play button state, loader, loading overlay) lives behind one dynamic import of `components/game/entry.ts`, enforced by an ESLint `no-restricted-imports` rule (ADR-006).
- Progress is one versioned localStorage record with an in-memory fallback (ADR-005).
- No new state library: React state only for low-frequency interface state via small `subscribe/getState` stores read with `useSyncExternalStore`; positions, velocities and input live in refs and module objects.

## 1. Facts about the current code that the design depends on

| # | Fact | Evidence |
|---|---|---|
| F1 | The hero is already lazy: `TalkingAvatar` is loaded with `next/dynamic` and `ssr: false`. | `app/page.tsx:12-15` |
| F2 | The hero owns the only `<Canvas>`, with `fov: 32`, class `!absolute inset-0`, `touchAction: pan-y`. | `components/avatar/TalkingAvatar.tsx:56-60` |
| F3 | Hero lights are direct children of the Canvas root. | `components/avatar/TalkingAvatar.tsx:61-64` |
| F4 | The avatar renders at group position `[0, -1.5, 0]` inside a Suspense boundary. | `components/avatar/TalkingAvatar.tsx:65-80` |
| F5 | `CameraRig` lerps the default camera to a fixed frame (`pos (0,-0.3,4.9)`, `target (0,-0.7,0)`) every frame. | `components/avatar/TalkingAvatar.tsx:18-32` |
| F6 | `AVATAR_URL` is defined in the hero module (`NEXT_PUBLIC_AVATAR_URL` or `/avatar.glb`). | `components/avatar/TalkingAvatar.tsx:13` |
| F7 | The talk button is disabled while `status === "connecting"`. | `components/avatar/TalkingAvatar.tsx:131-137` |
| F8 | `Avatar` loads the model with `useGLTF(url)` and creates its own `AnimationMixer` per mount. | `components/avatar/Avatar.tsx:88-90` |
| F9 | The hero idle is `animations[0]` of the avatar GLB, applied unfiltered. | `components/avatar/Avatar.tsx:93-96` |
| F10 | On unmount `Avatar` removes its listener and calls `mixer.stopAllAction()`. | `components/avatar/Avatar.tsx:125-128` |
| F11 | Head and neck mouse-follow is applied in `Avatar`'s `useFrame` from `state.pointer`, after `mixer.update`. | `components/avatar/Avatar.tsx:176-215` |
| F12 | Lip-sync writes mouth morph influences from `volumeRef`. | `components/avatar/Avatar.tsx:183-191` |
| F13 | The scene is mounted with `<primitive object={scene} />` inside a positioned group. | `components/avatar/Avatar.tsx:218-226` |
| F14 | Gesture retarget strips the `mixamorig:?` prefix and keeps only non-Hips `.quaternion` tracks. | `components/avatar/Avatar.tsx:36-52` |
| F15 | `preloadAvatar` exists but has no caller (a search for `preloadAvatar` finds only its definition). | `components/avatar/Avatar.tsx:229-232` |
| F16 | `disconnect()` runs `cleanup()`, which stops mic tracks, closes the peer connection and the AudioContext, and is safe to call repeatedly (all optional chaining). | `components/avatar/useRealtimeChat.ts:57-79`, `:226-229` |
| F17 | `connect()` assigns the mic stream after `await getUserMedia`, with no cancellation check, so a `disconnect()` during `connecting` can be followed by a re-acquired mic. | `components/avatar/useRealtimeChat.ts:144-145` |
| F18 | Featured projects: ids 1 (XecSuite), 2 (NewsStocks.live), 3 (Apex Mind Automation). | `data/index.ts:76-100` |
| F19 | Testimonials are marked placeholders. | `data/index.ts:156-182` |
| F20 | A project link is "external" only if it starts with `http`. | `components/site/Projects.tsx:9` |
| F21 | Project technology icons are decorative images with empty alt; there is no technology name field. | `components/site/Projects.tsx:62-70`, `data/index.ts:80` |
| F22 | Skills are strings of the form `"Group: items"`; experience and education are arrays; owner contact is email, LinkedIn, site. | `lib/persona.ts:6-25`, `:27-37`, `:39-94`, `:96-100` |
| F23 | The contact section uses `mailto:` and single `target="_blank"` links. | `components/site/Contact.tsx:16-45` |
| F24 | The fixed side nav uses `z-40`. | `components/site/Nav.tsx:42` |
| F25 | CSP already has `'wasm-unsafe-eval'` and `worker-src 'self' blob:`. | `next.config.mjs:17`, `:35` |
| F26 | `npm run lint` is `next lint`; ESLint 8 and `eslint-config-next` 14.1.4 are installed. | `package.json:12`, `:36-37` |
| F27 | `eslint.config.mjs` extends `next/typescript`, which `eslint-config-next` 14.1.4 does not ship (audit baseline.lint). | `eslint.config.mjs:13` |
| F28 | `tsconfig.json` maps `@/*` to the repo root and type-checks every `**/*.ts(x)`. | `tsconfig.json:20-24` |
| F29 | The restored root `.gitignore` ignores `/node_modules`, `/coverage`, `/.next/`, `.env*`, `next-env.d.ts`. | `.gitignore:4`, `:14`, `:17`, `:34`, `:41` |
| F30 | The hero crossfade pattern is `fadeOut` on the previous action and `reset().fadeIn().play()` on the next. | `components/avatar/Avatar.tsx:102-112` |

Audit facts reused without re-derivation: avatar bounds 1.824 x 1.868 x 0.368 m with feet at y about 0 (audit avatarModel.boundsMeters); 54-joint skeleton, root `Hips`; Hips rest-rotation mismatch 89.4 deg; walk 1.4 s / 42 frames, run 0.7667 s / 23 frames, both with a duplicated last frame; clip files are about 98% redundant mesh; rapier 1.5.0 peer ranges satisfied, WASM about 765 KB gzip; Vitest versions.

## 2. Directory and module map

All game code lives under `components/game/`.
`components/game/shell/` is the only part statically reachable from the hero; everything else is reachable only through `import("@/components/game/entry")`.

```
components/game/
  shell/                      hero-side, statically imported by TalkingAvatar.tsx
    useExperienceShell.ts     Experience shell
    gameLoader.ts             Game loader (the ONE dynamic import of ../entry)
    LoadingOverlay.tsx        Game loader UI (progress, Cancel, Retry, Back)
    ReadySignal.tsx           tiny component that reports "hero avatar loaded"
  entry.ts                    dynamic-import target; exports GameModule
  session.ts                  Game session (state machine + store + createGame)
  input.ts                    Input controller
  player.ts                   Player controller (motor on Rapier KCC)
  fixedStep.ts                Player controller helper (fixed-step accumulator)
  animator.ts                 Character animator (state machine + mixer)
  clips.ts                    Character animator assets (clip load, runtime filter)
  followCamera.ts             Follow camera
  world/layout.ts             World data (test arena + campus)
  world/colliders.ts          World colliders built from layout
  world/WorldView.tsx         World visuals built from layout
  interactions.ts             Interaction system
  content.ts                  Portfolio content adapters (read-only)
  progress.ts                 Progress storage + challenge rules
  config.ts                   Game configuration
  audio.ts                    Sound (M5), owned by the session
  GameScene.tsx               in-canvas root: Physics, world, avatar, frame driver
  GameAvatar.tsx              avatar primitive + animator wiring
  ui/GameInterface.tsx        Game interface root (DOM)
  ui/Hud.tsx, ui/Dialog.tsx, ui/panels.tsx, ui/PauseMenu.tsx, ui/TouchControls.tsx
  __tests__/*.test.ts(x)
```

Shared types used across modules (in `config.ts`):

```ts
export type Vec3 = { x: number; y: number; z: number };
export type CellId = "lab" | "workshop" | "tower";
export type PanelId =
  | { kind: "project"; projectId: 1 | 2 | 3 }
  | { kind: "all-projects" | "skills" | "experience" | "contact" | "controls" | "settings" | "completion" };
export type ClipName = "idle" | "walk" | "run" | "jump" | "fall" | "land" | "celebrate";
```

### 2.1 Experience shell - `components/game/shell/useExperienceShell.ts`

```ts
export type ExperienceMode = "hero" | "loading" | "game";
export type GameModule = typeof import("@/components/game/entry"); // type query only, erased at build

export function useExperienceShell(opts: {
  stopVoice: () => void;                        // TalkingAvatar passes useRealtimeChat().disconnect
  returnFocusRef: React.RefObject<HTMLElement>; // the Play button
}): {
  mode: ExperienceMode;
  load: LoadState;                              // from gameLoader
  game: { module: GameModule; handle: GameHandle } | null; // set once code is loaded
  play(): void;
  cancel(): void;
  retry(): void;
  exit(): void;
  reportPhysics(result: "ready" | Error): void;
};
export function isWebGLAvailable(): boolean;
```

Owns: the hero/loading/game mode; calling `stopVoice()` synchronously inside `play()`; page scroll lock (`document.documentElement.style.overflow`, saved and restored); focus save and restore to the Play button; reduced-motion read (`matchMedia("(prefers-reduced-motion: reduce)")`) passed to `createGame`; calling `handle.dispose()` before every switch back to `hero` (exit, cancel, failure).
Must never: statically import anything outside `shell/` (`GameModule` and `GameHandle` are `typeof import()` type queries, not import declarations); touch the camera, mixer, avatar scene, or Rapier; call `connect()` on the voice hook; change the scroll position.

### 2.2 Game loader - `components/game/shell/gameLoader.ts` and `LoadingOverlay.tsx`

```ts
export type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; step: "code" | "assets"; progress: number } // 0..1
  | { kind: "ready" }
  | { kind: "failed"; reason: "network" | "physics" | "timeout"; message: string };

export type LoaderDeps = {
  importGame: () => Promise<GameModule>;          // default: () => import("@/components/game/entry")
  physicsTimeoutMs: number;                       // default 20000
};
export interface GameLoader {
  start(onCode: (mod: GameModule) => void): void; // onCode lets the shell mount the warm-up scene
  reportPhysics(result: "ready" | Error): void;
  cancel(): void;                                 // idempotent; clears timers; late results ignored
  retry(): void;                                  // restarts from the failed step
  getState(): LoadState;
  subscribe(fn: () => void): () => void;
}
export function createGameLoader(deps?: Partial<LoaderDeps>): GameLoader;
```

Owns: the only `import("@/components/game/entry")` in the codebase; load progress (code 0.2, assets 0.7 by bytes, physics 0.1); the physics timeout timer; a generation counter so results from a cancelled run are ignored.
Readiness = code loaded AND `mod.loadGameAssets` resolved AND `reportPhysics("ready")` received.
Must never: render 3D, touch the DOM outside `LoadingOverlay`, or leave a timer or listener alive after `cancel()` or a terminal state.
`LoadingOverlay` shows progress, a Cancel button (loading), and Retry plus "Back to portfolio" (failed); it is a labelled `role="dialog"` that receives focus.

### 2.3 Game session - `components/game/session.ts`

```ts
export type SessionMode = "entering" | "playing" | "paused" | "panel" | "celebrating" | "fault";
export type SessionState = {
  mode: SessionMode;
  resumeTo: "playing" | null;            // set while paused
  pauseReason: "user" | "hidden" | "blur" | null;
  panel: PanelId | null;
  fault: "context-lost" | "runtime" | null;
};
export type SessionEvent =
  | { type: "ENTRY_DONE" }
  | { type: "PAUSE"; reason: "user" | "hidden" | "blur" }
  | { type: "RESUME" }
  | { type: "OPEN_PANEL"; panel: PanelId }
  | { type: "CLOSE_PANEL" }
  | { type: "BEACON_ACTIVATED" }
  | { type: "CELEBRATION_DONE" }
  | { type: "FAULT"; fault: "context-lost" | "runtime" };

export function reduceSession(s: SessionState, e: SessionEvent): SessionState; // illegal -> same object
export interface Store<T> { getState(): T; subscribe(fn: () => void): () => void }
export interface SessionStore extends Store<SessionState> { dispatch(e: SessionEvent): void }

export interface GameHandle {
  session: SessionStore;
  input: InputController;
  progress: ProgressStore;
  reducedMotion: boolean;
  registerCleanup(fn: () => void): void; // run LIFO by dispose()
  dispose(): void;                       // idempotent
}
export function createGame(opts: { reducedMotion: boolean; storage: Storage | null }): GameHandle;
```

Legal transitions (everything else is ignored and returns the same state object):

| From | Event | To |
|---|---|---|
| entering | ENTRY_DONE | playing |
| entering, playing, celebrating | PAUSE | paused (resumeTo playing; an interrupted entry or celebration is skipped) |
| paused | RESUME | playing |
| playing | OPEN_PANEL | panel |
| panel | CLOSE_PANEL | playing |
| panel | OPEN_PANEL | panel (swap content, for example completion to all-projects) |
| playing | BEACON_ACTIVATED | celebrating |
| celebrating | CELEBRATION_DONE | panel (completion) |
| any | FAULT | fault (terminal; only Exit or reload leave it) |

`PAUSE` while in `panel` is ignored because input is already stopped.
Entering `paused`, `panel` or `fault` calls `input.releaseAll()` (wired by `createGame` through a session subscription).
Owns: the state machine, the cleanup registry, the order of teardown, and `audio.ts` (M5).
Must never: hold positions or velocities, or touch React state directly (React reads it via `useSyncExternalStore`).

### 2.4 Input controller - `components/game/input.ts`

```ts
export type InputSnapshot = {
  move: { x: number; y: number };   // x right, y forward, |move| <= 1
  run: boolean;
  jump: boolean;                    // edge, latched until sampled
  interact: boolean;                // edge, latched until sampled
  recenter: boolean;                // edge
  look: { dx: number; dy: number }; // accumulated pixels since last sample
};
export function normalizeMove(x: number, y: number): { x: number; y: number }; // clamp length to 1
export interface InputController {
  attach(canvas: HTMLElement): void;  // window keydown/keyup, canvas pointer drag, window blur
  detach(): void;                     // removes every listener attach() added
  setEnabled(on: boolean): void;      // false = releaseAll + ignore events
  releaseAll(): void;
  sample(): InputSnapshot;            // consumes edges and look deltas
  setTouchMove(x: number, y: number): void; // from TouchControls, already in [-1,1]
  addTouchLook(dx: number, dy: number): void;
  pressTouch(action: "jump" | "interact"): void;
}
export function createInputController(): InputController;
```

Key map uses `KeyboardEvent.code`: `KeyW/ArrowUp`, `KeyS/ArrowDown`, `KeyA/ArrowLeft`, `KeyD/ArrowRight`, `ShiftLeft/ShiftRight` (run held), `Space` (jump), `KeyE` (interact), `KeyR` (recenter).
Keys are tracked as a held set, so opposite keys cancel and diagonals pass through `normalizeMove`, which makes diagonal speed equal forward speed.
Touch joystick magnitude above `INPUT.joystickRunThreshold` (0.85) sets `run`.
`preventDefault` is called only for mapped keys while enabled.
Escape is not handled here; it belongs to the game interface (2.10).
Owns: every input listener; held-key state; edge latches.
Must never: read camera or physics, call `setState`, or keep listeners after `detach()`.

### 2.5 Player controller - `components/game/player.ts` and `fixedStep.ts`

```ts
import type RAPIER from "@dimforge/rapier3d-compat";
type Rapier = typeof RAPIER;

export type MotorIntent = { moveWorld: { x: number; z: number }; run: boolean; jump: boolean }; // |moveWorld| <= 1
export type MotorState = {
  position: Vec3;          // capsule centre after the last step
  horizontalSpeed: number; // measured from the corrected movement, not from input
  verticalVelocity: number;
  grounded: boolean;
  airTime: number;         // seconds since last grounded
  jumpedThisStep: boolean;
  landedThisStep: boolean;
  respawnedThisStep: boolean;
};
export interface PlayerMotor {
  step(dt: number, intent: MotorIntent): MotorState; // computes movement, sets next kinematic translation; caller then calls world.step()
  capture(): void;                                   // record post-step position for interpolation
  interpolated(alpha: number, out: Vec3): Vec3;
  teleport(p: Vec3): void;                           // also resets interpolation history
  readonly state: MotorState;
  dispose(): void;                                   // removes the character controller; idempotent
}
export function createPlayerMotor(rapier: Rapier, world: RAPIER.World, spawn: Vec3, cfg: MotorConfig): PlayerMotor;
export function cameraRelativeMove(move: { x: number; y: number }, cameraYaw: number): { x: number; z: number };

// fixedStep.ts
export interface FixedStepper {
  advance(frameDelta: number, step: (dt: number) => void): { steps: number; alpha: number; dropped: boolean };
  reset(): void;
}
export function createFixedStepper(cfg: { dt: number; maxSteps: number; maxFrameDelta: number }): FixedStepper;
```

Owns: the kinematic body, capsule collider and `KinematicCharacterController` (created through the injected `world`, so runtime and tests share the code); gravity and vertical velocity; jump eligibility timers; kill-plane respawn.
Must never: import React or three, read input devices, touch the avatar scene or camera.
Section 4 gives the physics details.

### 2.6 Character animator - `components/game/animator.ts`, `clips.ts`, `GameAvatar.tsx`

```ts
export type LocoState = "idle" | "walk" | "run" | "jump" | "fall" | "land";
export type LocoInput = {
  grounded: boolean; horizontalSpeed: number; verticalVelocity: number;
  airTime: number; jumpedThisStep: boolean; stateTime: number; landClipDuration: number;
};
export function nextLocoState(current: LocoState, i: LocoInput, cfg: AnimationConfig): LocoState; // pure

export interface CharacterAnimator {
  update(dt: number, motor: MotorState): void; // chooses state, cross-fades, sets timeScale
  playCelebration(): Promise<void>;            // resolves when the clip ends or is skipped
  dispose(): void;                             // stopAllAction + uncacheRoot(scene)
}
export function createCharacterAnimator(scene: THREE.Object3D, clips: Partial<Record<ClipName, THREE.AnimationClip>>, cfg: AnimationConfig): CharacterAnimator;

// clips.ts
export type GameAssets = { clips: Partial<Record<ClipName, THREE.AnimationClip>> };
export function loadGameAssets(onProgress: (loaded: number, total: number) => void): Promise<GameAssets>; // module-level cache
export function toGameClip(clip: THREE.AnimationClip, jointNames: ReadonlySet<string>): THREE.AnimationClip; // new clip, never mutates input
```

`GameAvatar.tsx` renders `<group ref={rootRef}><primitive object={scene} /></group>`, where `scene` comes from `useGLTF(avatarUrl)` (a cache hit after the hero loaded it, F8), creates the animator, and on mount resets the skeleton to bind pose (`skinnedMesh.skeleton.pose()`) and zeroes the mouth morph influences that lip-sync may have left (F12).
Owns in game mode: the game `AnimationMixer`, the wrapper group transform (position from the motor, visual yaw), avatar `castShadow` flags (restored on dispose).
Must never: mutate `scene.position/rotation/scale`, dispose the avatar's geometry, materials or textures, call `useGLTF.clear`, or mutate the shared `animations[0]` clip.
Section 5 gives the animation pipeline.

### 2.7 Follow camera - `components/game/followCamera.ts`

```ts
export type ObstacleQuery = (from: Vec3, to: Vec3, radius: number) => number | null; // hit distance along from->to
export interface FollowCamera {
  readonly yaw: number;
  beginEntry(avatar: Vec3, avatarYaw: number, animate: boolean): void; // starts from the hero framing
  update(dt: number, target: Vec3, grounded: boolean, characterYaw: number,
    look: { dx: number; dy: number }, recenter: boolean): void;
  snapTo(target: Vec3, characterYaw: number): void; // after respawn or an entry skipped by pause
  entryDone(): boolean;
  dispose(): void; // restores the camera snapshot taken at creation
}
export function createFollowCamera(camera: THREE.PerspectiveCamera, query: ObstacleQuery | null, cfg: CameraConfig): FollowCamera;
```

Pivot = interpolated capsule centre + `(0, 0.6, 0)` (about 1.5 m above the feet, upper body).
Orbit distance 4.5 m, shoulder offset 0.4 m right, pitch clamped to `[-20, 50]` degrees, fov 55.
Follow smoothing is exponential (`1 - exp(-k dt)`), `k = 12` horizontally and `k = 6` vertically; while airborne the pivot height follows the last grounded height unless the character falls below it, which removes jump bob.
Obstacles: a sphere cast of radius 0.2 from pivot toward the desired position against colliders in the `GROUP_CAMERA_BLOCKER` collision group, excluding the character; pull in immediately to `max(0.8, hit - 0.2)`, restore outward at `k = 4`.
Recenter (R) eases yaw to behind the character over 0.25 s.
Entry: starts at the hero framing expressed relative to the avatar (camera offset `(0, 1.2, 4.9)` in front of the feet and look-at offset `(0, 0.8, 0)`, derived from F4 and F5) at fov 32, then orbits to behind and pulls back while fov eases to 55 over 1.5 s; reduced motion snaps directly.
Owns in game mode: the R3F default camera (position, rotation, fov, near, far); `dispose()` restores the snapshot taken at creation.
Must never: write the avatar or physics state; `query` is injected so tests use a fake.
The sphere cast uses Rapier's `castShape`; its 0.14.0 parameter order is confirmed against the installed `.d.ts` in M3 (with `castRay` plus a 0.25 m margin as the fallback).

### 2.8 World - `components/game/world/layout.ts`, `colliders.ts`, `WorldView.tsx`

```ts
export type Block = {
  id: string; kind: "ground" | "wall" | "building" | "ramp" | "step" | "prop";
  center: Vec3; size: Vec3; yawDeg?: number; pitchDeg?: number; // ramps use pitch
  material: "ground" | "path" | "stone" | "metal" | "accent-green" | "accent-cyan";
  blocksCamera: boolean; route?: "main" | "optional";
};
export type Layout = {
  name: "test-arena" | "campus";
  blocks: readonly Block[];
  spawn: Vec3; spawnYawDeg: number; killPlaneY: number;
  interactables: readonly Interactable[]; // empty for test-arena
  beacon: Vec3 | null;
};
export const TEST_ARENA: Layout;
export const CAMPUS: Layout;

export const GROUP_WORLD: number; export const GROUP_CAMERA_BLOCKER: number; export const GROUP_PLAYER: number;
export function buildColliders(rapier: Rapier, world: RAPIER.World, layout: Layout): void; // fixed bodies, cuboid colliders only

export function WorldView(props: { layout: Layout; quality: QualityPreset }): JSX.Element;
```

One data file drives both visuals and colliders, so what you see is what you collide with, and Vitest checks the same data.
Colliders are cuboids only (ramps are rotated cuboids, stairs are stacked cuboids with rise at most `MOVEMENT.stepHeight`).
`TEST_ARENA` (M1): 30 x 30 m flat ground, a wall, ramps at 30 and 45 degrees, steps of 0.2 and 0.35 m, a 1 m ledge and a pit below the kill plane.
`CAMPUS` (M3): about 60 x 60 m per spec section 3; Arrival Plaza at the origin, Project Lab at negative x, Skills Workshop at positive x, Contact Tower at positive z beyond the plaza (the camera starts looking along +z), garden path, optional raised terrace, scenery boundary walls.
`WorldView` renders shared geometries and materials created once per mount, uses `InstancedMesh` for repeated props, one shadow-casting directional light (only when the preset enables shadows), and disposes everything it created on unmount.
Owns: world meshes, materials, lights, fog, `scene.background` in game mode (restored on unmount).
Must never: touch the avatar, camera or session; no third-party model or texture without an `ASSETS.md` row.

### 2.9 Interaction system - `components/game/interactions.ts`

```ts
export type Interactable = {
  id: string;
  kind: "project" | "all-projects" | "skills" | "experience" | "contact" | "cell" | "beacon";
  position: Vec3; radius: number; prompt: string; // e.g. "E - View project"
  panel?: PanelId; cellId?: CellId;
};
export function pickFocus(player: Vec3, facingYaw: number, items: readonly Interactable[],
  available: (i: Interactable) => boolean): Interactable | null; // nearest in radius, prefers in front (dot > 0)
export interface InteractionSystem {
  update(player: Vec3, facingYaw: number, interactPressed: boolean): void;
  focused: Store<Interactable | null>; // changes only when focus changes
}
export function createInteractionSystem(items: readonly Interactable[], game: GameHandle): InteractionSystem;
```

Cells are collected by proximity (radius 1.0 m) without pressing E, so mobile needs no extra button for them.
Interacting with a display dispatches `OPEN_PANEL`; the beacon dispatches `BEACON_ACTIVATED` only when `canActivateBeacon(progress)` is true, otherwise its prompt reads "Energy cells n/3".
Owns: focus selection and the low-frequency `focused` store.
Must never: render DOM, open URLs, or write progress except through `progress.update`.

`components/game/content.ts` (read-only adapters used by interactions and panels):

```ts
export const FEATURED_PROJECT_IDS = [1, 2, 3] as const;
export type GameProject = { id: number; title: string; description: string; image: string | null;
  icons: string[]; tag: string | null; link: string | null; clients: { name: string; url: string }[] };
export function featuredProjects(): GameProject[]; // from data/index.ts projects, in id order; throws if any id is missing
export function allProjects(): GameProject[];
export function skillGroups(): { group: string; items: string }[]; // split persona skills at the first ": "
export const WORKSHOP_GROUPS: readonly string[]; // "Languages & frameworks", "AI & agents", "Automation" (labels from lib/persona.ts:28-32)
export function experienceEntries(): typeof experience;
export function educationEntries(): typeof education;
export function contactLinks(): { email: string; linkedin: string; site: string };
```

`link` is set only when it starts with `http` (same rule as F20); otherwise the panel shows "private".
Technologies are shown as the existing icon list (F21); no technology names are invented.
`content.ts` imports only `projects` from `@/data` and `owner`, `skills`, `experience`, `education` from `@/lib/persona`; importing `testimonials` from `@/data` anywhere under `components/game/` is a lint error (section 7.3).

### 2.10 Game interface - `components/game/ui/*`

```ts
export function GameInterface(props: { game: GameHandle; onExit: () => void }): JSX.Element;
export function Dialog(props: { labelledBy: string; onClose: () => void; children: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement> }): JSX.Element; // role="dialog", aria-modal, focus trap, Escape closes, focus returns to opener
export function TouchControls(props: { input: InputController; onPause: () => void }): JSX.Element;
```

HUD: Pause and Exit buttons always visible, "Energy cells n/3", interaction prompt, a short controls hint after entry, return-to-beacon guidance after 3 cells.
Panels: project (title, description, screenshot when present, icon list, tag, clients, one link opened only on click with `rel="noopener noreferrer"`), all projects, skills, experience (with education), contact (mailto and links only on click, never auto-send), controls reference, settings (sound on/off, volume, reduced motion `system | on | off`, quality `auto | low | high`), completion ("Explore more", "View projects", "Contact").
Pause menu: Resume, Restart challenge, Settings, Controls, Exit to portfolio.
Escape: closes the open panel, else toggles pause.
Window `blur` and `document.visibilitychange` (hidden) dispatch `PAUSE`; return shows Resume and never resumes movement by itself.
`TouchControls` render when `matchMedia("(pointer: coarse)")` matches: left joystick (own pointer id), right-half look area (own pointer id, so both work simultaneously), Jump and context Interact buttons at least 48 px, placed with `env(safe-area-inset-*)`; `pointercancel` and `lostpointercapture` release the stick.
Owns: all game DOM, focus inside the overlay, the Escape and blur handlers.
Must never: read or write positions every frame (it subscribes to stores only), import three or Rapier.

### 2.11 Progress storage - `components/game/progress.ts`

```ts
export const PROGRESS_KEY = "portfolio.game.progress";
export const PROGRESS_VERSION = 1;
export type Settings = { soundOn: boolean; volume: number; reducedMotion: "system" | "on" | "off"; quality: "auto" | "low" | "high" };
export type ProgressV1 = { version: 1; collected: CellId[]; completed: boolean; settings: Settings };
export function defaultProgress(): ProgressV1;
export function parseProgress(raw: string | null): { progress: ProgressV1; status: "ok" | "empty" | "invalid" | "migrated" };
export function collectCell(p: ProgressV1, id: CellId): ProgressV1;   // idempotent, keeps unique ids
export function canActivateBeacon(p: ProgressV1): boolean;           // all 3 collected and not yet completed
export function completeChallenge(p: ProgressV1): ProgressV1;
export function restartChallenge(p: ProgressV1): ProgressV1;         // clears cells and completed, keeps settings
export interface ProgressStore extends Store<ProgressV1> {
  update(fn: (p: ProgressV1) => ProgressV1): void;
  readonly persistent: boolean; // false when storage is unavailable or throws
}
export function getProgressStore(storage: Storage | null): ProgressStore; // module singleton: survives exit and re-entry within the visit
```

Format and versioning rules are in ADR-005.
Owns: the `PROGRESS_KEY` entry only.
Must never: throw to callers on storage errors, or store anything but this record.

### 2.12 Game configuration - `components/game/config.ts`

```ts
export const PHYSICS = { dt: 1 / 60, maxSteps: 4, maxFrameDelta: 0.25 } as const;
export const CAPSULE = { radius: 0.3, halfHeight: 0.6, skin: 0.01 } as const; // total height 1.8 m
export const MOVEMENT = {
  walkSpeed: 2.2, runSpeed: 4.8, groundAccel: 30, airAccel: 8,
  gravity: 20, jumpHeight: 0.9, maxFallSpeed: 20, groundStickSpeed: 1,
  stepHeight: 0.25, stepMinWidth: 0.2, maxSlopeDeg: 40, snapDistance: 0.3,
  coyoteTime: 0.12, jumpBuffer: 0.12, killPlaneY: -10, turnRate: 12,
} as const;
export const CAMERA = { distance: 4.5, minDistance: 0.8, shoulder: 0.4, pivotHeight: 0.6,
  pitchMinDeg: -20, pitchMaxDeg: 50, fov: 55, followK: 12, followKVertical: 6, restoreK: 4,
  probeRadius: 0.2, lookSensitivity: 0.004, entrySeconds: 1.5 } as const;
export const ANIMATION = { idleMaxSpeed: 0.15, runEnter: 2.6, runExit: 2.3,
  fallDelay: 0.15, hardLandAirTime: 0.35, landLock: 0.12,
  clipSpeed: { walk: 1.02, run: 2.37 }, timeScaleMin: 0.75, timeScaleMax: 1.8,
  fade: { loco: 0.25, jump: 0.1, fall: 0.2, land: 0.1 } } as const;
export const INPUT = { joystickRunThreshold: 0.85 } as const;
export type QualityPreset = { maxDpr: number; shadows: boolean; shadowMapSize: number };
export const QUALITY: Record<"low" | "high", QualityPreset> = {
  low: { maxDpr: 1, shadows: false, shadowMapSize: 0 },
  high: { maxDpr: 1.75, shadows: true, shadowMapSize: 1024 } };
export function resolveQuality(setting: Settings["quality"]): QualityPreset; // auto = low on coarse pointer or <= 4 cores
export const CLIP_URLS: Record<ClipName, string>; // "/game/clips/<name>.glb"
export type MotorConfig = typeof MOVEMENT & { capsule: typeof CAPSULE };
export type CameraConfig = typeof CAMERA;
export type AnimationConfig = typeof ANIMATION;
```

Movement values are the spec section 5 defaults; all values are tuning, changed only here.
`clipSpeed` values are the audit's rough clip speeds scaled by avatar height 1.865 / 1.809 (about 1.03) and must be re-measured in M1 (section 5.4).
Owns: constants only.
Must never: import React, three or Rapier at runtime.

### 2.13 Entry - `components/game/entry.ts`

```ts
export { createGame } from "./session";
export { loadGameAssets } from "./clips";
export { GameScene } from "./GameScene";
// GameScene props: { game: GameHandle; assets: GameAssets | null; active: boolean; avatarUrl: string;
//   layout?: "test-arena" | "campus"; onPhysics: (r: "ready" | Error) => void; onExit: () => void }
export { GameInterface } from "./ui/GameInterface";
export type { GameHandle } from "./session";
export type { GameAssets } from "./clips";
```

This is the only module the shell loads, and only through `gameLoader.ts`.
`avatarUrl` is passed in from `TalkingAvatar.tsx` (F6) so no game file imports the hero module.

## 3. Shared avatar, one canvas, ownership per mode

Decision: one canvas (ADR-002).
The spec asks for one canvas where practical and forbids the two scenes competing for skeleton or camera (spec section 4).
A second canvas would need a second WebGL context and a second copy of the avatar's GPU resources, and a three.js object can have only one parent, so the cached avatar scene cannot be shown in two scenes at once.
Because the hero canvas already exists and is lazy (F1, F2), the game mounts inside it.

### 3.1 Changes to `components/avatar/TalkingAvatar.tsx` (the only hero file that changes)

1. Call `useExperienceShell({ stopVoice: disconnect, returnFocusRef: playRef })`.
2. Canvas `className`: `!absolute inset-0` in `hero` and `loading`, `!fixed inset-0 z-50` in `game` (above the nav at `z-40`, F24).
   The section keeps its `h-screen` place in the page flow, so nothing below shifts and the scroll position is preserved; only the canvas wrapper becomes fixed.
   The R3F Canvas keeps the same DOM node and WebGL context when its `className` and `style` props change.
3. Canvas `style.touchAction`: `pan-y` (unchanged) in hero and loading, `none` in game.
4. Canvas children: the existing lights, Suspense with `Avatar`, and `CameraRig` (F3-F5) render only when `mode !== "game"`, unchanged.
   Inside the same Suspense after `Avatar`, add `<ReadySignal onReady={() => setAvatarReady(true)} />`; it renders only after the avatar has loaded, without editing `Avatar.tsx`.
   When `shell.game` exists, render `<shell.game.module.GameScene ... active={mode === "game"} />` (it wraps itself in `GameErrorBoundary`).
5. Hero overlays (status line, `AskHints`, error line, title block, gesture lists, scroll hint) render only when `mode !== "game"`; the scanline overlay may stay (it is under the fixed canvas).
6. Add `[ play / explore ]` beside `[ talk to me ]`, disabled when `!avatarReady || status === "connecting" || mode !== "hero" || !isWebGLAvailable()`.
   Disabling during `connecting` avoids the F17 race without editing `useRealtimeChat.ts`.
   Disable the talk button while `mode === "loading"`.
7. Render `<LoadingOverlay>` when `mode === "loading"` or the load failed, and `<shell.game.module.GameInterface>` when `mode === "game"`.

`Avatar.tsx`, `useRealtimeChat.ts`, `AskHints.tsx`, `lib/gestures.ts` and `app/page.tsx` do not change.

### 3.2 Ownership table

| Resource | hero | loading | game |
|---|---|---|---|
| Avatar `scene` (cached by `useGLTF`) | hero `Avatar` group at `[0,-1.5,0]` (F4, F13) | hero `Avatar` | `GameAvatar` wrapper group |
| `AnimationMixer` | hero mixer per mount (F8), stopped on unmount (F10) | hero mixer | game mixer in `createCharacterAnimator`, `stopAllAction` + `uncacheRoot` on dispose |
| Head and neck mouse-follow, lip-sync | hero `Avatar` `useFrame` (F11, F12) | hero | none: the hero component is unmounted, so no flag is needed |
| Default camera | `CameraRig` (F5) | `CameraRig` | `FollowCamera`; snapshot restored on dispose, then `CameraRig` resumes |
| Lights, background, fog | hero lights (F3) | hero lights | `WorldView` |
| Rapier world | none | `<Physics paused>` warm-up, colliders only, no visuals | same `<Physics>` instance, now stepped |
| Renderer settings (dpr, shadowMap, frameloop) | Canvas defaults | defaults | set by `GameScene` on activation, restored by cleanup |
| Voice session | `useRealtimeChat` | disconnected in `play()` | disconnected; never reconnected automatically |
| Page scroll and focus | page | page (overlay focused) | locked, focus in game overlay; restored on exit |

At any moment exactly one owner mounts the avatar scene and drives the mixer and camera, because the hero subtree and the active game subtree are mutually exclusive in the React tree.

### 3.3 Entry sequence (spec section 4 steps 1-8)

1. Play click: `play()` saves focus, calls `stopVoice()` (F16: stops mic tracks and closes the peer connection; idempotent), sets `mode = "loading"`, starts the loader.
2. `LoadingOverlay` shows progress and Cancel.
3. Code step: `import("@/components/game/entry")`; the shell creates `handle = mod.createGame(...)` and mounts `GameScene` with `active={false}`, which mounts `<Physics paused>` and `buildColliders` only.
   A child of `<Physics>` calls `onPhysics("ready")` in its first effect; an error boundary around `<Physics>` calls `onPhysics(error)`.
4. Assets step: `mod.loadGameAssets(onProgress)` loads the stripped clips (module-level cache, so re-entry is instant).
5. Ready: `mode = "game"`.
   The hero subtree unmounts; `GameScene` activates and mounts `WorldView` and `GameAvatar` at the spawn point; `followCamera.beginEntry(...)` starts from the hero framing, so the first game frame matches the last hero frame in camera pose; fog fades from opaque to clear while the camera pulls back.
6. Session `entering`: the frame driver feeds a scripted forward intent at walk speed for 1.0 s, so the auto-walk goes through the normal motor and animator.
7. `ENTRY_DONE` when both the camera entry and the auto-walk finish; the HUD shows the controls hint.
8. `playing`: input enabled.

Reduced motion: step 5 snaps the camera to the follow pose and step 6 is skipped.

### 3.4 Exit, cancel and failure sequence

`exit()`, `cancel()` and load failure all run the same order:
1. `handle.dispose()` runs the cleanup registry LIFO: input `detach()`, audio stop, animator dispose (stop actions, uncache root, restore `castShadow`), motor dispose (remove character controller), camera dispose (restore snapshot including fov 32 and `updateProjectionMatrix`), renderer restore (dpr, `shadowMap.enabled`, frameloop `always`), world restore (`scene.background`, fog).
   This runs before React unmounts `<Physics>`, so no Rapier call happens on a freed world regardless of React's effect order.
2. `loader.cancel()` (clears timers, ignores late results).
3. `mode = "hero"`: React unmounts `GameScene` (`<Physics>` frees the world, which releases bodies and colliders) and `GameInterface`, and remounts the hero subtree; `Avatar` finds the scene in the `useGLTF` cache, so there is no suspense, and its idle action overwrites the pose (F9).
4. Restore `documentElement.style.overflow` to the saved value and focus the Play button.

Voice stays disconnected (status `idle`), and progress stays in the module-level store and storage.
`GameScene` also registers the same cleanups in `useLayoutEffect` as a safety net; `dispose()` is idempotent, so the second call does nothing.

### 3.5 Failure handling (spec section 9)

| Failure | Detection | Behavior |
|---|---|---|
| Asset or code download fails | loader catches rejection | `failed/network`: Retry or Back to portfolio |
| Physics init fails | error boundary around `<Physics>` -> `onPhysics(error)`; or no ready signal in 20 s | `failed/physics` or `failed/timeout`: short explanation and Back |
| WebGL unavailable | `isWebGLAvailable()` false | Play button not rendered; portfolio unchanged |
| Graphics context lost | `webglcontextlost` on `gl.domElement` | `FAULT context-lost`: "Graphics were interrupted" with Exit and Reload page |
| Runtime error in game tree | `GameErrorBoundary` inside the canvas | `FAULT runtime`, then automatic exit with a short message on the hero |
| Save data invalid | `parseProgress` status `invalid` | default progress, overwritten on next save |
| Player below `killPlaneY` | motor | teleport to spawn, camera `snapTo` |
| Orientation or resize | R3F resizes canvas and camera aspect | touch controls use CSS and safe-area insets, no JS layout |

## 4. Physics integration (ADR-001)

### 4.1 Packages and ownership

`@react-three/rapier@1.5.0` (exact) provides `<Physics>` (WASM init under Suspense, world creation, `world.free()` on unmount, optional debug renderer) and `useRapier()` (`{ rapier, world }`).
`GameScene` mounts `<Physics paused gravity={[0, 0, 0]} colliders={false}>`; the game never uses the library's internal stepping, so the library's own catch-up and interpolation behavior does not matter.
The motor and colliders receive `rapier` and `world` from `useRapier()`; tests import `@dimforge/rapier3d-compat` directly and call `init()`.
Assumption A2 applies (section 10).

### 4.2 Fixed step, capped catch-up, interpolation

`GameScene` has exactly one `useFrame` (default priority 0, so R3F keeps rendering), the frame driver, in this order:
1. If the session mode is not `entering`, `playing` or `celebrating`: `stepper.reset()`, set frameloop `demand`, return.
2. `snap = input.sample()` (only meaningful in `playing`).
3. Build the `MotorIntent`: scripted in `entering`; `cameraRelativeMove(snap.move, camera.yaw)` in `playing`; zero in `celebrating`.
4. `stepper.advance(delta, dt => { motor.step(dt, intent); world.step(); motor.capture(); intent.jump = false; })`.
   `world.timestep` is set to `PHYSICS.dt` (1/60 s) once.
   `advance` clamps `delta` to `maxFrameDelta` (0.25 s), runs at most `maxSteps` (4) steps, and when the cap is hit it drops the remaining backlog (`dropped: true`), so a slow device slows down instead of spiralling.
5. `pos = motor.interpolated(alpha)` with `alpha = accumulator / dt`; teleports reset the history so respawn does not smear.
6. `GameAvatar` group position `= pos - (0, halfHeight + radius + skin, 0)`; visual yaw eases toward the movement direction at `turnRate` when horizontal speed is above 0.3 m/s.
7. `animator.update(delta, motor.state)`, then `camera.update(...)`, then `interactions.update(pos, yaw, snap.interact)`.

### 4.3 Capsule

From the audit bounds (height about 1.865 m, feet at y about 0, depth 0.368 m; the 1.82 m width is the T-pose arm span and is ignored): capsule radius 0.3 m, cylinder half-height 0.6 m, total height 1.8 m, centred 0.9 m above the feet.
The KCC offset (skin) 0.01 m keeps the capsule that far from surfaces, so the visual feet offset is `-(0.6 + 0.3 + 0.01) = -0.91` m.
Collider in group `GROUP_PLAYER`; body `kinematicPositionBased`, moved only through `setNextKinematicTranslation`.

### 4.4 KinematicCharacterController features

| Requirement | Mechanism |
|---|---|
| Wall collision and sliding | `computeColliderMovement(collider, desired)` then `computedMovement()`; `setSlideEnabled(true)` |
| Step assistance 0.25 m | `enableAutostep(0.25, 0.2, false)` (max height, min width, no dynamic bodies) |
| Max walkable slope 40 deg | `setMaxSlopeClimbAngle(40 deg)`; `setMinSlopeSlideAngle(40 deg)` so steeper surfaces slide |
| Ground snapping when descending | `enableSnapToGround(0.3)`; disabled while `verticalVelocity > 0` (jump ascent), re-enabled on landing |
| Ground detection | `computedGrounded()` after each `computeColliderMovement` |
| Grace-period jump | not a Rapier feature: the motor keeps `timeSinceGrounded` (coyote 0.12 s) and `timeSinceJumpPressed` (buffer 0.12 s); a jump starts when both are within their windows, then both reset, so a second jump requires touching ground again |
| Gravity | motor integrates `vy -= gravity * dt`, clamped to `-maxFallSpeed`; when grounded and not jumping `vy = -groundStickSpeed` so the downward probe keeps grounding stable |
| Jump height 0.9 m | `vy = sqrt(2 * gravity * jumpHeight)` (6 m/s with gravity 20) |
| No speed gain diagonally | `normalizeMove` clamps input length to 1 before scaling by walk or run speed |
| Other bodies | `setApplyImpulsesToDynamicBodies(false)`; the world has no dynamic bodies |
| Fall out of map | `position.y < killPlaneY` -> `teleport(spawn)`, `respawnedThisStep = true` |

Horizontal velocity accelerates toward `moveWorld * (run ? runSpeed : walkSpeed)` at `groundAccel` (grounded) or `airAccel` (airborne).
`horizontalSpeed` is measured from the corrected movement divided by `dt`, so walking into a wall reports about zero.
Assumptions A3 and A4 apply (section 10).

## 5. Locomotion animation pipeline (ADR-003)

### 5.1 Clip production (offline, committed)

`scripts/strip-clips.mjs` (Node, devDependencies `@gltf-transform/core` and `@gltf-transform/functions`) reads sources and writes `public/game/clips/<name>.glb`:

| Output | Source | Notes |
|---|---|---|
| `walk.glb` | `public/animations/walk.glb` | trim duplicated last frame |
| `run.glb` | `public/animations/run.glb` | trim duplicated last frame; see risk R2 |
| `idle.glb` | new Mixamo "Idle" in `assets-src/mixamo/` | until supplied, runtime falls back to the avatar's embedded idle filtered by `toGameClip` |
| `jump.glb`, `fall.glb`, `land.glb` | new Mixamo jump, falling idle, landing | until supplied: jump -> fall -> idle fallbacks |
| `celebrate.glb` | `public/animations/dance.glb` (existing) | loaded after entry, not in the first-play set |

Per clip the script: renames every node by removing `^mixamorig:?`; keeps a channel only if its path is `rotation`, its target name is in the avatar joint list read from `public/avatar.glb`, and the target is not `Hips`; removes every other channel; optionally removes the last keyframe; removes meshes, skins, materials and textures and prunes unused data; writes the GLB and prints bytes and kept channel counts; exits non-zero if fewer than 40 channels remain.
Expected output is about 25-40 KB per clip (audit walkClip.embeddedGeometry).
Kept tracks (audit retargeting recommendation): quaternions for Spine, Spine1, Spine2, Neck, Head, both Shoulder, Arm, ForeArm, Hand, finger joints 1-3, UpLeg, Leg, Foot, ToeBase.
Dropped: Hips rotation (89.4 deg rest mismatch, run yaw drift), Hips translation (root motion; physics owns position), all scale and non-Hips translation tracks (centimetre units), and tracks for HeadTop_End, finger 4 joints and Toe_End (absent from the avatar).
Rest-delta correction (`avatarRest * inverse(mixamoRest) * q`) for feet, toes, neck, head, shoulders and arms is a script option, off by default; M1 turns it on only if the visual check shows the 12-26 deg offsets the audit predicts, and records the outcome as an addendum to ADR-003.
The vertical Hips bob stays dropped unless M1 shows a stiff pelvis.
Raw Mixamo downloads are kept small ("Without Skin") in `assets-src/mixamo/`, and every file gets an `ASSETS.md` row (section 7.4).

### 5.2 Runtime clip handling

`loadGameAssets` loads `idle, walk, run, jump, fall, land` with `GLTFLoader.loadAsync` (progress from bytes), then passes each `animations[0]` through `toGameClip`, which clones and filters again by the live skeleton joint names (defensive: no binding warnings even if a source changes) and never mutates the input.
The embedded idle fallback uses `toGameClip(gltf.animations[0])`, which also drops its Hips translation, Hips rotation and morph `weights` tracks (audit avatarModel.embeddedAnimations); the hero keeps using the unfiltered original (F9).
On `GameAvatar` mount: `skeleton.pose()` resets every bone to bind pose (so Hips is upright and centred after the hero idle moved it), and mouth morph influences are set to 0.

### 5.3 State machine and guards

`nextLocoState` is pure and unit-tested; the animator applies its result.

| From | To | Guard |
|---|---|---|
| idle, walk, run, land | jump | `jumpedThisStep` |
| idle, walk, run | fall | `!grounded && airTime >= fallDelay (0.15 s)` (short edges and steps do not flicker) |
| jump | fall | `verticalVelocity <= 0` |
| jump, fall | land | `grounded && airTime >= hardLandAirTime (0.35 s)` |
| jump, fall | idle / walk / run | `grounded && airTime < 0.35 s`, chosen by speed |
| land | idle / walk / run | `stateTime >= 0.6 * landClipDuration`, or `stateTime >= landLock (0.12 s) && horizontalSpeed >= runEnter` |
| idle | walk | `horizontalSpeed >= idleMaxSpeed (0.15)` |
| walk | idle | `horizontalSpeed < idleMaxSpeed` |
| walk | run | `horizontalSpeed >= runEnter (2.6)` |
| run | walk | `horizontalSpeed < runExit (2.3)` (hysteresis) |

Selection uses measured speed and grounded state only, never key state, so running into a wall falls back to idle (spec section 6).
Cross-fades reuse the hero pattern (F30) with durations from `ANIMATION.fade`; walk and run synchronise phase on switch (`next.time = prev.time / prev.duration * next.duration`) to avoid a foot pop.
Jump and land play `LoopOnce` with `clampWhenFinished`; fall loops; exactly one action reaches weight 1 after each fade, so the skeleton never shows the unanimated bind pose.

### 5.4 Speed matching

`timeScale = clamp(horizontalSpeed / clipSpeed[state], timeScaleMin, timeScaleMax)` for walk and run, updated every frame.
Risk R1 (non-blocking, decided in M1): with spec defaults the ratio is about 2.2 / 1.02 = 2.2 for walk and 4.8 / 2.37 = 2.0 for run, above the 1.8 cap, so feet will slide visibly.
M1 measures each clip's real ground speed by a foot-contact check in the browser, then picks one of: lower `walkSpeed` and `runSpeed` toward the clips (the spec allows tuning), or source faster Mixamo variants for the same bands; the choice and the measured `clipSpeed` values are recorded in the M1 report and `config.ts`.
Risk R2: the audit found run.glb travels about 31 deg off forward with 36 deg Hips yaw drift; with Hips rotation dropped, the legs may read as sideways running (a spec acceptance failure).
M1 checks this visually first; if it fails, the run source is replaced with a Mixamo in-place run.

## 6. Game interface, accessibility, input lifecycle

- HTML for every menu and panel; the canvas has no text.
- `Dialog` is hand-written (about 40 lines) rather than native `<dialog>`, so jsdom tests exercise the real focus behavior: focus moves to the first focusable element or `initialFocusRef` on open, Tab cycles inside, Escape calls `onClose`, focus returns to the element focused before opening.
- Opening a panel dispatches `OPEN_PANEL`, which calls `input.releaseAll()`; the motor then decelerates to rest.
- Pause and Exit buttons are always reachable by keyboard; the game overlay root receives focus on activation.
- Reduced motion = the settings value, or the system query when the setting is `system`.
- Sound (M5): `audio.ts` creates one `AudioContext` lazily on the first sound after a user gesture inside the game, honours `soundOn` and `volume`, and closes it on dispose; nothing plays before interaction.
- Contrast uses the existing `term-*` palette on opaque panels.

## 7. Dependencies, tests, lint, ignore file, bundle boundary, assets

### 7.1 Dependency additions (all `--save-exact`)

| Package | Version | Kind | Why |
|---|---|---|---|
| `@react-three/rapier` | 1.5.0 | dependency | physics (ADR-001) |
| `@dimforge/rapier3d-compat` | 0.14.0 | devDependency | direct import in Node tests; must equal the version 1.5.0 pins so npm keeps one copy |
| `vitest` | 5.0.3 | devDependency | test runner (ADR-004) |
| `vite` | 8.3.3 | devDependency | vitest peer |
| `@vitejs/plugin-react` | 6.1.2 | devDependency | JSX transform for component tests (`tsconfig.json` has `jsx: preserve`) |
| `vite-tsconfig-paths` | 6.1.1 | devDependency | resolves `@/*` (F28) |
| `jsdom` | 30.1.2 | devDependency | DOM tests |
| `@testing-library/react` | 16.3.3 | devDependency | component tests |
| `@testing-library/dom` | 10.4.2 | devDependency | peer of the above |
| `@testing-library/jest-dom` | 7.0.1 | devDependency | DOM matchers |
| `@gltf-transform/core`, `@gltf-transform/functions` | resolved at M1 with `npm view @gltf-transform/core version` and `npm view @gltf-transform/functions version`; both installed at the same version, recorded in the M1 report | devDependency | clip stripping script |

Versions other than gltf-transform come from the audit's `npm view` checks and were not install-tested (audit testRunner.constraints).
jsdom 30.1.2 needs Node `^22.22.2`, so the M1 stage records the Node version used; if CI or Vercel builds on an older 22.x, the stage falls back to the newest jsdom that supports it and records that.
No runtime dependency other than `@react-three/rapier` is added.

### 7.2 Test setup

- `vitest.config.mts` (ESM extension because `package.json` has no `"type": "module"`): `plugins: [tsconfigPaths(), react()]`, `test.environment: "node"`, `test.setupFiles: ["./vitest.setup.ts"]`, `test.include: ["components/game/**/*.test.{ts,tsx}"]`.
- `vitest.setup.ts`: `import "@testing-library/jest-dom/vitest";`.
- DOM test files start with `// @vitest-environment jsdom`.
- Tests import `describe`, `it`, `expect` and `vi` from `vitest` explicitly (no globals), so `next build` type-checks them cleanly (F28).
- `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- Physics tests run real Rapier in Node: `await RAPIER.init()` once per file, a fresh `World` per test, `buildColliders(RAPIER, world, TEST_ARENA)`, `createPlayerMotor(RAPIER, world, ...)`, step with `world.step()`, `world.free()` afterward.
  Assumption A5 applies (section 10).

### 7.3 Lint gate and boundary rule (ADR-006)

- Add `.eslintrc.json`:
  ```json
  {
    "extends": "next/core-web-vitals",
    "overrides": [
      {
        "files": ["app/**/*.{ts,tsx}", "components/avatar/**/*.{ts,tsx}", "components/site/**/*.{ts,tsx}", "lib/**/*.ts", "data/**/*.ts"],
        "rules": { "no-restricted-imports": ["error", { "patterns": [{ "group": ["@/components/game/*", "!@/components/game/shell", "!@/components/game/shell/*"], "message": "Game code loads only through components/game/shell/gameLoader.ts (dynamic import)." }] }] }
      },
      {
        "files": ["components/game/**/*.{ts,tsx}"],
        "rules": { "no-restricted-imports": ["error", { "paths": [{ "name": "@/data", "importNames": ["testimonials"], "message": "Testimonials are placeholders and must not appear in the game." }] }] }
      },
      {
        "files": ["components/game/shell/**/*.{ts,tsx}"],
        "rules": { "no-restricted-imports": ["error", {
          "paths": [{ "name": "@/data", "importNames": ["testimonials"], "message": "Testimonials are placeholders and must not appear in the game." }],
          "patterns": [{ "group": ["../*", "@/components/game/*", "!@/components/game/shell/*", "@react-three/rapier", "@dimforge/*"], "message": "The shell must stay tiny; load game code with import() in gameLoader.ts." }]
        }] }
      }
    ]
  }
  ```
  In eslintrc, a later matching override replaces the options of the same rule, so the shell override comes last and repeats the testimonials path.
  `no-restricted-imports` checks import declarations only, not `import()` expressions or `typeof import()` type queries, which is exactly the boundary wanted.
  M1 proves each of the three rules fires with a deliberate violation that is then removed, and records the output.
- Delete `eslint.config.mjs`: `next lint` 14.1.4 ignores it, and it is broken under ESLint 8.57 (F27); keeping it invites a second, failing config.
- Effect on the build: once a config exists, `next build` also lints and fails on lint errors.
  M1 runs `npm run lint` first, records the pre-existing findings as the new baseline, fixes errors minimally where they are mechanical, and reports any that cannot be fixed without touching protected files.
- Gate: `npm run lint` prints results without an interactive prompt and exits 0.

### 7.4 Root `.gitignore` and assets record

- The restored `.gitignore` (F29) is committed in M1 with `git add -f .gitignore`; it already covers `.next/`, `next-env.d.ts`, `node_modules` and `coverage`.
  M1 adds nothing to it unless Vitest writes a new artifact.
- `ASSETS.md` at the repo root has one row per third-party asset: file path, origin (URL), provider and author, license or terms with the date they were checked, who downloaded it and when (name only, never an account email), derived outputs and modifications (for example "stripped mesh and skin, trimmed last frame").
  Rows are required for `public/avatar.glb` (Avaturn), the 9 existing `public/animations/*.glb` (Mixamo), every new `assets-src/mixamo/*` file and every `public/game/clips/*.glb`.
  Unknown fields are written as "unknown - to confirm by owner", never guessed.

### 7.5 Bundle boundary

- The only dynamic-import boundary is `import("@/components/game/entry")` inside `components/game/shell/gameLoader.ts`.
- The hero chunk (already lazy, F1) gains only `shell/*`, which imports React and `@/lib/utils` at most.
- Rapier, world, animator, UI and clips are reachable only from `entry.ts`; `public/game/**` is fetched only by `loadGameAssets`.
- Proof (M2 gate): after `npm run build`, a search of the `.next/static/chunks` files listed for the `/` route in `.next/app-build-manifest.json` for `rapier` and `KinematicCharacterController` returns nothing; in a browser, loading `/` and scrolling the whole page without pressing Play shows no request for the game chunk, `rapier`, or `/game/clips/`.

## 8. Milestone to files table

Every milestone runs `npm run lint`, `npm run build` and `npm test` and records exit codes.
"New" and "Changed" are relative to the base commit.

| Milestone | Creates or changes | Tests added | Gate check (observable) |
|---|---|---|---|
| M1 Movement prototype | Changed: `package.json`, `package-lock.json`, `components/avatar/TalkingAvatar.tsx` (minimal: Play button calling `stopVoice`, mode switch, Exit button, no loader UI), any file needing a mechanical lint fix. New: `.eslintrc.json`, `.gitignore` (force-added), `vitest.config.mts`, `vitest.setup.ts`, `ASSETS.md`, `scripts/strip-clips.mjs`, `public/game/clips/{walk,run}.glb` (+ idle, jump, fall, land when supplied), `assets-src/mixamo/*`, `components/game/{config.ts, entry.ts, session.ts (createGame and cleanup registry only), input.ts (keyboard), player.ts, fixedStep.ts, animator.ts, clips.ts, followCamera.ts (no collision), GameScene.tsx, GameAvatar.tsx}`, `components/game/world/{layout.ts (TEST_ARENA), colliders.ts, WorldView.tsx}`, `components/game/shell/{useExperienceShell.ts (mode, stopVoice, dispose), gameLoader.ts (no progress UI), ReadySignal.tsx}`. Deleted: `eslint.config.mjs`. | `fixedStep.test.ts` (cap, drop, alpha, reset); `input.test.ts` (diagonal normalization, opposite keys, blur releases all, detach removes listeners); `player.physics.test.ts` (real Rapier: grounded on flat, no jump in air, coyote and buffer windows, no infinite jump, wall blocks and slides, 0.2 m step climbs and 0.35 m step blocks, 30 deg ramp climbs and 45 deg ramp blocks, snap keeps grounded descending a ramp, kill plane respawns, diagonal speed equals forward speed); `animator.test.ts` (`nextLocoState`, every guard row in 5.3); `clips.test.ts` (reads each `public/game/clips/*.glb` JSON chunk: only `rotation` channels, no `Hips`, every target in the avatar joint list; `toGameClip` does not mutate its input). | Lint exits 0 without a prompt; build exits 0; tests pass. In a browser on the test arena: walk, run, jump, gravity, wall, ramp and step behave as tested; animation state follows actual movement (running into a wall shows idle); screenshots or a recording of walk and run from side and front for feet, arms and sideways-run (R2); measured clip speeds and the R1 decision recorded; A2-A5 confirmed or corrected. |
| M2 Entry, exit, lifecycle | Changed: `TalkingAvatar.tsx` (all of 3.1), `shell/useExperienceShell.ts` (scroll lock, focus, reduced motion), `shell/gameLoader.ts` (progress, cancel, retry, timeout), `session.ts` (full reducer and store), `followCamera.ts` (entry blend), `GameScene.tsx` (warm-up mode, auto-walk, frameloop on pause, context-loss handler, error boundary). New: `shell/LoadingOverlay.tsx`, `ui/GameInterface.tsx`, `ui/Hud.tsx`, `ui/Dialog.tsx`, `ui/PauseMenu.tsx`. | `session.test.ts` (every legal row of 2.3; representative illegal events return the same object); `gameLoader.test.ts` (cancel during the code, assets and physics steps leaves state idle and `vi.getTimerCount() === 0`; retry after a network failure; timeout; late results after cancel ignored); `shell.test.tsx` (jsdom, fake `GameModule`: play calls `stopVoice` once, loading then game, exit restores `overflow` and focuses Play, cancel during load restores the same, `addEventListener` and `removeEventListener` counts balance after 5 enter/exit cycles); `input.test.ts` additions (disabled input ignores keys); `Dialog.test.tsx` (focus on open, Tab trap, Escape, focus return). | Ten consecutive Play/Exit cycles and five Play/Cancel cycles in Chrome: hero camera, idle avatar, gestures, head-follow and talk button work afterward; page scroll restored; focus on Play; mic indicator off after Play from an active voice session; DevTools listener count and JS heap after cycle 10 within noise of cycle 1 (numbers recorded); tab hide pauses and shows Resume; reduced motion skips the travel; the bundle-boundary proof in 7.5 passes; A1 and A6 confirmed. |
| M3 World and destinations | Changed: `world/layout.ts` (`CAMPUS`), `world/WorldView.tsx`, `world/colliders.ts` (collision groups), `followCamera.ts` (obstacle query), `GameScene.tsx` (campus, interactions), `ui/GameInterface.tsx`. New: `interactions.ts`, `content.ts`, `ui/panels.tsx`. | `interactions.test.ts` (radius, nearest, front preference, unavailable items skipped); `content.test.ts` (featured ids are exactly 1, 2, 3 in order with titles equal to `data/index.ts`; links only when `http`; skills split; no testimonial text in any adapter output); `layout.test.ts` (every `route: "main"` ramp pitch <= 40 deg and every main-route step rise <= 0.25 m; every interactable sits on or near a walkable block); `followCamera.test.ts` (fake query: immediate pull-in, min distance, smooth restore, pitch clamp, recenter); `player.physics.test.ts` on `CAMPUS` (spawn grounded; a scripted walk reaches each destination radius); `panels.test.tsx` (project panel shows the data, one link with `rel`, focus handling). | Manual run from spawn to all three destinations without jumping; every panel matches `data/index.ts` and `lib/persona.ts` text; no testimonial text anywhere; the camera never shows building interiors in the narrowest passage; destinations identifiable from the plaza (screenshot from spawn). |
| M4 Challenge and mobile | Changed: `layout.ts` (cells, beacon), `interactions.ts` (cells, beacon), `session.ts` (celebration), `ui/Hud.tsx`, `ui/PauseMenu.tsx` (Restart), `ui/panels.tsx` (completion), `input.ts` (touch API), `GameScene.tsx`. New: `progress.ts`, `ui/TouchControls.tsx`. | `progress.test.ts` (round trip; corrupt JSON, wrong types, unknown version -> default with status; storage getter throws -> in-memory with `persistent` false; `setItem` quota error keeps memory state; restart keeps settings); `challenge.test.ts` (collecting the same cell twice counts once; beacon only with 3; completion then restart); `TouchControls.test.tsx` (joystick vector normalized, outer range sets run, `pointercancel` releases, two pointers tracked independently). | Full loop completed on desktop and on a mobile viewport (DevTools emulation, labelled as emulation) and on any real phone available (or reported unavailable); reload keeps collected cells; Restart clears them; with storage blocked in the browser the loop still completes. |
| M5 Polish and optimization | Changed: `WorldView.tsx` (finished materials, lighting, instancing), `config.ts` (quality presets, tuned values), `animator.ts` (celebration, tuned fades), `GameScene.tsx` (dpr cap, shadows per preset), `ui/*` (settings, accessibility pass), `ASSETS.md`. New: `audio.ts`, `public/game/clips/celebrate.glb`, any world assets with `ASSETS.md` rows. | `audio.test.ts` (no `AudioContext` before the first gesture; volume and mute applied; closed on dispose); `config.test.ts` (`resolveQuality` for coarse pointer and low core counts); settings persisted through `progress`. | Recorded FPS and frame time on a named desktop and a named phone or emulation (labelled), with browser, resolution and preset; total additional first-play bytes (game JS chunks gzip plus `public/game/**` fetched before ready) at or under 8 MB; no listener or heap growth over 10 cycles; each failure row in 3.5 exercised and recorded. |

M6 (review and delivery) adds no new modules; it uses the gate evidence above, the cross-provider review policy in spec section 13, and the PR.

## 9. Constraints for the dev stage contracts

- Do not touch: `components/avatar/Avatar.tsx`, `components/avatar/useRealtimeChat.ts`, `components/avatar/AskHints.tsx`, `lib/persona.ts`, `lib/gestures.ts`, `data/index.ts`, `app/page.tsx`, `app/api/**`, `public/avatar.glb`, `public/animations/*` (read-only sources), `next.config.mjs` (an additive CSP entry only if the browser proves physics needs one, recorded in the report), `next.config.ts`, `postcss.config.*`.
- Hero file changes are limited to `components/avatar/TalkingAvatar.tsx` as described in 3.1.
- No static import of `components/game/*` (other than `shell/*`) from outside `components/game/`.
- No new global state library; React state only for interface data via `useSyncExternalStore` stores.
- No `useFrame` in game code except the single frame driver in `GameScene.tsx`; no `useFrame` priority above 0.
- Every listener, timer, audio node, mixer and Rapier object created by game code is released through `GameHandle.registerCleanup` or the owning module's `dispose()`.
- Never dispose or clear the cached avatar GLTF.
- Implementation is owned by game-dev; graphics-engineer only for M5 rendering deliverables.

## 10. Assumptions and risks

- A1 (Assumption): R3F 8 class error boundaries inside the Canvas tree catch errors thrown by game components without unmounting the hero page; verified in M2 with a forced throw in development.
- A2 (Assumption): `useRapier().world` in 1.5.0 is the raw `RAPIER.World` and `paused` stops all internal stepping; M1 verifies against the installed `.d.ts` and source before writing the motor.
- A3 (Assumption): the KCC method names in 4.4 match `@dimforge/rapier3d-compat` 0.14.0 (the audit verified `createCharacterController` and listed stepping, slope and snapping as available); M1 confirms each name in the installed `.d.ts`.
- A4 (Assumption): `world.free()` releases character controllers; mitigated by explicit removal in `dispose()`; M1 verifies with a 20-cycle create/free test.
- A5 (Assumption): the compat build initializes in Node under Vitest (it embeds the WASM as base64, audit physicsDependency.csp); M1 proves it with the first physics test.
- A6 (Assumption): webpack retries a failed `import()` chunk on the next call, so Retry works after a network failure; M2 verifies with DevTools offline mode.
- A7 (Assumption): the owner downloads the Mixamo idle, jump, falling and landing clips ("Without Skin") and converts them to GLB; until then the fallbacks in 5.1 apply and the M1 jump-animation quality check is reported as partial.
- R1: walk and run speed mismatch with clip speeds (5.4).
- R2: the run clip may look sideways after dropping Hips (5.4).
- R3: the 14 MB avatar with 72 morph targets on the head may cost mobile frame time; measured in M5; re-authoring is out of scope unless measurements fail (audit avatarDecision.conditions).
- R4 (pre-existing): a browser without WebGL may already fail inside the hero canvas; the game only hides Play and does not change that behavior.
