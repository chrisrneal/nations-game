# Progress
Current phase: 0

## Gate 0 checklist
- [x] Sim core has no UI, DOM, network or clock imports (enforced by tsconfig, ESLint and packages/harness/src/purity.test.ts)
- [x] 1,000 seeds give identical hashes in browser and Node (packages/harness/src/determinism.test.ts, headless Chromium)
- [x] Dummy AI and UI use the same command API (both submit ordinary Commands; the UI through LocalHost in a Web Worker, prompt 04)
- [x] Save-reload-continue matches an uninterrupted run (property test in packages/sim/src/session.test.ts)
- [ ] 1,000 catch-up ticks under 2 s on a mid-range phone (desktop: ~14 ms; the app's Saves tab now has a speed check to run on a real phone)
- [ ] PWA installs and runs offline on iOS and Android (passes in headless Chromium at 360 px: installable, opens offline; real iPhone and Android still to be tried by the owner)
- [ ] Owner completes three sample decisions one-handed (three sample cards built and checked by touch at 360 px; waiting on the owner)
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

### 2026-09-28 - prompt 04, App foundations (lanes P and U)
**Changed.** Platform (apps/web/src/platform): the sim now runs in a Web Worker
behind Comlink. `GameEngine` owns the session and the clock (paused, 1x, 4x) and
runs the dummy AI for all 16 nations the player does not control, through the
same command API the player uses. `LocalHost` implements the contracts `Host`
(submit, subscribe, setPace) plus new game, three save slots and an autosave in
IndexedDB (every 10 ticks and whenever the app is hidden), and an on-device speed
check. Service worker precaches everything including the worker, so the app opens
in airplane mode; vercel.json stops the service worker file being cached stale.
Screens (apps/web/src): start screen (continue, load, choose one of the 17 real
nations), decision inbox as home with three sample cards (2-3 options, one-line
consequence each, options in a bottom sheet under the thumb), world map with the
17 nations and lines sized by structural ties, a four-number resource strip, a
why-sheet on every number, a live month counter with pause, 1x and 4x, and saves.
**Proof.** `apps/web/src/boundary.test.ts` fails if any interface file imports the
sim, the AI, Comlink or a platform internal, or touches Worker or IndexedDB
directly. Platform tests cover pace, AI ticking, "only your own nation",
save-close-load continuing the same game hash-for-hash. `npm run build` then
`npm run e2e --workspace web` drives headless Chromium as a 360 px touch phone:
21/21 checks - installable, opens offline, no horizontal scroll on any screen,
three decisions by touch with options in the bottom third, save, close, reopen
offline, load continues the tick count (13 -> 15), 60.1 fps at 4x with the CPU
slowed 4x.
**How to see it.** Open the Vercel production address on the phone (Safari on
iPhone, Chrome on Android), add it to the home screen, open it once online, then
try airplane mode. README.md has the steps.
**Left.** Real-device install test and the owner's one-handed trial; the phone
speed check reading; cards, resources and trust are placeholders until the Phase 1
economy (docs/GAPS.md, prompt 04).

### 2026-09-27 - prompt 02, World 2030 and rules (lane D)
**Changed.** `data/world-2030.json` replaced: 17 playable nations and 6 background
regional aggregates, each with population, GDP (nominal and PPP), a 2026-2031
baseline growth path, food and energy balances, critical minerals, climate exposure,
pandemic preparedness, bloc and alliance memberships, top trade partners and a
one-line justification. Population from UN World Population Prospects 2024 (medium
variant), GDP and growth from IMF WEO April 2026, food from FAO cereal import
dependency, energy from World Bank net energy imports, climate from the ND-GAIN
Country Index 2024, preparedness from the Global Health Security Index 2021.
`data/SOURCES.md` written: every source with link, publication date and retrieval
date, every formula, an Estimates table naming every value that is not a published
figure, the owner's seven contested-territory rulings, known weaknesses, and how to
regenerate the file. `docs/RULES.md` written: four resources, per-tick production and
consumption, expiring bilateral offers with standing-policy defaults, a slow climate
ratchet and a fast pandemic spike beaten through shared pools, own-baseline scoring
times a collective multiplier with the argument for why sabotage cannot pay, AI
personalities derived from eight structural inputs, starting trust from structural
ties only, 53 tunables with bands, and every rule as decision cards plus standing
policies. Each rule names its gate metric. No code changed.

**Owner decisions taken this session.** 17 nations rather than 15 or 16 (Canada
added, so fair share is 5.9%); four resources, not five, with minerals as a
production multiplier instead of a stock; one tick = one world month and a 60-tick
game; and all seven contested territories ruled case by case.

**How to see it.** `cat data/world-2030.json | head -60` for the shape, or open
`docs/RULES.md` and read sections 1 to 5 — that is the game. `node -e
"const d=require('./data/world-2030.json'); console.table(d.nations.map(n=>({id:n.id,
pop:n.population2030/1e6, pppBn:n.gdp2030PppBn, food:n.food.selfSufficiencyIndex,
energy:n.energy.selfSufficiencyIndex})))"` prints the board. `npm test` and `npm run
check` both pass (100 tests, 1 skipped for a missing Chromium).

**Verified.** Board population reconciles to the WPP 2030 world total to within
0.00% and PPP GDP to the IMF 2030 world total exactly. GHS Index values spot-checked
against the publication (United States 75.9 highest, Egypt 28.0, global average
38.9). Every worked example in RULES.md recomputed from the committed file, including
the full starting-trust matrix (lowest mean Nigeria 30.3, highest China 70.1).

**Left.** Nothing reads the world file into the sim, the 53 tunables are not yet in
`tunables.ts`, and `packages/harness/src/roster.ts` still parses the old placeholder
shape and now loads eight fictional nations - all in docs/GAPS.md under prompt 02,
with six open design questions for the owner at the end of docs/RULES.md.
