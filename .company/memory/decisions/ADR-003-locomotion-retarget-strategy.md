# ADR-003: Locomotion clips are stripped offline, rotation-only, with physics-owned movement

- Status: Accepted 2026-10-08 after TASK-002 QA approval and Codex cross-review (TASK-002 design.md section 5)
- Date: 2026-10-06
- Work item: TASK-002

## Context

The M0 audit measured that `public/animations/walk.glb` and `run.glb` are about 98% redundant Mixamo mesh and skin data (about 1.8 MB each, animation data 22-39 KB), use `mixamorig:` node names, carry translation and scale tracks in centimetres, include 13 joints the avatar lacks, and repeat their first frame as the last frame.
The Mixamo Hips rest rotation differs from the avatar's by 89.4 degrees, and run.glb's Hips yaw drifts about 36 degrees per loop.
The hero gesture retarget already keeps only non-Hips quaternion tracks (`components/avatar/Avatar.tsx:36-52`), but the spec says locomotion must be validated separately and not copied blindly (spec section 6).
Physics owns world movement; animation changes the pose only (spec section 6).
Idle, jump, fall and land clips do not exist yet (audit assetGaps).

## Decision

A committed Node script (`scripts/strip-clips.mjs`, using `@gltf-transform/core` and `@gltf-transform/functions` as pinned devDependencies) produces game-only clips in `public/game/clips/`.
Each output keeps only rotation channels whose target, after removing the `mixamorig:` prefix, is an avatar joint other than Hips; it drops Hips rotation and translation, all scale and other translation tracks, and tracks for absent joints; it trims the duplicated last frame and removes all mesh, skin, material and texture data.
At runtime a separate `toGameClip` helper filters again against the live skeleton, never mutating shared clips, and the hero's `retargetClip` stays unchanged.
Animation state is chosen from the motor's measured speed and grounded state, and walk and run playback rate is `measured speed / clip ground speed` clamped to a configured range.
Rest-pose delta correction for feet, neck, head, shoulders and arms is an option of the script, off by default, enabled only if the M1 visual check shows the offsets the audit predicts; that outcome is appended to this ADR.
New clips come from Mixamo "Without Skin" downloads stored in `assets-src/mixamo/`, each with an `ASSETS.md` row.
Resolve the gltf-transform version at install time with `npm view @gltf-transform/core version` and `npm view @gltf-transform/functions version`, install both at the same exact version, and record it in the M1 report.

## Consequences

- First-play clip download drops from about 1.8 MB per clip to tens of KB.
- No root motion: position, speed and collisions come only from physics, so walking into a wall cannot keep a running animation.
- Some foot sliding remains wherever controller speed is outside the clamp range; the spec's default speeds are about twice the measured clip speeds, so M1 must tune speeds or source faster clips (design.md 5.4).
- Dropping Hips rotation may make the drifting run clip look sideways; M1 checks it visually and replaces the source if needed.
- Clip outputs are derived artifacts; re-running the script must reproduce them byte-for-byte from the same inputs and versions.

## Alternatives

1. Load the existing 1.8 MB clips and filter at runtime like the hero does: no tooling, but about 3.6 MB for walk and run alone plus the same per new clip, eating the 8 MB budget.
2. Keep Hips translation as root motion and drive the capsule from it: matches feet exactly, but conflicts with physics ownership, the centimetre unit and axis mismatch, and the run clip's lateral drift.
3. Re-author clips on the avatar skeleton in Blender: best fidelity, but manual work per clip and no reproducible pipeline in the repo.
4. A runtime retargeting library (for example SkeletonUtils.retargetClip): handles rest-pose differences, but its behavior with these rigs is unverified and it still requires the heavy files.

## Rollback Plan

Delete `public/game/clips/` and the script, point `CLIP_URLS` in `components/game/config.ts` at the original `public/animations/*.glb`, and let `toGameClip` do all filtering at runtime; this costs download size but no code outside `clips.ts` changes.
