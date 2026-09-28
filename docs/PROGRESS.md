# Progress
Current phase: 0

## Gate 0 checklist
- [x] Sim core has no UI, DOM, network or clock imports (enforced by tsconfig, ESLint and packages/harness/src/purity.test.ts)
- [x] 1,000 seeds give identical hashes in browser and Node (packages/harness/src/determinism.test.ts, headless Chromium)
- [ ] Dummy AI and UI use the same command API (AI half done: dummy AI submits ordinary Commands through `Session`; UI half waits for LocalHost)
- [x] Save-reload-continue matches an uninterrupted run (property test in packages/sim/src/session.test.ts)
- [ ] 1,000 catch-up ticks under 2 s on a mid-range phone (desktop: ~14 ms in Node and Chromium; phone not yet measured)
- [ ] PWA installs and runs offline on iOS and Android
- [ ] Owner completes three sample decisions one-handed
- [ ] Independent review signs off the nine seams

## Session log

### 2026-09-27 - prompt 01, Repo setup (architect)
**Changed.** npm workspaces monorepo: packages/contracts (types only, one doc
comment per type naming the multiplayer need it protects), packages/sim (pure,
placeholder plus tunables.ts), packages/ai (placeholder), packages/harness
(placeholder CLI plus the purity invariant test), apps/web (Vite + React +
vite-plugin-pwa, one placeholder screen, src/platform reserved for lane P).
TypeScript strict, ESLint 9 flat config, Vitest + fast-check, GitHub Actions CI on
every pull request. Governance files written: CLAUDE.md, docs/ROADMAP.md,
docs/DECISIONS.md (D1-D9, S1-S9, T1-T6), docs/PROGRESS.md, docs/GAPS.md. No game
logic.
**How to see it.** `npm install`, then `npm run dev -- --host` and open the printed
LAN address on a phone (README.md has the install steps). `npm test`,
`npm run check` and `npm run harness` all run.
**Proof the purity guard works.** A scratch file in packages/sim using `Date.now`,
`Math.random`, `document`, `fetch` and `node:fs` failed all three guards (6 lint
errors, 3 type errors, 2 failing purity tests) and was removed.
**Left.** Everything in Gate 0 except criterion 1: step(), seeded RNG, state hash,
LocalHost in a Worker, IndexedDB saves, catch-up performance, the offline install
test on real devices, and the nine-seam review. See docs/GAPS.md.


### 2026-09-28 - prompt 03, Engine foundations (lanes S, A, H)
**Changed.** packages/sim: pure `step(state, commands)` returning new state and
events; counter-based seeded RNG stored in State; canonical-JSON state hash;
`CommandQueue` with validation; `Session` (queue + tick + command log, only
`advance` moves the tick); saves as snapshot + command log with
`schemaVersion`, an empty migration registry, and a hash check on load;
`viewFor` builds a nation's View with other nations' private fields left out;
controller slots switch mid-game via a `setController` command. One placeholder
command, `ping`, with no game meaning. Two engine limits in tunables.ts.
packages/ai: `dummyDecide(view, seed)`, a seeded dummy that reads only a View.
packages/harness: `npm run harness` (seeded games, `out/games.csv` +
`summary.txt`), `npm run harness -- determinism` (Node twice + Chromium),
`npm run harness -- bench`; the purity scan now also covers packages/ai.
**Results.** 1,000 seeds: identical hashes on repeat Node runs and in headless
Chromium 141. 100 ticks of dummy AI: zero rejected commands. Benchmark, 1,000
catch-up ticks, 6 nations, dummy AI everywhere: median ~13 ms in Node, ~14 ms in
Chromium on the build machine.
**How to see it.** `npm run harness -- determinism` prints PASS; `npm run harness
-- bench` prints the timing. Nothing visible on the phone yet.
**Left.** LocalHost in a Worker (lane P) so the UI uses the same command API;
the phone benchmark; contracts to absorb the sim's extended types. See
docs/GAPS.md.
