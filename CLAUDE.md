# Rules for every AI session on this project

You are building a mobile-first PWA game: the player runs a real nation in a staged 2030 world, alongside AI-run nations, and collaboration beats conquest. Single-player first; small async multiplayer later.

The owner is not a programmer. Explain outcomes in plain language, and ask questions only when a choice is irreversible. For anything else that's ambiguous, pick the reading most consistent with docs/ROADMAP.md, say which one you picked, and proceed.

## Start of every session
Read docs/ROADMAP.md (the plan and gates), docs/DECISIONS.md (why things are built this way) and docs/PROGRESS.md (where the project stands). docs/RULES.md is the game-rules spec and docs/AI_DESIGN.md is the AI design: read whichever one your work touches.

For build work, open by stating the task in three bullets and listing the files you will touch, then proceed without waiting for confirmation. This lets the owner follow along.

## Architecture rules
These rules keep the sim deterministic and let it run unchanged on a server later. Breaking one needs a new decision record in docs/DECISIONS.md first; the existing records (D6, S1-S9) explain each rule. Purity is enforced by the tsconfigs, ESLint and packages/harness/src/purity.test.ts (T3), so a violation fails `npm run check` or `npm test`.

- packages/sim and packages/contracts are pure TypeScript: no DOM, network, Date, Math.random, or imports except packages/contracts.
- State changes only through Commands processed by the sim step. UI and AI never write state.
- UI and AI read only the per-nation View, never full State. In multiplayer, the View is the anti-cheat boundary.
- Randomness comes from the seeded RNG in State. Economy maths uses integers.
- Every nation has a controller slot: human, ai or caretaker.
- Interactions between nations (offers, appeals, treaties) are State objects with expiry ticks. Nothing assumes the other side is online.
- Tunable numbers live in packages/sim/src/tunables.ts with a documented band, never inline.
- The UI reaches the sim only through the Host interface.

## Lanes (folder ownership)
Sessions often run in parallel, so each prompt names the lanes it may edit. Edit only those. Log anything needed elsewhere in docs/GAPS.md, then continue with what you can do.

- C: packages/contracts (only when your prompt says so)
- S: packages/sim
- A: packages/ai
- U: apps/web/src except apps/web/src/platform
- P: apps/web/src/platform and PWA config
- H: packages/harness
- D: docs/ design documents and data/

ROADMAP.md, DECISIONS.md and CLAUDE.md are architect-only: no lane edits them.

## Working method
- Work on a new branch named after your prompt. Small commits.
- Big prompts may hand independent parts to subagents, one lane each.
- Write tests first for sim and ai logic.
- Justify any new dependency in your summary.

## Finish every build session
1. `npm test` (which includes the Node-vs-Chromium determinism test) and `npm run check` pass. Never merge work that fails them.
2. Add a short entry to the session log in docs/PROGRESS.md: what changed, how to see it, what is left.
3. Log any gap or shortcut in docs/GAPS.md with the prompt number.
4. Open a pull request with the title your prompt gives, and merge it into main yourself once CI passes.
5. Reply to the owner in plain language, 5 lines max: what you built, how to see it on a phone, and any decision the owner must make.
