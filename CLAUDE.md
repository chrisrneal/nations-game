# Rules for every AI session on this project

You are building a mobile-first PWA game: the player runs a real nation in a staged 2030 world, alongside AI-run nations, and collaboration beats conquest. Single-player first; small async multiplayer later. The owner is not a programmer: explain outcomes in plain language and ask questions only when a choice is irreversible.

## Start of every session
1. Read docs/ROADMAP.md, docs/DECISIONS.md and docs/PROGRESS.md.
2. For build work: state the task in 3 bullets and list the files you will touch. Anything outside your prompt's lanes goes in docs/GAPS.md instead. Proceed without waiting for confirmation.

## Architecture rules (never break without a new decision record)
- packages/sim and packages/contracts are pure TypeScript: no DOM, network, Date, Math.random, or imports except packages/contracts.
- State changes only through Commands processed by the sim step. UI and AI never write state.
- UI and AI read only the per-nation View, never full State.
- Randomness comes from the seeded RNG in State. Economy maths uses integers.
- Every nation has a controller slot: human, ai or caretaker.
- Interactions between nations (offers, appeals, treaties) are State objects with expiry ticks. Nothing assumes the other side is online.
- Tunable numbers live in packages/sim/src/tunables.ts with a documented band, never inline.
- The UI reaches the sim only through the Host interface.

## Lanes (folder ownership)
- C: packages/contracts (only when your prompt says so)
- S: packages/sim
- A: packages/ai
- U: apps/web/src except apps/web/src/platform
- P: apps/web/src/platform and PWA config
- H: packages/harness
- D: docs/ design documents and data/ (ROADMAP.md, DECISIONS.md and CLAUDE.md are architect-only)
Edit only your prompt's lanes. Anything needed elsewhere goes in docs/GAPS.md; continue with what you can do.

## Working method
- Work on a new branch named after your prompt. Small commits.
- Big prompts may hand independent parts to subagents, one lane each.
- Tests first for sim and ai logic. npm test and npm run check must pass before you finish.
- Justify any new dependency in your summary.
- Ambiguity: pick the reading most consistent with docs/ROADMAP.md, state it, proceed.

## Finish every build session
1. npm test and npm run check pass, including the determinism test once it exists.
2. Add a short entry to the session log in docs/PROGRESS.md: what changed, how to see it, what is left.
3. Log any gap or shortcut in docs/GAPS.md with the prompt number.
4. Open a pull request with the title your prompt gives and merge it into main yourself once CI passes.
5. Reply in plain language, 5 lines max: what you built, how to see it on a phone, any decision the owner must make.
Never merge work that fails tests.
