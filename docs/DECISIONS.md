# Decision records

One record per decision. Each says what was decided, why, what it costs, and what
would have to happen to reverse it. **Changing one of these needs a new record
appended here, not an edit to an old one** - later sessions rely on these being
stable.

**Read K1 first (then K5-K11 for what was added since), then W8, then W1, then P1.** On 2026-10-20 the warehouse
became Snack Attack, a daily grid puzzle for kids (K1); `K` records cover it,
and K1 lists which older records still bind. On 2026-10-07 the idle game was removed
and the warehouse management system became the whole game (W8). On 2026-10-06 the airport game became a warehouse
game (W1); on 2026-10-01 "Nations" had become the airport game (P1). P1 lists
which of the older records still bind (the architecture ones) and W1 which of
the `P` records carry over, renamed. `W` records cover the warehouse game, `P`
records the airport game. Older prefixes: `D` came from the Nations roadmap, `S` are the nine architecture seams,
`T` the toolchain, `G` gate rulings, `H` the Nations "100x" work.

Status of the D, S and T records: **accepted**, 2026-09-27, prompt 01, unless a
record gives its own status.

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

---

## G1 - Gate 2 archetype line reworded; top-scorer line waived, then pooled
**Status.** **Accepted**, 2026-09-30, prompt 16, on the owner's two rulings. It
refines the Cost line of D4 and changes what docs/ROADMAP.md says for Gate 2 and
Gate 4; it does not edit D4.

**Decision.**
1. **Gate 2 criterion 2 is reworded to what it protects against.** Old: "no
   archetype over 1.5x fair share with nations assigned at random". New: *"No
   defecting archetype (free-rider, hoarder, exploiter, isolationist) tops the
   score in more than 1.5x its fair share, and none tops it more often than the
   reciprocal cooperator, with nations assigned at random."*
   - An archetype's fair share is its share of the nation-seats dealt (about one
     in five each), which is what the harness already measures ("tops / fair
     share"). The reciprocal cooperator is the shipped AI, as the harness has
     graded it since prompt 13.
   - "More often than the cooperator" is compared as a multiple of fair share,
     not as a raw count. The seat draw is random (628 cooperator seats against 730
     free-rider seats on seeds 1-200), and a raw count would let that draw decide
     the line. With equal seats the two readings agree.
   - The cooperator is exempt from the 1.5x ceiling. Its multiple is still
     reported, so the owner can see it, but it is not graded.
2. **Gate 4's line does not have Gate 2's flaw as written, but it is reworded to
   close two weaknesses.** The line names only the defectors ("warmonger and
   betrayer at or under 1.5x fair share"), so unlike Gate 2's it does not put the
   cooperator under a ceiling it cannot meet. The weaknesses are:
   - It has no "not more often than the cooperator" clause. D4 says war must
     never be the dominant strategy, and a warmonger at 1.4x while the cooperator
     sits at 1.3x passes the old line while being dominant. Gate 4 now reads:
     *"warmonger and betrayer each at or under 1.5x fair share, and neither tops
     the score more often than the reciprocal cooperator, with nations assigned at
     random."*
   - A ceiling of 1.5x depends on the mix of archetypes dealt. If a warmonger or
     betrayer trades as well as the cooperator, the good traders share the wins
     and each lands near (archetypes dealt) / (archetypes that trade well), which
     is 1.75x with seven archetypes and four good traders. That is Gate 2's flaw
     again, by structure. It cannot be judged until the archetypes exist, so the
     Gate 4 prompt must state the archetype mix and the expected multiple for a
     good trader before any grading. If the ceiling cannot be met by
     structure, the architect rules before the run, never after it.
3. **The top-scorer line (Gate 1 criterion 5, GATE-2 line 9b: no nation tops more
   than 2x its fair share, 11.8%) is waived a second time, for Gate 2 only.** The
   waiver is recorded in docs/gates/GATE-2.md (Waivers), citing
   docs/balance/gate2-prompt15.md section 5. Nothing is tuned to it.
4. **From Gate 3 on, the line is graded pooled over 800 games, not per 200.**
   The limit stays at 2x fair share (11.8% with 17 playable nations, at most 94
   wins in 800 games). The games are four consecutive 200-game ranges on seeds
   that nobody tuned on, in both the archetype games and the Gate 1 mix, and the
   most frequent top scorer is graded on the pooled count. Each range is still
   reported, for information only. The threshold and the 800 are fixed now, before
   any run they will grade. The second option in prompt 15 section 6 ("2x the
   fair share of the nations that can win") is rejected.

**Why.**
- **Item 1.** As worded the line could not pass while Gate 1 holds. Two archetypes
  trade well and three trade badly on purpose, so the two good traders took 170 of
  200 wins on 40% of the seats (docs/balance/gate2-p2-prompt09.md). To bring every
  archetype under 1.5x the defectors would have to win as often as the
  cooperator, which contradicts Gate 1's "trading beats isolating by 15%". What
  the line was written to stop is defection paying. Two checks say that
  directly: no defector over 1.5x, and none ahead of the cooperator. Prompt 14
  already fixed the real defect behind it (free-riding paid): the free-rider
  tops 1.05x and 1.15x on seeds 1-200 and 201-400, below the cooperator's 3.90x
  and 3.50x, so the reworded line is met by the numbers we have. The re-review
  (prompt 20) still has to confirm it for all four defectors.
- **Item 2.** The Gate 4 fix costs one clause and keeps D4's "never dominant"
  honest. The mix problem is real but unmeasurable today, so the record makes the
  Gate 4 prompt name it in advance instead of guessing now.
- **Item 4, why pooled.** Prompt 15 section 5 shows that 200 games is too few for
  an 11.8% line. Only about 11-12 of 17 nations can realistically win, and a
  perfectly fair game with 12 equally likely winners has its top nation over
  11.8% in 47% of 200-game ranges. I re-ran that simulation for this record
  (scratch script, not committed) and got the same figures, then ran it at 800:

  | Equally likely winners | Fair game, one 200-game range over 11.8% | Fair game, pooled 800 over 11.8% |
  |---|---|---|
  | 17 | 1.5% | 0.0% |
  | 14 | 12.4% | 0.0% |
  | 12 | 46.9% | 0.6% |
  | 11 | 75.8% | 5.1% |

  Pooling therefore passes a fair game and still catches a biased one: one
  nation whose true win rate is 13% is flagged 83% of the time at 800 games (70%
  at 200), and one at 15% is flagged 99.6% of the time. A pass now means fairness,
  where before it was mostly luck.
- **Item 4, why not "the nations that can win".** It sets the denominator from the
  results, so it is circular and breaks the rule that thresholds are fixed before
  the results they grade (ROADMAP, Gate rules). It also removes the nations that
  cannot win, Japan, Korea and Turkiye at the shortfall cap, from the sums, so the
  line would pass by excluding the unfairness GO-NO-GO section 2 points at.

**Cost.**
- **The top-scorer line will fail at Gate 3 on today's game.** Saudi Arabia tops
  21.0-22.5% on seeds 1-400, so a pooled grade fails by a wide margin. Gate 3
  cannot close until a fairness change holds on pooled fresh seeds. No prompt
  for it is scheduled here. Prompt 15's rule (reverted in c9f1c4b, 276f1bf and
  40741f6) took the worst nation to 12-14% per range and is the obvious first
  try; its pooled figure was never measured.
- Grading the line takes four times as many games (the gate2 suite is about a
  minute per 200 games, so about four to six minutes for 800). The
  harness needs a pooled mode for the gate2 suite; Gate 1's suite already
  reports pooled numbers.
- The line still grades only the ceiling. Whether every nation *can* win is a
  separate question (a floor), and it is not part of this record. The
  Credit-buyer lever in prompt 17 is aimed at it.
- The reworded Gate 2 line does not ask whether cooperation wins against other
  cooperators, only whether defection pays. The current bots cannot test that.
- Lane H must change `gate2.ts` and `packages/ai/src/gate2.test.ts` to grade the
  new wording (logged in docs/GAPS.md, prompt 16).

**Reversing it.** Restore the old Gate 2 wording (it cannot pass while Gate 1
holds), grade per 200 games again (which mostly measures luck), or add a floor
for nations that cannot win. Each needs a new record; none touches the sim.

---

`H` records come from the owner's 100x mandate (2026-09-30): one autonomous
session acting as architect, product engineer and release engineer, with docs/100X.md
as its plan.

## H1 - An autonomous session may act as architect for the 100x work
**Status.** Accepted, 2026-09-30, by the owner's instruction to "work end to end and
ship" without review, asking questions only for something destructive.
**Decision.** For the 100x work the session edits every lane, including
docs/ROADMAP.md and this file, one slice per pull request, and merges each slice
itself once CI is green. Each slice still passes `npm test` and `npm run check`,
logs itself in docs/PROGRESS.md and its shortcuts in docs/GAPS.md. The eight
architecture rules in CLAUDE.md are unchanged and still enforced by the tests.
**Why.** The owner is not available and asked for structural change, which crosses
lanes by nature (a new collaboration system touches contracts, sim, AI, UI and
harness). Lanes exist so parallel sessions do not collide; there is one session.
**Cost.** No second pair of eyes before merge. Mitigated by small slices, tests
first for sim and AI logic, and the harness measuring every balance change.
**Reversing it.** Revert any slice's squash commit; later slices name what they
depend on.

## H2 - New systems are gated on invariants and decisions, not on fairness lines
**Status.** Accepted, 2026-09-30. Replaces the ROADMAP gate rule "No new
collaboration system before Gate 2 passes".
**Decision.** A new system may merge when: determinism, conservation, no negative
stocks and 0 crashes hold; sabotage still never pays (RULES 5.3); trading still
beats isolating; and the system creates a decision with no single right answer
(its harness line says how often each option is chosen). The fairness lines (top
scorer, archetype shares) are measured and reported with every balance change,
never used to block or revert it. Gate 2's playtest line stays the go/no-go
question for Phase 3 being *finished*.
**Why.** Gate 2 needs "most testers want another game". The go/no-go review
(docs/gates/GO-NO-GO.md) found every monthly decision has an obvious answer, and
nobody has played it. Two attempts to fix that inside the Phase 2 loop failed on
fairness lines no player sees (docs/balance/gate2-prompt17b.md). The rule
therefore forbade the one thing that could make the gate passable: a real
decision. Prompt 17b's own report recommends joint projects next.
**Cost.** A system may ship that makes one nation win more often. That is visible
in every report and can be tuned later; a game nobody wants to replay cannot.
**Reversing it.** Restore the ROADMAP line; the slices built under this record
revert cleanly one by one.

## H3 - No dead zone in the shortfall penalty
**Status.** Accepted, 2026-09-30.
**Decision.** `shortfallPenaltyBpPerPct` 35 -> 20 and `maxShortfallPenaltyPct`
30 -> 60, both inside their existing bands. Unmet food and energy together can
reach 200% of demand, so at 20 bp per percent no nation can reach 60%: the
penalty is a straight line with no cap in practice.
**Why.** At 35 bp and a 30% cap, Japan (158% unmet, food and energy together),
Korea and Turkiye sit on the cap, so their first 70 points of cover are worth
nothing. It is the structural reason they could not win, and why home investment
failed twice (prompt 17b section 4: "their first points only clear a dead zone").
Every system that hands out goods (trade, joint projects) needs every unit to
count, for every nation. At 20 bp Japan's starting penalty is 31.6%, about where
it was, so the world keeps its shape.
**Cost.** A small deficit hurts less (10% unmet costs 2% of output, was 3.5%), so
trade matters a little less to shallow importers. Measured in
docs/balance/100x-slice2.md before merging.
**Reversing it.** Two tunables.

## H4 - Joint projects: hosted consortia, paid in Credit, shared by what each paid
**Status.** Accepted, 2026-09-30. Phase 3 of D7, designed in RULES 13.
**Decision.** A project is a State object with a host, an invite list, a forming
deadline, a build cost and a yield (seam 8). Goods projects are hosted by a
nation with a surplus in that good and yield a share of that surplus again as new
production; shield projects cut crisis damage for their members. Members pay
monthly installments; shares of the yield follow what each paid; leaving
mid-build forfeits what was paid and costs trust; climate damage at the host cuts
a goods project's yield. The catalogue (seven templates) lives in the sim as
design data, like the world file, and every number that scales it is a tunable.
**Why.** It gives Credit a use worth sacrificing for, creates supply the world is
short of (goods, not Credit, are scarce: prompt 17b section 4), and makes
collaboration the route to self-reliance rather than an alternative to it. It
hands no nation a private lever: a deficit nation needs a host and partners, and
a host needs financiers. Nothing transfers output between nations without
consent (RULES 5.3), and no baseline moves.
**Cost.** A save schema bump; a new card type and a screen; the AI must learn to
found, join and leave; the balance moves and is reported (H2).
**Reversing it.** Remove the commands and the State field with a migration; the
catalogue and AI module are self-contained.

---

## P1 - Pivot: Nations becomes an idle airport game
**Status.** Accepted, 2026-10-01, by the owner's pivot brief.
**Decision.** The game is now a single-player, offline-first idle game: you run
an airport and earn cash by filling planes with passengers (docs/RULES.md). No
backend, no multiplayer, no AI nations. The Nations game stays reachable at its
last main commit, **`67d1d9279052dc215b82c45a0f76a618d4b26a0d`** ("[100x-10]
Playtest kit", 2026-09-30): `git checkout 67d1d92` restores it whole. History is
kept; main is never force-pushed.
**What carries over.** The architecture, because it already fits an idle game:
D6 (pure TypeScript sim), S1 (step), S2 (commands are the only mutation), S3
(Host), S4 (the host owns the clock; catch-up is stepping), S5 (seeded RNG,
integers, stable order, hash test), S6 (the UI reads a View), S9 (snapshot plus
command log saves with migrations), and T1-T6 (toolchain and purity
enforcement). The Web Worker host, IndexedDB saves, export and import files, the
live wall clock with catch-up (now offline earnings), the PWA setup, the harness,
the Node-vs-Chromium determinism test and the phone checks are kept and adapted.
**What retires.** D1-D5 and D7-D9 (nations, multiplayer, co-opetition scoring,
war, utility AI, the 2030 world), S7 (controller slots: there are no nations) and
S8 (interactions with expiry ticks: there is no other side), G1 and H1-H4
(Nations balance and gates). Their code and data are deleted slice by slice once
the airport replaces them, each deletion in its own commit.
**Why.** The owner's call. Nations' gates kept failing on balance between 17
nations; an idle game has one player, one economy and a balance problem a
harness bot can measure directly.
**Cost.** Months of Nations content is retired. The architecture's multiplayer
reasons (anti-cheat View, server-ready sim) now matter less, but they cost little
and keep the sim testable, so they stay.
**Reversing it.** Check out 67d1d92 on a branch.

## P2 - An autonomous session is the architect for the pivot
**Status.** Accepted, 2026-10-01.
**Decision.** The session that runs the pivot brief may edit CLAUDE.md,
docs/ROADMAP.md and docs/DECISIONS.md, works through eight slices (ROADMAP),
one squash-merged pull request each, and records assumptions here rather than
asking. Every slice merges only with `npm test` and `npm run check` green in CI.
Work happens on the session's designated branch, reset to main after each merge.
**Why.** The owner is unavailable for the pivot and asked for end-to-end work.
**Cost.** Design calls are made without the owner; each is a record here that
the owner can overturn.
**Reversing it.** The owner takes the architect role back by editing CLAUDE.md.

## P3 - Time and money units: 250 ms ticks, integer cents, milli-passengers
**Decision.** One tick is 250 ms of wall clock (`tickMs`). Money is integer cents.
Passengers are integer milli-passengers, so a rate of 1.6 a second is exactly
400 a tick. Growth is in basis points with a floor at every step.
**Why.** S5 needs integers. Cents keep $1.60 fares exact; milli-passengers keep
slow arrival rates exact without fractional carry. 250 ms makes a tap land within
a quarter second while 24 hours of catch-up stays 345,600 steps.
**Cost.** Display code divides by 100 and 1000. Cash is capped at 9e15 cents
(about $90 trillion), the safe-integer limit; the rules keep play far below it.
**Reversing it.** A tick length change is one tunable plus retuning every per-tick
rate.

## P4 - Offline earnings are the same sim, stepped fast, with a cap
**Decision.** Away time is caught up by stepping the sim every tick the wall
clock owes, up to an offline cap that the night-shift upgrade raises (2 h to
24 h). No closed-form shortcut and no reduced offline rate. The sim offers a
multi-tick advance that copies the state once and steps in place; a test proves
it equals stepping tick by tick.
**Why.** "Catching up N hours equals stepping through them" is then true by
construction, and charters and rotating gate order stay identical online and
offline. The in-place advance keeps 24 hours (345,600 ticks) well under the
2-second budget on a phone.
**Cost.** Catch-up time grows with the cap and the number of gates; the phone
check measures it with the CPU slowed 4x.
**Reversing it.** A closed-form estimate would be faster but would break the
equality test and S4.

## P5 - Commands carry no player id; the View is the whole airport
**Decision.** A command is `{ tick, type, payload }`: `tap`, `buy`, `sell`. The
View is the player's airport with derived numbers (costs, the income estimate,
the bottleneck) and design names. With one player and no hidden information,
the View is everything the interface needs, and still the only thing it reads.
**Why.** S7 and S8 retired with Nations (P1); a player id would be dead weight.
Deriving costs and estimates in the sim keeps every balance number out of the UI.
**Cost.** Multiplayer would need an id back; none is planned.
**Reversing it.** Add `playerId` to commands with a save migration.

## P6 - Income per second is a steady-state estimate, with the bottleneck named
**Decision.** The headline income per second is computed from the current
levels (RULES 8), not averaged from recent departures, and the sim names the
current bottleneck and the upgrade that fixes it.
**Why.** Payouts are lumpy (one plane at a time), so a running average jumps
around and lags a purchase. An estimate moves the moment you buy, and the named
bottleneck is what makes the upgrade trade-offs legible on a phone.
**Cost.** The estimate can disagree with what actually happens; the harness
checks it against measured idle income (within 20%).
**Reversing it.** Show a running average from host-side events instead.

## P7 - Animation runs outside React
**Decision.** React renders structure (gates, planes, upgrade rows) and re-renders
only when it changes: a plane arrives or leaves, a level changes, an upgrade
becomes affordable. Fill bars, timers and the cash counter are written straight
to the DOM on each update, and CSS transitions as long as one tick interpolate
between ticks.
**Why.** 60 fps on a phone with the CPU slowed 4x, which re-rendering the tree
four times a second cannot promise.
**Cost.** Two update paths in the interface, kept apart by a small store.
**Reversing it.** Render everything from state if phones get fast enough.

## P8 - Package names stay `@nations/*` until the last slice
**Decision.** The workspace packages keep their `@nations/` scope while Nations
code is being replaced, then are renamed `@airport/` in slice 8 with the rest of
the cleanup. The airport sim is built inside packages/sim beside the Nations sim
(slice 2) so the game stays playable after every merge.
**Why.** Renaming early would touch every Nations file only to delete it later.
**Cost.** For a few slices, a package called nations holds an airport.
**Reversing it.** Not needed after slice 8.


## P9 - Pacing pass: the first airport takes about 35 minutes
**Status.** Accepted, 2026-10-01, slice 6.
**Decision.** Retuned from RULES 11 measurements by the harness bots
(`npm run harness -- pacing`): gates x4 (was x5); planes $300 x3.5 (was $100
x4.5); routes $750 x4 (was $250 x5.5); the rush 2.5x (was 3x); a slot needs
$600K earned (was $10K) and is worth +25% fares (was +10%). Three bands moved,
which is a design change and why this record exists: `routeCostBase` max to
200000, `slotUnitCents` to [1000000, 400000000], `slotBonusBp` to [1000, 5000].
`packages/harness/src/pacing.test.ts` now holds every RULES 11 target on each
build.
**Why.** The first numbers put a slot on offer at 5 minutes and the greedy bot
sold for a trivial +10% again and again; unlocks came every 30 s early and
every 8 minutes late. Higher bases with slower growth spread gates, planes and
routes evenly (longest wait 4.5 min); a bigger, stronger slot makes the first
sale land at 35-36 minutes worth +75% fares; tapping at 3x reached 3.5x idle
income on some seeds, 2.5x keeps it at 2.3-2.8x.
**Cost.** An idle player (no taps, a check-in every 15 minutes) reaches the
first sale at about 2 h 45 min: slower than an active one by design, but the
offline cap (2 h at first) means a player who checks in twice a day waits
longer. Measured, not targeted; see docs/GAPS.md.
**Reversing it.** Values in tunables.ts and the RULES table; the pacing test
says whether the targets still hold.

## P10 - Nations code removed; packages renamed `@airport/*`
**Status.** Accepted, 2026-10-01, slice 8. Completes P1 and P8.
**Decision.** Deleted, each in its own commit: the Nations harness suites, the
AI package and its design document, the Nations sim and contract types, and the
Nations data and documents (world data, 100x plan, gates, balance reports,
playtest kit, reviews). The airport sim moved from packages/sim/src/airport up
to packages/sim/src, so tunables live at packages/sim/src/tunables.ts as
CLAUDE.md says. The workspace scope is now `@airport/` (sim, contracts,
harness) and the local lint rule of T6 is `airport/allowed-imports`; T3's three
purity guards are unchanged in substance. The repository and the Vercel project
keep the name nations-game.
**Why.** Dead code and data cost every future session reading time and invite
edits to the wrong game. Everything removed is at commit 67d1d92.
**Cost.** The Nations git history is the only copy of that work.
**Reversing it.** `git checkout 67d1d92`.

## P11 - Boosts: three free, timed power-ups on recharge clocks in State
**Status.** Accepted, 2026-10-02, at the owner's request ("it needs boosts").
The owner asked for the feature directly, so this session wrote the record
(P2's architect role, for this change only).
**Decision.** Three boosts (RULES 15), each a minute long and each fixing one
bottleneck of RULES 8: Rush hour (3x arrivals, 5-minute recharge, ready at
once), All hands (every gate rushed as if tapped, 5 minutes, opens at 3
gates) and Fare surge (2x fares, 15 minutes, opens with the first new route).
A new command, `boost`, starts one; its clock (`left`, `recharge`, in ticks)
lives in State, so boosts are hashed, saved, replayed and caught up like
everything else, and run on while the app is closed (P4). They are free:
no currency, no ads, no purchase. Selling resets them to ready. Ten new
tunables with bands. Save schema 2; the migration from 1 replays the old save
once to prove it against its old hash, then records the new one, and is tested
with a real version-1 save (packages/harness/fixtures). The headline income
stays the plain estimate (P6); a boosted estimate shows beside it, in gold,
while a boost runs.
**Why.** The owner felt the game was missing them, and they serve three
pillars: idle play gets something to do at each check-in (pillar 3); the
boost that fixes the named bottleneck glows, so the trade-offs stay legible
(pillar 2); and All hands gives a one-handed or idle player a minute of the
active game (pillar 1). Clocks in State, not the host, keep P4's equality
and S5's determinism without exceptions.
**Measured** (`npm run harness -- pacing`, seeds 1-5, bots using every boost as
soon as it is ready): the greedy first sale moves from 35.5-35.9 to
33.5-33.9 minutes, inside the 30-60 target, with no retune; the idle player's
from about 2 h 45 min to 2 h 15 min (the gap in docs/GAPS.md narrows); every
other RULES 11 target holds. The tapping-over-idle check now samples the
no-boost greedy path it was tuned on (P9): a tap's worth depends only on the
levels, and swings by about 1x between one minute's levels and the next, so
the boosted path's one-minute shift put one sample at 3.21-3.24x on two
seeds. The boosted path's figures are reported beside it.
**Cost.** A save migration; a new State field in the hash; a fourth command;
a row of three buttons in the thumb zone (the gates lose about 50 px of
height); with All hands on eight gates, departures and their effects roughly
double, and the phone check reads 56-59 fps (budget 55; 58-60 before).
**Reversing it.** Remove the command and the State field with a migration
from 2 to 3; the tunables, RULES 15 and the boost bar are self-contained.

## P12 - The security line is a real queue; the flow is the centre of the screen
**Status.** Accepted, 2026-10-02, at the owner's request ("improve the queueing
system ... I want it to be more of the focus, watch your empire move"). The
owner asked for the change directly, so this session wrote the record (P2's
architect role, for this change only, as for P11). This answers the open
question in docs/GAPS.md: should checkpoints be real bottlenecks.
**Decision.** Security becomes a real queue (RULES 3). Arrivals join a line in
State (`line`, milli-passengers); security clears it into the lounge at its
own rate, set by a new eighth upgrade, Security lanes ($25, x1.8 a level, +50%
speed a level); a full lounge holds the line; people will not join a line
longer than 30 s of clearing and turn back at the door instead (the missed
count). Passport control and preclearance, scenery until now, each slow
security by 5%: the catch of the long routes. A new command, `tapSecurity`,
opens an extra lane for the tap rush's 2.5 s (`securityRush` in State), and All
hands opens it too. The income estimate takes `min(arrivals, security)` and
names a new bottleneck, "Long lines at security", fixed by Security lanes.
Seven new tunables with bands. Save schema 3.
On screen (P7 still holds: canvas and direct DOM writes), the passenger flow
grows from a strip into the middle of the screen: the security maze, a
tappable panel where the dots standing in line are the real line, snaking
along three rows into a bank of scanners (one bar per two lanes levels), with
its length and wait written above it; a bigger lounge with the international
checkpoints beside it; arrivals along the top.
**Migration.** Old rules are not kept, so a migration changes only the
snapshot and the history since it is replayed under today's rules. The game's
own saves are compact (snapshot at the save point, no history): those are
checked against their old hash and migrate exactly, with an empty line and the
lowest Security lanes level that keeps up with their terminal, so an old
airport is not suddenly choked. Saves with history (the version-1 fixture) are
no longer proven against their old hash; the v1-to-2 migration's replay proof
retired with this one.
**Why.** The owner wants the queue to be the thing to watch. A queue that is
only scenery cannot carry that: it never builds, so there is nothing to see.
A real line gives the screen a story the player reads at a glance (the maze
filling is the bottleneck) and a new trade-off in the loop pillar 2 asks for:
a bigger terminal makes the line longer, lanes fix it, routes slow it.
**Measured** (`npm run harness -- pacing`, seeds 1-5): the greedy first sale
34.1-34.4 min (was 33.5-33.9), the idle player's about 2 h 15 min (unchanged),
the longest wait for something new 4.3-4.4 min (was 4.4-4.6), tapping 2.3-2.8x
idle; every RULES 11 target holds. The first numbers (security x2 cost, +40%
a level, international x0.8) put a 6-minute wait before Transatlantic, which
slowed security enough that the bot put it off; the shipped numbers are the
sweep that held every target with the old margin.
**Cost.** A save migration and a weaker proof for old saves with history; two
State fields in the hash; a fifth command; an eighth upgrade row; the
concourse takes about 70 px more of the screen, so the gates scroll sooner.
**Reversing it.** Drop the line (arrivals straight into the lounge), the
command, the upgrade and the State fields with a migration from 3 to 4; the
maze becomes the old strip again.

## W1 - Pivot: the airport becomes a warehouse
**Status.** Accepted, 2026-10-06, at the owner's request ("different approach
same repo, let's make it warehouse themed idle game. POs and Orders come in,
workers fulfill, you see the dashboard of progress money comes in and you
improve your warehouse to make it faster").
**Decision.** The game is now Warehouse Idle (docs/RULES.md): customer orders
queue in a backlog, pickers pick them into packing, loaders fill trucks at the
docks, and each truck pays when it leaves. Purchase orders arrive at a
receiving dock and are put away onto shelves; every order picked takes a unit
of stock, so empty shelves stop the pickers. That is the one new rule
(RULES 3a), with a ninth upgrade (Receiving bay), a sixth command
(`tapReceive`) and a sixth bottleneck ("The shelves are running empty"). Under
the cash, a dashboard row shows orders shipped, orders a minute, the backlog
and stock. Everything else is the airport's rules, renamed, with the same
numbers: gates are docks, planes trucks, passengers orders, security picking,
the lounge packing, routes contracts, fares pay, slots stars, cities sites,
Rush hour Flash sale, Fare surge Peak rates. The airport stays reachable at
its last main commit, **`5f78bce`** ("The airport fills a big phone", #53):
`git checkout 5f78bce` restores it whole. History is kept; main is never
force-pushed.
**What carries over.** P1's architecture list unchanged (D6, S1-S6, S9,
T1-T6). P3 (units: cents and milli-units, now milli-orders), P4 (offline is
the same sim stepped fast), P5 (commands carry no player id; the View is the
whole warehouse), P6 (estimated income, named bottleneck), P7 (animation
outside React), P9's pacing targets, P11 (boosts with clocks in State) and
P12 (the queue is real and the centre of the screen: now the backlog) all hold
under their new names. P8 and P10 are superseded: the workspace scope is now
`@warehouse/` and the lint rule `warehouse/allowed-imports`.
**Saves.** The schema starts again at version 1 in a new IndexedDB database
(`warehouse`), so airport saves are never read. An airport save file is
refused with a message saying so. Converting airports was not worth the
migration: the owner is the only player.
**Tuning.** With every airport number kept, receiving at 2 a second bought the
first bay before the second dock (2.5 minutes, target 2). At 2.4 a second,
level with picking, every RULES 11 target holds on seeds 1-5: first dock
19-29 s, longest wait 4.3-4.4 min, first sale 35.3-35.6 minutes with 3 stars,
tapping 2.1-2.7x idle, the estimate within 4%.
**Why.** The owner's call. The airport's engine already fits any "things
arrive, queue, get processed and leave in batches" idle game, so the switch
costs renaming, not rebuilding, and keeps its proven determinism, offline
earnings and pacing. Stock is the smallest addition that makes "POs come in"
a real part of the game rather than scenery: it adds a second supply line to
balance against sales, just as the security line did (P12).
**Cost.** Airport saves are lost. Every document and test was rewritten in
warehouse words, so later sessions reading old P records must translate the
names. The floor is one lane taller (receiving), and the dashboard row takes
about 45 px, so on a 740 px phone with the install banner showing the docks
are squeezed (docs/GAPS.md).
**Reversing it.** `git checkout 5f78bce` on a branch.

## W2 - This session is the architect for the warehouse pivot
**Status.** Accepted, 2026-10-06.
**Decision.** As in P2, the session that runs the owner's pivot request may
edit CLAUDE.md, docs/ROADMAP.md and docs/DECISIONS.md, records its design
calls here rather than asking, and merges only with `npm test` and `npm run
check` green. It did the pivot as one pull request (the airport stayed
playable on main until the warehouse was whole) rather than P2's eight slices.
**Why.** The owner asked for the change directly and is not a programmer; the
rename is mechanical enough that splitting it would leave main half airport,
half warehouse.
**Cost.** One large pull request instead of eight small ones.
**Reversing it.** The owner takes the architect role back by editing CLAUDE.md.

## W3 - Star perks: permanent bonuses unlocked by stars owned, never spent
**Status.** Accepted, 2026-10-06, at the owner's request ("Create a feature
that has stars"). The owner asked for the feature directly, so this session
wrote the record (the architect role of P2 and W2, for this change only, as
for P11). The request was open; this session read it as "give stars more to
do", the reading closest to docs/ROADMAP.md ("sell the warehouse for stars
that permanently boost the next one"), rather than a second, unrelated kind
of star (ratings, achievements) that would blur the one the game already has.
**Decision.** Five perks (RULES 10a) unlock as the stars owned reach 1, 3, 6,
10 and 15: Head start (a new warehouse opens with $250), Second dock (it opens
with two docks), Quick charge (boosts recharge 25% faster), Express lane
(express trucks twice as often) and Long shift (offline cap x1.5). Stars are
never spent, so the +25% pay per star (RULES 10) is unchanged and there is no
shop to balance. Each perk is a pure function of `stars`, which State already
holds: no new State field, no new command, no hash or save change, and the
first warehouse is exactly as before. Nine tunables with bands. On screen, a
★ button by the site's name opens the stars sheet (every perk, its threshold
and what is left to reach it); the sell sheet names the perks a sale unlocks,
and the welcome sheet lists the perks owned.
**Why.** Stars were one number (+25% pay); after the first sale nothing new
came from them. A ladder of perks gives each sale something to aim for besides
a bigger multiplier (pillar 4, steady novelty), and the 0-star sheet shows a
new player why selling matters. Two perks shape the opening of a warehouse
(the slow first minutes after a sale), two help the idle player (boosts,
offline cap: docs/GAPS.md says twice-a-day players are held back by the cap),
and one rewards long play.
**Measured** (`npm run harness -- pacing`, seeds 1-5): every RULES 11 target
is unchanged (they end at the first sale, before any perk); the greedy bot's
second sale comes about 40 s sooner (55.2-55.6 min, was 56.3).
**Cost.** Rules now depend on the stars owned in three places (boost recharge,
express odds, offline cap): a save with a command log from before this change
and 6 or more stars would replay differently. The game's own saves are compact
(no history), so none exist. The top row gains a 44 px button.
**Reversing it.** Remove perks.ts and its calls (openWarehouse, boostTicks,
rollExpress, offlineCapTicks), the tunables and the stars sheet; State is
untouched, so no migration.

## W4 - Bigger customers send bigger orders: items per order grow with contracts
**Status.** Accepted, 2026-10-07, at the owner's request ("Some orders should
have many items and require multi picks to tote", then "Go" when asked whether
big orders should become a real rule rather than only a picture). As for W3,
the owner asked for it directly, so this session wrote the record.
**Decision.** An order is `items = itemsBase + itemsPerContract x contract`
items on average (RULES 3b): 1.2 at Local shops, +0.15 a contract level. Each
item is one pick and one unit of stock: pickers pick items a second, and
picking takes `ceil(orders x items)` milli-units of stock. The sim keeps the
average in milli-items (P3) and turns it into orders where the rest of the
rules need orders (`pickingMilliAt`, the estimate's receiving rate), so the
backlog, staging, loading, the estimate and the bottleneck are unchanged in
form. No State, command or save change: items come from the contract level.
The View gains `picking.itemsMilli`. Picking and receiving bases, the shelves
and the opening stock were raised 20% (2.4 to 2.88 a second, 120 to 144
units, 60 to 72) so a Local shops warehouse picks and stocks exactly the
orders it did. On the floor (RULES 14) each ticket is now one order; its size
is drawn so the mix averages the real figure, and a big order is picked into
a tote, one rack location an item. This replaces #59's display-only totes,
which grouped one-item tickets.
**Why on contracts.** Better contracts was the one upgrade with little catch
before Cross-border (+60% pay, a truck lock). Now each contract also costs
picking and stock per order, the trade-off pillar 2 asks for, and the
customer names already say who sends bigger orders (Local shops against an
Everything store). Putting it on contracts rather than on a site keeps the
first warehouse's opening as it was and changes every run's middle.
**Measured** (`npm run harness -- pacing`, seeds 1-5): every RULES 11 target
holds. First sale 36.0-36.3 min with 3 stars (was 35.3-35.6), longest wait
4.3 min, tapping 2.1-3.2x idle (was 2.1-2.7: with picking tighter, extra
pickers are worth more), estimate within 4%. At +0.2 an item a level or more,
the wait for contract 6 passed 5 minutes on seed 1 (5.0-5.8 min), so the step
is +0.15.
**Cost.** The rules for picking changed: a save with a command log from
before this change would replay differently (the game's own saves are
compact, as in W3). Tapping now reaches 3.16x idle on one seed, near the top
of its 1.8-3.2 band. Stock rounds up per tick, so a few milli-units a tick are
lost to rounding at most.
**Reversing it.** Set `itemsPerContractMilli` to 0 and `itemsBaseMilli` to
1000 with the old picking and receiving bases (600), shelves (120) and stock
(60): every rule is then as before.


## W5 - A warehouse management system beside the idle flow
**Status.** Accepted, 2026-10-07, at the owner's request (a nine-slice WMS
brief, docs/wms-plan.md). As for W3 and W4, the owner asked for it directly,
so this session wrote the record. The brief was written for the Nations game
(nations, trade deals, aid, relations), retired in P1; this session read it
for the warehouse game, the reading closest to docs/ROADMAP.md: destination
countries for nations, customer accounts (contracts) for trade deals,
goodwill per country for relations, cash for the expedite cost.
**Decision.** The game gains a WMS: discrete key-account orders with lines,
SKUs, bins, a picker pool and an activity log, shown in dense operational
screens. It lives in State as `wms` (save schema 2; the migration from 1 adds
a freshly generated WMS and changes nothing else), on its own seeded RNG
stream so it never shifts the idle game's draws, and it changes only through
commands and the step like everything else (S1, S2). The idle flow of RULES
3-5 (milli-orders, pickers, staging, docks, pay) stays the truth for income
and pacing and is not rewritten; the WMS is a bounded layer beside it, and
its results reach the economy only in its slice 8, measured by the harness.
Slice 1 (this record) adds the types, the generator (10-15 sample orders) and
13 tunables; nothing steps yet.
**Why.** The owner wants the game to feel like running a real distribution
operation. Discrete orders are what a WMS shows, but the idle economy runs at
thousands of orders a second, too many to model one by one; a bounded layer
gives the real-WMS feel without touching the proven pacing (P9, W1, W4).
**Cost.** A save migration; State grows by a few KB (hashed and saved);
the step will do more work per tick from slice 2, so catch-up must stay
inside the phone budget (S4). The WMS's orders are not the idle flow's
orders, which a player may notice; slice 8 links the two through pay.
**Reversing it.** Remove `wms` with a migration from 2 to 3 and delete
packages/sim/src/wms and its screens; the idle game is untouched.

## W6 - The WMS gets inbound and inventory: real purchase orders replace instant top-ups
**Status.** Accepted, 2026-10-07, at the owner's request ("change the orders
countries toggle to inbound, outbound, and inventory and implement the
corresponding inbound and inventory view simulations"). As for W3-W5, the
owner asked for it directly, so this session wrote the record.
**Decision.** The WMS screen's Orders | Countries toggle becomes three pages:
Inbound, Outbound (the order grid, as before) and Inventory. Countries moves
to a chip at the end of the Outbound filters, so goodwill stays one tap
away; the next-wave countdown moves from the header into the Outbound KPI
strip to make room for three tabs on a 360 px phone. Each page has its own
KPI strip. Behind the two new pages are two new parts of the WMS sim
(RULES 16):
- *Inbound.* The instant REPLEN of slice 2 (+120 units to any SKU under 40,
  every minute) is gone. Reorder planning raises purchase orders to eight
  suppliers instead: every minute, a SKU whose position (available plus
  inbound, less the units order lines wait for) is under the reorder point
  is ordered up to it plus a PO quantity. Trucks come on a promised ETA
  (15% late), wait in the yard for one of two dock doors, are counted in by
  three receivers (some lines short or damaged), and each line's units reach
  the bin after a short put-away. Only then can they be allocated.
- *Inventory.* Rolling cycle counts check one SKU every 30 s and adjust the
  bin when it differs (10% of counts, mostly losses, never allocated units);
  each SKU keeps units picked out of it and its net adjustment. The
  Inventory page shows on hand, allocated, available, inbound, units
  waiting, bin, picked, last count and variance, with a status (SHORT, OUT,
  LOW, OK) and count accuracy.
State gains `pos`, `receivers`, `nextPoNo`, `nextCountAt`, `countCursor`,
`inbound` (totals) and `recentIn`, and each SKU `picked`, `counted` and
`variance` (save schema 5; the migration from 4 adds them empty and keeps
orders, stock and the log as saved). No new command: the player watches
inbound and inventory; the actions are still the outbound ones of slice 7.
Inbound log lines carry the PO number in the event's `order` field (the
code says which); the View splits it into `order` and `po`, and tapping an
inbound line in the activity feed opens the PO.
**Tuning.** With lead times, the old reorder numbers (40 and 120) cut an idle
WMS's OTIF from 80% to 64% and fill from 97% to 92% (seeds 1-8, 2 h). A
reorder point of 80, 30-90 s lead times and 6 units a second of receiving
give 84% OTIF and 98% fill; the first ten minutes run lower than with
instant top-ups (about 55% OTIF against 59%), because a new warehouse waits
for its first trucks. Every RULES 11 target holds (first sale 36.2 min).
24 h of catch-up: 568 ms in Node against 496 ms for the build before, on
this session's machine (Chromium unchanged at about 480-500 ms).
**Why.** A real WMS is three screens: receiving, shipping and stock. Stock
that appears from nowhere made the inventory page meaningless; with POs,
shorts on the Outbound page trace back to a late truck or a busy dock on
the Inbound page, and the Inventory page shows why. Keeping it watch-only
keeps the change bounded and the pacing untouched.
**Cost.** A save migration and about 6 KB more State (20-30 POs kept; a
save of a 2-hour warehouse is about 49 KB). The WMS step does a
little more work (inbound every second, planning every minute). Early WMS
OTIF is a little lower. Inbound has no player actions yet (expedite a truck,
change a door, raise a PO by hand would each be a new `wms` action).
**Reversing it.** Restore REPLEN in `wmsStep` in place of `planReorders`,
`stepInbound` and `cycleCount`, migrate the new fields away (5 to 6), and
put the two tabs back in WmsScreen.


## W7 - The WMS becomes the game: its floor is home, and the player sets its plan
**Status.** Accepted, 2026-10-07, at the owner's request ("the pick pack
animation should emulate what the wms is doing. It's less of an idle game
more of a wms sim, let users start to change some of the sim's decisions.
Wms becomes the main"). As for W3-W6, the owner asked for it directly, so
this session wrote the record, and (as in W2) updated docs/ROADMAP.md's
description of the main screen to match.
**Reading.** Three asks, read the way closest to docs/ROADMAP.md: (1) the
animation shows the WMS's own pickers, orders and trucks, not the idle
flow's scenery; (2) the player can change decisions the WMS made by itself,
beyond the per-order actions of slice 7; (3) the WMS is the screen the app
opens on. The money is not moved: income still comes mostly from the idle
flow's trucks (RULES 3-11), so the pacing targets hold. Making the WMS the
money-maker is the obvious next step but needs a pacing pass and is the
owner's call (docs/GAPS.md).
**Decision.**
- *Home.* The app opens on the WMS. A one-row money bar (stars, site, cash,
  income, settings) sits over five tabs: **Floor** (new, the default), In,
  Out, Stock (the three W6 pages, renamed to fit) and **Plan** (new). The
  activity console stays docked at the bottom, and under it Docks, Upgrades
  and Sell. The idle floor with the trucks, the boosts and the tap rushes is
  now the **Docks** screen, one tap away and back (‹ WMS).
- *Floor.* A canvas drawn from the WMS View only (P7, the S6 seam): the two
  dock doors with the PO being received, the yard, the receivers counting,
  forklifts putting each received line away (arriving when the sim puts it
  in the bin), four aisles of 20 bays with every SKU's stock, the pickers
  walking to and picking at their line's bin (an arc for the share picked),
  each confirmed line's tote riding the conveyor to packing, and every order
  past picking as a carton at the pack bench, the packed area, the staging
  lanes and the truck, which pulls out once its orders have shipped (with
  the pay). A tap on a picker or carton opens its order, on a docked
  trailer its PO, on a bin its SKU. The UI may not import the sim, so the
  View carries each picker's, stock row's and PO line's aisle and bay and
  the floor's shape.
- *Walking* (so the animation is the truth, and so a pick order can save
  steps). Pickers walk to each line's bin before picking: bins sit in four
  aisles of 20 bays, a walk is the bays along an aisle or out to the front
  cross aisle, across (3 bays an aisle) and in, at `wmsWalkTicksPerBay` (1
  tick a bay). Pick speed rose from 0.65 to 0.75 units a second to keep an
  idle WMS shipping as before (82% OTIF and 94% on time against 84% and
  95%, seeds 1-8, 2 h).
- *The plan* (a new `policy` WMS action, PLAN in the log): **pick order**
  (priority first, the old rule; cutoff first; nearest bin), **release**
  (timed waves, the old rule; continuous; manual) and **crew** (the nine
  people split between pickers and receivers, 1-8 picking). Allocation now
  goes most urgent first under the pick order, so waves let a P1 take the
  stock ahead of a P3 released with it: the catch of continuous release.
  State gains `policy` and each picker `at` and `walk` (save schema 6; the
  migration from 5 adds the default plan, sized to the saved pickers, and
  puts each picker at its line's bin with no walk left).
**Measured** (idle WMS, seeds 1-8, 2 h; OTIF, on time, fill): default 82%,
94%, 97.4%; cutoff first 84%, 96%, 97.3%; nearest bin 81%, 93%, 97.1%
(more lines than priority first with a backlog: a test); continuous 84%,
97%, 97.1%; seven pickers 85%, 98%, 97.3%; five 65%, 74%, 97.4%. No plan
dominates on every number, and the crew split is the sharpest lever. Every
RULES 11 target holds. Phone check 74/74 at 360 x 740, the WMS floor at
60 fps with the CPU slowed 4x.
**Why.** The owner wants a WMS sim more than an idle game. A floor that
shows the WMS (and a sim that times the walks it shows) makes every number
on the WMS pages visible as people and boxes, and the plan hands the player
the decisions a real WMS supervisor makes: the pick sequence, the release
strategy and the labour split.
**Cost.** A save migration. The WMS's rules changed for every save
(walking, allocation order, pick speed): a save with a command log from
before would replay differently (the game's own saves are compact). The
home is denser than the old floor; the tabs are shorter words. The Docks
screen, where most of the money is still made, is a tap away instead of
being home.
**Reversing it.** Make `screen` start at 'docks' in App.tsx to put the old
home back. For the rules: `wmsWalkTicksPerBay` 0 and `wmsPickMilliPerSec`
650 remove walking; the default plan is the old behaviour except
allocation order (`needing.sort` in `wmsStep`).


## W8 - The WMS is the whole game: workers do the tasks the WMS creates, POs book dock appointments, the idle game is gone
**Status.** Accepted, 2026-10-07, at the owner's request ("i want to be able
to tap on a warehouse worker and see their assigned tasks, the wms should
create tasks for pickers and receivers and track the work of each worker,
assigning them accordingly. i also need you to prune down the idle features,
this really becomes a warehouse automation simulator - with pos generate new
pos that have an appt in the day"). As for W3-W7, the owner asked for it
directly, so this session wrote the record and, as in W2, acted as architect
for this change: it updated docs/ROADMAP.md, CLAUDE.md's description of the
game and its units rule, and rewrote docs/RULES.md for the new game.
**Reading.** Four asks, read the way closest to docs/ROADMAP.md and W7's
"next step" (docs/GAPS.md: make the WMS the money-maker):
1. *Tasks.* Every piece of WMS work becomes a task the WMS creates and
   assigns: a PICK task per allocated order line, a RECEIVE task per line of
   a docked PO, and a PUTAWAY task per line counted in. Put-away was a timer
   (W6); it is now receivers' work, so receivers "receive" in the full sense.
2. *Assigning.* The WMS lines up the next few tasks for each worker of the
   right role (`wmsTaskQueue`, 3, its active task included), by the plan's
   pick order, and redoes the plan when work waits, a more urgent task comes
   in or someone runs dry. A worker's queue is real: it is what they do next.
3. *Tracking.* Every worker keeps a record (tasks, units, time working,
   walking and idle), and every finished task is kept for a while
   (`wmsTasksKept`) so each worker's page lists their recent work. A tap on a
   worker on the floor, or a row on a new Crew page, opens it.
4. *Pruning.* "Prune down the idle features" is read as remove them: the idle
   flow (the backlog in milli-orders, docks and trucks, taps and rushes,
   upgrades, boosts, selling for stars, perks and sites, the pacing bots) is
   deleted, and the WMS is the whole game. Its shipments are the only income,
   at `wmsUnitPayCents` ($1) a unit times the goodwill factor. Money buys what
   a WMS supervisor would buy: more people (hire a picker or a receiver,
   rising prices) and more dock doors. This is the smallest money sink that
   keeps cash meaningful; demand that grows with goodwill was left out
   (docs/GAPS.md: an owner decision).
5. *Appointments "in the day".* The game gains a warehouse clock: a warehouse
   minute a second (a day is 24 real minutes), opening at 06:00 on day 1.
   Reorder planning books every new PO into the first appointment slot (30
   warehouse minutes) after its supplier's lead time with a door free; trucks
   come up to 10 minutes early or (15%) miss the slot, and the yard docks
   earliest appointment first. The In page shows each PO's appointment and a
   dock schedule. Every time on screen is a time of this clock, and rates are
   per warehouse hour; cutoffs (3-8 real minutes) now read as 3-8 hours.
**Decision.**
- *State* (save schema 7) is `{ schemaVersion, tick, cash, wms }`. The WMS
  replaces `pickers` and `receivers` with `workers` (id, role, active task,
  queue, position, walk, record) and gains `tasks`, `nextTaskNo`, `doors`,
  `today` and `yesterday` (day totals), `recentPay`, and `earned` and `spent`
  in its stats; POs swap `eta` for `appt` and lose `putAt`; orders name a
  `customer` (8 customers) instead of a contract level. The WMS keeps its own
  seeded stream; the idle game's RNG is gone.
- *Commands* are `wms` actions only; two are new, `hire` (a role) and `door`.
  `assign` puts a picker on a line now (it drops its queue).
- *Saves.* Versions 1-6 migrate by keeping the snapshot's tick and cash and
  opening a fresh WMS at that tick, seeded from the old warehouse seed and
  site; commands other than WMS actions are dropped from the log. The old
  WMS's orders and stock are not carried over: its workers had no tasks, and
  the owner is the only player (as for W1's airport saves).
- *Offline cap* is fixed at `offlineCapMinutes` (8 hours; the night shift
  upgrade is gone). The recap reports orders shipped, OTIF, earnings, POs in
  and cutoffs missed.
- *Harness.* `npm run harness -- report` (the default command) replaces the
  pacing pass: an untouched warehouse on several seeds, checked against the
  RULES 11 targets. The determinism player uses every WMS action.
- *Screen.* The top bar is the warehouse clock, cash and today's earnings; the
  page tabs (Floor, In, Out, Stock, Crew, Plan) moved to the bottom third,
  where Docks, Upgrades and Sell were. The floor draws every worker doing its
  task (receivers drive pallets to the racks; the separate forklifts are
  gone).
**Measured** (`npm run harness -- report`, seeds 1-8, 2 h, an untouched
warehouse): 82% OTIF (80-86%), on time 92-98%, fill 97%, pickers working 69%
of their time, receivers 20%, $210 a warehouse hour (the first hire after
2.4 warehouse hours). The first 15 minutes average 64% OTIF over 16 seeds
(W7's build: 59%). Catch-up: 8 hours of a new warehouse 370-480 ms in Node
(the old game's 8 hours, idle flow included: 250-400 ms); the phone check
reopens after 10 hours away in 1.5-1.7 s with the CPU slowed 4x (budget 2 s).
Phone check 47/47.
**Why.** The owner wants a warehouse automation simulator, not an idle game.
Tasks are how a real WMS directs labour, so making them the unit of work
makes the floor, the Crew page and the numbers all the same truth, and gives
the player something to read off each worker. Appointments are how a real
dock is run, and they need a day to live in.
**Cost.** Everything idle is gone, with its tests and screens (the airport and
idle warehouse stay in history: `git checkout b34368a`). The owner's save
loses its WMS orders and stock (cash and time are kept). The sim does more
work a step (the task plan), so catch-up is about 1.5x slower than the idle
game's for the same hours, and the cap came down from 24 h to 8 h to stay
inside the phone budget. The pacing targets of P9/W1 no longer apply; the
report's targets replace them. Receivers are idle much of the time with the
opening crew (20%), which the Plan's crew split and hiring are for.
**Reversing it.** `git checkout b34368a` restores the idle game with the WMS
beside it. Within this design: `wmsTaskQueue` 1 gives a task only when a
worker is free; `wmsPutawayDropTicks` 0 and `wmsWalkTicksPerBay` 0 make
put-away and walking instant.


## W9 - Speed in the host, waves and labour in the plan: the warehouse runs 5 minutes a second, and the player moves people by need
**Status.** Accepted, 2026-10-07, at the owner's request ("Speed up the sim,
let it run 5 mins a second but also would like to see controls for waving or
to reallocate labor based on needs"). As for W3-W8, the owner asked for it
directly, so this session wrote the record and updated docs/ROADMAP.md's
list of commands and plan choices to match.
**Reading.** Two asks, read the way closest to docs/ROADMAP.md:
1. *"5 mins a second"* is the warehouse clock: five warehouse minutes pass
   each real second (W8 ran one). Read as a speed the host sets, not a new
   sim clock, and offered with pause, 1x and 10x so the player can slow down
   to watch, with 5x the default. "Speed up" also covers time away: the
   warehouse runs at the chosen speed while the app is closed.
2. *"Controls for waving or to reallocate labor based on needs"* is two
   things a WMS supervisor does: run waves (how often they go, and one now),
   and move people between picking and receiving according to the work
   waiting. Both the hand control (move one person, chosen or picked by the
   WMS) and an automatic one (the WMS balances by need) are given, since
   "based on needs" reads as either.
**Decision.**
- *Speed* (host, apps/web/src/platform). `SPEEDS` 0, 1, 5, 10 warehouse
  minutes a second, `DEFAULT_SPEED` 5; a tick takes `tickMs / speed` of wall
  time (50 ms at 5), so the sim, its tunables and every test are untouched
  and the same ticks give the same warehouse (S4, P4). A change of speed
  first steps the time owed at the old speed. 0 pauses: nothing is owed for
  paused time. The speed is saved with the autosave and the export file
  (`SavedWarehouse.speed`); a save without one caught up at 1, then runs at
  5. Updates carry the speed so the floor times its walks by the real tick.
  Live events cover the last `LIVE_EVENT_TICKS x speed` ticks, so the step
  that answers a tap is never caught up quietly, and the autosave runs every
  10 real seconds at any speed. A pause button and a speed button (1x, 5x,
  10x) sit in the top bar.
- *Away time* runs at the speed, up to the same offline cap in ticks (8 hours
  at 1x, 20 warehouse days), so catch-up stays inside the phone budget at any
  speed; at 5x the cap is 1 h 36 m of real time, and the recap says it in
  warehouse days and in real time.
- *Waves* (sim). The plan gains `waveTicks`, one of `wmsWaveMinTicks` (30
  min), `wmsWaveTicks` (1 h) and `wmsWaveMaxTicks` (2 h); a shorter interval
  brings the next wave forward. Plan offers "Release a wave now" (the
  existing `release` action with every NEW order).
- *Labour* (sim). A new `role` action moves a worker (or, as worker 0,
  whoever the WMS picks: no task first, then least lined up) to picking or
  receiving; it drops its tasks and the plan's split follows (a MOVE event).
  The plan gains `labor`, fixed (the old behaviour) or balance by need: every
  `wmsBalanceTicks` (15 warehouse minutes) the WMS moves one person to the
  side with at least `wmsBalanceGap` (3) more tasks waiting a head, each side
  keeping one. The View gains `needs` (each side's people, idle and tasks
  waiting, the side that is short, the next look) and `waveChoices`; the
  Plan and Crew pages show "where the work is" with "+ 1 here", and a
  worker's page has "Move to receiving" (or picking).
- *Saves* are schema 8: version 7 gains waveTicks 240 and labor fixed. A plan
  command naming only the three W7 settings keeps the other two, so a
  version-7 history replays exactly (tested with a real version-7 save).
**Measured** (an untouched warehouse, seeds 1-8, 2 h of ticks; OTIF, on time,
fill): default 82%, 96%, 96.6% (unchanged: the report passes as at W8);
balance by need 81.5%, 97.3%, 95.3% (people move to picking, so orders
ship sooner but stock lands later); waves every 30 min 81.4%, 95.8%, 96.4%;
every 2 h 77.5%, 89.4%, 96.8%. Balance gap 2-6 and cadence 15-60 min all sit
within a point and a half of each other on an idle warehouse. Phone check
52/52 at 360 x 740 (the floor at 60 fps with the CPU slowed 4x at 5x speed;
10 hours away reopens in about 1 s).
**Why.** At one warehouse minute a second a warehouse day took 24 real
minutes, too slow to see a plan play out in a 5-minute session (pillar 3).
Doing the speed in the host keeps the sim deterministic and every balance
number and test as they were. Waves and labour moves are the levers a WMS
supervisor pulls hour to hour; showing the work waiting each side makes the
labour trade-off readable (pillar 2), and the balance plan is the
automation of the same rule.
**Cost.** The WMS screens re-render up to four times a second at 5x and 10x
(once a WMS step that an update carries) instead of once. The offline cap
in real time shrinks with the speed (1 h 36 m at 5x). Moving a worker drops
what it holds (a half-picked line starts again), as the crew split already
did. A save migration. The default plan is unchanged, so an untouched
warehouse plays exactly as before; balance by need trades about a point of
fill for a point of on time and is not a free win.
**Reversing it.** `DEFAULT_SPEED` 1 brings back a minute a second; removing
the speed buttons and `setSpeed` leaves the old host. `wmsBalanceGap` 20
makes balance by need do almost nothing; the `role` action and the wave
interval can stay without harm.


## W10 - Outbound doors with scheduled trailers, three times the orders, a dock crew that loads, a bigger crew
**Status.** Accepted, 2026-10-07, at the owner's request ("Give me multiple
outbound docks, and more business lots of orders lots of movement. Might
need more staff..."). As for W3-W9, the owner asked for it directly, so this
session wrote the record and acted as architect for the change: it updated
docs/ROADMAP.md and rewrote the affected parts of docs/RULES.md.
**Reading.** Three asks, read the way closest to docs/ROADMAP.md:
1. *"Multiple outbound docks"* is outbound dock doors as real places, as the
   inbound doors became in W8: shipping was a single truck at the end of four
   fixed timers. Each outbound door now has a trailer that leaves on a
   schedule, the way a carrier's trailer does; packed orders are staged at
   the door whose trailer will take them soonest, a dock hand loads each one,
   and every order on a trailer ships when it leaves. Three doors to start,
   up to six, bought like inbound doors.
2. *"More business, lots of orders, lots of movement"* is volume: orders
   arrive every 6-10 warehouse minutes (20-30 before), about seven an hour,
   and stock is reordered in bigger lots to keep up. Read as a fixed, higher
   rate, not as demand that grows with goodwill: that idea (ROADMAP Next)
   changes the game's loop and stays the owner's call.
3. *"Might need more staff"* is a bigger crew and cheaper growth: the
   warehouse opens with 14 pickers and 6 on the dock (6 and 3 before), can
   hire up to 40 (16), and each hire costs x1.15 more (x1.5), from $2,000.
   Loading is dock work: the receivers become the **dock crew** (receive,
   put away, load), which was idle 80% of the time at W8 and now works about
   half of it. No third role: the crew split, the balance plan and the Crew
   page keep their two sides.
**Decision.**
- *State* (save schema 9): `wms.shipDoors` (door, trailer, departs) and
  `nextTrailerNo`; orders gain `door`; stats gain `trailers`; finished tasks
  move from `tasks` to a new `history` (performance, below). Tasks gain the
  kind LOAD (at outbound door d, bin -10 - d). Events gain DEPART; STAGE
  names the door and LOAD the units, door and worker; DOOR names its side.
- *Commands*: `door` takes an optional `side` ('in', the default, as every
  older command meant, or 'out').
- *Rules* (RULES 4-6, 9): PICKED -> PACKED after `wmsPackTicks`, -> STAGED
  at a door after `wmsStageTicks` (the soonest trailer with room that it can
  still be loaded onto), LOADED by a dock hand at `wmsLoadMilliPerSec`, a load
  starting only if it fits in `wmsTrailerUnits`; trailers leave every
  `wmsTrailerTicks` per door, staggered, and ship what is on them. The dock
  crew's loads go before receiving, soonest trailer first. `wmsLoadTicks`
  and `wmsShipTicks` are gone.
- *Saves*: version 8 gains the doors, its staged and loaded orders go back to
  PACKED (staged again at once), finished tasks move to the history, and the
  crew is topped up free to the new opening crew, so the owner's warehouse
  can take the new volume. Tested with a real version-8 save.
- *Performance* (P4's 2 s budget at three times the work): finished tasks
  live in their own list so the plan reads only live work; orders, POs and
  tasks are found by halving (they stay in number order); the log and
  history are cut back in batches of 100; the plan sorts only the tasks it
  can hand out; a re-plan for urgency looks only at work that came in since
  the last step (a priority, an expedite or a hold released gives back what
  is lined up instead); open orders are capped at 80 (40 before). The plan's
  decisions are the same as before these changes on every case measured.
**Measured** (`npm run harness -- report`, seeds 1-8, 2 h of ticks, an
untouched warehouse): 868 orders shipped a seed (290 at W9), OTIF 84%, on
time 95-98%, fill 96%, pickers working 61%, dock crew 48%, $717 a warehouse
hour, about 337 trailers out at 64% full. Outbound doors as capacity: with
two doors an untouched warehouse falls to 74% OTIF, with one to 9%; four
ship as three do. Catch-up of 8 hours: 370-420 ms in Node for a new
warehouse, 240-270 ms for the 40-worker benchmark, up to 0.9 s with a
backlog of 80 open orders (half the pickers moved off; the W9 build's worst
backlog was 0.65 s with a cap of 40). Phone check 55/55: 60 fps on the busy
floor (40 workers, 6 outbound doors) with the CPU slowed 4x, 10 hours away
reopens in 1.2-1.6 s.
**Why.** The owner wants a busier floor with more to manage. Scheduled
trailers are how outbound docks work in a real warehouse, and they make
the doors a capacity the player can see and buy; loading as dock work gives
the idle receivers a job and the labour split a real trade-off.
**Cost.** A save migration that changes the owner's warehouse (orders on the
dock re-staged, people added). Demand is still fixed, so beyond enough doors
and people, more only shortens waits (docs/GAPS.md). The re-plan for urgency
no longer reads old waiting work (covered by the actions that change it).
The log and task history hold up to 100 more than their limits between
cuts.
**Reversing it.** `wmsOrderMinTicks` 80 and `wmsOrderMaxTicks` 120 bring
back W9's volume; `wmsStartPickers` 6 and `wmsStartReceivers` 3 the crew;
`wmsTrailerTicks` 60 with `wmsTrailerUnits` 2000 makes trailers leave every
15 minutes with room for anything, close to the old timers.


## W11 - A SKU in every bay: 80 SKUs, a warehouse that opens stocked, and bins drawn against a full mark
**Status.** Accepted, 2026-10-08, at the owner's request ("The warehouse
barely gets filled, come on now."). As for W3-W10, the owner asked for it
directly, so this session wrote the record and updated the affected parts of
docs/RULES.md.
**Reading.** The floor draws 80 rack bays (four aisles of 20), but the
warehouse stocked only 16 SKUs, one bin each, so 64 bays were always empty
and the 16 that held stock were drawn about half full against whichever bin
was deepest: measured on seeds 1-3 over 12 warehouse hours, the painted
share of the racks was 5-15%. "Barely gets filled" is read as the racks, not
the trailers (64% full, W10) or demand (fixed, docs/GAPS.md): the warehouse
should look like a warehouse full of stock, and the floor must stay the
truth (pillar 1), so the fix is more stock in the sim, not fuller drawing.
**Decision.**
- *Catalogue.* 80 SKUs, one for every bay: the sixteen product families of
  before, five kinds each (`WMS_SKUS` is built from `WMS_FAMILIES`). SKU `i`
  is kind `floor(i / 16)` of family `i % 16`, so SKUs 0-15 keep their codes
  and names, and every aisle holds some of each family. A supplier supplies
  its families' SKUs; still 8 suppliers and at most one PO each a run.
- *Bins.* SKU `i` sits in bay `i` (a bin in `[8i, 8i + 7]`), replacing the
  37-bin spread: every bay of every aisle holds a SKU.
- *Stock.* A bin's **full mark** is the level reorder planning tops it up to,
  `wmsReorderUnits + wmsReplenUnits` (420 units, `binFullUnits`). A new
  warehouse opens every SKU at `wmsStockOpenMinPct`-`wmsStockOpenMaxPct`
  (50-100%) of it (the old rule stocked 60-180% of the sample orders' units,
  about 25 units a SKU at 80 SKUs: empty racks). The reorder point and lot
  stay as W10 set them, now per SKU over 80 SKUs: each SKU is reordered
  about every day and a half, and the dock sees as many PO lines as before.
  A sweep of reorder point 100-180 and lot 200-300 kept every target; the
  W10 values give the fullest racks.
- *View and floor.* `WmsStockView` gains `full`; the floor draws each bay's
  stock against it (capped at full) instead of against the deepest bin.
- *Report.* RULES 11 gains "racks filled": every bay's stock against its
  full mark, averaged over the bays at a look every warehouse hour, 55% or
  more on average and 35% or more at the emptiest look of any seed.
- *Saves* are schema 10: a version-9 warehouse keeps its sixteen SKUs, bins
  and stock as they are; the 64 new SKUs take the bays nobody uses (aisle A
  first, the first bin of each) and arrive at their full mark. Tested with a
  real version-9 save the W10 build wrote.
**Measured** (`npm run harness -- report`, seeds 1-8, 2 h, an untouched
warehouse): racks filled 70% on average (65% at the emptiest look; the
painted share of the floor was 5-15% before), OTIF 88% (84% at W10), fill
98% (96%), pickers working 62%, dock crew 47%, $757 a warehouse hour, 219
POs in (as before). Catch-up of 8 hours: the 40-worker benchmark 301 ms in
Node against 303 ms for the W10 build on the same machine. Phone check
55/55 (the busy floor at 59 fps with the CPU slowed 4x; 10 hours away
reopens in 1.4 s).
**Why.** The racks are most of the floor, and an empty warehouse reads as a
broken one. A SKU a bay is the simplest truthful way to fill them: the sim
holds the stock the screen shows. Drawing against a fixed full mark makes a
bar mean the same thing in every bay and lets a player see a bin running
down to its reorder point.
**Cost.** Deeper stock makes shortages rarer: fill rises from 96% to 98% and
OTIF from 84% to 88%, so stock-outs, and the plan choices that matter most
under them, come up less (stock still costs nothing, docs/GAPS.md). Each
SKU is cycle counted five times less often (every 40 warehouse hours). The
Stock page lists 80 rows. A save migration that adds stock to the owner's
warehouse for free. The new SKUs' names are design data, not a real
catalogue.
**Reversing it.** `WMS_SKUS` built from one kind per family brings back 16
SKUs (with the bins they then take, bays 0-15); `wmsStockOpenMinPct` 10
with `wmsStockOpenMaxPct` 40 opens a thin warehouse. A lower
`wmsReorderUnits` (100) runs the racks emptier (65%) without hurting fill.

## K1 - Pivot: the warehouse becomes Snack Attack, a daily grid puzzle for kids
**Status.** Accepted, 2026-10-20, at the owner's request ("i want to wipe this
again, instead of a warehouse sim lets try a simple chess-like tower defence
game"). The owner then answered three rounds of questions, sent a brief of
locked decisions, accepted all twenty proposed defaults (D1-D20 in
docs/RULES.md) and said "Go all the way": reset, then build steps 1-6 of the
plan (docs/ROADMAP.md) up to a plain playable screen.
**Decision.** The game is Snack Attack (docs/RULES.md).
- Friends placed on a grid throw snacks in chess patterns (rook, bishop, king,
  knight; plus a Nurse) from lunchboxes to hungry kids on the path.
- Each kid wants one snack, worked out from a clue card (main mode, a 9-year-old
  reader) or shown as a picture (Kindy mode, a 4-year-old).
- Set up, press Go, watch. A day is 10 waves, plus a bonus round. There is one
  daily puzzle per day and unlimited practice, and every board is proved
  solvable before anyone sees it.

The warehouse code is removed. It is at commit `734c848`.
**What still binds.**
- The architecture records: S1 (pure `step`), S2 (commands only), S3 (the Host),
  S5 (seeded RNG, whole numbers, the Node-vs-Chromium hash test), S6 (the View),
  S9 (snapshot plus command log, versioned).
- T1-T6 (toolchain), P5 (commands carry no player id) and P7 (animation outside
  React).

**What is retired.**
- Every W record: the warehouse game.
- P3 (ticks and cents): K1 counts squares, beats and points.
- S4 and P4 (the host's clock and offline catch-up): replaced by K3.
- The P records about the airport game, already retired by W1 and W8.

**Conflicts the owner was shown, and how each was settled** (2026-10-20):
- C1 the whole repository was the warehouse: removed; the skeleton above kept.
- C2 the clock and offline catch-up: dropped (K3).
- C3 ticks and cents: beats and points.
- C4 RULES.md was tied to a test: replaced by the Snack Attack rules, test kept.
- C5 the WMS report targets: replaced by generator checks.
- C6 ROADMAP, DECISIONS and CLAUDE.md: rewritten by this session (K2).
- C7 one save per device: a slot per game kind now, per profile in build step 7 (done, K7).
- C8 the sim may not read Date: the host passes in the day number.
- C9 package names: `@snacks/*`.
- C10 big-number formatting: kept, harmless.
- C11-C18: the session's own earlier proposals (not chess, then chess
  patterns; kids walking, now standing; tapping a parent mid-wave, now a
  Nurse; 8-way throws in a range, now per-type patterns; rounds; points;
  Kindy), each settled as docs/RULES.md now says.

**Why.** The owner wants a game for their own kids. The warehouse was "too easy,
then what", and they want something "somewhat puzzly". A deterministic puzzle
with a solver fits the existing pure, seeded, hash-tested core better than any
earlier game did.
**Cost.**
- Everything game-specific is rewritten.
- The warehouse, airport and Nations saves are not read (a new database name,
  `snacks`).
**Reversing it.** `git checkout 734c848` has the warehouse.

## K2 - This session is the architect for the Snack Attack pivot
**Status.** Accepted, 2026-10-20. As in P2 and W2, the owner asked for the
change directly ("Go all the way"), so this session wrote K1-K5 and rewrote
docs/ROADMAP.md, CLAUDE.md, docs/RULES.md, docs/PROGRESS.md, docs/GAPS.md and
the README in one pull request with the code.
**Why.** A pivot touches every lane, and splitting it across parallel
sessions would leave the repository broken between them.
**Cost.** One large pull request.
**Reversing it.** Later sessions go back to their lanes.

## K3 - No clock: a wave is resolved whole when Go is pressed, and the host passes in the day
**Status.** Accepted, 2026-10-20 (conflicts C2, C3, C8).
**Decision.**
- The sim has no ticks. A command (place, turn, toTray, buy, go, retry) is
  applied when it arrives. `go` resolves the whole wave at once and returns
  every snack's route as data (`WaveResult`). The interface replays that as
  animation, a beat (220 ms) per square, outside React (P7).
- Nothing happens while the app is closed.
- The daily's seed comes from the day number: days since 1970-01-01 on the
  device's calendar, computed by the host and passed in. The sim never reads
  a clock.

This replaces S4 and P4 and the CLAUDE.md rule "the host owns the clock;
catching up N ticks must equal stepping N ticks".
**Why.** Waves are watch-only (L) and the board does not change during one, so
there is nothing to step in time. A wave resolved whole is easier to test
(hand-made boards) and to solve (the solver calls the same function).
**Cost.** The animation is a replay, not the sim running. That is fine while
waves are watch-only. A future rule that lets the player act mid-wave would
need ticks back.
**Reversing it.** Make `go` advance a beat at a time: the beat counts are
already in every route.

## K4 - Rules the brief left open, settled the way the engine needed
**Status.** Accepted, 2026-10-20, by this session under CLAUDE.md's "pick
the reading most consistent with the plan, say which, and proceed". The
owner sees them in docs/RULES.md section 7a.
**Decision.**
- A Nurse heals a kid once. A healed kid still there when the day ends counts
  as hungry.
- Kids never arrive on a square another kid may still stand on:
  - main mode: not on the previous wave's squares;
  - Kindy: not on any earlier kid's square.
- A Kindy day ends when every kid has been fed.
- The pass cap drops a snack at its 12th catch.
- First arrival is decided by beats:
  - a beat is one square crossed;
  - a Bouncer hop is 2 beats;
  - a catch takes none;
  - ties go to the higher picker, then the one further left (D8).
- Clue cards run 2-7 words. The brief said 3-6, but its own examples run from
  2 to 7 words.
- "Same as" cards point only at hats and glasses.

**Why.** Each case was otherwise undefined or could deadlock a board. A
healed kid staying forever would block the squares that later waves arrive
on.
**Cost.** Five small rules the owner did not write. Each is one line of code
or one generator constraint to change.
**Reversing it.** Each rule is local: `game.ts` (Nurse, day end, Kindy),
`generate.ts` (arrival squares), `clues.ts` (word counts, features).

## K5 - A sound, incomplete solver, and a generator that plants a solution and then checks it
**Status.** Accepted, 2026-10-20 (RULES 10).
**Decision.**
- **The solver** searches backwards from each kid to a lunchbox with the right
  snack, through routes of up to `routeMax` (3) friends, and combines one
  route per kid within the friends owned and the points earned. It keeps a
  setup only if the real wave engine feeds every kid with no tummy ache.
  - It is sound: anything it returns works.
  - It is not complete: it may miss a solution that needs a longer route, or a
    friend used only to block.
- **The generator** chooses a board, then kids whose shortest route has the
  length each wave calls for. It plants one route per kid, writes clues and
  sizes the tray, then runs the clue checker and the solver.
  - On any failure it tries the next seed: deterministic, so a daily is the
    same on every device.
  - The solver's solution is stored in the puzzle as the witness. It is never
    in the View.
- The harness checks 1000 main dailies and 300 each of bonus rounds and Kindy
  dailies on every `npm test`. The report checks 1000 of each:
  - every day passes;
  - a main day skips 0.7 seeds on average (9 at worst);
  - a main day takes 15 ms in Node (median) and 184 ms in the app with the CPU
    slowed 4x.

**Why.** A complete solver for a 48-square board with five friend types,
facings, passing and blocking would be slow on a phone. Soundness is what the
owner's rule needs ("no unsolvable boards, ever"). Throwing away the rare
board the solver cannot crack costs a few milliseconds. Planting first means
the solver almost always finds something, and the planted route lengths give
the difficulty ramp.
**Cost.**
- A board whose only solutions need a 4-friend route or a blocker is never
  generated, so some clever puzzles are lost.
- The starting tray is sized to the planted plan, so its mix hints at the
  intended solution.
**Reversing it.** Raise `routeMax` (slower), or let the solver place blockers.


## K6 - The controls pass: one setup screen, tap-to-aim, drag, Undo and Clear in the interface only
**Status.** Accepted, 2026-10-20, at the owner's request ("controls pass for
phones": the tap-then-tap controls worked but were poor on a phone). The owner
asked for the rules engine to stay as it is, and for the decision records to
be updated with the change.
**Decision.**
- **One screen, no scrolling during setup** at 360 x 740: the bar, the kids'
  cards, the board (sized by a CSS container query to the height left, squares
  never under 44 px) and the dock: the selected friend's controls, the tray,
  Undo, Clear board and Go. The kids' cards share one row in a shorter form
  when 3 or 4 kids are on the board. This replaces the old layout where the
  clue cards and the snack list scrolled under the board.
- **Tap-to-aim.** A selected friend lights every square its pattern can throw
  to (Straight and Diagonal up to the first thing on each line, Short 8,
  Bouncer 8 L-hops); a tap there sends a `turn` command. One small turn button
  stays for facings no square stands for (a friend at the edge facing off the
  board). A selected Nurse lights its heal range. `nurseRange` reaches the
  screen in the host's update (`GameUpdate.healRange`), so the interface keeps
  no copy of a tunable.
- **Drag** on pointer events: tray to square (`place`), square to square
  (`place` at a new cell), off the board (`toTray`). Every drag has a tap way
  (tray then square; Move then square; To tray). While a finger drags, the page
  cancels the browser's own touch moves, because otherwise a quick drag can end
  as a fling and Chromium swallows the next tap.
- **Undo and Clear board live in the interface.** The screen keeps, for each
  change in this setup, the commands that put it back, and sends them like any
  other command. The stack empties at Go, at a retry and in a new game.
  Clear board sends back every friend not on the board when this setup began.
  The sim has no undo; nothing a played wave locked in can be undone.
- **The tray** shows each friend's name, a 5 x 5 diagram of its pattern
  (also on the board's tokens and in the shop) and how many are left. The
  chess symbols are gone.
- **The result** of a wave is a card over the board: fed, tummy aches,
  healed, hungry against the allowance, points, and one button back to setup.
- **D12 is unchanged:** every friend shows only where its next throw lands, as
  a dashed line from the friend to that square.

**Why.** A 9-year-old playing one-handed should not scroll between a kid and
its clue, nor turn a friend through up to eight facings to aim it. Keeping undo
and the layout in the interface leaves the sim, its saves and the
determinism test untouched.
**Cost.**
- Undo history lives in memory: reloading mid-setup empties it, and Clear
  board then treats friends placed before the reload as earlier ones.
- A selected friend's lit squares take taps that would otherwise select a
  friend or open a kid's card on those squares; the cards above the board and
  the Done button cover both.
**Reversing it.** The previous screen is at commit `f97ff86`.

## K7 - Profiles on one phone: a profile book beside the saves, a streak worked out from finished days, dates that can't break it
**Status.** Accepted, 2026-10-20, at the owner's request (build step 7:
"profiles, daily completion and streaks"). The owner asked for the decision
records to be updated with the change, so this session wrote this record
and edited ROADMAP.md as in K2.
**Decision.**
- **A profile book** (`ProfileBook` in contracts, pure functions in
  `packages/sim/src/profiles.ts`) holds every profile:
  - an id (`p1`, `p2`..., never reused);
  - a picture, an optional name and a mode (set when made, RULES 12);
  - its finished days, one `DayRecord` each (fed, hungry, retries, bonus won);
  - its best streak, and the save slot it is playing.

  It is a plain value. The host keeps it on the device and passes in today,
  so nothing in it reads a clock.
- **Storage.** The IndexedDB database `snacks` goes to version 2.
  - A new `meta` store holds the book under `profiles`.
  - Every game slot moves under its profile: `p1/daily-main-20400`,
    `p1/bonus-main-20400`, `p1/practice-main`.
  - The book has its own `version` and a migration chain like S9's.
  - A book that can't be read (damaged, or from a newer game) is copied to
    `profiles-unread` and the app carries on with a fresh book. Its first
    profile finds `p1`'s saves again, and new ids skip every id a slot uses.
- **Version 0 to 1, the migration.** A device played before profiles had
  slots without a profile and the active slot in localStorage. They become
  the first profile's: slots renamed under `p1/`, the active slot carried
  over, and every won daily and bonus round in the old slots put on its
  record, so the streak survives. The book is written before the old slots
  are removed, so a migration cut short simply runs again.
- **The streak** (RULES 9, D10): consecutive local calendar days on which
  the profile finished the 10-wave daily.
  - It is worked out from the finished days and today, never stored: today
    if finished, else the run up to yesterday; a missed day makes it 0.
  - A day finished after a retry counts. The bonus round and practice never
    change it.
  - The best streak is stored and only grows.
  - History keeps `historyKept` days, and never cuts a streak still going.
- **Dates.** A won daily is recorded under the puzzle's day, the day the run
  started, not the day it ended. So:
  - a run across midnight counts for its first day;
  - a timezone change or a clock set backwards only changes which day is
    today: the finished days are a set, so nothing is counted twice, and
    days after "today" wait until the clock catches up;
  - opening the app on a later day opens that day's daily, and an
    unfinished earlier run stays saved.
- **The screens.**
  - **The picker** opens on launch when there is more than one profile;
    with one, the app goes straight to that child's game. It also opens
    from the picture in the top bar, which shows the streak.
  - **The grown-ups' menu** (add, change, delete with a confirm step) opens
    from a one-second press-and-hold (D17). Lifting the finger after the
    hold is not a tap, so the menu that opened under it isn't pressed by
    accident.
  - **Done for today:** a won daily shows this screen instead of the board,
    with a countdown to local midnight (from the host, written to the DOM
    once a second, P7).
  - **Kindy:** a Kindy profile opened a picture-only "coming soon" screen
    until build step 10 (K8 replaced it with the Kindy screen).
- The host publishes a `HomeView` (profiles, streaks, who is playing, the
  pictures to offer) beside the game updates, and every `GameUpdate` says
  whose game it is. The interface shows a game only when it belongs to the
  profile on screen.

**Owner's spec, refined.** RULES 12 (L) said "the first screen is a row of
big avatar pictures". The step 7 prompt says the picker opens on launch
only when there is more than one profile. With one profile there is
nothing to choose, so RULES 12 now says that. The prompt's "edit" changes
the picture and name only, because RULES 12 sets the mode when a profile
is made.
**Why.**
- Two children share one phone, and a 4-year-old must be able to switch
  without reading.
- Working the streak out from finished days, instead of counting up a
  number, makes every date problem (midnight, travel, a clock set back)
  harmless by construction: there is no "last played" to go wrong.
- Keeping the book pure puts the streak rules beside the other rules, under
  the same purity checks and tests.
**Cost.**
- Old daily slots are never cleaned up: one per profile per day, a few
  kilobytes each.
- Changing a timezone can show yesterday's puzzle once more, and a clock
  set forward lets a child play tomorrow's puzzle early. Both are allowed
  on purpose.
- A Kindy profile can't play yet.
**Reversing it.** The profile screens are in `apps/web/src/ui` (Picker,
ParentMenu, DoneToday; KindySoon until K8) and the host in `platform/localHost.ts`.
Without profiles the app would need its one profile's slots renamed back.

## K8 - Kindy on screen: pictures drawn by CSS, hints from the stored solution, and Kindy days that never get stuck
**Status.** Accepted, 2026-10-20, at the owner's request (build step 10:
"Kindy mode playable on screen"). The owner asked for the rules, the
roadmap, the spec and the decision records to be updated with the change,
so this session wrote this record and edited ROADMAP.md as in K2 and K7.
**Decision.**
- **A Kindy profile plays Kindy.** The host opens its own daily (the date
  seed with the Kindy salt) in its own slot, `pN/daily-kindy-<day>`, and its
  practice board in `pN/practice-kindy`. A won Kindy daily goes on that
  child's record like a main one; Kindy has no bonus round. The "coming
  soon" screen is gone.
- **No text, proved.** Every picture on the Kindy screens (snacks, kids,
  friends, avatars, the flying snacks, the hand) is an emoji drawn by CSS
  from a `data-pic` attribute (`Pic.tsx`), so the page holds no text node at
  all. The phone check walks the whole page on every Kindy screen and fails
  on any visible text, or any `data-pic` that is a letter or digit. The
  Kindy screen never shows a toast; a refused tap wiggles the square.
- **Aiming in Kindy** lights one square per facing: where that throw ends
  (`lineEnds`), so a Straight has at most 4 big squares, each with an arrow.
- **Hints** are pure sim (`hint.ts`), in the View as `hint` for Kindy only
  (always null in main mode, S6). A hint is one step: place a friend (moving
  one already out before taking one from the tray), aim it, take one in the
  way back, or Go. The setup it leads to is the stored solution (the
  witness) while the day goes to plan. Once a kid is left waiting, the
  witness no longer fits the board, so the hint leads to what the solver
  finds: a setup that feeds every kid there, else one that feeds the kid who
  has waited longest (their own wave's witness first), checked by the real
  engine with the others standing in the way (`feedSome`). A setup that
  already feeds everyone gives the hint Go.
- **The interface shows the hint** after `kindyHintIdle` (8) seconds without
  a tap, or when the help bubble is tapped: a hand moves from the friend to
  where it goes, by CSS variables on one element (P7). The phone's voice says
  a few words (platform `speech.ts`, the Web Speech API). Speech starts on
  the child's first tap (iOS allows it only after one) and is silently
  skipped where there is no voice; the hand is always there. A `voice`
  preference beside sound and haptics, on by default, is switched in the
  grown-ups' menu.
- **Kindy days never get stuck.** The step 10 work found that on about 1
  Kindy day in 8, if the child missed one kid, the next kid stood in the way
  so that neither could ever be fed with the friends given: a day that could
  not be finished, against "Kindy can't be lost" (L). The generator now
  rejects such a board (`stuckKindySet`: every set of kids who could be
  waiting together must have one kid `feedSome` can feed) and tries the next
  seed, as K5 does for any other failure. The harness checks it on its 300
  Kindy days, and a sim test plays 60 days by a child who presses Go too
  soon at random and then follows the hints.

**Owner's prompt, as read against the spec** (no conflict with a locked
rule, so no stop):
- "5 waves of 1 kid each": RULES 7a (K4) goes on past the fifth wave until
  every kid is fed, as the prompt said to follow the spec where it is more
  detailed.
- "Let the child try again (follow the spec on whether the board resets)":
  the board stays as the child left it and the kid waits for the next wave
  (D15); there is no reset in Kindy.
- "No timer" and the 8-second idle hint: nothing in the game is timed; the
  idle clock only decides when the hand shows itself, in the interface.
- "Aim by tapping one of the 4 highlighted squares": one square per facing,
  so fewer at the edge of the board, where a throw off the board feeds
  nobody.
- "Its own sticker book per profile": the sticker book is build step 11 and
  not built here (logged in docs/GAPS.md).
- "From picking their avatar": the picker is shared with the main-mode
  child and keeps its heading, the optional names and the Grown-ups button;
  a Kindy child needs only their picture there. The no-text check covers
  every Kindy screen. Owner to confirm (logged in docs/GAPS.md).

**Why.**
- Drawing pictures by CSS makes "no text" something a test can prove, not
  just a promise, and costs nothing (an emoji either way).
- Hints in the sim keep them deterministic, tested on hand-made boards and
  on generated days, and next to the solver they reuse; the interface only
  points.
- A stuck day would leave a 4-year-old with no way forward: rejecting the
  board is the same "never unfair" rule as K5.
**Cost.**
- About 1 Kindy day in 8 moves to a later seed than before, so those days'
  Kindy puzzles changed. Nobody had played a Kindy day yet.
- The View carries a hint on every Kindy update (cheap on a 4 x 4 board).
- The voice preference is per phone, not per child.
- Hints off the plan come from the solver, so they may not be the shortest
  way, and they may feed only one of two waiting kids in a wave.
**Reversing it.** The Kindy screen is `apps/web/src/ui/KindyGame.tsx` and
`KindyDone.tsx`; the hint is `packages/sim/src/hint.ts`; the stuck check is
one line in `generate.ts`.

## K9 - The shop screen: a bottom sheet of cards, a refund until Go, and no options to change before buying
**Status.** Accepted, 2026-10-20, at the owner's request (build step 9: "a
proper shop screen"). The owner asked for the rules, the roadmap, the spec
and the decision records to be updated with the change, so this session
wrote this record and edited ROADMAP.md as in K2, K7 and K8.
**Decision.**
- **The screen** (RULES 8, "On the screen"): the Shop button in the tray
  shows the points; it opens a bottom sheet with a card per friend the
  puzzle sells (a picture, the name, the tray's pattern diagram, one line a
  grade-4 reader can follow, "You have N", the price). Too few points greys
  the card out and its button says "Need N more". A buy puts the friend
  straight into the tray under the sheet. The sheet closes with its close
  button, the backdrop, Escape or a swipe down on its top; every sheet now
  closes that way, and the swipe moves it by direct DOM writes (P7). Main
  mode only; Kindy has no shop (D15).
- **Never during a wave.** The button is off from the moment Go is pressed
  (before the host answers) until the replay ends, and the sheet closes if
  setup ends under it.
- **A refund command** (`{ type: 'refund', friend }`, S2). The spec said
  nothing about refunds, so, as the step 9 prompt asked, a friend bought in
  this setup can be given back for its full price until Go is pressed,
  whether it is in the tray or on the board. "Bought in this setup" is
  worked out from what the game already holds: a friend's id is at least
  the checkpoint's next id (`boughtThisSetup`), because only buying makes
  friends and the checkpoint is set at every Go and kept by a retry. So the
  save format, the hash and the checkpoint are unchanged, and no new state
  is stored.
  - The View's shop item says the shortfall, how many the player has, and
    which friend a refund gives back: the last one bought, one still in the
    tray before one on the board.
  - The interface's Undo stack drops every step that names a friend given
    back. Undo still never takes back a purchase (K6); Give back does.
- **Fairness, tested.** A sim test plays three dailies twice, with a buy, a
  refund and a buy again before every wave that buys, and gets the same
  wave results and the same hash. The harness checks every one of the
  1600 generated days sells every friend its solution buys (Kindy none), and
  makes 150 days again from their own seeds: the catalogue, and the whole
  puzzle, come out the same. The 300 scripted games hashed in Node and
  Chromium now buy and refund too.

**Owner's prompt, as read against the spec** (no conflict with a locked
rule, so no stop):
- "The spec": the prompt names docs/snack-attack.md, which does not exist;
  the spec with the (L) rules and D1-D20 is docs/RULES.md, so that is what
  this session read and updated.
- "Reached from the setup phase between waves": the button also works in
  the setup before wave 1, where with no points every card says what it
  needs. RULES 8 allows the shop whenever the game is in setup.
- "Refunds: follow the spec": RULES 8a (K6) said only that Undo and Clear
  board don't reach past Go or back into the shop. A refund until Go keeps
  to that: nothing a played wave locked in can be changed.
- **"Modify" (an open question).** The owner's first brief spoke of picking
  from a catalogue and modifying before buying. The spec defines nothing to
  modify: a friend is a type and a facing, and the facing is set on the
  board. This session did not invent one. Recommended default: keep it
  that way; the facing is the friend's only setting, chosen where it
  matters, on the board. If the owner meant something else (say, a hat or
  colour for each friend), that is a cosmetic for step 11 and must never
  change play (RULES 9). Logged in docs/GAPS.md for the owner.
- "The catalogue for a day is fixed by the seed": it is, and it was. Every
  main-mode puzzle sells all five friends, so nothing about the catalogue
  changes from day to day yet; the checks guard that it stays a function of
  the seed if it ever varies.

**Why.** A 9-year-old who taps the wrong friend should be able to fix it
before the wave, without a grown-up and without losing points for good;
after Go the points are spent, as before. Working out "bought this setup"
from the checkpoint keeps the sim's state, saves and hashes as they were.
**Cost.**
- A refunded friend's number is not reused, so friend ids can have gaps.
- A friend bought, placed and aimed, then given back, loses its place and
  facing; buying again puts a new one in the tray.
- The pictures are emoji until the art in step 8.
**Reversing it.** Remove the `refund` case in `game.ts`, the `refund`
field of `ShopItem` and the Give back button in `apps/web/src/ui/Shop.tsx`.
The plain list the shop replaced is at commit `d205c40`.

## K10 - Art and animation: one original SVG style, clues readable without colour, a replay driven by a timeline
**Status.** Accepted, 2026-10-20, at the owner's request (build step 8: "art
and animation"). Numbered K10 because the shop screen, built in parallel
and merged first, took K9. The owner asked for the rules, the roadmap, the spec and
the decision records to be updated with the change, so this session wrote
this record and edited ROADMAP.md as in K2, K7 and K8.
**Decision.**
- **One style, all in the repo.** Every picture is inline SVG drawn by a
  React component in `apps/web/src/ui/art/` (snacks, lunchboxes, obstacles,
  the parents' table, kids, friends, avatars, icons) or CSS (grass, paving,
  the shop's awning, sparkles). No image files, no third-party art, no
  emoji in the game's screens, no new dependency. docs/ART.md is the art
  direction: a friendly schoolyard at lunchtime, one warm brown ink, chunky
  rounded shapes, flat fills.
- **Clues are read from the art.** Every trait a clue can point at has a
  picture (RULES 6). Colour is never the only cue: each snack colour has a
  mark (triangle, square, star, diamond, leaf) on the lunchbox's tag, in the
  clue card's snack key and in the clue's pictures; each shirt colour has a
  pattern. `art.test.ts` takes every colour out of the pictures and fails if
  two snacks, colour chips, lunchbox tags, shirts, friends, avatars or clue
  pictures are then the same; the harness checks every colour in the snack
  pool has a mark.
- **The View carries each clue's facts** (`KidView.facts`, main mode only)
  beside its text, so the screen draws the clue as pictures without parsing
  words. It holds nothing the text didn't already say (S6).
- **Friends look like game pieces.** Each stands on a round base and wears
  the hat of its chess piece (a tower, a tipped hat, a crown, a pony hood)
  with a badge of its throw (a plus, a cross, a ring, an L); the Nurse a cap
  and heart (no red cross). Hungry kids have no base, so the two never mix.
- **The replay is a timeline.** `timeline.ts` turns the wave result into
  numbers: each snack's position and height at each moment (a beat a square,
  arcs by the thrower's type), and when lids open, friends catch and kids
  react, heal or walk home. It is pure and tested on hand-made results.
  `replay.ts` plays it with the Web Animations API on transform and opacity
  only, cloning the lunchbox's own snack picture to fly; faces change by one
  attribute write (`data-mood`). React does not render during a wave (P7).
  With reduced motion the timeline has no arcs or spins and the kids no
  dances, wobbles, walks or sparkles: a face change and a gentle fade.
- **Kindy uses the same art** at about 80 px a square, the wanted snack in a
  bubble inside the kid's square (so the top row's bubble is not cut off),
  and pictures only. The CSS emoji of K8 (`Pic.tsx`, `data-pic`) are gone;
  the no-text check now also fails on any SVG `<text>`, `<title>` or
  `<desc>`, and `art.test.ts` proves no picture holds text.
- **Checked on every build and on a phone.** `npm test` runs the art and
  timeline tests. The phone check also proves every picture is inside 360 x
  740 and showing, that the replay flies every snack as its picture and
  moves only transform and opacity, that snacks arc, and that the calm
  version doesn't; and a new visual check compares four screens (main
  board, Kindy board, shop, result) at 360 x 740 with committed pictures.

**Owner's prompt, as read against the spec** (no conflict with a locked
rule, so no stop):
- "docs/snack-attack.md": there is no such file; the locked decisions (L)
  and D1-D20 are in docs/RULES.md, which this session read as the spec.
- "A test that fails if two snacks differ only in colour": read as the art.
  In RULES 4 the apple and the cookie share every trait but colour (both
  crunchy, sweet and round), by the owner's own table; the test checks the
  drawings, and the harness checks that such snacks have different
  outlines, so "Something red" can still be solved without seeing red.
- "The tray, shop and profile avatars": the shop screen (K9, merged while
  this was being built) gets the friends' pictures in place of its emoji, a
  drawn star beside each price and an awning.
**Why.** The children should see a place, not a spreadsheet, and a
colour-blind player must be able to solve every board. Drawing in SVG keeps
the art small, sharp at any size, identical on every phone and testable as
text. A timeline keeps the replay honest to the sim and testable without a
browser.
**Cost.**
- About 40 KB more to download (12 KB gzipped): main's build was 321 KB of JavaScript and CSS and is now 361 KB, against a budget of about 300 KB more.
- The kids' skin and hair are picked from their id: looks only, never a clue.
- The visual check, like the phone check, needs a build and a Chromium, so
  it runs by hand, not in CI.
**Reversing it.** The pictures are `apps/web/src/ui/art/`; the grey-squares
screen with emoji is at commit `d205c40`.

## K11 - Hints in main mode, decoys in the tray, a bonus round that ramps, and a difficulty report
**Status.** Accepted, 2026-10-20, at the owner's request ("hints, tray
giveaway and difficulty ramp"). The owner asked for the rules, the roadmap,
the spec and the decision records to be updated with the change, so this
session wrote this record and edited ROADMAP.md as in K2, K7 and K8.
**Decision.**
- **A hint command** (`{ type: 'hint' }`, main mode, setup only) in the sim
  (`mainHint.ts`). Each press is the next tier for one kid, from the stored
  solution: 1, whose card to solve next and what it is about (cards that pin
  their snack themselves first); 2, the lunchbox that feeds them; 3, one
  friend of their route put in place and aimed (a friend of another type on
  the square goes to the tray; a spare friend on the board moves before one
  comes from the tray; one is bought only if none is owned). With the kid
  fed by the board, the next press moves to the next kid; with all fed, the
  hint says Go (tier 0). Off the plan (a healed kid, other friends bought)
  the setup comes from the solver with what the player has.
  - The press is a command, so it is in the save's log, replays the same in
    Node and Chromium (the determinism test now also plays a whole day by
    hints) and is checked like any other. Tier 3's moves go through the
    normal place, turn, toTray and buy rules. The screen puts whatever tier
    3 moved on its undo stack (worked out from the friends before and after).
  - `GameState` gains `hints` (per wave, kept across a retry) and `hint`
    (the one showing, cleared by Go and retry). Save schema 2; the migration
    from 1 replays the log, checks the old hash on the old fields and writes
    the new hash, so a damaged old save is still refused. Tested on a real
    version-1 save (`packages/harness/fixtures/save-v1.json`).
  - `DayRecord` gains `hints`, written when the daily is won. The profile
    book keeps version 1: a record without it reads as 0, and an older app
    ignores it, so neither has to refuse the other's book.
- **S6 refined.** The View still never holds what a main-mode kid wants,
  except the lunchbox a tier-2 hint shows: the player asked for it.
  `GameView.mainHint` is null in Kindy and outside setup.
- **Decoys** (`decoys`, 2): main-mode trays get friends the planted day
  doesn't need. The solution proved on the planted tray is kept (owning more
  never stops a setup, buying costs the same). The first decoy is a type the
  tray already holds as many of as the solution ever places at once, never
  used if possible, so it is spare on every wave; the second is any type
  that throws. The generator keeps a day only if its tray keeps a friend the
  solution never places and no wave places every friend owned. Kindy's
  given friends are unchanged (D15): its puzzles are the same, hash for hash.
- **The giveaway metric.** A wave gives the answer away when the friends
  owned at its start are exactly what its solution places; a day's tray
  does when every friend in it is placed on some wave. Before K11, on 1000
  days from day 20000: 0.8% of daily waves and 67% of daily trays (2.2% and
  63% in bonus rounds). Now 0% and 0%, the report's target.
- **The bonus ramp.** Bonus waves are planted so the two kids' shortest
  routes add up to a number rising evenly from `bonusFriendsFirst` (3) to
  `bonusFriendsLast` (5), each kid 1-3 friends; clues pointing at another
  kid rise from 30% to 90%. Kid squares are picked from pairs whose lengths
  already add up, and a board without two such pairs for the hardest total
  on four squares is thrown away before planting. Measured difficulty goes
  3.4 to 5.9 (daily wave 10: 4.5).
- **The report** (`npm run harness -- report`, docs/balance/generator-report.md)
  adds the giveaway table, the bonus curve, the targets (with a failing
  exit code when one is missed) and, for each kind, a table of kids,
  friends needed, clue-logic steps, pass chains, spare friends and tray
  tells per wave. The 1000-day check fails on any day without a decoy, any
  tell wave, any bonus wave off the ramp, or a flat bonus curve.

**Owner's prompt, as read against the spec** (no conflict with a locked
rule, so no stop):
- The prompt names docs/snack-attack.md; there is no such file. The spec is
  docs/RULES.md (K1), where the (L) decisions and D1-D20 live.
- The play-test feedback section of the prompt was the empty template, so
  there was no feedback to apply.
- "End harder than the main day's wave 10": RULES 8 (L) keeps 2 kids a
  bonus wave, so the ramp is in route lengths and clues. Ending at 6 (both
  kids on 3-friend routes) skips about 23 seeds a day and came within reach
  of `generatorSeeds`; 5 skips 2.3 and still ends well above the daily.
- "Tier 3 places one friend": the hint places it itself, as a command, and
  buys it if none is owned (points the witness would have spent anyway).
- "Clue-logic steps" are counted as facts on a card, plus the facts of the
  card a "same as" or "sister" card points at.
**Why.**
- A 9-year-old stuck on a wave needs a way forward that teaches (whose card,
  then what it means) before it gives the answer away (a friend placed).
- A tray of only the answer's pieces makes the puzzle "use everything";
  one spare friend is enough to break that, and a type the solution never
  uses also hides the mix.
- A bonus round as flat as the daily's end is not a reward for finishing.
**Cost.**
- The View can now say what a main kid wants, after a hint.
- Every main daily, bonus round and practice board changed (new tray;
  bonus boards entirely). Saved games keep their own puzzle.
- Trays are 2 friends longer, so the tray more often shows all four
  throwing types beside the shop (each button stays over 44 px at 360 px).
- Bonus rounds skip 2.3 seeds on average instead of 1.0; the time per day
  is unchanged (about 17 ms in Node).
**Reversing it.** Set `decoys` to its floor and remove `withDecoys`
(generate.ts); set `bonusFriendsFirst` = `bonusFriendsLast`; the hint is
`mainHint.ts`, one case in `game.ts`, and the button in `Game.tsx`.

## K12 - The sticker book and outfits: cosmetic only, worked out from the profile and the day, worn on the player's avatar and nowhere else
**Status.** Accepted, 2026-10-21, at the owner's request (build step 11:
"sticker book and outfits"). The owner asked for the rules, the roadmap, the
spec and the decision records to be updated with the change, so this session
wrote this record and edited ROADMAP.md as in K2, K7, K10 and K11.
**Decision.**
- **The schedule** (RULES 9a). The spec only says "hats, outfits and
  sticker-book entries, earned by finishing dailies" (L), so the owner's
  default was used and is recorded here:
  - one sticker per finished daily (a pool of 24: Snacks, Friends, Sunny day,
    School);
  - one gold sticker per won bonus round (a pool of 6), which can only be won
    after that day's daily, so it still rides on a finished daily;
  - a hat or outfit when the streak reaches exactly 3, 7, 14 and 30 days:
    party hat, scarf, crown, cape (hat, outfit, hat, outfit);
  - practice earns nothing.
- **Which sticker is a function, not a draw.** `stickerFor(profileId, day,
  kind, owned)` in `packages/sim/src/stickers.ts` hashes `profile|kind|day`
  with the RNG's own integer mixer to a place in the pool and takes the first
  sticker from there, going round, that the profile does not own. No clock, no
  unseeded randomness; the purity test scans the file like the rest of the sim.
  Two profiles fill their books in different orders. A full pool gives
  nothing.
- **Where it lives.** In the profile, in the profile book: `stickers`,
  `cosmetics` (hats and outfits, each with the streak that earned it), `worn`
  (one hat, one outfit) and a `seen` flag on each earned item for the reveal.
  `recordDaily` and `recordBonus` (`profiles.ts`) award in the same pure
  step that records the day, so a day that is recorded twice, retried or
  reopened is safe. `equipCosmetic` and `acknowledgeStickers` are the only other
  writers. The host gets `equip` and `seeStickers`; the screens read the
  catalogue from `HomeView.catalogue`, so they never import the sim.
- **The save** (S9). The profile book goes to version 2. The 1 to 2 migration
  gives each profile the stickers and hats its finished days would have earned,
  replaying the days in order with the same functions as live play (a test
  proves a migrated book equals a played one), all marked seen. Reading a
  version-2 book is forgiving: unknown ids, the wrong kind, repeats, and worn
  items that are not owned or are in the wrong slot are dropped, never thrown.
  The migration is tested on a real version-1 file
  (`packages/harness/fixtures/profile-book-v1.json`) and in a real browser by
  the phone check. A book from a newer game is still refused.
- **Books are kept apart.** The book is a field of the profile, so deleting a
  profile deletes only its own, and a new profile (a fresh id, never reused)
  starts empty. Tests cover earning, equipping and deleting.
- **Cosmetic only, enforced.** `packages/harness/src/cosmetics.test.ts` fails
  if any sim file other than `stickers.ts`, `profiles.ts` and `index.ts`
  mentions stickers or outfits or imports them, if the View holds such a key,
  or if a day's puzzle and a wave hash differently for a profile that has
  earned everything.
- **Not on kids, and not on friends** (the owner's rule, plus one finding).
  Kids' hats, glasses and backpacks are clue attributes, and K10 drew each
  friend with the hat and badge of its pattern, so a cosmetic on either would
  be a false clue signal. The prompt allowed friends "if the spec allows";
  the spec (K10) does not, so cosmetics go on the player's own avatar only
  (top bar, picker, book, reveal). `apps/web/src/ui/art/cosmetics.test.ts`
  fails if a kid or friend picture, or any file that draws or labels one,
  mentions cosmetics; if anything but `Avatar.tsx` imports the cosmetics
  drawing; if `KidArt` or `FriendArt` accept a cosmetic (a `@ts-expect-error`
  line stops compiling); or if a cosmetic is drawn in the clue hat's blue.
  The phone check also looks at a real board, a clue card and a practice board
  with a hat and scarf on and finds nothing worn outside the avatar.
- **The screens.**
  - The sticker book is an overlay over the child's game: Back, the count, the
    child's avatar wearing what they wear, page arrows with the page name,
    six slots a page (names under the stickers), and a row of the four hats and
    outfits (tap to wear, tap again to take off; unearned ones are silhouettes
    that say how many days in a row). A page's backing shape tells the pages
    apart without colour (`catalogue.test.ts` takes the colour out and
    checks no two stickers match).
  - Kindy gets the same book with no words: a house, arrows and dots, 64 px
    targets, no Gold page (no bonus round exists to fill it).
  - The reveal sits over done for today. CSS animates it (P7): a pop with a
    little spin, a glow and sparkles. It puts itself away after 2.6 s (350 ms
    more per extra item) and a tap anywhere skips it. With reduced motion it is
    shown still. It marks the items seen when it ends or is skipped, so it plays
    once; a closed app replays it.
  - Entry points: the done screen (both modes), the menu (main) and the Kindy
    top bar in the spare slot where the help hand goes when there is no hint.
- **Where this meets the spec.** (1) "docs/snack-attack.md" does not exist;
  RULES.md is the spec, as in K10. (2) The owner's default gives a bonus
  sticker; RULES (L) says cosmetics are "earned by finishing dailies". The
  bonus round is part of a finished daily's day, so the two agree; noted
  rather than stopped for. (3) CLAUDE.md makes ROADMAP.md and DECISIONS.md
  architect-only; the owner's brief asks for both to be updated, as it did in
  K10 and K11. No locked (L) decision or D1-D20 default was changed.
**Why.**
- A child should be able to look forward to a morning's sticker, and to a hat
  for keeping a streak, without the game ever getting easier or harder for it.
- Working the sticker out from the profile and the day, instead of storing a
  random draw, makes it the same on every device, safe to claim twice, and
  rebuildable if a book is ever damaged.
- Putting hats only on the player's avatar keeps every picture of a kid and a
  friend meaning exactly what its clue says.
**Cost.**
- Four hats and outfits, and 30 stickers, last a child about 30 days of dailies
  (24 daily stickers, then none more). That is the whole book; more stickers
  are one more row in `stickers.ts` and a picture, and a migration is not
  needed because the pools are read, not counted.
- The 3 and 7 and 14 and 30 are catalogue data in `stickers.ts` and RULES 9a,
  not entries in the tunables table: they decide a gift, not the play, and
  keeping them out of the table keeps the rule "tunables change play" true.
- The top bar's avatar is 38 px, so a hat there is small. The book and the
  picker show it at 56 to 88 px.
- About 20 KB more to download.
**Reversing it.** The screens are `StickerBook.tsx`, `StickerReveal.tsx`,
`BookContext.tsx` and `art/Cosmetics.tsx`, `art/Stickers.tsx`; the rules are
`stickers.ts` and the award calls in `profiles.ts`. Removing them leaves the
profile book readable: version 2's extra fields are ignored by reading it as
version 1 would need a downgrade, which is not written.
