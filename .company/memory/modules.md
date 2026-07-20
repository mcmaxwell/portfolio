# Module Setup: portfolio

Keep one concise section per verified module. Do not duplicate the generated graph.

## app router (app/)

- Responsibility: Next.js App Router root: HTML shell, SEO/metadata + JSON-LD, theme + GA bootstrap, and route-level generated assets (robots, sitemap, OG image, favicon). Renders the single-page portfolio via app/page.tsx.
- Package root: app/
- Entrypoints: app/layout.tsx (RootLayout), app/page.tsx (Home), app/provider.tsx (ThemeProvider), app/robots.ts, app/sitemap.ts, app/opengraph-image.tsx, app/icon.svg, app/globals.css
- Setup/development commands: npm install; npm run dev
- Build/test/lint commands: npm run build; npm run lint; tests: none
- Dependencies and external services: next, next-themes, next/font/google (JetBrains Mono, self-hosted), Google Analytics (gtag script). No secrets used here.
- Security and data boundaries: Server component sets global CSP/security headers via next.config.mjs; GA script whitelisted in CSP. app/page.tsx dynamically imports TalkingAvatar with ssr:false (browser-only WebRTC/Canvas).
- Key source files: app/layout.tsx, app/page.tsx, app/provider.tsx
- Related tests: none
- Status: verified

## realtime-session API route (app/api/realtime-session/)

- Responsibility: Only server-side endpoint. GET mints a short-lived ephemeral client secret from OpenAI so the browser can open a direct WebRTC session, injecting the avatar persona instructions and the two tool definitions (navigate_to_section, play_gesture).
- Package root: app/api/realtime-session/
- Entrypoints: app/api/realtime-session/route.ts (GET; runtime='nodejs', dynamic='force-dynamic')
- Setup/development commands: Requires OPENAI_API_KEY in .env.local; npm run dev
- Build/test/lint commands: npm run build / npm run lint; tests: none
- Dependencies and external services: OpenAI POST https://api.openai.com/v1/realtime/client_secrets. Imports buildInstructions() from lib/persona and GESTURES from lib/gestures. ENV VAR NAME: OPENAI_API_KEY.
- Security and data boundaries: Reads process.env.OPENAI_API_KEY server-side only; returns 500 if unset. Returns only the OpenAI response (ephemeral key at data.value) to the client — the long-lived OPENAI_API_KEY is never sent to the browser. Comment route.ts:4-5 confirms intent. Server-only boundary: OPENAI_API_KEY must not escape app/api/realtime-session/route.ts.
- Key source files: app/api/realtime-session/route.ts
- Related tests: none
- Status: verified

## components/site

- Responsibility: Static portfolio content sections rendered under the avatar hero: nav, about (bento grid), projects, experience, contact/footer, plus a reusable terminal-window wrapper.
- Package root: components/site/
- Entrypoints: Nav.tsx, About.tsx, Projects.tsx, Experience.tsx, Contact.tsx (Contact + SiteFooter), TermWindow.tsx (TermSection)
- Setup/development commands: npm run dev
- Build/test/lint commands: npm run build / npm run lint; tests: none
- Dependencies and external services: React client components; content from data/ (e.g. Projects.tsx imports { projects } from @/data); framer-motion for animation; no external network services.
- Security and data boundaries: External project links rendered with target=_blank rel=noopener noreferrer (Projects.tsx:11). No secrets.
- Key source files: components/site/Projects.tsx, components/site/TermWindow.tsx
- Related tests: none
- Status: verified

## components/avatar

- Responsibility: The interactive 3D talking-avatar hero: renders the r3f Canvas + GLTF avatar, runs the OpenAI Realtime voice loop over WebRTC, drives lip-sync from model audio volume, and plays body-gesture animations triggered by the user or by model tool-calls.
- Package root: components/avatar/
- Entrypoints: TalkingAvatar.tsx (default export, Canvas + UI), Avatar.tsx (Avatar, GLTF/animation), useRealtimeChat.ts (WebRTC voice hook), AskHints.tsx (typewriter prompt hints)
- Setup/development commands: npm run dev (mic permission + OPENAI_API_KEY needed for live session)
- Build/test/lint commands: npm run build / npm run lint; tests: none
- Dependencies and external services: @react-three/fiber, @react-three/drei (useGLTF), three; OpenAI Realtime API — useRealtimeChat fetches /api/realtime-session for the ephemeral key then POSTs SDP to https://api.openai.com/v1/realtime/calls. Uses navigator.mediaDevices.getUserMedia (microphone). Loads GLB assets from public/.
- Security and data boundaries: Client never sees OPENAI_API_KEY — only the ephemeral key from the server route (useRealtimeChat.ts:109-118). Mic access gated by browser + Permissions-Policy 'microphone=(self)' (next.config.mjs:46). Client function-call handler only runs whitelisted local actions (navigate_to_section, play_gesture) — useRealtimeChat.ts:6-24,171-192. Server-only boundary: OPENAI_API_KEY must not escape app/api/realtime-session/route.ts.
- Key source files: components/avatar/useRealtimeChat.ts, components/avatar/Avatar.tsx, components/avatar/TalkingAvatar.tsx
- Related tests: none
- Status: verified

## lib

- Responsibility: Shared non-UI logic: avatar persona/knowledge and system-instruction assembly, the gesture registry, and the cn() Tailwind class-merge helper.
- Package root: lib/
- Entrypoints: persona.ts (owner, skills, experience, education, extraKnowledge, buildInstructions()), gestures.ts (GESTURES, GESTURE_URLS, gestureUrl), utils.ts (cn)
- Setup/development commands: n/a (imported by app/api and components)
- Build/test/lint commands: npm run lint; tests: none
- Dependencies and external services: clsx, tailwind-merge (utils.ts). No network/secrets. persona.buildInstructions() consumed by the API route; gestures consumed by API route + Avatar.
- Security and data boundaries: persona.ts contains only public owner bio/contact info (name, email, LinkedIn) — no secrets. Owner email/phone are hardcoded public contact details, appropriate for a portfolio.
- Key source files: lib/persona.ts, lib/gestures.ts, lib/utils.ts
- Related tests: none
- Status: verified

## data

- Responsibility: Static content data for the portfolio site sections (nav items, bento grid items, projects list) plus animation JSON assets.
- Package root: data/
- Entrypoints: data/index.ts (navItems, gridItems, projects, ...), data/confetti.json, data/globe.json
- Setup/development commands: n/a (imported by components/site)
- Build/test/lint commands: npm run lint; tests: none
- Dependencies and external services: None; plain TS/JSON. Imported via @/data (e.g. Projects.tsx:1).
- Security and data boundaries: Public static content only; no secrets.
- Key source files: data/index.ts
- Related tests: none
- Status: verified

## public assets

- Responsibility: Static served assets: the 3D avatar model, gesture animation clips, and portfolio SVG/PNG imagery and background.
- Package root: public/
- Entrypoints: public/avatar.glb (default AVATAR_URL), public/animations/*.glb (9 clips: wave, run, walk, dance, silly_dance, zombie, defeated, dodge, climb), public/*.svg and public/proj-*.png, public/bg.png
- Setup/development commands: n/a (served statically by Next)
- Build/test/lint commands: n/a; tests: none
- Dependencies and external services: Consumed by components/avatar (useGLTF loads /avatar.glb and /animations/<name>.glb via lib/gestures.GESTURE_URLS) and components/site (img src=/proj-*.png, /b1.svg, etc.).
- Security and data boundaries: Public static files; CSP media-src/img-src/worker-src allow 'self' + blob (next.config.mjs:31-36). No secrets.
- Key source files: public/avatar.glb, public/animations/wave.glb
- Related tests: none
- Status: verified
