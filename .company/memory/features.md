# Feature Registry: portfolio

Add concise feature-to-file entries after verified work items.

## Interactive 3D talking-avatar hero

Interactive WebRTC-driven 3D avatar with voice chat via OpenAI Realtime API. Uses React Three Fiber to render GLTF model, lip-sync from audio, and gesture animations. Browser calls `/api/realtime-session` to get an ephemeral token; never receives the long-lived OPENAI_API_KEY.
- **Play entry**: the Play button in components/avatar/TalkingAvatar.tsx enters the playable world (see below); without WebGL the hero renders no Canvas and no Play button, and the talk button stays.
- **Files**: components/avatar/TalkingAvatar.tsx, components/avatar/Avatar.tsx, components/avatar/useRealtimeChat.ts, app/api/realtime-session/route.ts
- **Status**: stable

## Static portfolio content sections

Responsive portfolio sections (nav, about bento grid, projects, experience, contact/footer) with terminal-themed styling and Framer Motion animations. Imports content from data/ module.
- **Files**: components/site/Nav.tsx, components/site/About.tsx, components/site/Projects.tsx, components/site/Experience.tsx, components/site/Contact.tsx, components/site/TermWindow.tsx, data/index.ts
- **Status**: stable

## SEO/OG/robots/sitemap assets

Route-level generated assets for search engines and social media. Includes robots.txt, sitemap.xml, OpenGraph image, and JSON-LD metadata.
- **Files**: app/robots.ts, app/sitemap.ts, app/opengraph-image.tsx, app/layout.tsx (metadata export)
- **Status**: stable

## Playable 3D portfolio world

Third-person 3D campus entered from the hero Play button, with Project Lab, Skills Workshop and Contact Tower, keyboard, mouse and touch controls, and a three-cell energy challenge with versioned local progress; panels show only data/index.ts and lib/persona.ts content.
- **Files**: components/game/ (GameScene.tsx, shell/gameLoader.ts, world/WorldView.tsx, world/campus.ts, player.ts, input.ts, followCamera.ts, challenge.ts, progress.ts, ui/GameInterface.tsx, ui/TouchControls.tsx); entry point components/avatar/TalkingAvatar.tsx
- **Progress**: localStorage key portfolio.game.progress, version 1 (ADR-005); unavailable or invalid storage falls back to in-memory progress.
- **Limits and controls**: see the "Playable 3D world" section of README.md.
- **Camera and entry**: follow camera rule 6 (frameHead) keeps the avatar head in view by tilting the aim, never moving the camera; the first opening env fade step is capped at ENV_FIRST_STEP_S = 10 ms (components/game/tween.ts).
- **Status**: stable
