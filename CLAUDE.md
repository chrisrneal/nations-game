# Rules for every AI session on this project

You are building a mobile-first PWA idle game: the player runs a warehouse. Orders and purchase orders come in, workers receive, pick, pack and load them onto trucks, and every truck pays when it leaves. Single player, offline-first, no backend. (Until 2026-10-06 this repo held an airport idle game, and before 2026-10-01 "Nations"; see decision records W1 and P1 in docs/DECISIONS.md.)

The owner is not a programmer. Explain outcomes in plain language, and ask questions only when a choice is irreversible. For anything else that's ambiguous, pick the reading most consistent with docs/ROADMAP.md, say which one you picked, and proceed.

## Start of every session
Read docs/ROADMAP.md (the plan), docs/DECISIONS.md (why things are built this way; start at W1, then P1) and docs/PROGRESS.md (where the project stands). docs/RULES.md is the game-rules spec: read it before touching the sim, the harness or anything that shows a number.

For build work, open by stating the task in three bullets and listing the files you will touch, then proceed without waiting for confirmation. This lets the owner follow along.

## Architecture rules
These rules keep the sim deterministic and offline earnings exact. Breaking one needs a new decision record in docs/DECISIONS.md first; the existing records (D6, S1-S6, S9, P3-P7, W1) explain each rule. Purity is enforced by the tsconfigs, ESLint and packages/harness/src/purity.test.ts (T3), so a violation fails `npm run check` or `npm test`.

- packages/sim and packages/contracts are pure TypeScript: no DOM, network, Date, Math.random, or imports except packages/contracts.
- State changes only through Commands processed by the sim step. The UI never writes state.
- The UI reads only the View, never State.
- Randomness comes from the seeded RNG in State. All game maths uses integers: money in cents, orders and stock in milli-units (P3).
- The host owns the clock. Offline earnings are the same sim stepped fast, up to the offline cap; catching up N ticks must equal stepping N ticks (P4).
- Tunable numbers live in packages/sim/src/tunables.ts with a documented band, and in the RULES.md tunables table; never inline.
- The UI reaches the sim only through the Host interface.
- Animate with CSS or direct DOM writes, not React re-renders every tick (P7).

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
Portrait, one-handed, primary actions in the bottom third, touch targets at least 44 px, no horizontal scroll at 360 px, safe areas respected, 60 fps with the CPU slowed 4x. Big numbers are formatted (1.2K, 3.4M, 5.6B).

## Finish every build session
1. `npm test` (which includes the Node-vs-Chromium determinism test) and `npm run check` pass. Never merge work that fails them.
2. Add a short entry to the session log in docs/PROGRESS.md: what changed, how to see it, what is left.
3. Log any gap or shortcut in docs/GAPS.md with the prompt or slice number.
4. Open a pull request with the title your prompt gives, and squash-merge it into main yourself once CI passes.
5. Reply to the owner in plain language, 5 lines max: what you built, how to see it on a phone, and any decision the owner must make.
