# Implementation specification: playable 3D portfolio (user-supplied, TASK-002)

This is the user's implementation plan, transcribed verbatim in substance as the specification for TASK-002.
Art direction and tuning values below are approved starting points.

## 1. Goal and first-release scope

Turn the portfolio's existing talking avatar into a playable character.
A visitor clicks Play, watches the scene transition into a 3D world, and explores the work by walking, running, jumping, and interacting with locations.

First release includes: one compact handcrafted 3D environment; the recognizable avatar; desktop and mobile controls; a third-person camera; three portfolio destinations; a short collectible challenge; pause, restart, settings, and exit; a complete experience without an account or backend game service.
Target a two-to-five-minute first visit, with freedom to explore longer.
Multiplayer, combat, vehicles, character customization, and large procedurally generated terrain are reserved for later releases.

## 2. Existing foundation and initial audit

Existing: Next.js 14 and React 18 (host), Three.js + React Three Fiber + Drei (render), full-body avatar model (playable character), walking and running clips (locomotion start), gesture system (optional wave or celebration), portfolio project data (game displays), talking-avatar hero (entry and return point).
Avatar file is about 13 MB; walk/run clips about 1.8 MB each (file sizes, not transfer or memory).

Before implementation: run build and lint and record baseline failures; inspect model dimensions, skeleton, materials, textures, animation tracks; visually test walking and running on the actual avatar; check feet, shoulders, hips, facing direction for retargeting problems; measure initial asset loading and rendering performance; verify physics integration compatibility with installed React and rendering-library versions.
No test suite exists; add focused tests for new game behavior.
Decision gate: reuse and optimize the avatar unless the prototype demonstrates a concrete rigging or visual-quality problem requiring replacement.

## 3. Art direction and world layout

Environment: a small technology campus at dusk, solid architecture, natural ground surfaces, trees, paths, illuminated installations.
Use the portfolio's green and cyan as accents on signs and machinery; keep ground and building materials more neutral so the avatar and navigation remain easy to read.
Initial layout about 60 x 60 game meters, adjusted after movement testing.

| Area | Placement | Purpose |
|---|---|---|
| Arrival Plaza | Center | Spawn point, tutorial, central beacon |
| Project Lab | Left of plaza | Explore selected projects |
| Skills Workshop | Right of plaza | Discover skills and experience |
| Contact Tower | Beyond plaza | Contact information and completion destination |
| Garden path | Connects destinations | Exploration, collectible route |
| Raised terrace | Beside garden | Optional jumping challenge |

The three destinations should be recognizable from the plaza through shape, lighting, and signs.
Start with simple geometry to verify distances and navigation; replace progressively with finished assets.
Include: ground with modest elevation changes; paths, shallow ramps, short stairs; buildings with shallow accessible display areas; benches, planters, trees, a few animated props; boundaries formed by scenery and terrain; a safe recovery point if the character leaves the playable area.
Keep the main route accessible without precise jumping; the terrace provides optional play.
Acceptance: visitors can locate all three destinations without relying on a minimap.

## 4. Entry and exit experience

Entering: (1) visitor clicks [ Play / Explore ] beside [ Talk to me ]; (2) interface shows asset-loading progress and a Cancel control; (3) any active voice session disconnects and releases the microphone; (4) the game loads physics, environment, required animations; (5) camera pulls back from the avatar as the world appears; (6) avatar takes a short automatic walk onto the plaza; (7) brief controls hint; (8) player input becomes active.
Transition about 1-2 seconds after assets are ready.
Reduced-motion mode skips camera travel and the automatic walk.
Use one active rendering canvas through the transition where practical.
The talking scene and the game scene must not compete to control the avatar's skeleton or camera.

Exiting is available at all times.
On exit: stop game input and audio; stop physics updates; restore hero camera and avatar idle state; restore page scrolling and keyboard focus; retain progress for the current visit; leave voice chat disconnected until the visitor explicitly reconnects.
Canceling a load must not leave hidden controls, a scroll lock, or a delayed transition running.

## 5. Character controls and physical behavior

Desktop: Move WASD/arrows; Run hold Shift; Jump Space; Interact E; Rotate camera mouse drag; Recenter camera R; Pause / close panel Escape.
Movement follows the camera's horizontal direction; diagonal movement has the same maximum speed as forward.
Initial tuning: walk about 2.2 m/s; run about 4.8 m/s; jump height about 0.9 m; step assistance about 0.25 m; max walkable slope about 40 degrees (prototype defaults, tuned by playtesting).

Mobile: left joystick movement; right-side drag area for camera; Jump and context-sensitive Interact buttons; run toggle or outer joystick range; controls clear of browser and device safe areas; walking and camera control work simultaneously.

Physics: capsule collider and a kinematic character controller with ground detection; gravity and vertical velocity; jumping only when grounded with a small input grace period; wall collision and sliding; step and slope handling; ground snapping when descending; fall detection and safe respawn.
Fixed simulation timestep, initially 60 updates/second, with a capped catch-up budget; rendering interpolates movement when needed.
Acceptance: the character cannot pass through walls, gain speed diagonally, jump indefinitely, or become stuck on ordinary path edges.

## 6. Avatar animation

Locomotion state machine: Idle -> Walk -> Run -> Jump -> Fall -> Land -> Idle/Walk.
Animation selection follows actual movement and grounded state rather than key presses alone (walking into a wall must not keep a full-speed run animation).
Tasks: separate reusable avatar rendering from talking-specific behavior; retarget walking and running to the avatar's skeleton; add compatible jump, fall, landing clips; blend between states; match playback speed to movement speed within a reasonable range; rotate the character smoothly toward travel direction; disable hero mouse-follow head motion during gameplay; optional celebration on challenge completion.
The gesture code removes root movement and hip rotation; locomotion needs its own retargeting validation and those filters must not be copied without testing.
Physics owns world movement; animation changes the pose.
Acceptance: no sideways running, severe foot sliding, stretched limbs, sudden pose snapping, or visible resets to an unanimated pose.

## 7. Third-person camera

Over-the-shoulder camera about 4-5 m behind the avatar, looking toward the upper body.
Implement smooth follow; horizontal orbit and limited vertical rotation; collision against environment geometry; automatic adjustment when an obstacle blocks the desired position; smooth restoration after the obstacle clears; manual recentering; stable behavior on stairs, jumps, landing.
Avoid head bob and rapid shaking.
Acceptance: walls do not fill the screen unexpectedly, the camera does not pass through buildings, the avatar remains readable in narrow areas.

## 8. Portfolio interactions and game objective

Project Lab: three primary displays from existing data (XecSuite, NewsStocks, Apex Mind); other projects via an "All projects" panel.
Approaching a display shows "E - View project"; activation opens an accessible HTML panel with title, existing description, technologies, existing screenshot when available, valid link when available.
Reuse the portfolio's source data; do not invent results, testimonials, or claims.

Skills Workshop: skills in a few readable groups (for example frontend, automation, AI systems); an experience panel from the same location.

Contact Tower: existing contact options and links; interacting must never automatically send a message or open multiple tabs.

Exploration challenge: one energy cell near each destination; each collectible once; counter "Energy cells 0/3"; after all three, guide the player back to the plaza; interacting with the beacon triggers a short lighting effect and celebration; show "Explore more", "View projects", "Contact" actions.
The challenge is optional; portfolio content stays accessible throughout.
Save progress locally in a versioned format with a Restart option; if storage is unavailable, continue in memory.

## 9. Interface, accessibility, and recovery

HTML for menus, project panels, settings, status.
Provide visible Pause and Exit; keyboard-accessible menus; focus management on panel open/close; a controls reference; sound toggle and volume; reduced-motion support; readable contrast; phone-sized touch targets; a direct return to the regular portfolio.
When a panel opens, stop movement and release held inputs.
Pause automatically on tab hide or window blur; on return show Resume instead of moving immediately.

| Failure | Expected behavior |
|---|---|
| Asset download fails | Retry or return to portfolio |
| Physics initialization fails | Explain briefly and offer exit |
| WebGL unavailable | Keep regular portfolio usable |
| Graphics context lost | Pause and offer recovery/reload |
| Save data invalid | Reset game progress safely |
| Player falls outside the map | Respawn at the plaza |
| Orientation changes | Reposition controls and resize the camera |

Sound begins only after user interaction.
Game functionality does not require voice access or AI requests.

## 10. Technical organization

| Module | Responsibility |
|---|---|
| Experience shell | Switch between hero and game |
| Game loader | Load assets, progress, cancel/retry |
| Game session | Modes, pause, entry, exit, completion |
| Input controller | Keyboard and touch input |
| Player controller | Movement, gravity, collisions |
| Character animator | Animation selection and blending |
| Follow camera | Tracking, orbit, obstacle handling |
| World | Terrain, buildings, props, colliders |
| Interaction system | Nearby objects and prompts |
| Game interface | Menus, HUD, project panels |
| Progress storage | Versioned local progress |
| Game configuration | Movement tuning and quality settings |

Keep rapidly changing positions and physics data outside React state; use React state for interface changes.
Own and clean up input listeners, audio, physics objects, and animation mixers explicitly.
Preserve shared cached assets when unloading only the game world.

## 11. Performance and asset plan

Loading: download game code, physics, world assets after Play; reuse the loaded avatar; load only required locomotion clips initially; load celebration assets later; avoid importing game modules into the initial portfolio bundle.
Asset preparation: reduce unnecessary texture resolution; remove unused meshes, materials, tracks; check whether animation files contain redundant geometry; use compatible compression; self-host decoding assets where practical; record source and license for third-party assets.
Rendering: simple collision shapes; reuse materials and geometry; instance repeated props; limit shadow-casting lights; lower-cost lighting for distant objects; cap rendering resolution on high-density mobile screens; pause rendering when hidden.

| Measure | Initial target |
|---|---|
| Desktop gameplay | Near 60 FPS on the selected baseline laptop |
| Mobile gameplay | Sustained 30 FPS on the selected baseline phone |
| Additional first-play assets | 8 MB or less, excluding the existing avatar |
| Ordinary portfolio browsing | No game-world or physics downloads |
| Repeated entry/exit | No accumulating listeners or unbounded resource growth |

Record exact device, browser, resolution, quality setting, and measured results.

## 12. Milestones

- M0 Baseline and asset audit: build/lint results, avatar and animation audit, dependency decision, initial measurements, confirmed scope. Gate: clear avatar-reuse decision and identified asset gaps.
- M1 Movement prototype: flat test environment, avatar loading, walk/run/jump/gravity/collision, basic follow camera, minimal keyboard controls. Gate: movement, animation, and collisions work together convincingly.
- M2 Entry, exit, session lifecycle: Play button, loading and cancellation, hero-to-game transition, pause/resume, exit and restoration, voice-session shutdown. Gate: repeated entry and exit produce no broken input, camera, scrolling, or microphone state.
- M3 World and destinations: navigable campus, three destinations, project and experience panels, interaction prompts, camera obstacle handling. Gate: every destination reachable with correct content.
- M4 Challenge and mobile: three collectibles, beacon completion, progress saving and restart, touch movement and camera, responsive interface. Gate: full loop completable on desktop and mobile.
- M5 Polish and optimization: finished materials and lighting, tuned blending, optional sound and celebration, asset compression and quality presets, accessibility and failure recovery. Gate: measured performance meets agreed device targets.
- M6 Review and delivery: automated checks, manual browser playthroughs, cross-provider code review, fixes and re-review, documentation and memory updates, reviewable PR with evidence. Deployment is a separate action.

## 13. Testing and cross-review

Automated coverage: legal game-state transitions; canceling loading; input normalization and release on blur; grounding and jump eligibility; collision, slopes, respawn; collectible uniqueness; completion and restart; corrupt or unavailable storage; entry/exit cleanup; project-panel focus and keyboard behavior.
Browser tests for the full journey; real rendered playthroughs for animation quality, camera comfort, touch usability.
Test current Chrome, Firefox, Safari on desktop plus Android Chrome and iOS Safari on named devices where available; report unavailable coverage explicitly.
Review policy: Claude-authored code reviewed by Codex; Codex-authored code reviewed by Claude; mixed work gets both; reviewers inspect the actual diff and independently run required checks; fixes return to the implementer; final approval applies to the final revision; an unavailable reviewer is a blocker, not an approval.
Cross-provider orchestration must be configured and verified before it is treated as an enforced gate.

## 14. Definition of done

Play reliably transitions the existing avatar into the world; walking, running, jumping, collisions, camera work; all three destinations reachable; portfolio information and links correct; challenge completable and restartable; desktop and mobile controls usable; pause, exit, repeated entry restore correct state; game failure leaves the portfolio usable; performance recorded against named devices; build, lint, tests pass or blockers reported; final changes have independent cross-provider approval; PR contains notes, evidence, and known limitations.
