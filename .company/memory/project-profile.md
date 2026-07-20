# Project Profile: portfolio

Record verified architecture, commands, and human decisions.

## Verified Profile

- **Language**: TypeScript with strict mode enabled.
- **Node engine**: 22.x
- **Framework**: Next.js 14.1.4 with App Router.
- **React**: React 18.
- **Package manager**: npm (lockfile committed).
- **Key npm scripts**: 
  - dev: `next dev`
  - build: `next build`
  - start: `next start`
  - lint: `next lint`
  - deploy: `vercel --prod`
  - Note: no test runner configured; no test suite exists.
- **Rendering model**: App Router with React Server Components by default; interactive UI opts into client components.
- **Theming**: `next-themes` (attribute=class, defaultTheme=dark, enableSystem); custom Tailwind 'terminal' palette with term.* color tokens.
- **3D/animation libraries**: three ^0.163, @react-three/fiber ^8.16.2, @react-three/drei ^9.105.4, framer-motion ^11.
- **Analytics**: Google Analytics via gtag (loaded in app/layout.tsx with next/script afterInteractive).
- **External LLM service**: OpenAI Realtime API (gpt-realtime-2, voice cedar) — server endpoint mints ephemeral keys; client never sees the long-lived OPENAI_API_KEY.
- **Fonts**: JetBrains Mono from next/font/google (self-hosted, exposed as --font-mono CSS var).
- **Styling utilities**: TailwindCSS ^3.3, tailwind-merge, clsx (cn helper), tailwindcss-animate, autoprefixer/postcss.
- **Deployment**: Vercel.

### Configuration ambiguity (hypothesis)

Next.js 14.1.4 has both next.config.mjs (active; defines CSP/security headers) and next.config.ts (unused stub). Next 14 loads .js/.mjs config natively but does not load .ts config (TS config support landed in Next 15). Also duplicate postcss.config.js and postcss.config.mjs present; consolidation out of scope for this audit.
