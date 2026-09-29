# Progress
Current phase: 2

## Gate 0 checklist
- [x] Sim core has no UI, DOM, network or clock imports (enforced by tsconfig, ESLint and packages/harness/src/purity.test.ts)
- [x] 1,000 seeds give identical hashes in browser and Node (packages/harness/src/determinism.test.ts, headless Chromium)
- [x] Dummy AI and UI use the same command API (both submit ordinary Commands; the UI through LocalHost in a Web Worker, prompt 04)
- [x] Save-reload-continue matches an uninterrupted run (property test in packages/sim/src/session.test.ts)
- [x] 1,000 catch-up ticks under 2 s on a mid-range phone (owner reported, 2026-09-28; re-measure with the Phase 1 economy)
- [x] PWA installs and runs offline on iOS and Android (owner reported, 2026-09-28)
- [x] Owner completes three sample decisions one-handed (owner reported, 2026-09-28)
- [~] Independent review signs off the nine seams (WAIVED by the owner; seam 8 built in prompt 06, not yet re-reviewed)

Gate 0 verdict: **PASS WITH WAIVERS** (docs/gates/GATE-0.md).

## Gate 1 checklist
Suite: `npm run harness -- gate1` (200 seeded full-roster games, random strategies, paired runs). Latest results: docs/balance/gate1-prompt10.md (`--ranges 4`: graded on seeds 1-200, 201-400, 401-600, 601-800 and pooled).
- [x] 200 seeded full-roster games with no crashes (0), no negative stocks (0), sources and sinks in band (food 91.8-92.1%, energy 84.5-84.6% consumed/produced; Credit sinks 0.5% of income; prompt 09, three graded ranges)
- [x] The same nation does 15%+ better against its baseline trading than isolating (prompt 10: +17.6-17.7% on each of seeds 1-200, 201-400, 401-600, 601-800, pooled +17.6%, 62.6% of pairs at +15% or more; was +14.5% pooled at the Gate 1 review. confirmed by the second Gate 1 review)
- [x] Isolationists worse off but alive (isolating scores lower in 94.5-96% of pairs; 0 dead; prompt 09)
- [x] Dead states under 2% (0.0%)
- [~] No nation tops the score in more than 2x its fair share, 11.8% (WAIVED by the owner, 2026-09-28, carried to Gate 2; FAIL after prompt 09's rule change: Egypt 12.5%, Saudi Arabia 13.0%, Russia 15.0%, Saudi Arabia 14.0% on seeds 1-800 in four ranges, pooled Russia 12.6%, was India 34.5-45%; owner decision in docs/balance/gate1-prompt09.md; prompt 13 trade-gain rule graded 12.0 / 12.5 / 13.5 / 14.0% and was reverted, owner waiver recommended in docs/balance/gate1-prompt13.md)
- [x] A trade in 3 taps or fewer (prompt 07: 2 taps from home - open the card, send the offer; checked by touch at 360 px)
- [x] Gate 0 still passes (determinism 1,000/1,000 Node vs Chromium, purity, save/load; phone speed to re-measure)

Gate 1 verdict: **PASS WITH WAIVER** (docs/gates/GATE-1.md): the owner waived the top scorer (12.5-15.0% on seeds 1-800) after prompt 13. The real-phone trade and phone speed check are carried to the Gate 2 playtests.

## Gate 2 checklist
Suite: `npm run harness -- gate2` (200 seeded games with random archetypes, cooperator / free-rider and spoiler pairs, 40 absence runs, and the Gate 1 suite again). Latest results: docs/balance/gate2-p2-prompt09.md (seeds 1-200; tuned on 1001-1100 only).
- [x] Crisis success 40-75% (55.3% of 1,182 crises; climate 536 / 385 / 79, pandemic 118 / 22 / 42 success / partial / failure)
- [ ] No archetype over 1.5x fair share, nations assigned at random (FAIL: free-rider 2.21x, trader 2.03x. Cannot pass while Gate 1 requires trading to beat isolating; owner or architect ruling needed, options in the balance report)
- [x] Reciprocal cooperators beat free-riders (cooperator ahead in 87% of same-nation pairs, median +0.17%; thin because contributing costs little Credit)
- [x] A trailing nation gains nothing by sabotage (spoiler median final score 1,073 vs 1,235 as a cooperator; sabotage paid in 0 of 200 pairs)
- [ ] Owner predicts AI responses 70%+ after one game (owner; prompt 11 built prediction mode in the Game tab and `npm run harness -- predictions --files <exported saves>`, which grades it)
- [~] 24 h absence test with a recap readable in under a minute (engine PASS: 40 runs, 0 offers lapsed, 0 appeals or pledges unanswered, recaps at most 6 lines and 121 words; prompt 11 phone check PASS: a live game closed 24 hours catches up in 86 ms on a 4x-slowed Chromium and shows a 6-line, 73-word ranked recap; the owner still reads one on a real phone)
- [ ] 10 playtests, 3+ by others, most want another game (owner)
- [ ] Depth budget and 60 fps hold (prompt 11 phone check at 360 px PASS: 60.1 fps at 4x on a 4x-slowed CPU, no horizontal scroll on any screen or sheet, tables at most 4 columns, every card 2-3 taps; owner to confirm on a real phone)
- [x] Gates 0-1 pass (determinism 1,000/1,000 Node vs Chromium; Gate 1 rerun passes every line but the waived top scorer, Egypt 12.0%, trade advantage +17.6%)
- [ ] Gate 1's waived top-scorer line re-graded with archetypes (FAIL: Saudi Arabia 23.5%, limit 11.8%. Not caused by crises: 24.5% with crises switched off. Needs a RULES 2.8 change or a second waiver)

## Session log

### 2026-09-29 - Opus 5.5 instruction review (owner request, no prompt number; text only)
**Changed.** A text-only pass over every instruction in the repo. There are no LLM
prompts (D5), so the game plays exactly as before. CLAUDE.md now says each rule once
(tests-must-pass had been stated three times) and gives the architecture rules their
reason and how they are enforced. About ten stale or wrong comments and docs are fixed:
the AI Gate 2 helper said the sim had no crises, RULES.md pointed to the wrong section for
the phone, and the README still described Phase 0. Only comment lines changed in code.
**Checked.** 444 tests pass (Node-vs-Chromium determinism included), check and build pass.
**How to see it.** `REVIEW_REPORT.md` (what changed and why) and `REVIEW_INVENTORY.md`.
**Left.** Out-of-scope findings are logged in docs/GAPS.md under "Opus review".

### 2026-09-29 - prompt 11, MVP on the phone (lanes U and P, plus the prediction report in lane H)
**Changed.** The phone now plays the whole MVP. The app runs the new layered AI
(prompt 10) instead of the Phase 1 greedy trader, and saves its memory with the game,
so a reloaded game plays exactly like one that never closed. The inbox has crisis
appeal cards (pay your share, pledge, or decline, 2 taps), a "pool closing" card,
alerts (a pledge you cannot cover, resilience under your floor, an AI nation that
suspended trade with you), and every AI offer card shows the nation's own reason, or
a placeholder until it gives one. The Game tab has the three dial groups: trade
posture (Open, Hard, Closed), auto-accept conditions, and the crisis rule with the
monthly share and its pool. The map draws your trades of the last year as gold lines
beside the trust lines; tapping a nation's trust explains it (where it started, what
trades, broken deals and pledges moved it, and drift). Tapping your score breaks it
down into your baseline percent, the world multiplier and the four world goals. A new
🕒 live clock runs the world at one month per 30 minutes, keeps going while the app
is closed, and catches up on reopen with an away recap ranked by importance (repeated
crises folded into one line). An install banner offers to add the app to the home
screen (iPhone gets the Share steps). Prediction mode (Game tab) asks "What will they
do?" before an AI answer is shown, and keeps every guess and the real answer in the
save; `npm run harness -- predictions --files a.json,b.json` prints the accuracy.
**Checked.** 444 tests pass (was 419), check passes. Phone check at 360 px in
Chromium: 53/53, including crisis card in 2 taps, dials reach the sim, prediction
question and reveal in 2 taps, 24 hours closed = 48 months caught up in 86 ms on a
4x-slowed CPU (Gate 0 budget 2,000 ms), recap 6 lines and 73 words, one tap to
dismiss, 60.1 fps at 4x, no horizontal scroll anywhere, tables at most 4 columns.
**How to see it.** Open the app, start a nation, tap 🕒 in the bottom bar and close
the app; reopen later to see "While you were away". Crisis cards appear from about
month 3. Game tab: dials and the Prediction mode switch. No new dependency.
**Left.** The owner's own checks on a real phone (recap in under a minute, 60 fps,
depth budget, 70% predictions after one game). Harness bots still use the greedy
trader. See docs/GAPS.md, prompt 11.

### 2026-09-29 - prompt 10, AI nations (lane A, plus docs/AI_DESIGN.md)
**Changed.** packages/ai now has a layered AI (`AiDirector`). Perception uses only the
nation's own View and the events it may see. It remembers deals kept and broken,
crisis appeals paid and skipped, and broken pledges, and the memory fades. Personality
comes from each nation's data row; the RULES 7 worked examples are reproduced exactly.
Goals are re-scored every 3 months, staggered across nations. Partners are scored
using trust and seeded noise. It accepts, counters or rejects, at prices that move
with trust, and answers every real crisis appeal (merged from prompt 09) itself, by
style. Every command carries its explanation as the command's `why`, which the sim
relays to the nations concerned ("declined: you broke the deal in month 1 (95 energy
for 9 credit); no trade with you until month 9"). Strict nations retaliate the next
month and resume after 6 months. Forgiving nations let one offence pass. Hard
bargainers charge instead of refusing. Repeat offences escalate. 13 AI tunables were
added to tunables.ts and RULES 11; `aiExploiterMarkupPct` was tuned 20 -> 0 on seeds
1001-1400. The AI's Gate 2 check was graded once on seeds 1-200:
- Pass: crisis success 57.9%, cooperators beat free-riders (69% of pairs), exploiters
  and betrayers, 53 of 53 broken deals answered inside the window, every one of
  606,676 commands explained, peak 1,333 of 4,000 budget units, 0 invalid commands,
  deterministic including save + AI snapshot reload.
- Fail, as with the greedy trader in prompt 09: the free-rider tops 1.64x fair share
  (greedy 2.21x) and Saudi Arabia 24.0% (greedy 23.5%).

About 3 ms a month for all 17 nations on a 4x-throttled Chromium. 39 AI tests. No new
dependency.
**How to see it.** Not on the phone yet: the app and the harness still run the
Phase 1 greedy trader until lanes P and H switch to `AiDirector` (docs/AI_DESIGN.md
section 3). Read docs/AI_DESIGN.md, or run
`AI_GATE2_GAMES=200 npx vitest run packages/ai/src/gate2.test.ts` for the table.
**Left.** Wiring into the app and harness, saving AI memory with the game, and owner
rulings on the archetype line and the top scorer. See docs/GAPS.md, prompt 10.

### 2026-09-29 - Phase 2 prompt 09, Crisis, trust and scoring engine (lanes C, S, H)
**Changed.** Phase 2 has started. The world now has two crises. A climate appeal
opens once a world year and gets worse each year; a pandemic can fire any month.
Each asks every nation for a share of a pool, sized by how exposed that nation
is. Nations pay now, pledge to pay by a deadline, or say no. Anyone who does not
answer is answered by their standing crisis policy on the deadline, so nothing
waits for a player to be online. Pledges are collected automatically on their
deadline; one withdrawn or unpaid breaks, and every nation trusts the breaker 12
less, which fades back over about a year. When a pool locks, damage lands on
every nation by its own exposure, reduced by how full the pool was. The world
multiplier now reads all four goals, crises included. Standing policies now
answer every trade offer (yes or no) instead of letting some lapse. The sim can
write a short away recap from what a nation saw. The monthly crisis contribution
was tuned from 0.2% to 1.1% of income (seeds 1001-1100 only). New harness suite
`gate2`, results in docs/balance/gate2-p2-prompt09.md: crisis success 55.3%,
cooperators beat free-riders, sabotage never pays, the 24-hour absence test
passes, Gate 1 still passes. Two lines fail and need an owner ruling: the
archetype win rate (free-rider 2.21x, trader 2.03x) and the top nation (Saudi
Arabia 23.5%). 352 tests pass; determinism 1,000/1,000.
**How to see it.** `npm run harness -- gate2` (about a minute; writes
packages/harness/out/gate2.md). Nothing shows on the phone yet: the crisis
cards, pledge buttons and recap card are lane U's next prompt.
**Left.** Owner rulings on the two failing lines; crisis screens and the recap
card (lane U); the AI pledging, contributing and explaining itself (lane A). See
docs/GAPS.md, P2-09.


### 2026-09-28 - Gate 1 closed (owner decision)
**Changed.** The owner waived Gate 1 criterion 5 (top scorer) in writing and marked
Gate 1 passed. docs/gates/GATE-1.md carries the waiver table. The real-phone trade and
the phone speed check move to the Gate 2 playtests. No code changed. Phase 2 can start.

### 2026-09-28 - prompt 13, Fair trade-gain rule (lanes S, D, H)
**Changed.** No change to the game. A new trade-gain rule was designed, tested and
graded, then reverted because it failed (like prompt 11). The rule kept "each side
gains by the share of its own imbalance cleared" and added three things: a steep
payout curve for buyers (the first units of a deficit pay most), a gentle one for
sellers, and an import floor of 3.5% of output (never more than the whole deficit),
so one small delivery can no longer earn the whole gain. Graded once on seeds 1-800,
the top scorer was Saudi Arabia 12.0%, Korea 12.5%, Russia 13.5% and Egypt 14.0%
(limit 11.8%; main 12.5-15.0%). The trade gain was +18.4 to +20.0% (main +17.6%).
Japan, Korea and Turkiye gained about +9-10% from trading instead of +5%. The trader
archetype topped 2.7-2.9x fair share. Rule f258f25 and tests acc5be9 were reverted by
0e97a85 and c37a7b6. One regression test stays: a small imbalance never out-earns a
large one at the same share. The diagnosis in the report finds the rest of the gap
outside the trade gain: small importers' luck against their structural baseline, and
near-ties between exporters that sell their whole surplus.
**How to see it.** docs/balance/gate1-prompt13.md (design, 30+ variants on seeds
1001-1800, the graded run, and the owner decision).
**Left.** Owner: waive Gate 1 criterion 5 in writing (recommended) or reopen the
structural baseline's upside (RULES 2.8). See docs/GAPS.md, prompt 13.

### 2026-09-28 - prompt 12, Interface shows the sim's real score (lanes C, S, U, P)
**Changed.** The View now carries the sim's own scoreboard (`NationView.scores`: every
playable nation's 12-month ownScore and final score, plus the world multiplier). The end
screen, the score line above the resource strip and the map read it instead of
recomputing last month's ratio. Over the 200 Gate 1 games the end screen's winner used to
differ from the sim's in 93 games; now it differs in 0. The baseline why-sheets explain
the baseline as RULES 2.8 defines it. The game-over table's Baseline and Score cells have
why-sheets. The phone check now fails on a refused or failed trade, and checks the end
screen's winner against the sim's scoreboard for the exported final game. 300 tests and
34/34 phone checks pass. The save schema is unchanged, because the View is never saved.
**How to see it.** Play to month 60 (Game tab, 4x): the table's order is the game's real
ranking. Tap any percent or score for its explanation.
**Left.** See docs/GAPS.md, prompt 12.

### 2026-09-28 - prompt 11, Spread AI trade offers (lane A)
**Changed.** No change to the game. The AI seller now drew its buyers in a seeded order
weighted by deficit size, with tests (commit 7397c25). On the tuning seeds (1001-1400)
it and ten other spread variants all made the top scorer worse than main (13.8-22.3%
against 10.8%). Graded once on seeds 1-800, the candidate failed: top scorer Egypt 16.0%,
Russia 16.0%, Russia 19.0%, Russia 16.5%, and the trade gain dropped to +14.9% on seeds
401-600. Reverted in the same pull request (d749508).
**How to see it.** docs/balance/gate1-prompt11.md.
**Left.** Gate 1 still fails the top scorer at 12.5-15%. It needs an owner waiver or a
lane S change to the trade-gain rule; the AI's buyer choice is not the cause.

### 2026-09-28 - prompt 08 (re-run), Gate 1 review, second pass (independent)
**Changed.** docs/gates/GATE-1.md rewritten; no code changed. Verdict **FAIL** on one
criterion: the most frequent top scorer is 12.5-15.0% on seeds 1-200, 201-400,
401-600 and 601-800 (limit 11.8%); only the tuning seeds 1001-1200 pass. Every other
criterion passes: trade advantage +17.6-17.7% on every range, 0 crashes, 0 negative
stocks, 0 dead states, 2-tap trade at 360 px, determinism 1,000/1,000, 295 tests.
New finding: the end screen's winner differs from the sim's in 93 of 200 games,
because the interface still reads last month's score, not the 12-month average.
**How to see it.** Open docs/gates/GATE-1.md, or run `npm run harness -- --suite gate1 --games 200`.
**Left.** Fix the AI's choice of buyers and re-grade, or an owner waiver; the end-screen
score fix; the owner's phone speed check and one real trade on the phone.

### 2026-09-28 - prompt 10, Robust trade advantage (lanes S, D, H)
**Changed.** The Gate 1 trade advantage is now clear of the line on every seed range:
+17.6-17.7% on each of seeds 1-200, 201-400, 401-600 and 601-800, with 62.6% of paired
games above +15% (was +14.0-15.7%, 48.9%). This comes from prompt 09's trade rule,
merged while this prompt ran. This prompt first built and tuned its own fix for
exporters (a separate supplier bonus, +18.6-19.2%). When prompt 09 landed with the
same idea in a more general form, this prompt kept prompt 09's rule, dropped its own
and confirmed the result. So the prompt's step 2 stop rule applied and no game rule
or number changed. The harness now refuses unknown flags (exit 2) and accepts
`--suite gate1`. `--ranges N` reports N seed ranges and all of them pooled, and every
report shows the share of pairs at +15% or more, per nation too. RULES.md now lists
every tunable with the value the code uses (five prompt 06 gap-fillers and the engine
limit added), and a test fails if RULES.md and tunables.ts ever disagree.

**How to see it.** `npm run harness -- gate1 --ranges 4` (about a minute), or read
docs/balance/gate1-prompt10.md. `npm run harness -- --suite gate1 --gmaes 5` shows
the new error.

**Left.** The top scorer still fails (12.5-15% per range, limit 11.8%): prompt 09's
owner decision stands. Japan, Korea and Turkiye still gain only ~5% from trading.
Gate 1 needs a fresh independent re-review.

### 2026-09-28 - prompt 09, Top-scorer fairness rule (lanes D, S, H)
**Changed.** New scoring rule, in RULES.md 2.8, 3.3, 5.1 and 11: (1) each
nation's baseline now expects the shortfall it would suffer in a world short of
food and energy, beyond its fair share of what the world can supply; (2) each side
of a trade gains by the share of *its own* surplus or deficit the trade clears, not
by the buyer's deficit, so a giant exporter no longer farms small buyers; (3) the
score is a 12-month average, not the last month alone. Two new tunables
(`structuralCoverSharePct` 80, `scoreSmoothingTicks` 12), `shortfallPenaltyBpPerPct`
40 -> 35. Save format version 3: phone saves carry over; saves that need their
moves replayed are refused with a plain message. New tests: packages/sim/src/
fairness.test.ts, save migration, and a harness test that pins the top-scorer
share to the ROADMAP definition.
**Result.** Tuned only on seeds 1001-1400, graded on 1-600. The top scorer improved
from India 34.5-45% to 12.5-15% (Egypt, Saudi Arabia, Russia), still over the 11.8%
line on all three graded ranges, so the prompt's step 6 applies: best result and
trade-off written up in docs/balance/gate1-prompt09.md. Every other Gate 1 metric
passes on all three ranges, and the trade advantage is now +17.6-17.7% everywhere
(was 14.0-15.7%). Trader archetype tops 2.8-2.9x fair share (was 2.3-2.6x).
**How to see it.** `npm run harness -- gate1 --seed 401`, or read
docs/balance/gate1-prompt09.md. In the app, a big importer like Japan now reads
near 1.00 against its baseline instead of 0.70.
**Left.** Owner decision on the top scorer (fix the AI's offer spreading next,
recommended; or waive; or let regions make offers). Japan, Korea and Turkiye now
gain only ~5% from trading. The interface still computes end-screen scores from
the last month. See docs/GAPS.md, prompt 09.

### 2026-09-28 - prompt 08, Gate 1 review (independent)
**Changed.** docs/gates/GATE-1.md written; no code changed. Verdict **FAIL**.
The top scorer fails (India tops 34.5-45% of games on every seed range; limit
11.8%). The trade advantage fails on robustness: it passes on seeds 1-200
(+15.4%), which it was tuned on, but gives +14.0% and +14.9% on fresh ranges and
+14.5% pooled over 800 seeds. Everything else passes, including invariants, dead
states, isolationists, 2-tap trades, the depth budget, architecture rules,
determinism, and a review of seam 8 (the Gate 0 waiver). Also found:
`npm run harness -- --suite gate1` silently runs the wrong command.
**How to see it.** Open docs/gates/GATE-1.md; `npm run harness -- gate1 --seed 401`.
**Left.** Rule change for the top scorer, then re-tune the trade gain on
out-of-sample seeds; owner phone speed check. See docs/GAPS.md, prompt 08.

### 2026-09-28 - prompt 07, Phase 1 playable on the phone (lanes U and P)
**Changed.** Platform: the app now plays the real world (17 nations + 6
regions from data/world-2030.json) with the greedy AI trader for every other
nation, stops the clock at month 60, exports the running game to a file and
imports it back (then autosaves it), steps one month on demand, and uses a
play-test pace (1x = a month every 10 s, 4x = every 2.5 s). Interface: a live
resource strip (food, energy, credit, resilience) with why-sheets built from
real stocks, production and demand; output against baseline in the header;
decision cards built from the View - offers other nations send you (accept,
counter, decline), next month's shortfalls (buy in one tap), spare goods to sell
(offer in one tap), and your own offers waiting (withdraw); a trade sheet to
make or counter any offer with a live fair-price check; a world map drawn from
live trust with "Propose a trade" on every nation and region; standing-policy
switches; export and import buttons with a game fingerprint; and an end-of-game
table of all 17 nations. The Phase 0 sample cards are gone.
**Proof.** 257 tests pass (new: file export/import resumes the same game after a
wiped store, end of game, cards from the View, two-tap trades). Phone check at
360 px in headless Chromium, 33/33: no horizontal scroll on any screen or sheet;
a trade offer in 2 taps; AI offers arrive as cards and accepting one settles it;
a counter-offer; why-sheets on all four resources; 60 fps at 4x with the CPU
slowed 4x; policies reach the sim; export, clear site data, import restores the
same month and fingerprint and continues; reopens offline; a full game as India
plays to the month-60 end screen.
**How to see it.** Open the app on the phone, start a new game (any nation),
answer cards from Decisions, tap ⏭ to move a month or 1x/4x to run. Game tab:
policies, Export to file, Import from file.
**Left.** Small importers (Japan, Korea, Germany...) receive almost no AI
offers, because the AI trader only sells to the biggest deficits; they can still
buy through their own cards. Phone re-check of speed and install by the owner.
See docs/GAPS.md, prompt 07.

### 2026-09-28 - prompt 06, Economy and trade engine (lanes C, S, A, H)
**Changed.** Gate 0 recorded as PASS WITH WAIVERS on the owner's word
(docs/gates/GATE-0.md). Contracts: resources, stocks, endowments, flows,
standing policies, trade offers with expiry ticks, trade commands, economy
event payloads, and the nation View (`NationView` now lives in contracts, so the
AI imports contracts only). Sim: the RULES section 2 economy in integers
(output, food, energy, credit, minerals, resilience, shortfalls, baseline
growth), reference prices from world scarcity, starting trust from structural
ties, the whole trade system (offer, accept, reject, counter, withdraw, settle,
renege, expire) with standing policies answering for anyone away and background
regions answering at once, scoring (own baseline x a Phase 1 collective
multiplier), `rosterFromWorldData` for the real 17 nations + 6 regions, all 54
RULES tunables in tunables.ts with their bands, save schema 2 (Phase 0 saves are
refused with a clear message). AI: `greedyDecide`, a View-only greedy trader
with a numeric reason for every command. Harness: real roster (Gate 0 finding
F1 fixed), hoarder / isolationist / exploiter bots, `npm run harness -- gate1`.
**Results.** 244 tests pass, including conservation and no-negative-stock
property tests, every trade path (including an offer its maker can no longer
pay, by command and by policy), and determinism 1,000/1,000 in Node and
Chromium. Gate 1 suite, 200 games: every metric passes except "no nation tops
the score in more than 2x fair share" (India 45.0%). Tuning moved
`gainsFromTradeBp` 15 -> 40, the top of its band (paired trading gain +5.4% ->
+15.4%).
**Why the top-scorer metric cannot be tuned away.** The world data is short of
energy (world production is 82% of demand) and food (87%), so a nation that
imports is always partly short and pays the shortfall penalty, while a
self-sufficient exporter never is. Scores therefore sort by structure, not play:
every combination of tunables inside their bands left one structural exporter on
top in 18-52% of games (sweeps of pivot, gains, price band, offer cap, buffer,
penalty). A diagnostic that changed how trade gains are split (receiver only, or
exporter capped) still left 18-43%. It needs a rule change, for example
measuring shortfalls against a nation's share of what the world can supply, or
normalising the world data so supply meets demand. That is the owner's or
architect's call (docs/GAPS.md, prompt 06).
**How to see it.** `npm run harness -- gate1` prints the results table;
`npm test`. Nothing new on the phone yet: the app still plays the Phase 0 dummy
until the interface prompt connects the economy.
**Left.** The top-scorer rule decision; the interface (prompt 07); phone speed
re-measure (1,000 ticks now ~630 ms on the build machine); gap-filler tunables
to ratify in RULES.md. See docs/GAPS.md, prompt 06.

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

### 2026-09-28 - prompt 05, Gate 0 review (independent)
**Changed.** docs/gates/GATE-0.md written; no code changed. Verdict **FAIL**:
criteria 1-4 PASS (reviewer re-ran determinism with the real 17 nations and a
300-seed save/reload test with AI and caretaker switches, all identical),
criteria 5-7 OWNER CHECK (phone speed, real-device install, one-handed
decisions), criterion 8 FAIL because seam 8 (interactions as State objects with
expiry ticks) has no code. Harness roster bug confirmed still open.
**How to see it.** Open docs/gates/GATE-0.md.
**Left.** Build seam 8 and fix the harness roster, then re-review; owner phone
checks. See docs/GAPS.md, prompt 05.

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
