# Decision records

One record per decision. Each says what was decided, why, what it costs, and what
would have to happen to reverse it. **Changing one of these needs a new record
appended here, not an edit to an old one** - later sessions rely on these being
stable.

**Read P1 first.** On 2026-10-01 the project pivoted from "Nations" to an idle
airport game. P1 lists which of the records below still bind (the architecture
ones) and which retired with Nations. `P` records cover the airport game. Older
prefixes: `D` came from the Nations roadmap, `S` are the nine architecture seams,
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
