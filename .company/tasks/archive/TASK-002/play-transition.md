# TASK-002 Play transition spec (hero to game, and back on Exit)

Stage: 08-product-designer-play-transition.
User request (verbatim): "can we when click play, smooth move to the game? like all menu and buton go out and avatr move to start the game?"
Inputs: `design.md` (sections cited as D-x.y), `components/avatar/TalkingAvatar.tsx`, `components/game/*` as it exists in the worktree at the time of writing, `app/page.tsx`, `components/site/Nav.tsx`.
This is a design specification.
Nothing here was prototyped or run in a browser, and no usability testing took place.
All timings are proposed starting values to be tuned by looking at a recording, and the frame-time budgets in section 9 are proposals, not measurements.

## 0. Summary of the experience

1. The user clicks `[ play / explore ]`.
2. Within 100 ms the page chrome leaves: gesture list slides left, ask hints slide right, title and buttons drop and fade, nav dots slide right, status and scroll hint fade.
   Only the avatar, still alive and idling, stays on the dark stage.
3. The world fades in out of the dark behind the avatar (fog opens), the camera pulls back and widens, the avatar turns its back to the camera, takes a short walk forward, and the HUD fades in.
4. Control is handed over about 1.9 s after the click when the game is already loaded.
5. Exit plays the same story backwards, ending on the exact hero layout, scroll position and focus.

Key design decision that keeps this cheap and smooth: the entry is staged so that the camera starts in FRONT of the avatar at the spawn point (avatar facing the camera, exactly like the hero), and the avatar turns 180 degrees away from the camera.
After the turn the camera is already behind the avatar, which is the follow-camera pose, so no 180 degree camera orbit and no world-space jump is needed.
The world is placed so the camera starts on the spawn-backward side: hero camera position = spawn + backward * 4.9 (relative to `spawnYawDeg`), look-at 0.8 m above the feet.

## 1. Definitions and clocks

- C = the moment of the Play click (or Enter/Space on the focused button).
- GO = the moment the loader reports "ready" (code, assets and physics, D-2.2) AND the world is warmed (section 7.3).
- S = swap time = `max(C + 360 ms, GO)`.
  At S the hero subtree (lights, `Avatar`, `CameraRig`) unmounts and the game subtree activates in the same canvas (D-3.3 step 5).
- Warm case: assets already cached or fetched by hover prefetch, so GO is at or before C + 360 ms and S = C + 360 ms.
- All offsets in sections 2 to 6 are in ms.
  "Owner" names the element or object that animates the property.
- Easing tokens (existing Tailwind `ease-*` equals these, so no new dependency):
  - `ease-in` = `cubic-bezier(0.4, 0, 1, 1)` (things leaving).
  - `ease-out` = `cubic-bezier(0, 0, 0.2, 1)` (things arriving).
  - `ease-inout` = `cubic-bezier(0.45, 0, 0.2, 1)` (camera and avatar motion).
  - JS tweens in game code use the matching functions: `easeInOutCubic` for camera and yaw, `easeOutCubic` for fov and fog.

## 2. Beat-by-beat timeline for Play (warm case)

Total: click to input enabled is 1860 ms (C to S = 360, S to `ENTRY_DONE` = 1500).
HUD is fully visible at C + 2160 ms at the latest.
This is inside the 1.5 to 2.5 s target once assets are ready.

### 2.1 Beat A: chrome exit (C + 0 to C + 360)

The existing overlay elements stay mounted until C + 360, then are removed (current code removes them at game mode).
From C + 0 every one of them is `inert`, `aria-hidden="true"` and `pointer-events-none` so a second click cannot happen.

| Offset | Element (owner) | Property | From to to | Easing |
|---|---|---|---|---|
| 0 to 80 | `[ play / explore ]` button (TalkingAvatar) | transform scale, label | 1 to 0.97 to 1; label becomes `[ starting... ]` | ease-out |
| 0 to 120 | status line, error line, scroll hint (TalkingAvatar) | opacity | 1 to 0 | ease-in |
| 0 to 300 | gesture list, desktop (TalkingAvatar, children staggered 20 ms) | translateX, opacity | 0 to -24 px, 1 to 0 | ease-in |
| 0 to 300 | gesture chip row, mobile (TalkingAvatar) | translateY, opacity | 0 to +24 px, 1 to 0 | ease-in |
| 40 to 340 | `AskHints` wrapper (TalkingAvatar wraps it in a div; `AskHints.tsx` is untouched) | translateX, opacity | 0 to +24 px, 1 to 0 | ease-in |
| 60 to 360 | title block, subtitle, `[ talk to me ]` and play button row (TalkingAvatar) | translateY, opacity | 0 to +32 px, 1 to 0 | ease-in |
| 0 to 300 | side nav dots (`Nav.tsx` in `app/page.tsx`, untouched) | translateX, opacity | 0 to +24 px, 1 to 0 | ease-in |

The nav is animated without editing `Nav.tsx` or `app/page.tsx`: the shell sets `document.documentElement.dataset.experience` to `leaving | game | returning | hero` and a small rule in `app/globals.css` targets `html[data-experience="leaving"] nav` and `html[data-experience="game"] nav`.
Without that rule the nav would be covered by the canvas at S (z-50 over z-40, D-3.1 item 2) with a hard cut, so the rule is required, not optional.

At C + 0 the shell also:
- calls `stopVoice()` synchronously (D-3.3 step 1; the mic indicator goes off before any animation);
- locks scroll (section 2.2);
- sets `aria-disabled` on both buttons instead of `disabled`, so focus stays on the Play button and is not dropped to `body` (a disabled focused button loses focus in some browsers);
- starts the loader (or joins a prefetch already in flight, section 4.3).

### 2.2 Beat B: canvas takes the full screen (C + 0 to C + 400, runs alongside A)

Current facts: the hero canvas is `absolute inset-0` inside an `h-screen` section, so at scroll position 0 it is already viewport sized (TalkingAvatar.tsx:67-70).
The only "growth" needed is when the hero is partly scrolled, because switching to `fixed inset-0` would move it by the scroll offset in one frame.

| Offset | Owner | Property | Value | Easing |
|---|---|---|---|---|
| C + 0 | shell (reads `section.getBoundingClientRect().top`, saves `window.scrollY`) | measure and save | `t` (px) and `scrollY` saved in a ref | none |
| C + 0 | canvas element (TalkingAvatar `className`) | position | `absolute` to `fixed inset-0` with `z-0` (still under the chrome at z-20), background `term-bg` so page content never shows through | none |
| C + 0 to C + 400 | canvas element | transform translateY | `t` px to 0 (skipped when `abs(t) < 1`) | ease-inout |
| C + 0 | shell | `documentElement` scroll lock | `overflow: hidden` plus `scrollbar-gutter: stable` so the page does not shift sideways when the scrollbar disappears; saved values restored on exit | none |
| S | canvas element | z-index | `z-0` to `z-50` (above nav z-40, D-F24), `touchAction` to `none` | none |

The `<section>` keeps `h-screen` in the flow, so nothing below shifts (D-3.1 item 2).
Scroll lock moves from "game mode" (current `useExperienceShell`) to C + 0, otherwise the user could scroll the avatar away during loading.
At scroll position 0 beat B is a no-op by design: the stage already fills the screen, and the perceived "growth to full screen" comes from the chrome leaving and the camera widening (beat C).

### 2.3 Beat C: swap and world reveal (S + 0 to S + 300)

| Offset | Owner | Property | From to to | Easing |
|---|---|---|---|---|
| S + 0 | `TalkingAvatar` (mode to `game`), `GameScene` (`active`) | hero subtree unmounts, `GameAvatar` mounts at spawn, `Physics` already warm | instant, no visible change by construction (section 7.1) | none |
| S + 0 | `GameAvatar` | pose | bind pose reset AND idle action at weight 1 AND `mixer.update(0)` all in the same layout effect, before the first game render | none |
| S + 0 to S + 300 | `WorldView` fog | fog near and far | near 5.5 m and far 7 m (everything beyond the avatar is the `term-bg` colour) to near 20 m and far 60 m | ease-out |
| S + 0 to S + 300 | `WorldView` lights | intensity | hero-equivalent values (ambient 1.1, key 1.6) to the world preset | ease-out |
| S + 0 | `WorldView` | `scene.background` | `term-bg` colour (matches the stage, so nothing flashes) | none |

Fog starts at 5.5 m because the avatar is about 4.9 m from the camera, so the avatar is not fogged while the ground and buildings emerge from the dark behind it.
The ground fading in from the stage colour is what gives "the world appears around the avatar".

### 2.4 Beat D: camera move from hero framing to follow position (S + 0 to S + 1500)

Owner: `followCamera` (`beginEntry`, D-2.7), driven by the single frame driver (D-4.2).
Start pose is read from the live camera at S (not a constant), so the first game frame equals the last hero frame even when the hero `CameraRig` lerp was mid-flight.

| Offset | Property | From to to | Easing |
|---|---|---|---|
| S + 0 to S + 1500 | camera distance behind the pivot | 4.9 m (in front, relative to avatar) to 4.5 m (behind, `CAMERA.distance`) | ease-inout |
| S + 0 to S + 1500 | camera position and look-at | hero framing relative to the feet (offset `(0, 1.2, 4.9)`, look-at `(0, 0.8, 0)`) to follow pose (pivot +0.6 m, shoulder 0.4 m) | ease-inout |
| S + 0 to S + 1500 | camera fov | 32 to 55 | ease-out (`easeOutCubic`) |

Because the avatar turns toward the walk direction (beat E) instead of the camera orbiting around it, the camera only slides and widens.
That keeps the world from sweeping past and keeps the per-frame cost low.
`CAMERA.entrySeconds` stays 1.5.

### 2.5 Beat E: avatar turn and walk into the world (S + 150 to S + 1500)

Owner: `GameScene` frame driver (visual yaw, scripted intent), `animator` (clips), motor (position).
In `entering` mode the driver builds a scripted intent (D-3.3 step 6, D-4.2 item 3), so physics, animation selection and shadows go through the normal path.

| Offset | Property | From to to | Easing |
|---|---|---|---|
| S + 0 to S + 150 | hold: avatar keeps the hero idle pose facing the camera | none | none |
| S + 150 to S + 570 | avatar visual yaw (`charYaw`, driver tween, not `turnRate`) | `spawnYaw + 180 deg` (facing the camera) to `spawnYaw` | ease-inout |
| S + 400 to S + 650 | animator cross-fade idle to walk (`ANIMATION.fade.loco` 0.25 s) | idle weight 1 to walk weight 1 | linear fade (existing) |
| S + 500 to S + 1500 | scripted forward intent, walk speed (`MOVEMENT.walkSpeed` 2.2 m/s) | `moveWorld` along `spawnYaw`, `run` false | motor accel (existing `groundAccel`) |
| S + 1500 | session `ENTRY_DONE` then `playing`, `input.setEnabled(true)` | none | none |

Walk distance is about 2.2 m, so the avatar ends clear of the spawn point with the camera behind it.
If the walk would collide (spawn is in the test arena or the campus plaza, both open), the motor handles it normally.
The turn has no turn-in-place clip yet, so it reads as a pivot; the early walk cross-fade at S + 400 puts feet in motion before the turn finishes to hide that.
If foot sliding during the turn is visible in review, shorten the turn to 360 ms rather than adding a clip (open item, section 8).

### 2.6 Beat F: HUD entry (S + 1000 to S + 1800)

Owner: `GameInterface` (DOM, `components/game/ui`); the HUD is rendered while `entering` with `opacity: 0` and mounted state, so there is no layout shift when it appears.

| Offset | Element | Property | From to to | Easing |
|---|---|---|---|---|
| S + 1000 to S + 1300 | Pause and Exit buttons (top left) | opacity, translateY | 0 to 1, -8 px to 0 | ease-out |
| S + 1200 to S + 1500 | "Energy cells n/3" counter | opacity, translateY | 0 to 1, -8 px to 0 | ease-out |
| S + 1200 to S + 1500 (mobile) | touch controls (joystick, Jump, Interact) | opacity, translateY | 0 to 1, +12 px to 0 | ease-out |
| S + 1500 to S + 1800 | controls hint line | opacity | 0 to 1; fades out after 6 s or on first movement | ease-out |

Pause and Exit are reachable by keyboard from S + 1000 (earlier than control hand-over) so the user is never trapped in the sequence.
Focus: at S the game overlay root receives focus (D-2.10); the Exit button is the first tab stop.
A polite live region (visually hidden) announces "Game started. Escape pauses." at ENTRY_DONE.

### 2.7 Skip during entry

Pressing any mapped movement key or touching the joystick area during `entering` skips the rest:
- the camera finishes the remaining tween in 250 ms (`finishEntry(250)`);
- the scripted walk stops and input is enabled immediately;
- `ENTRY_DONE` is dispatched when the camera tween ends.
`Escape` during `entering` already means pause with the entry skipped (D-2.3 table); `snapTo` is used on resume.

## 3. Loading case (assets not ready at C + 360)

Principle: never a blocking screen.
The hero stays live (avatar idling, mouse head-follow, gestures not clickable because chrome is gone) and the page is scroll-locked, so the avatar stays in place.

States and timings (C = click):

| Time | What the user sees | Owner |
|---|---|---|
| C + 0 to C + 360 | Beat A and B exactly as in the warm case (feedback is instant and not tied to network) | TalkingAvatar, shell |
| C + 360 until GO, if GO > C + 400 | Hero stage with only the avatar. A loading strip fades in (opacity 0 to 1, 200 ms, ease-out) at the bottom centre, where the title was: one line `loading world... 42%`, a 2 px progress line under it (width = `load.progress`, `transition: width 150ms linear`), and a `[ cancel ]` button. | `LoadingOverlay` (shell), rendered as an inline strip, not the full-screen `role="dialog"` of D-2.2 |
| any time while loading | `Escape` or `[ cancel ]`: run Cancel (section 3.2) | shell |
| GO | strip fades out (150 ms, ease-in) while Beat C to F start at S = GO | shell, game |

Rules:
- The strip is shown only if the load has not finished by C + 400 ms, so a warm start never flashes it.
- Minimum strip visibility is 300 ms once shown (avoids a flicker when the load finishes right after it appears).
- Progress is the existing weighted progress (code 0.2, assets 0.7, physics 0.1, D-2.2); it never goes backwards.
- The strip has `role="status"` (polite) for the percentage, updated at most every 500 ms for screen readers; `[ cancel ]` receives focus when the strip appears (focus was on the Play button before, which was `aria-disabled`).
- The talk button stays inert during loading (D-3.1 item 6).

### 3.1 Resume when ready

At GO the shell does not re-run Beat A or B: chrome is already gone and the canvas is already fixed (z-0).
It sets S = GO, then runs Beat C to F unchanged, with these differences:
- the loading strip fade-out overlaps the first 150 ms of Beat C;
- focus moves from `[ cancel ]` to the game overlay root at S.

### 3.2 Cancel and failure

Cancel (user) and failure (D-3.5) run the same reverse path as Exit but without any 3D leg, since the game never activated:
1. loader cancel, `handle.dispose()` (D-3.4 order);
2. canvas returns to `absolute` through the reverse FLIP (section 5, step 4), scroll lock released, saved `scrollY` restored;
3. chrome re-enters (section 5, Beat X3);
4. focus returns to the Play button with `preventScroll: true`;
5. on failure the red line under the buttons shows the message (existing `role="alert"` paragraph) and a `[ retry ]` replaces the play label; nothing blocks the rest of the page.

### 3.3 Prefetch of the game chunk

Add `loader.prefetch()` to `gameLoader.ts` (the only module allowed to `import()` the game, D-2.2).
- Triggers: `pointerenter`, `focus` and `pointerdown` on the Play button (desktop, keyboard, touch).
- Idempotent: it starts the same `import("@/components/game/entry")` promise that `start()` later awaits, so Play never downloads twice.
- Fetches game code only on touch (coarse pointer) or when `navigator.connection?.saveData` is true.
  Fetches game code plus the first-play clips (`loadGameAssets`, module-level cache) on fine pointers without `saveData`.
- Does not mount anything, does not change `LoadState` shown to the user, and swallows errors (a failed prefetch must not show an error; the real click retries).
- No game request is made until hover, focus or press; the bundle proof in D-7.5 is amended accordingly (section 8, item 5).
- Prefetch does not cancel when the pointer leaves: the bytes are already on the way and the cache is useful.

## 4. Exit: the reverse sequence

Exit sources: HUD Exit button, pause menu "Exit to portfolio", completion panel actions that exit.
X = the exit click time.
Beats are the mirror of Play, with leaving easings swapped (leaving elements use `ease-in`, arriving use `ease-out`).

### 4.1 Beat X1: game leaves, avatar returns to hero framing (X + 0 to X + 700)

Owner: `session` (new mode `leaving`, section 8), `followCamera` (`beginExit`), frame driver, `GameInterface`, `WorldView`.

| Offset | Owner | Property | From to to | Easing |
|---|---|---|---|---|
| X + 0 | input controller | `setEnabled(false)`, `releaseAll()` (existing for non-playing modes) | motor decelerates; avatar settles to idle | none |
| X + 0 to X + 200 | HUD, touch controls (GameInterface) | opacity | 1 to 0 | ease-in |
| X + 0 to X + 420 | avatar visual yaw (driver tween) | current yaw to "facing the current camera position" (shortest turn) | ease-inout |
| X + 0 to X + 700 | camera (`beginExit`) | pose relative to the avatar: follow pose to the hero framing (offset `(0, 1.2, 4.9)` in front of the feet, look-at +0.8 m) | ease-inout |
| X + 0 to X + 700 | camera fov | 55 to 32 | ease-inout (`easeInOutCubic`); an ease-in would arrive at full speed and stop dead at the swap (a visible landing snap), so the fov lands with zero velocity like the camera move |
| X + 100 to X + 600 | `WorldView` fog and lights | near 20 and far 60 back to near 5.5 and far 7; lights to hero values | ease-in |

The avatar can be anywhere in the world when Exit is pressed.
Because the camera framing is relative to the avatar and the fog closes to the stage colour, the destination of the avatar in the world does not matter: at X + 700 the screen shows the avatar on the dark stage with the hero framing.

### 4.2 Beat X2: swap back to the hero (X + 700)

Owner: shell (`finish`, D-3.4 order) and `TalkingAvatar`.

1. `handle.dispose()` (input detach, animator dispose, motor dispose, camera `dispose()` restoring the snapshot taken at creation including fov 32 and `updateProjectionMatrix`, renderer and world restore).
2. `mode = "hero"`: game scene unmounts, hero subtree remounts; `Avatar` finds the scene in the `useGLTF` cache (no suspense, D-3.4 step 3).
3. The hero `CameraRig` lerp (0.1 per frame, TalkingAvatar.tsx:29-30) continues from the restored snapshot, so there is no camera jump.
4. Restore `documentElement` `overflow`, `scrollbar-gutter`; call `window.scrollTo({ top: savedScrollY, behavior: "instant" })` once (re-asserts the position in browsers that reset it when `overflow` toggles).
5. Canvas wrapper goes back from `fixed` to `absolute`: reverse FLIP, transform translateY from `-t` px to 0 over X + 700 to X + 1100 (ease-inout), skipped when `abs(t) < 1`, where `t` is the value saved at Play.
   Page position and hero layout are therefore exactly the pre-Play ones.

### 4.3 Beat X3: chrome returns (X + 700 to X + 1100)

Mirror of Beat A in reverse order, using the Tailwind enter utilities from the already installed `tailwindcss-animate` (`animate-in fade-in slide-in-from-*`), all `ease-out`, 300 ms:

| Offset | Element | Property |
|---|---|---|
| 700 to 1000 | title block, subtitle, buttons | translateY +32 to 0, opacity 0 to 1 |
| 760 to 1060 | gesture list or chip row | translateX -24 to 0 (mobile translateY +24 to 0), opacity 0 to 1, stagger 20 ms |
| 800 to 1100 | `AskHints` wrapper | translateX +24 to 0, opacity 0 to 1 |
| 820 to 1000 | status line, scroll hint | opacity 0 to 1 |
| 700 to 1000 | nav dots (`html[data-experience="returning"]`) | translateX +24 to 0, opacity 0 to 1 |

Details:
- `AskHints` is remounted, so its typewriter restarts from the first hint (it is an untouched file and its timers are not paused while hidden; this is accepted and listed in the hero risks).
- The status line shows `status: idle - press to connect` because the voice session was stopped on Play and is never auto-reconnected (D-3.2).
- The game progress store is kept (D-3.4); nothing in the hero shows it.

### 4.4 Focus

At X + 700, after the chrome is mounted and `inert` removed, call `playRef.current.focus({ preventScroll: true })`.
The current shell calls `focus()` without `preventScroll`, which can scroll the page to the button and breaks the exact-scroll guarantee; adding `preventScroll: true` is a required fix.
The visible focus ring is the existing one; no extra animation.
A polite live region announces "Back to portfolio".

### 4.5 Exit total

Exit takes 1100 ms from click to chrome fully back; the page is interactive again at X + 700 (scroll unlocked, buttons focusable).
Cancel during loading follows 3.2 and takes about 400 ms.

## 5. prefers-reduced-motion variant

Read once at `play()` via `matchMedia("(prefers-reduced-motion: reduce)")` (already passed to `createGame`, D-2.1), plus the in-game setting `reducedMotion` (D-2.11) when set to `on`.
When reduced:
- Beat A: chrome does a pure opacity crossfade, 150 ms, no translation; nav likewise.
- Beat B: no FLIP translation; the canvas goes `fixed` instantly (accepting that a partly scrolled hero jumps, since a jump with no motion is the reduced-motion convention).
- Beat C: world appears with a single 150 ms opacity-style fog open; no staging.
- Beat D: `snapTo` the follow pose (D-3.3 reduced motion), fov 55 at once.
- Beat E: avatar yaw set to `spawnYaw` at once, no auto-walk, `ENTRY_DONE` fires immediately (D-3.3, step 6 skipped).
- Beat F: HUD, touch controls and hint fade in 150 ms.
- Exit: HUD fade 150 ms, no camera or avatar leg, swap immediately, chrome opacity-only 150 ms; scroll and focus restored identically.
- The loading strip still shows (progress is information, not motion); its fade is 100 ms and the progress bar width does not animate.
Total click to control: about 360 ms (A) plus 150 ms, or just the load time when assets are cold.

## 6. Mobile variant (touch controls entry)

Applies when `matchMedia("(pointer: coarse)")` matches.
- No hover prefetch exists on touch: prefetch fires on `pointerdown`/`touchstart` of Play (a few tens of ms of head start); when the connection is not `saveData`, also fetch clips on the first scroll that makes the hero button visible is NOT done (no network use before intent).
- Beat A uses the chip row variant (translateY down 24 px, 300 ms) instead of the left list; nav is not rendered on mobile (`hidden md:flex`), so the nav rule is a no-op.
- Beat B: canvas size. The hero section is `h-screen` (100vh, large viewport on mobile browsers) and the fixed canvas is `inset-0` (visual viewport with the URL bar), so they can differ by the URL bar height.
  Required: the canvas wrapper uses `height: 100dvh` when fixed, and the camera aspect update from the R3F resize is allowed to run once at C + 0 (hero is still on stage, so the aspect step happens under the chrome exit and is small).
  Verified on a real phone or reported untested.
- Beat F: Jump (at least 48 px), Interact and the left joystick fade in with `translateY(12 px)`, placed with `env(safe-area-inset-*)` (D-2.10).
  The joystick and look area become active only at `ENTRY_DONE`; a touch during `entering` triggers skip (section 2.7), consuming that touch as the start of the joystick so the first gesture is not wasted.
- Orientation change during the sequence: the camera tween is in time, not in screen space, so it continues; the HUD layout re-flows through CSS only.
- Portrait framing: fov 55 vertical gives a narrower horizontal view than desktop; the avatar is the same size on screen at the end of the pull-back, so no extra adjustment is specified.
- Exit on mobile is the same as desktop; the Exit button is at least 44 px and `touch-action: manipulation`.
- Page scroll after Exit is restored by `scrollTo` (iOS Safari can drop the position when `overflow` toggles).

## 7. Mapping to the existing design, minimal additions, bundle and hero risks

### 7.1 Beat to design mapping

| Beat | Existing design reference | Status |
|---|---|---|
| A chrome exit | D-3.1 item 5 (hero overlays render only outside game mode); D-3.3 step 1 (`stopVoice`) | Changed: overlays stay mounted and animate until C + 360 instead of being removed at the mode switch |
| B canvas | D-3.1 item 2 and 3 (`!fixed inset-0 z-50`, `touchAction none`, section keeps `h-screen`) | Changed: becomes fixed at C (z-0) with FLIP, z-50 at S; scroll lock moves to C (D-2.1) |
| Loading | D-2.2 (`LoadingOverlay`, progress, Cancel), D-3.3 steps 2 to 4 | Changed: inline strip shown after 400 ms instead of a dialog; the dialog stays for `failed` |
| C swap | D-3.3 step 5, D-3.2 ownership table, D-2.6 (`GameAvatar` pose reset) | Changed: pose reset and idle action in the same layout effect before first render; fog starts opaque near the avatar |
| D camera | D-2.7 `beginEntry(avatar, avatarYaw, animate)` (hero framing relative to the avatar, 1.5 s, fov 32 to 55) | Same: entry call with `avatarYaw = spawnYaw + 180 deg`; the "orbit to behind" is replaced by the avatar turn (shorter, no 180 deg sweep) |
| E turn and walk | D-2.3 `entering` state, D-3.3 step 6 (scripted 1.0 s auto-walk), D-4.2 item 3, D-5.3 animator | Same walk; added: yaw tween for the turn, walk start at S + 500 |
| F HUD | D-2.10 (HUD, TouchControls, controls hint) | Changed: staged fade-in during `entering` instead of at `playing` |
| X1 to X3 exit | D-3.4 (exit order), D-2.7 `dispose()` restore | Added: a visible exit leg before the swap and a chrome re-entry after it |

### 7.2 Minimal additions (all small)

1. `components/game/shell/transition.ts` (new, constants only): the timing table in sections 2 to 4 and easing strings; no imports outside `shell/`.
2. `useExperienceShell.ts`: expose `phase` (`hero | chrome-out | waiting | entering | game | leaving | returning`), run the C, S and X timers (all cleared on cancel and unmount), set `documentElement.dataset.experience`, save `scrollY` and rect top, `focus({ preventScroll: true })`, `scrollTo` restore, `scrollbar-gutter`. Add `exit()` that starts the exit leg and calls `finish` at X + 700.
3. `gameLoader.ts`: `prefetch()` (section 3.3), "ready" additionally requires the world warm-up (7.3 below).
4. `TalkingAvatar.tsx` (the one hero file allowed to change): chrome wrappers with phase classes and `inert`, FLIP transform on the canvas wrapper, canvas z-index handling, inline loading strip, `aria-disabled` instead of `disabled`, prefetch handlers on the Play button, nav attribute handling is in the shell.
5. `app/globals.css`: the two nav rules for `html[data-experience]` (section 2.1). No change to `Nav.tsx` or `app/page.tsx`.
6. `followCamera.ts`: `beginEntry`, `entryDone`, `finishEntry(ms)`, `beginExit(avatar, avatarYaw, ms)`; the current file has none of these yet (it only has `update`, `snapTo`, `dispose`).
7. `session.ts`: add mode `leaving` (event `EXIT_BEGIN` from any non-fault mode; frame driver treats it like a non-input mode) and event `ENTRY_SKIP` (maps to `ENTRY_DONE` after `finishEntry`).
8. `GameScene.tsx`: scripted entry intent, yaw tweens (entry and exit), fog and light tween driver, exit leg, world warm-up before `onPhysics("ready")` is reported.
9. `GameAvatar.tsx`: first-frame pose guarantee (idle at weight 1 plus `mixer.update(0)` in a layout effect, not `useEffect`); today the pose reset runs in `useEffect`, which can show one bind-pose (T-pose) frame.
10. `GameInterface.tsx` and `TouchControls.tsx`: staged HUD fade-in and `leaving` fade-out.
No new dependency, no animation library; DOM motion is CSS transitions and the `tailwindcss-animate` utilities already in `tailwind.config.ts`, 3D motion is a small tween helper in the game chunk.

### 7.3 Warm-up so nothing hitches inside the 1.5 s window

The slow work must happen during Beats A to B (hero still on stage, nothing is moving yet), not during the camera tween:
- Rapier WASM init, clip load and `GLTFLoader` parse are already in the loading step (D-3.3 steps 3 and 4).
- Shader compile for the world materials: mount `WorldView` hidden during warm-up and call `gl.compileAsync(scene, camera)` (cap 2 s) before reporting ready.
  If the installed three version does not compile invisible objects, the fallback is to hold the first 150 ms of Beat C with the world at fog 5.5 to 7 m so the compile hitch lands on a nearly static frame.
  Needs a graphics-engineer check (assumption, not verified here).

### 7.4 Bundle boundary

- Everything added to the hero-reachable chunk is CSS classes, a constants file and shell logic with no import outside `shell/` (D-7.3 ESLint rule keeps this enforced); the shell must still not import `three` or Rapier.
- Camera, yaw and fog tweens, the scripted intent and HUD staging live under `components/game/` behind `import("@/components/game/entry")`.
- `prefetch()` uses the same `import()` call as `start()`, so no second import site appears and the D-7.3 boundary rule is unchanged.
- No request to the game chunk, Rapier, or `/game/clips/` occurs until the Play button receives hover, focus or press.
  The M2 proof in D-7.5 changes from "no request after scrolling the whole page" to "no request until hover, focus or press on Play".

### 7.5 Risks to the talking-avatar hero

1. Hero swap pop: the hero `Avatar` mixer (embedded idle, unfiltered) and the game idle are different mixers, so the pose can step at S; the hero head and neck mouse-follow (D-F11) leave the head tilted toward the pointer, which is on the Play button below the avatar at click time, and the game avatar resets to bind pose.
   Mitigation: Beat C holds idle for 150 ms and the camera is already moving; with the embedded idle fallback the pose delta is minimal; QA frame-diff check in section 9.
   If the Mixamo idle is supplied later the delta grows and may need a short blend or a matching start time (open item).
2. Lighting mismatch between hero lights (D-F3) and `WorldView` lights at S: mitigated by starting `WorldView` lights at hero values (Beat C).
3. Exit restores a camera snapshot taken at game creation; if the hero `CameraRig` lerp was mid-flight at that moment the restore is slightly off the hero frame and then eases in over a few frames (not a jump).
4. `AskHints` typewriter restarts after Exit (untouched file; timers not pausable from outside).
5. The mic is cut at C + 0 even if the avatar is mid-sentence (voice stop is synchronous by design, D-3.3 step 1); no fade-out is possible without editing `useRealtimeChat.ts`, which is out of scope.
6. Mobile viewport mismatch between `h-screen` and the fixed canvas (section 6) can show a resize during Beat A or B.
7. Scrollbar width change on desktop when `overflow` is locked (mitigated by `scrollbar-gutter: stable`; the fixed canvas width with a stable gutter is not verified and is a QA item).
8. Voice reconnect is never automatic after Exit (existing behaviour); the status line reads idle.

## 8. Open items and assumptions

1. The turn-in-place has no dedicated clip; confirm by recording whether the 420 ms pivot plus early walk fade reads as natural (graphics-engineer and QA frame review).
2. World placement for the entry: the spawn point and `spawnYawDeg` come from the layout data; the entry pose is derived from them, so no per-layout tuning is expected (assumption, confirmed when CAMPUS exists in M3).
3. Warm-up compile behaviour (7.3) is an assumption.
4. Timings are starting values; the product owner reviews a screen recording and may adjust the table in `transition.ts` without any other change.
5. Amendment to D-7.5: the "no request without Play" proof becomes "no request without hover, focus or press on Play" (section 7.4).
6. The existing `fixed left-4 top-4` Exit button and static controls hint in the current `TalkingAvatar.tsx` is placeholder M1 UI; the HUD staging in Beat F replaces it in M2.

## 9. Verification steps for QA (measurable)

Record each run at 60 fps with the browser's own recorder or Playwright video plus a CDP `Page.startScreencast` frame dump, desktop 1440 x 900 and a mobile emulation (labelled as emulation) 390 x 844; a real phone is a separate, reported-or-unavailable item.
Record the browser, version, device and hardware in the evidence.

1. Recorded frame sequence, Play, warm case (reload, hover Play for 1 s, click):
   - extract frames at 16.7 ms spacing from C to S + 2000;
   - confirm in order: chrome fully transparent by C + 360 (opacity read from the DOM at C + 360 is 0 or the element is removed), first world pixels visible after S, camera visibly moving by S + 100, avatar yaw completes by S + 570, avatar position advancing from S + 500, HUD buttons opaque by S + 1300, `ENTRY_DONE` and input working by S + 1500 (a held W key at S + 1550 moves the avatar);
   - total C to `playing` between 1.5 and 2.5 s (expected 1.86 s).
2. No hard cut: compute mean absolute pixel difference between each consecutive frame pair over the avatar bounding region; the pair spanning S must not exceed 2x the median of its 10 neighbours, and no frame in the sequence shows the bind pose (T-pose: arms horizontal) or a fully blank canvas.
3. No layout jump: sample `getBoundingClientRect()` of the hero section, `#about` and the canvas wrapper every frame (via `requestAnimationFrame` log) from C to S + 2000 and from X to X + 1200; the section and `#about` rects never change (delta 0 px) and the canvas wrapper only changes by the FLIP translate; `document.documentElement.scrollWidth` does not change (no scrollbar shift).
4. Scrolled start: scroll to a hero offset of about 300 px, click Play, confirm no one-frame jump of the avatar (canvas translate animates `t` to 0 over 400 ms), then Exit and confirm `window.scrollY` equals the saved value to the pixel and the hero rect equals the pre-Play rect.
5. Exit exactness: before Play record hero rect, `scrollY`, `document.activeElement` (Play button), the screenshot; after Exit compare the same (rect equal, `scrollY` equal, focus on Play with no scroll caused by focus, screenshot pixel difference below 1 percent excluding the typewriter hint area and avatar idle pose).
6. Loading case: throttle to Slow 3G (or block the chunk with a delay) and click Play: chrome leaves at the same time as warm; strip appears after 400 ms and not before; progress never decreases; `[ cancel ]` returns to the exact hero state (rect, `scrollY`, focus) within 500 ms; no strip appears with a warm cache; resuming after throttle removal continues into Beat C without replaying Beat A.
7. Hover prefetch: Network panel shows no request for the game chunk or `/game/clips/` on page load and scroll; hover on Play for 300 ms triggers it; clicking afterwards issues no duplicate request for the same URLs; with `saveData` emulated only code is fetched.
8. Frame-time budget (proposed): sample `requestAnimationFrame` deltas from C to S + 2000 on the named reference desktop: p95 at most 20 ms, p99 at most 33 ms, no single frame above 50 ms; on mobile emulation: p95 at most 33 ms and no frame above 100 ms.
   Report the numbers; if the swap frame at S exceeds the limit, check the 7.3 warm-up.
9. Reduced motion: emulate `prefers-reduced-motion: reduce`; chrome crossfades, no translateX or translateY on any element during Beat A (check computed `transform` is `none` throughout), camera snaps, no auto-walk, control available by C + 600 ms; Exit takes at most 400 ms.
10. Cycles and leaks: 10 Play and Exit cycles and 5 Play and Cancel cycles; after each, hero camera pose, idle avatar, gestures, head-follow and talk button work; `overflow` and `scrollbar-gutter` on `documentElement` equal the original values; no timers left (`vi.getTimerCount() === 0` equivalent in the shell test); listener and heap numbers within noise (D-8 M2 gate).
11. Mobile: touch controls fade in during Beat F and are inert until `ENTRY_DONE`; a touch during `entering` skips the entry and the first gesture starts the joystick; Jump and Interact at least 48 px; no content under the safe area; orientation change mid-sequence leaves a correct final frame.
12. Keyboard and screen reader: Tab order during the sequence never lands on a hidden chrome element (they are `inert`); focus on Play until swap or on `[ cancel ]` while loading, then the game overlay root; live-region announcements present; `Escape` during `entering` pauses; no keyboard trap.
13. Mic: after Play from an active voice session, the browser mic indicator is off before C + 100 ms.

## 10. Needs real user validation (not claimed here)

- Whether 1.86 s feels smooth rather than slow on repeat visits; consider a shorter repeat-visit variant only after observing real users.
- Whether the avatar pivot reads as natural without a turn clip.
- Whether the staggered chrome exit is distracting for users who start voice chat first.
- Comfort of the fov change (32 to 55) for motion-sensitive users beyond the reduced-motion path.
