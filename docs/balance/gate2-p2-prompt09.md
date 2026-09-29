# Gate 2 balance report: Phase 2 prompt 09 (crisis, trust and scoring engine)

2026-09-29. Lanes C, S, H. Command: `npm run harness -- gate2 --games 200`
(seeds 1-200, about a minute). It plays, per seed, a main game with the 17
nations assigned the five archetypes at random, a cooperator / free-rider pair,
a spoiler pair, and it reruns the Gate 1 suite on the same seeds. Plus 40
absence runs on seeds 1-20.

## Verdict

**Two Gate 2 lines fail, and neither can be fixed by tuning inside the bands.**
Everything the engine can prove on its own passes: crisis success 55.3% (band
40-75%), cooperators beat free-riders, sabotage never pays, the 24-hour absence
test, and Gates 0-1. The owner items (predicting the AI, playtests, 60 fps) need
the crisis screens, which are lane U's next job.

| # | Gate 2 criterion (docs/ROADMAP.md) | Result on seeds 1-200 |
|---|---|---|
| 1 | Crisis success 40-75% | **PASS** 55.3% of 1,182 crises (climate 536 / 385 / 79, pandemic 118 / 22 / 42 success / partial / failure) |
| 2 | No archetype over 1.5x fair share, nations assigned at random | **FAIL** free-rider 2.21x, trader 2.03x (hoarder 0.37x, exploiter 0.40x, isolationist 0.00x). Needs a ruling, below |
| 3 | Reciprocal cooperators beat free-riders | **PASS** same nation, same seed: cooperator ahead in 87% of pairs, median +0.17% (thin; below) |
| 4 | A trailing nation gains nothing by sabotage | **PASS** spoiler median final score 1,073 vs 1,235 as a cooperator; sabotage paid in 0 of 200 pairs |
| 5 | Owner predicts AI responses 70%+ after one game | OWNER CHECK (needs crisis cards in the app) |
| 6 | 24 h absence test, recap readable in under a minute | **PASS** (engine) 40 runs: 0 offers lapsed, 0 appeals and 0 pledges unanswered; recaps at most 6 lines and 121 words. Owner still reads one on a phone |
| 7 | 10 playtests, 3+ by others, most want another game | OWNER CHECK |
| 8 | Depth budget and 60 fps hold | OWNER CHECK |
| 9 | Gates 0-1 pass | **PASS** determinism 1,000/1,000 Node vs Chromium; Gate 1 rerun passes every line except the waived top scorer (Egypt 12.0%); trade advantage +17.6% |
| - | Gate 1's waived line re-graded: no nation tops over 2x fair share (11.8%) | **FAIL** Saudi Arabia 23.5% (Gate 1 mix: Egypt 12.0%). Not caused by crises, below |

## What was built

- **Contract (lane C).** Pools, crisis appeals, pledges, crisis damage, crisis
  results, the crisis standing policies (`crisisRule`, `contributionBp`,
  `contributionTo`), four new commands (`contribute`, `pledge`, `withdrawPledge`,
  `declineAppeal`), crisis and explanation event payloads, the away `Recap`, the
  four collective goals, and a `crises` slice in the View. Commands may carry a
  numeric `why`, which the sim relays as an explanation event.
- **Sim (lane S).** RULES 4 and 4.4 (written this prompt): climate appeals once a
  year, pandemics on a seeded roll, shares by exposure, answers by command or by
  standing policy on the deadline, pledges collected or broken on their deadline,
  damage by exposure and resilience, contributor bonuses, crisis trust. The
  multiplier reads all four goals. Standing policies now answer every offer
  (decline instead of letting it lapse). `buildRecap` turns two Views and the
  events between them into at most six sentences. Save schema 4 (compact saves
  migrate; saves that need a replay are refused, as in 2 -> 3).
- **Harness (lane H).** Free-rider and spoiler bots; the exploiter now pledges and
  breaks. The `gate2` suite above.

## Tuning (seeds 1001-1100 only, before grading)

Crisis success before tuning was 11% (5.5% on 40 early graded seeds): three of
the five archetypes pay nothing, so pools usually reach 50-80% of target
(partial). The monthly contribution is what fills the pools, above all the
health pool before a pandemic, so it is the lever. The pool target barely
matters, because every share scales with it.

| Change (tuning seeds 1001-1100) | Crisis success |
|---|---|
| main values (`defaultContributionBp` 20) | 11.4% (60 seeds) |
| `poolTargetScaleBp` 500 | 12.2% (60 seeds) |
| `poolCoverMaxPct` 60 | 30.6% (60 seeds) |
| `defaultContributionBp` 100 | 48.9% (60 seeds) |
| **`defaultContributionBp` 110 (chosen)** | **59.1%** |
| `defaultContributionBp` 120 | 67.7% |
| `defaultContributionBp` 130 | 72.7% |
| `defaultContributionBp` 140 | 78.1% |

110 bp (1.1% of income a month) sits near the middle of the 40-75% band. Graded
once on seeds 1-200: 55.3%.

## Why the two failures need a ruling, not tuning

### Archetype win rate (free-rider 2.21x, trader 2.03x)

Two of the five archetypes trade well (trader and free-rider trade the same
way); three trade badly on purpose (hoarder, isolationist, exploiter). The top
scorer of a game almost always comes from the two good traders: 170 of 200 games.
Two archetypes sharing 85% of wins on 40% of the seats are each about 2.1x their
fair share. To get every archetype under 1.5x, the hoarder, exploiter and
isolationist would need to win about as often as the trader. That contradicts
Gate 1, which requires trading to beat isolating by 15% or more, and the
game's premise. Crisis numbers do not move it: with crises switched off
entirely (a diagnostic run, not a band value), the split was the same.

**Options for the owner.** (a) Re-word the criterion to what it protects against:
"no *defecting* archetype (free-rider, exploiter, hoarder) tops more than the
reciprocal cooperator" or "no archetype over 1.5x among strategies that trade".
(b) Waive it, as Gate 1's top scorer was. (c) A rule change that makes hoarding
and bargaining hard competitive with trading, which works against Gate 1.
Recommendation: (a), decided by the architect in DECISIONS.md, because the
current wording cannot pass while Gate 1 holds.

### Top nation (Saudi Arabia 23.5%)

A diagnostic run on the tuning seeds with every crisis severity set to 0 gave
Saudi Arabia 24.5%, and the Gate 1 archetype mix gave 11-13% with or without
crises. So crises are not the cause. The cause is the Phase 1 structural baseline
(RULES 2.8, docs/GAPS.md prompt 13): Saudi Arabia imports 95% of its food, and its
baseline expects a large shortfall; when many sellers trade freely (two trading
archetypes out of five instead of one out of four) its deficit gets covered and it
beats that baseline by 25-40%. Only a rule change to the RULES 2.8 upside can fix
this. **Options:** waive again for Gate 2, or a design prompt on the structural
baseline's upside (lanes D and S).

### Also worth the owner's attention

- **Contributing costs almost nothing yet.** Credit has little use besides
  imports; world Credit sinks are 0.7% of income. So the cooperator's edge over
  the free-rider (criterion 3) is real but thin: +0.17%, from the contributor
  resilience bonus. Free-riding "works" as RULES 4.3 intends, but it is not a
  tempting choice either. A later design pass could make Credit scarcer.
- **Honest pledges are untested in play.** The AI (lane A) does not pledge yet, so
  every pledge in the main games is an exploiter's or a spoiler's, and all of them
  break (100%). Pledges that are kept are covered by the sim tests and the absence
  test.
- **Defection 60%, retaliation 7%.** Six in ten playable nation-appeals pay less
  than half their share (three of five archetypes pay nothing). Reciprocal nations
  scaled down 7% of their answers after a round that met less than half its target.

## Graded run output

### Graded run: Gate 2 suite: 200 games x 60 ticks, seeds 1-200 - FAIL

| Metric | Result | Pass line | |
|---|---|---|---|
| Seeded full-roster games (17 nations + 6 regions, 60 ticks, random archetypes) | 200 + 800 paired | 200 with no crashes | PASS |
| Crashes | 0 | 0 | PASS |
| Negative stocks or pools (every nation, every tick) | 0 | 0 | PASS |
| Crisis success (locked crises reaching full cover) | 55.3% of 1182 | 40-75% | PASS |
| Climate: success / partial / failure | 536 / 385 / 79 | info | see note |
| Pandemic: success / partial / failure | 118 / 22 / 42 | info | see note |
| Defection rate (playable nation-appeals paid under half their share) | 60.4% | info | see note |
| Broken pledges (of all pledges resolved) | 100.0% | info | see note |
| Retaliation rate (reciprocal answers scaled down after a short round) | 7.0% | info | see note |
| Most winning archetype (freeRider), tops / fair share | 2.21x | <= 1.50x | FAIL |
| Most frequent top scorer (saudi-arabia) | 23.5% | <= 11.8% (2x fair share) | FAIL |
| Reciprocal cooperator vs free-rider, same nation (median finalScore gap) | +0.17% | > 0 | PASS |
| Pairs where the cooperator scores higher | 87.0% | > 50% | PASS |
| Trailing nation: spoiler vs cooperator from mid-game (median finalScore) | 1073 vs 1235 | spoiler strictly lower | PASS |
| Spoiler pairs where sabotage paid | 0.0% | info | see note |
| Spoiler pairs where it sank a shared goal (fewer crises at full cover) | 5.5% | info | see note |
| World multiplier change from one spoiler (median) | -0.010 | info | see note |
| Dead states (ownScore < 0.50 at game end) | 0.0% | < 2% | PASS |
| Credit sinks / Credit income (resilience + crises) | 0.7% | 0-25% | PASS |
| 24-hour absence (40 runs: 4 months at the multiplayer cadence, 48 at single-player 1x) | 0 lapsed, 0 appeals and 0 pledges unanswered; recap <= 6 lines, <= 121 words | 0 / 0 / 0; <= 6 lines, <= 150 words | PASS |
| Gate 1 suite (top scorer waived) | all other lines pass | pass | PASS |
| Gate 0 still passes | npm test: determinism (1,000 seeds, Node vs Chromium), purity, save/load | all pass | see note |
| Owner predicts AI responses after one game | owner check | >= 70% | see note |
| 10 playtests, 3+ by others, most want another game | owner check | see ROADMAP | see note |
| Depth budget and 60 fps hold | owner check (phone) | hold | see note |

#### Win rate by archetype (random assignment)

| Archetype | Nation-games | Tops | Tops / fair share | Mean final score |
|---|---|---|---|---|
| trader | 628 | 75 | 2.03x | 1389 |
| hoarder | 651 | 14 | 0.37x | 1244 |
| isolationist | 718 | 0 | 0.00x | 1163 |
| exploiter | 673 | 16 | 0.40x | 1273 |
| freeRider | 730 | 95 | 2.21x | 1392 |

#### Top scorer share by nation

| Nation | Games topped |
|---|---|
| saudi-arabia | 23.5% |
| brazil | 9.5% |
| egypt | 9.5% |
| indonesia | 9.0% |
| nigeria | 9.0% |
| russia | 9.0% |
| korea | 6.5% |
| australia | 5.5% |
| canada | 5.0% |
| germany | 4.0% |
| united-states | 2.5% |
| china | 2.0% |
| mexico | 2.0% |
| japan | 1.5% |
| turkiye | 1.5% |
| india | 0.0% |
| south-africa | 0.0% |

#### Sample away recap (seed 1, china, away months 6-54, 117 words)

- Months 6-54: score 1488 -> 1197, world multiplier 1.36 -> 1.27.
- Climate crisis (severity 20): pool met 62% of target, partial; you paid 34 at the appeal; your output -2.2% for 6 months.
- Climate crisis (severity 28): pool met 100% of target, success; your monthly payments covered your share; your output -1.7% for 6 months.
- Climate crisis (severity 36): pool met 99% of target, success; your monthly payments covered your share; your output -2.2% for 6 months.
- Climate crisis (severity 44): pool met 98% of target, success; your monthly payments covered your share; your output -2.7% for 6 months.
- Climate appeal open until month 54: your share is 186 Credit; your policy (reciprocal) answers on the deadline.
