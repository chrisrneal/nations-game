# Gate 2 - MVP (go/no-go): independent review

Prompt 12, 2026-09-29. Reviewed at `main` 7281b80 (after prompt 11 and the
Opus 5.5 instruction review merged; GitHub Actions CI green on that commit).

The reviewer did not build this code. Every result below was produced by
running it or reading it in this session. docs/PROGRESS.md, docs/balance/,
docs/AI_DESIGN.md and the builders' comments were not taken as evidence.
No code was changed. Scratch scripts were kept outside the repository or
deleted after use.

## Verdict: **FAIL**

Two graded criteria fail, and two owner criteria have not been done at all:

| # | Criterion | Result |
|---|---|---|
| 1 | Crisis success 40-75% | **PASS** |
| 2 | No archetype over 1.5x fair share, nations assigned at random | **FAIL** |
| 3 | Reciprocal cooperators beat free-riders | **PASS** (thin) |
| 4 | A trailing nation gains nothing by sabotage | **PASS** (thin) |
| 5 | Owner predicts AI responses 70%+ after one game | **OWNER CHECK - not done** (no data) |
| 6 | 24 h absence test passes, recap readable in under a minute | **PASS** (automated; owner reads one on a phone) |
| 7 | 10 playtests, 3+ by others, most want another game | **OWNER CHECK - not done** (0 of 10) |
| 8 | Depth budget and 60 fps hold | **PASS** (headless phone; owner confirms on a phone) |
| 9 | Gates 0-1 pass | **PASS WITH WAIVERS** (carried; Gate 0 phone speed at risk) |
| 9b | Gate 1's waived top-scorer line, re-graded at Gate 2 as its waiver required | **FAIL** |

The gate cannot close as PASS WITH WAIVERS either: no waiver has been given
for criterion 2 or line 9b, and criteria 5 and 7 have no evidence to waive.
`docs/playtests/` holds only `.gitkeep`: no playtest notes, no exported saves,
no prediction files, no "would play again" answers.

What the failures mean in plain terms:
- **Criterion 2.** A nation that never pays into the crisis pools but otherwise
  trades normally (the free-rider) tops the score in 2.21x its fair share of
  games with the harness bots, and 1.64x with the AI the phone actually plays.
  The cooperative AI itself tops 2.92x, because the other archetypes trade badly
  on purpose. As worded, the line cannot pass while any archetype trades badly.
  That needs an owner ruling. The free-rider result is a real defect under any
  wording: skipping the pools should never pay better than paying.
- **Line 9b.** Saudi Arabia tops 23.5% of games (shipped AI: 24.0%) against a
  limit of 11.8%. Gate 1 waived this line only on condition that Gate 2 grade it
  again. It is now twice as bad as at Gate 1 (12.0-15.0%).

Beyond the criteria, three findings weaken the evidence the passes rest on (F1-F3
below). The most important: **the harness grades the Phase 1 greedy trader, not
the AI the phone plays.**

## What was run

| Command | Result |
|---|---|
| `npm ci`, `npm run check` | lint and typecheck of all workspaces, exit 0 |
| `npm test` | 31 files, 444 tests passed, 0 skipped, 31 s. Determinism: 1,000 seeds identical in Node and headless Chromium (the test ran, 23.3 s) |
| `npm run harness -- --suite gate2 --games 200` | seeds 1-200, 51 s, suite verdict FAIL (full table below). Every number matches docs/balance/gate2-p2-prompt09.md exactly |
| `AI_GATE2_GAMES=200 AI_GATE2_SEED=1 npx vitest run packages/ai/src/gate2.test.ts` | the shipped AI's own check: 1,200 games, 63 s (table below) |
| `npm run build`, `npm run e2e --workspace web` | 53/53 phone checks at 360 px in Chromium |
| `npm run harness -- bench` | 1,000 ticks, greedy trader: Node median 679 ms, Chromium 464 ms |
| GitHub Actions CI on `main` 7281b80 | success |
| Reviewer's own scripts (not committed) | results under each criterion: purity guards, a "stealth" spoiler, AI answer base rates, the AI's decline reasons, a crawl of every why-sheet, a shipped-AI catch-up benchmark |

## Criterion evidence

### 1. Crisis success 40-75% - PASS
- Harness (greedy bots, random archetypes, seeds 1-200): **55.3% of 1,182**
  locked crises reached full cover. Climate 536 / 385 / 79 and pandemic
  118 / 22 / 42 (success / partial / failure).
- Shipped AI (`AiDirector` as cooperator and free-rider, harness bots for the
  rest): **57.9% of 1,182**.
- Both sit in the middle of the band. The tuning (`defaultContributionBp` 110)
  was done on seeds 1001-1100, not on the graded seeds.

### 2. No archetype over 1.5x fair share, nations assigned at random - FAIL
Harness (the pass line the suite applies, all five archetypes):

| Archetype | Nation-games | Tops | Tops / fair share |
|---|---|---|---|
| trader (reciprocal cooperator) | 628 | 75 | **2.03x** |
| freeRider | 730 | 95 | **2.21x** |
| hoarder | 651 | 14 | 0.37x |
| exploiter | 673 | 16 | 0.40x |
| isolationist | 718 | 0 | 0.00x |

Shipped AI, 200 seeds: cooperator **2.92x**, free-rider **1.64x**, hoarder 0.31x,
exploiter 0.20x, isolationist 0.00x.

- The AI check prints "FAIL" but grades only the bots and leaves its own
  cooperator (2.92x) out of the pass line. The ROADMAP says "no archetype", so
  the cooperator counts. That reading was the builder's, not a decision record.
- **Two separate problems.** (a) The wording: two good-trading archetypes
  against three that trade badly on purpose will always share the wins, so some
  archetype will exceed 1.5x while Gate 1 requires trading to beat isolating by
  15%. That is an owner or architect ruling. (b) The free-rider: in the harness
  it wins more often than the cooperator (95 tops vs 75). Paying nothing into
  the pools and trading normally is the best-scoring strategy there, which is
  what this criterion exists to catch. With the shipped AI it drops below the
  cooperator (1.64x vs 2.92x) but is still over the line. RULES 4.3 rule 1
  protects every nation by exposure whatever it paid, so free-riding is free.

### 3. Reciprocal cooperators beat free-riders - PASS (thin)
- Harness, same nation, same seed, 200 pairs: the cooperator scores higher in
  **87.0%** of pairs, median gap **+0.17%**.
- Shipped AI, 200 pairs: ahead in **69.0%**, median **+1.8%**.
- It passes as written, but the margin is tiny. Contributing costs almost
  nothing (world Credit sinks 0.7% of income), so neither choice matters much.
  This is the same gap that makes the free-rider win in criterion 2.

### 4. A trailing nation gains nothing by sabotage - PASS (thin)
- Harness, 200 pairs: the nation trailing at mid-game, playing the spoiler from
  mid-game, has median final score **1,073** vs **1,235** playing cooperatively.
  Sabotage paid in **0 of 200** pairs.
- **Reviewer's adversarial check.** The harness spoiler also closes all its
  trade, which alone costs about 17% (Gate 1). So "sabotage never pays" could
  be true only because the spoiler hurts itself. I re-ran the 200 pairs with a
  **stealth spoiler**: it trades exactly like the cooperator, pays nothing, and
  pledges twice its share to every appeal then withdraws it. My replication
  first reproduced the harness numbers (1,234.5 vs 1,073).

  | Trailing nation from mid-game | Median final | Median rank (of 17) |
  |---|---|---|
  | cooperator | 1,234.5 | 14 |
  | harness spoiler (closes trade) | 1,073 | 17 |
  | stealth spoiler (keeps trading) | 1,232 | 14 |

  The stealth spoiler scored higher than the cooperator in 3 of 200 pairs (best
  +2.8%). It scored the same or higher in 57%, and improved its rank in 2 of
  200. It sank a shared goal in 6.0% of pairs. The median is strictly lower, so
  the criterion holds. But sabotage costs a trailing nation nothing in over half
  of games, which is weak for a game whose premise is that collaboration beats
  conquest.
- Sabotage was measured only with the greedy bots. The shipped AI's check
  marks it "n/a", so nobody has measured it against the AI the phone plays (F1).

### 5. Owner predicts AI responses 70%+ after one game - OWNER CHECK, not done
- No data. `docs/playtests/` is empty, and no exported save exists anywhere in
  the repository. `npm run harness -- predictions` has nothing to grade.
- The tooling works: the phone check turns prediction mode on, answers a
  question in 2 taps, exports the save, and the harness report grades it.
- **Validity problem, found in this review (F2).** Prediction mode asks two
  kinds of question: the AI's answer to your own trade offers, and crisis
  answers from the AI nation you trust most. In 50 all-AI games (shipped AI):
  - AI answers to offers: accept 61.5%, reject 25.2%, counter 13.4% (45,406).
  - AI answers to crisis appeals: contributed 22.4%, **declined 77.6%** (4,848).

  So always guessing "declined" and "accept" scores about 60-78% without
  understanding the AI. Worse, **98.0% of the AI's "declined" answers are
  nations that had already paid their full share** through monthly payments
  (1,485 declines over 20 games; the AI's own reason reads "my share of N is
  already paid"). The sim labels the same situation "contributed" when a
  standing policy answers (packages/sim/src/crisis.ts, `answerAppeals`), but an
  AI command goes through `declineAppeal` and is recorded as "declined". The
  phone check's own reveal shows it: "China declined." A player who guesses
  "contributed" for a nation that paid is graded wrong, and the crisis card
  tells the player a paying nation said no. The AI's own memory is not misled,
  because it reads the real contributor lists. Until this is fixed, a 70% score
  would not show the AI is legible.

### 6. 24 h absence test, recap readable in under a minute - PASS (automated)
- Harness, 40 absence runs (seeds 1-20, 4-month and 48-month absences):
  **0** offers lapsed, **0** appeals and **0** pledges unanswered; recaps at most
  **6 lines and 121 words** (limit 6 lines, 150 words, i.e. under a minute at
  200 words a minute).
- Phone check (Chromium, CPU slowed 4x): a live game closed for 24 hours moved
  48 months (month 11 -> 59). Stepping took **93 ms**, 399 ms from tap to
  recap. The recap was **6 lines, 73 words**, dismissed in one tap, with no
  horizontal scroll.
- Owner still to read one on a real phone (part of the playtests).

### 7. 10 playtests, 3+ by others, most want another game - OWNER CHECK, not done
- 0 of 10 recorded. `docs/playtests/` has no files besides `.gitkeep`. There is
  no evidence either way on "would play again".
- Also carried here from Gate 1 and not yet reported: the real-phone trade in
  3 taps, and the phone speed check.

### 8. Depth budget and 60 fps hold - PASS (headless phone)
Checked against the ROADMAP's depth-budget rules:

| Rule | Evidence | Result |
|---|---|---|
| Any decision within 3 taps of home | trade offer 2 taps; crisis card 2 taps; prediction 2 taps; dials on the Game tab, 1 tap from home | PASS |
| No horizontal scroll | phone check, 21 screens and sheets at 360 px. **Reviewer's crawl**: every tab, every nation row on the map, and **73 why-sheets** (98 views after 30 s at 4x as Japan): **0** overflowing | PASS |
| Tables max 4 columns | the only `<table>` is the game-over table (#, Nation, Baseline, Score). Grids: 4, 3 and 3 columns | PASS |
| 3-5 resources in one strip | food, energy, credit, resilience (4) | PASS |
| Every number actionable or explanatory | numbers are `Num` buttons opening a why-sheet (73 opened; all had text). Not every number on every screen was audited by hand | PASS (sampled) |
| One-handed, primary actions in the bottom third | decision sheet first option centre at 515 of 740 px; crisis options in the bottom third | PASS |
| 2-5 minute check-in is a full session | owner, in the playtests | OWNER CHECK |
| 60 fps | **60.2 fps**, worst frame 17 ms, at 4x with the CPU slowed 4x | PASS |

The owner confirms on a real phone during the playtests. iOS is untested here
(no Safari).

### 9. Gates 0-1 pass - PASS WITH WAIVERS (carried)
**Gate 1** (rerun inside the gate2 suite, seeds 1-200, its own strategy mix):
0 crashes, 0 negative stocks, food 92.2% and energy 84.7% consumed / produced,
Credit sinks 0.4%. Trading vs isolating median **+17.6%** (63.0% of pairs at
+15% or more), isolating scores lower in 95.0% of pairs, 0 dead, trade in
2 taps. Only the waived top-scorer line fails (Egypt 12.0%, limit 11.8%).

**Gate 0:**

| # | Criterion | Now |
|---|---|---|
| 1 | Sim core has no UI, DOM, network or clock imports | PASS. Every non-test import in packages/sim and packages/contracts is `@nations/contracts` or relative. A scratch `packages/sim/src/zz_review.ts` using `node:fs`, `Date.now()`, `Math.random()` and `document` failed all three guards: purity test (2 failures), ESLint (5 errors) and `tsc` (2 errors). File deleted |
| 2 | 1,000 seeds identical in browser and Node | PASS (in `npm test`) |
| 3 | AI and UI use the same command API | PASS. The shipped AI returns `Command`s and reads `viewFor` only. Each mind sees only events addressed to it (`perception.ts`). The UI imports only `platform/index.ts` (boundary test). The View is all that crosses to the UI |
| 4 | Save-reload-continue matches an uninterrupted run | PASS (property test in `session.test.ts`; phone import restores the same fingerprint and continues) |
| 5 | 1,000 catch-up ticks under 2 s on a mid-range phone | **AT RISK - OWNER CHECK.** The owner's pass was on the Phase 0 sim. With the shipped AI, 1,000 ticks take a median **1,080 ms** in Node on this build machine (greedy trader: 679 ms), and phones are several times slower. The harness `bench` still times the greedy trader. A real game owes at most 60 ticks, and 48 ticks take 51 ms (Node) and 93 ms (throttled Chromium), so players are not affected. But the criterion as written has not been measured with the shipped AI on a phone |
| 6 | PWA installs and runs offline | PASS in Chromium (installable, opens and continues offline); iOS owner-reported at Gate 0 only |
| 7 | Three sample decisions one-handed | Owner-reported at Gate 0 |
| 8 | Independent review signs off the nine seams | Was WAIVED. **This review signs the seams off**, with the notes below. S1 `step` is the whole sim. S2: nothing outside the sim writes State (searched platform, AI and harness). S3: boundary test. S4: the host clock and live catch-up. S5: determinism test. S6: the View for UI and AI. S7: absence runs switch controllers mid-game. S8: offers, appeals and pledges are State objects with deadlines, and 0 lapsed in 40 absence runs. S9: versioned saves with migrations. Notes: every phone save is compact (`session.save({ compact: true })`, the snapshot only, no replay history), so a save sent in by a player can resume but cannot replay a bug from the start. AI memory and the journal live beside the save, not in it (GAPS prompt 11) |

### 9b. Gate 1's waived top-scorer line, re-graded - FAIL
- GATE-1.md waived "no nation tops more than 2x fair share (11.8%)" on
  condition that Gate 2 re-grade it. Re-graded with random archetypes:
  **Saudi Arabia 23.5%** (harness) and **24.0%** (shipped AI). Next: Brazil 9.5%
  (harness) and 13.0% (AI). Canada is 12.0% (AI).
- Twice the limit, and twice the 12.0-15.0% Gate 1 waived. The builders'
  diagnostic (not re-run here) attributes it to the RULES 2.8 structural
  baseline: Saudi Arabia imports 95% of its food, so its baseline expects a
  large shortfall, and with more trading archetypes its deficit gets covered.
  Crises are not the cause.

## Findings outside the criteria

- **F1 (major) - The harness grades a different AI than the phone plays.**
  `packages/harness/src/bots.ts` drives `trader` and `freeRider` with
  `greedyDecide`, the Phase 1 greedy trader. The app runs `AiDirector`
  (`apps/web/src/platform/engine.ts`). So the harness's crisis, sabotage,
  absence, Gate 1 and `bench` numbers describe the old AI. The shipped AI's
  check (`packages/ai/src/gate2.test.ts`) covers only part of the gate, and CI
  runs it on 5 seeds. Logged since prompt 10 (GAPS) and still open. Every gate
  number should come from the AI the player meets.
- **F2 (major) - Paid-in-full AI nations are shown as "declined".** See
  criterion 5. It misleads the crisis cards, prediction reveals and the
  prediction score.
- **F3 (moderate) - Defection is nearly free.** Contributing costs +0.17% of
  final score, and a stealth spoiler loses nothing in over half of games. Credit
  has almost no use besides imports (sinks 0.7% of income). Criteria 2, 3 and 4
  all come back to this; the playtests may show it as "my choices in a crisis
  don't matter".
- **F4 (minor) - Some AI coefficients are inline.** For example
  `negotiation.ts` (`importDependence * 20`, `cooperativeness * 10`) and
  `goals.ts` (`floor + 10`, `* 60`). docs/AI_DESIGN.md gives most formulas'
  shape, but these numbers have no tunable or band (CLAUDE.md: "tunable numbers
  live in tunables.ts").
- **F5 (minor) - Compact saves only on the phone** (seam S9 note above).
- **F6 (info) - Broken pledges 100%, retaliation 7.0%, defection 60.4%** in the
  harness. Only the exploiter and spoiler bots pledge, and they always break.
  The shipped AI pledges honestly in its own check, but the harness never
  exercises an honest pledger.

## Harness output (seeds 1-200)

| Metric | Result | Pass line | |
|---|---|---|---|
| Seeded full-roster games (17 nations + 6 regions, 60 ticks) | 200 + 800 paired | no crashes | PASS |
| Negative stocks or pools | 0 | 0 | PASS |
| Crisis success | 55.3% of 1182 | 40-75% | PASS |
| Most winning archetype (freeRider) | 2.21x | <= 1.50x | FAIL |
| Most frequent top scorer (saudi-arabia) | 23.5% | <= 11.8% | FAIL |
| Cooperator vs free-rider (median gap) | +0.17% | > 0 | PASS |
| Pairs where the cooperator scores higher | 87.0% | > 50% | PASS |
| Trailing nation: spoiler vs cooperator (median final) | 1073 vs 1235 | spoiler lower | PASS |
| Dead states | 0.0% | < 2% | PASS |
| Credit sinks / income | 0.7% | 0-25% | PASS |
| 24-hour absence (40 runs) | 0 lapsed, 0 / 0 unanswered; <= 6 lines, <= 121 words | 0/0/0; <= 6 lines, <= 150 words | PASS |
| Gate 1 suite (top scorer waived) | all other lines pass | pass | PASS |

## Shipped AI check (seeds 1-200)

| Criterion | Result | Verdict |
|---|---|---|
| Crisis success | 57.9% of 1,182 | PASS |
| Archetypes at random | cooperator 2.92x, free-rider 1.64x, hoarder 0.31x, exploiter 0.20x, isolationist 0.00x | FAIL |
| Cooperator beats exploiter (paired) | 87.0%, median +10.9% | PASS |
| Cooperator beats free-rider (paired) | 69.0%, median +1.8% | PASS |
| Top scorer | saudi-arabia 24.0% | FAIL |
| Trading beats isolating | median +17.2% | PASS |
| Keeping deals beats breaking them | 97.5%, median +9.9% | PASS |
| Strict AI retaliates within the window | 53 of 53 | PASS |
| Every AI command explained with a number | 606,676 of 606,676 | PASS |
| Compute budget | peak 1,333 of 4,000 units, 0 deferred, 0.39 ms/tick | PASS |
| Invalid AI commands | 0 (2,996 same-month races) | PASS |
| Determinism | 10 of 10 | PASS |

## To pass on re-review
1. Criterion 2: an owner or architect ruling on the wording (a DECISIONS
   record, since ROADMAP is architect-only), and a free-rider that no longer
   out-wins the cooperator, graded with the shipped AI.
2. Line 9b: a RULES 2.8 change that holds on fresh seeds, or a second written
   waiver.
3. F1 and F2 fixed before the playtests, so the playtests measure the real AI
   and the prediction score means something.
4. Criteria 5 and 7: 10 playtests (3+ by others) written up in
   `docs/playtests/`, each with the exported save and the answer to "would you
   play another game?". Grade them with
   `npm run harness -- predictions --dir docs/playtests`.
5. Owner phone checks: recap reading, 60 fps and depth budget, the Gate 1 trade
   in 3 taps, and Gate 0's catch-up speed with the shipped AI.
