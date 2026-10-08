# Lessons: portfolio

- [TASK-001] For onboarding-only tasks, precise file:line citations in memory facts
  are a strong, cheap independent-verification signal — QA can reopen the exact cited
  lines to confirm each fact against source.
- [TASK-001] `scripts/company-map query`/`symbol` confirms the App Router entrypoint
  set without reading the whole tree; run it before opening files.
- [TASK-001] Follow-up (not yet actioned): the repo carries duplicate config files —
  `next.config.mjs` (active, defines CSP) alongside a `next.config.ts` stub, and both
  `postcss.config.js` and `postcss.config.mjs`. Next 14 loads `.js`/`.mjs` config only.
  Consolidating would reduce confusion but was out of scope for onboarding.
- [TASK-002] Every headless Chrome must use a `--user-data-dir` inside the stage output directory and delete it on exit and on SIGTERM; leaked profiles once filled about 20 GB of disk, and helper processes can outlive the main kill, so also kill leftovers by exact PID.
- [TASK-002] Run production builds in a copy of the tree, never in the working tree: the dev server shares `.next`, and a build there breaks the running dev session.
- [TASK-002] Exercise every failure row in a real browser early: "WebGL unavailable" looked handled (a disabled Play button) while the hero Canvas actually threw and blanked the whole portfolio.
- [TASK-002] A repeated clamp such as `Math.max(reach, floor, HARD_MIN / len)` can silently override the collision-solved camera distance; test the camera against the distance the collision query reported, not against a fixed minimum.
- [TASK-002] A hover-prewarmed baseline hides most of a cold-load cost: A/B the no-prefetch click, the press and the hover separately, and start all shader compiles before awaiting their links together.
- [TASK-002] CDP touch emulation: `touchEnd` releases exactly the points it lists and `touchMove` with fewer points releases nothing; under heavy host load, drive the avatar with closed-loop steering from the renderer camera yaw rather than dead reckoning.
- [TASK-002] The README is an upstream tutorial template with a manual table of contents, so a new section needs a matching TOC entry and anchor.
- [TASK-003] A bone no clip writes keeps whatever the last owner left, so blend code must remember its own target; and re-run bodyClearance.test.ts after any clip posture change.
- [TASK-003] Proximity pickups need an exit latch: arm an item only after the player is seen outside its reach, or Restart and reload inside the radius re-collect it on the next frame.
- [TASK-005] One long test file runs on a single Vitest worker: split heavy matrices per case into files so wall time and per-case time both shrink, and keep a raised testTimeout only as a safety net.
- [TASK-005] A long first frame after a scene swap becomes a visible fade pop when its dt is consumed by the tween; cap the first step of opening tweens. Measure fades with gl.readPixels per rendered frame, since CDP screencast drops frames under load.
- [TASK-005] Re-plan the review gate after every committed change and hand QA the domain list from the latest plan; a dependency change adds the operations domain and an older template list fails domain coverage.
- [TASK-005] IntroVideo must be same-origin (CSP media-src), and inert-state tests must query by text because role queries ignore inert or aria-hidden subtrees.
