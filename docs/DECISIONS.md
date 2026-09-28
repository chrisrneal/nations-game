# Decision records

One record per decision. Each says what was decided, why, what it costs, and what
would have to happen to reverse it. **Changing one of these needs a new record
appended here, not an edit to an old one** - later sessions rely on these being
stable. `D` records come from docs/ROADMAP.md, `S` records cover the nine
architecture seams, `T` records cover the toolchain chosen in prompt 01.

Status of everything below: **accepted**, 2026-09-27, prompt 01.

---

## D1 - Real-time ticks on a wall clock
**Decision.** The world advances on real time. Single-player can pause, run 1x or
4x, or use a live-clock mode that advances while the app is closed. Multiplayer
runs one fixed cadence. Players act through standing policies plus a short queue
of decisions.
**Why.** A 2-5 minute check-in must be a complete session on a phone, and an
async multiplayer game of days to weeks cannot wait for anyone to be present.
**Cost.** Absence has to be a first-class case everywhere: recaps, expiry ticks,
caretaker AI. Nothing may need a human to be online.
**Reversing it.** Turn-based play would remove the away-recap and live-clock work
but breaks D2's async games; it would need a new record and a rewrite of the host.

## D2 - Multiplayer is small and async
**Decision.** 4-8 nations, games lasting days to weeks, no real-time lobby.
**Why.** It fits phone play and keeps hosting cheap; it also matches the fixed
cadence in D1.
**Cost.** Every interaction needs an expiry tick and a default answer (S8).
**Reversing it.** Larger or real-time games change the cost model and the Host
implementation, not the sim.

## D3 - Co-opetition scoring
**Decision.** Final score = a nation's growth against its own 2030 baseline
trajectory, multiplied by a collective multiplier from how well the world met
shared goals. No binary "everyone loses". A trailing nation never gains by
sabotage.
**Why.** The baseline is what lets a small nation win, so a player is never out of
the running for being small; the multiplier is what makes cooperation pay without
removing competition.
**Cost.** Baselines must be produced for every nation from real projections (D9)
and kept stable across a game.
**Reversing it.** Any other scoring rule invalidates the Gate 1-2 balance
thresholds, which are written in terms of baseline-relative performance.

## D4 - Limited war exists, in Phase 4, abstracted
**Decision.** War is possible but abstract, arrives in Phase 4, and must never be
the dominant strategy.
**Why.** A world with no coercion makes cooperation meaningless; a world where
conquest wins makes it pointless.
**Cost.** Gate 4 has to prove warmonger and betrayer archetypes stay at or under
1.5x fair share.
**Reversing it.** Dropping war entirely is easier than adding it later; adding
detailed war would break the mobile depth budget.

## D5 - AI nations use deterministic utility AI, no LLM
**Decision.** Nation behaviour is scored by rules in packages/ai. No language model
takes decisions.
**Why.** Determinism lets 200-seed balance runs and exact replays exist at all, it
costs nothing per game, it works offline, and it can be explained to the player.
**Cost.** Personality and negotiation have to be engineered, not prompted.
**Reversing it.** An LLM could only ever generate flavour text, and even that must
sit outside the sim; decisions inside would break D5, seam 5 and the harness.

## D6 - The sim core is a pure TypeScript package
**Decision.** packages/sim depends only on packages/contracts: no DOM, network,
Date or Math.random. It runs in a Web Worker now and unchanged on a server later.
**Why.** This is the single load-bearing constraint. It buys determinism, headless
balance runs, replay, and a multiplayer server that runs the same package unforked.
**Cost.** Anything platform-shaped (storage, clock, transport) must be injected by
the host, which is more plumbing up front.
**Reversing it.** Nothing else in this document survives it. See T3 for how it is
enforced mechanically rather than by good intentions.

## D7 - MVP is trade plus crisis response
**Decision.** Phase 1 economy and trade, Phase 2 crises and trust (the MVP, and a
go/no-go gate). Joint projects Phase 3. Treaties, alliances, blocs and limited war
Phase 4.
**Why.** Trade and crisis response are the smallest pair that can show whether
cooperation is fun. Everything else is an amplifier.
**Cost.** Interesting systems stay unbuilt for a long time; Gate 2 may say the core
is not fun and send Phase 2 round again.
**Reversing it.** Reordering phases without passing Gate 2 risks polishing a game
nobody wants to play a second time.

## D8 - Depth lives in the simulation, not the interface
**Decision.** Complexity goes into the model. The screens stay a decision inbox,
a relationship map, policy dials, an away recap and why-sheets.
**Why.** The game is played on a phone, one-handed, in short sessions.
**Cost.** Every system must be expressible as decision cards plus standing
policies before it is coded; if it cannot be, it gets simplified.
**Reversing it.** A desktop-style interface would break the depth budget audited at
every gate.

## D9 - Real nations in a staged 2030 world
**Decision.** About 15 major nations modeled individually and playable; the rest of
the world as regional aggregates. Starting data from published 2030 projections in
data/world-2030.json, sourced in data/SOURCES.md. AI personality comes from
structural facts (trade dependence, energy imports, alliances, exposure), never
stereotypes. Starting trust comes from real alliance and trade ties. No real people
appear as characters.
**Why.** Recognisable nations make the world legible without teaching a fictional
setting; structural derivation keeps the portrayal defensible and the AI honest.
**Cost.** Data provenance is an ongoing obligation, and the roster is a balance
surface (no nation may top the score more than 2x its fair share).
**Reversing it.** Fictional nations would remove the sourcing burden and the
sensitivity, at the cost of the premise.

---

## S1 - Pure sim core: `step(state, commands) -> state + events`
**Decision.** One synchronous function is the whole simulation surface. No side
effects, no I/O, no ambient time.
**Why.** Everything testable, replayable and portable follows from this shape.
**Cost.** Long operations must be modeled as state over ticks, not as async work.
**Reversing it.** Would invalidate the determinism test and the harness.

## S2 - Commands are the only mutation
**Decision.** UI and AI both produce `Command` objects (nationId, tick, type,
payload). Nothing else writes state. The sim validates on step.
**Why.** One audited path means a server can re-validate intent from a client it
does not trust, and a command log replays a game exactly.
**Cost.** Convenience mutations are banned, even in tests.
**Reversing it.** Direct writes would break saves, replay and multiplayer at once.

## S3 - Host interface: submit, subscribe, setPace
**Decision.** The UI reaches the sim only through `Host`. LocalHost wraps a Web
Worker today; RemoteHost talks to a server later. Everything is async.
**Why.** The interface cannot tell local from remote, so multiplayer needs no UI
rewrite - and a UI that can only submit commands cannot write state.
**Cost.** Even single-player reads go through an async boundary.
**Reversing it.** Direct sim calls from the UI would make Phase 5 a rewrite.

## S4 - The host owns the clock
**Decision.** The sim counts ticks and knows nothing about time. The host decides
when a tick happens, and catch-up after an absence is "run N ticks fast".
**Why.** It makes pause, 4x, live-clock and a fixed multiplayer cadence the same
mechanism, and keeps `Date` out of the sim.
**Cost.** A catch-up performance budget (Gate 0: 1,000 ticks under 2 s on a
mid-range phone) becomes a hard requirement.
**Reversing it.** Time inside the sim would break determinism and offline play.

## S5 - Determinism: seeded RNG in State, integer maths, stable order
**Decision.** Randomness comes from an RNG whose state lives in `State`. Economy
maths uses integers. Iteration over nations has a stable order. A state-hash test
runs on every build.
**Why.** Two machines must agree; 1,000 seeds must hash identically in browser and
Node; bugs must reproduce from a save.
**Cost.** No floats in economy paths, no `Object.keys` ordering assumptions, and
every new system needs its own hash coverage.
**Reversing it.** Nothing about multiplayer, replay or balance testing works
without it.

## S6 - Per-nation View for UI and AI
**Decision.** UI and AI read a `View`, never `State`. In multiplayer only Views
cross the network.
**Why.** It is the anti-cheat boundary, and it is what makes "the AI does not
cheat" checkable instead of promised.
**Cost.** Every new state field needs a deliberate decision about who can see it.
**Reversing it.** Sending State to a client leaks hidden information permanently -
it cannot be walked back after a release.

## S7 - Controller slot per nation
**Decision.** Every nation is `human`, `ai` or `caretaker`, switchable mid-game.
**Why.** A dropout in a week-long game must not end it; a player must be able to
hand their nation to the AI and take it back.
**Cost.** The AI must be able to play any nation from standing policies at any
moment, including one it did not start.
**Reversing it.** Fixed roles make async multiplayer fragile.

## S8 - Interactions are State objects with expiry ticks
**Decision.** Offers, appeals and treaties are stored state with an expiry tick.
Absent players answer through standing policies.
**Why.** Nothing may assume the other side is online (D1, D2).
**Cost.** Every interaction type needs a default answer and a timeout rule.
**Reversing it.** Synchronous negotiation would exclude async play.

## S9 - Saves are snapshot plus command log, versioned
**Decision.** `SaveFile` is `{ schemaVersion, snapshot, commandLog }`, with
migrations. The same format serves resume, replay, bug reports and the harness.
**Why.** One format, four jobs; and save-reload-continue can be tested against an
uninterrupted run.
**Cost.** Schema changes need migrations from day one.
**Reversing it.** A snapshot-only save loses replay and repro.

---

## T1 - npm workspaces, no pnpm or Turborepo
**Decision.** Plain npm workspaces: `packages/*` and `apps/*`, one lockfile.
**Why.** The owner is not a programmer; `npm install` at the root must be the only
setup step, with nothing extra to install first. CI uses the same `npm ci`.
**Cost.** No remote build cache, slower installs than pnpm.
**Reversing it.** Moving to pnpm later is a lockfile change and a CI edit.

## T2 - Packages export TypeScript source, no build step
**Decision.** Each package's `exports` points at `src/index.ts`. Nothing compiles
packages before use; Vite, Vitest and tsx consume TypeScript directly.
**Why.** Parallel sessions never hit "did you rebuild the package first?", and
typecheck stays a single source of truth.
**Cost.** Any future consumer outside this repo (a server in Phase 5) needs a build
step added then.
**Reversing it.** Add `tsc` builds per package and repoint `exports`.

## T3 - Purity enforced three ways
**Decision.** packages/sim and packages/contracts are kept pure by (a) tsconfig
`lib` without DOM and `types: []`, (b) ESLint restricted globals plus a local
`nations/allowed-imports` rule, (c) a text scan of their source in
packages/harness/src/purity.test.ts.
**Why.** Gate 0 criterion 1 has to be provable. Lint alone can be disabled inline;
types alone miss `Date` and `Math.random`; a text scan alone is crude. Together
they have no easy bypass.
**Cost.** Three places to update if the rule ever changes, and occasional friction
when a legitimate exception appears.
**Reversing it.** Needs a new record here first, by design.

## T4 - Vitest with fast-check, node environment only for now
**Decision.** One root Vitest config, `environment: 'node'`, tests live beside the
code as `*.test.ts`. fast-check is in place for property tests of sim logic.
**Why.** The sim is pure, so it needs no browser to test; property tests are the
right tool for invariants like conservation and non-negative stocks.
**Cost.** UI tests need a jsdom project added when lane U writes the first one.
**Reversing it.** Adding a jsdom project is additive.

## T5 - tsx runs the harness CLI
**Decision.** `npm run harness` runs `tsx packages/harness/src/cli.ts`.
**Why.** Node's own type stripping requires `.ts` specifiers and trips over the
package-style imports used everywhere else; tsx runs the same source the tests run,
with no build step (T2). It is a dev dependency only and never ships to the browser.
**Cost.** One more dev dependency.
**Reversing it.** Compile the harness with tsc, or move to Node type stripping once
it handles these imports.

## T6 - A local ESLint rule instead of `no-restricted-imports` patterns
**Decision.** Import restrictions in the pure packages use a small rule defined in
eslint.config.js (`nations/allowed-imports`) that takes an explicit allow-list.
**Why.** ESLint's pattern negations (gitignore syntax) did not reliably express
"nothing except these", and a guard that silently passes is worse than none. The
local rule is about twenty lines and says exactly what it means.
**Cost.** A little custom code in the lint config.
**Reversing it.** Swap back if upstream gains a first-class allow-list option.
