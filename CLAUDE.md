# Rules for every AI session on this project

You are building Snack Attack, a mobile-first PWA daily puzzle for the owner's two kids. Friends placed on a grid throw snacks in chess patterns (rook, bishop, king, knight, plus a Nurse) from lunchboxes to hungry kids. Each kid wants one snack, worked out from a clue card (main mode, a 9-year-old) or shown as a picture (Kindy mode, a 4-year-old). Set up, press Go, watch the wave. There is one daily puzzle a day plus practice, and every board is proved solvable first. Single player, offline-first, no backend. (Until 2026-10-20 this was a warehouse simulator, until 2026-10-06 an airport idle game, and before 2026-10-01 "Nations"; see decision records K1, W8, W1 and P1 in docs/DECISIONS.md.)

The owner is not a programmer. Explain outcomes in plain language, and ask questions only when a choice is irreversible. For anything else that's ambiguous, pick the reading most consistent with docs/ROADMAP.md, say which one you picked, and proceed.

## Start of every session
Read docs/ROADMAP.md (the plan), docs/DECISIONS.md (why things are built this way; start at K1) and docs/PROGRESS.md (where the project stands). docs/RULES.md is the game-rules spec: read it before touching the sim, the harness or anything that shows a number.

For build work, open by stating the task in three bullets and listing the files you will touch, then proceed without waiting for confirmation. This lets the owner follow along.

## Architecture rules
These rules keep the sim deterministic and every puzzle the same on every device. Breaking one needs a new decision record in docs/DECISIONS.md first; the existing records (D6, S1-S3, S5, S6, S9, P5, P7, K1, K3) explain each rule. Purity is enforced by the tsconfigs, ESLint and packages/harness/src/purity.test.ts (T3), so a violation fails `npm run check` or `npm test`.

- packages/sim and packages/contracts are pure TypeScript: no DOM, network, Date, Math.random, or imports except packages/contracts.
- State changes only through Commands processed by the sim step. The UI never writes state.
- The UI reads only the View, never State.
- Randomness comes from seeded RNGs (the puzzle generator's seed). All game maths uses whole numbers: squares, beats, points (K1).
- The sim never reads a clock. A wave is resolved whole when Go is pressed; the host passes in the day number (K3).
- Every puzzle a player sees has passed the clue checker and the solver (K5).
- Tunable numbers live in packages/sim/src/tunables.ts with a documented band, and in the RULES.md tunables table; never inline.
- The UI reaches the sim only through the Host interface.
- Animate with CSS or direct DOM writes, not React re-renders every frame (P7).

## Lanes (folder ownership)
Sessions may run in parallel, so each prompt names the lanes it may edit. Edit only those. Log anything needed elsewhere in docs/GAPS.md, then continue with what you can do.

- C: packages/contracts (only when your prompt says so)
- S: packages/sim
- U: apps/web/src except apps/web/src/platform
- P: apps/web/src/platform and PWA config
- H: packages/harness
- D: docs/ design documents

ROADMAP.md, DECISIONS.md and CLAUDE.md are architect-only: no lane edits them.

## Working method
- Work on a branch named after your prompt (or the branch your session is given). Small commits.
- Big prompts may hand independent parts to subagents, one lane each.
- Write tests first for sim logic.
- Justify any new dependency in your summary.

## Phone UX rules
Portrait, one-handed, primary actions in the bottom third, touch targets at least 44 px (64 px in Kindy mode), no horizontal scroll at 360 px, safe areas respected, 60 fps with the CPU slowed 4x. Kindy mode has no text in play. Big numbers are formatted (1.2K, 3.4M, 5.6B).

## Finish every build session
1. `npm test` (which includes the Node-vs-Chromium determinism test) and `npm run check` pass. Never merge work that fails them.
2. Add a short entry to the session log in docs/PROGRESS.md: what changed, how to see it, what is left.
3. Log any gap or shortcut in docs/GAPS.md with the prompt or slice number.
4. Open a pull request with the title your prompt gives, and squash-merge it into main yourself once CI passes.
5. Reply to the owner in plain language, 5 lines max: what you built, how to see it on a phone, and any decision the owner must make.
