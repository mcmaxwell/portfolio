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
