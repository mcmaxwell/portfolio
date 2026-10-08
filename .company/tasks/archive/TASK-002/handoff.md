# TASK-002 handoff (playable 3D portfolio)

Written by the Boss on 2026-10-07 so a fresh Boss session can continue without the long prior conversation.
Read this file, then `work-item.json` (acceptance criteria, approvals, decisions, qaOverrides), then only the stage contracts and reports named below.

## Where everything lives

- Target project: registered id `portfolio` (resolve its root with `scripts/company-map`).
- Isolated worktree for this task: the `TASK-002` directory under the company worktrees area for `portfolio`; branch `feat/task-002-3d-portfolio-game`, pushed to origin.
- Base of the task: `710f034`; PR base branch: `company/onboard-portfolio-task-001` (stacked, per the approval in work-item.json).
- Dev server: `next dev -p 3100` from the worktree (http://localhost:3100).
- Scratch evidence from earlier stages lives in the previous session's scratchpad and is not needed.

## Milestone status

| Milestone | State | Commit |
|---|---|---|
| M1 movement, clips, clothing bake | done, QA approved with user-approved deferrals | `afd4f0f` |
| M2 Play and Exit cinematic, loading, pause, failures, self-hosted font | done, QA approved | `729f9d6` |
| M3 campus, destinations, panels, camera rework, dusk visuals, body clearance | done, QA approved (`reports/33-qa-m3-verify.json`) with accepted residuals | `7b6b056` |
| M4 challenge, progress, touch controls | done, light QA approved (`reports/34-qa-m4.json`) | `9847be9` |
| M5 performance and accessibility (sound and quality presets deferred) | done, light QA approved (`reports/36-qa-m5.json`) | `3c888d6` |
| M6 Codex cross-review of the whole game, full QA, docs, PR | done: Codex rounds 37, 39, 43; full QA 40 approved; docs 42 | `a17b599` plus the records commit |

TASK-002 is closed and archived; follow-ups are on the board.
QA noted the worst toe overlap in prop corners is 7.8 cm (accepted residual, M5 polish) and suggested re-running the cold-entry hero-gap check on an idle machine in M5 (two spikes appeared only under host load average above 160).
Under heavy host load the full `npm test` can fail on timeouts; re-run the failing files alone with a raised `--testTimeout` before treating it as a regression.

## User decisions to honour (all recorded in work-item.json)

- Save time and tokens: M5 drops sound and quality presets; M4 and M5 use light QA (new features plus a short regression); the full deep QA runs once in M6; M4 runs `31-game-dev-m4.json` and `31b-mobile-dev-m4-touch.json` in parallel.
- Accepted residuals for M5 polish: toe up to about 6 cm into a prop in plinth and wall corners; faint interior wall streaks; cold load about 1.1 s longer (start texture generation at prefetch time in M5).
- Codex cross-review is mandatory for the final revision (M6); the dispatcher is `scripts/dispatch-task.sh` on the controller branch `feat/task-202-codex-cross-review-dispatch` (draft PR #50, not yet merged to main). Run it from that controller worktree with `--workdir` pointing at a clean portfolio worktree whose untracked `.company/tasks/active/TASK-002/` holds the reviewer contract; keep the nvm Node 17 bin (which carries codex) LAST on PATH.

## Operating rules learned in this task (put them in every delegation)

- Every headless Chrome must use a `--user-data-dir` inside the stage's output directory and delete it on exit and failure; leaked profiles once filled the disk (about 20 GB).
- Check free disk before and during browser work; stop under 5 GB.
- Stop every server you start by exact PID; never `pkill` by name (the dev server on 3100 must stay up).
- Run production builds in a copy of the tree, never in the worktree (the dev server shares `.next`).
- Required checks for every stage: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Never write evidence or screenshots under the repository or `.company/`.
- Copy acceptance criteria verbatim into reports; persist each report with `scripts/lib/agent_report.py --write`.
- Raw Mixamo FBX sources stay out of git (public repo); `ASSETS.md` documents re-download.

## Next actions in order

1. Launch `31-game-dev-m4.json` and `31b-mobile-dev-m4-touch.json` in parallel, then a light QA stage.
2. M5 contract: start procedural texture generation at prefetch time, make the page behind the game inert while playing, measure and record performance on named environments, polish the accepted residuals if cheap; light QA.
3. M6: commit, Codex cross-review of `710f034..HEAD` (fix loop), full QA, tech-writer docs, ledger with SR&ED (ask the user for hours once), PR with summary, evidence and known limitations.
