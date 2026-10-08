# ADR-002: One canvas and one avatar with mode-exclusive ownership

- Status: Proposed (TASK-002 design.md section 3)
- Date: 2026-10-06
- Work item: TASK-002

## Context

The spec asks for one active rendering canvas through the hero-to-game transition where practical, and forbids the talking scene and the game competing for the avatar skeleton or camera (spec section 4).
The hero already owns the only `<Canvas>` (`components/avatar/TalkingAvatar.tsx:56-82`) and is lazy-loaded (`app/page.tsx:12-15`).
The avatar scene comes from the `useGLTF` cache (`components/avatar/Avatar.tsx:88`); a three.js object can have only one parent.
The hero `Avatar` creates its own mixer per mount (`Avatar.tsx:90`), stops it on unmount (`Avatar.tsx:125-128`) and applies mouse-follow on the head and neck every frame (`Avatar.tsx:193-215`).
`CameraRig` drives the default camera every frame (`TalkingAvatar.tsx:25-32`).
Hero behavior must not change.

## Decision

Keep one canvas: the game mounts inside the hero canvas.
The hero subtree (lights, `Avatar`, `CameraRig`) renders only when the experience mode is not `game`; the game subtree (`GameScene`) renders the same cached avatar scene with its own mixer, follow camera and lights.
Because the two subtrees are mutually exclusive in the React tree, exactly one owner holds the avatar scene, the mixer, the head motion and the camera at any time; no runtime flags arbitrate.
In game mode only the canvas wrapper becomes `fixed` (the section keeps its place in the page flow), and the game restores every renderer and camera setting it changed on exit.
`Avatar.tsx` is not edited; a sibling `ReadySignal` component inside the same Suspense reports when the avatar has loaded.

## Consequences

- One WebGL context and one copy of the avatar's GPU resources; no second 14 MB parse.
- The first game frame can reuse the hero camera pose, so the transition is continuous.
- Game teardown must restore camera fov and transform, dpr, shadow map flag, frameloop, scene background and fog, and must never dispose the cached avatar.
- A graphics context loss affects both modes; the game offers reload rather than full recovery.
- `TalkingAvatar.tsx` gains mode-conditional rendering; regressions there affect the hero, so M2 re-checks hero gestures, lip-sync, head-follow and voice after repeated entry and exit.

## Alternatives

1. Two canvases (hero canvas hidden, game canvas created on Play): simpler isolation, but a second WebGL context, a cloned avatar (SkeletonUtils.clone) or re-parenting between renderers, a visible cut instead of a continuous camera move, and more GPU memory on mobile.
2. One canvas with both subtrees mounted and a `mode` flag inside `Avatar` to disable mouse-follow and hand over the mixer: requires editing the hero component and keeps two writers alive behind flags, which is the competition the spec forbids.
3. Move the canvas into a new shared shell component above `TalkingAvatar`: cleaner long-term layering, but a larger hero refactor than needed now.

## Rollback Plan

The change is confined to mode-conditional rendering in `TalkingAvatar.tsx`.
Reverting that file to the base commit restores the hero exactly; the game can then be mounted in its own canvas inside an overlay without touching the hero again.
