# Feature Registry: portfolio

Add concise feature-to-file entries after verified work items.

## Interactive 3D talking-avatar hero

Interactive WebRTC-driven 3D avatar with voice chat via OpenAI Realtime API. Uses React Three Fiber to render GLTF model, lip-sync from audio, and gesture animations. Browser calls `/api/realtime-session` to get an ephemeral token; never receives the long-lived OPENAI_API_KEY.
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
