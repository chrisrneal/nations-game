# Gate 2 balance report: prompt 13 (the harness grades the shipped AI)

2026-09-29. Lanes H, A, S. Command: `npm run harness -- --suite gate2 --games 200`
(seeds 1-200, run once, 97 s). **Nothing was tuned.** Every number below is the
first and only run after the two fixes. The full suite output is at the end.

## What changed before this run

- **F1.** The harness `trader` and `freeRider` are now the shipped AI
  (`AiDirector`, packages/ai), the AI the phone plays. The trader is the AI in
  its data-derived style; the free-rider is the same AI with paying switched off.
  One director per game, `observe()` after every step, seeded as in the app.
  Hoarder, isolationist, exploiter and spoiler are still the greedy-trader bots.
  The Gate 1 rerun, the 24-hour absence runs, `bench` and the determinism test
  all use the AI too.
- **F2.** A nation whose share is already paid is recorded as having
  contributed, not declined. This changes crisis cards and prediction answers
  only. It does not change any score, because it changes nothing that is paid.
- **New: stealth spoiler.** From mid-game, the trailing nation keeps the AI's
  trade, pays nothing, and pledges twice its share to every appeal, then
  withdraws the pledge. It is reported, not graded (see "Decision" below).

## Gate 2 criteria

| # | Criterion | Prompt 12 review (greedy trader) | Now (shipped AI) | |
|---|---|---|---|---|
| 1 | Crisis success 40-75% | 55.3% of 1,182 | **56.4%** of 1,182 (climate 549 / 377 / 74, pandemic 118 / 22 / 42) | PASS |
| 2 | No archetype over 1.5x fair share | free-rider 2.21x, trader 2.03x | **trader 3.22x**, free-rider 1.47x, hoarder 0.34x, exploiter 0.13x, isolationist 0.00x | FAIL |
| 3 | Reciprocal cooperators beat free-riders | ahead in 87.0%, median +0.17% | ahead in **73.0%**, median **+1.41%** | PASS |
| 4 | A trailing nation gains nothing by sabotage (spoiler) | 1,073 vs 1,235; paid in 0% | **1,066 vs 1,156**; paid in 0% | PASS |
| 6 | 24 h absence, recap under a minute | 0 / 0 / 0; <= 6 lines, 121 words | 0 / 0 / 0; <= 6 lines, **121** words | PASS |
| 9 | Gate 1 rerun (top scorer waived) | +17.6% trading vs isolating | **+17.1%**; isolating lower in 98.0% of pairs; 0 dead | PASS |
| 9b | No nation tops over 2x fair share (11.8%) | Saudi Arabia 23.5% | **Saudi Arabia 22.0%** (then Nigeria 16.0%, Canada 12.0%) | FAIL |

Criteria 5, 7 and 8 are owner checks and are unchanged by this prompt.

Other lines (info, no pass line): defection 60.4%, broken pledges 100% (only
the exploiter and spoilers pledge), retaliation 6.5%, dead states 0.0%, Credit
sinks 0.7% of income. The Gate 1 rerun's own top scorer is Saudi Arabia 19.0%
(prompt 12: Egypt 12.0%). By strategy, its trader tops 3.44x fair share.

## Sabotage from mid-game (the nation trailing at mid-game, 200 seeds)

| Trailing nation plays | Median final score | Median rank (1 = top, of 17) | Scores above the cooperator | Rank better / worse than as cooperator | Fewer crises at full cover |
|---|---|---|---|---|---|
| cooperator (the AI) | 1,156 | 15.0 | - | - | - |
| spoiler (closes trade) | 1,066 | 17.0 | 0.0% | 0.0% / 64.5% | 7.0% |
| stealth spoiler (keeps trading) | **1,116** | **16.0** | **19.0%** (same or higher 38.0%) | **8.5% / 32.5%** | 7.5% |

The stealth spoiler's median is lower than the cooperator's (1,116 vs 1,156), so
it loses on average. But it beats the cooperator in **38 of 200 pairs** (19.0%)
and climbs the ranking in 17 (8.5%). The reviewer's greedy-trader version beat
it in 3 of 200. The world multiplier barely moves (median -0.000): one nation's
broken pledges rarely sink a goal (7.5% of pairs).

## Catch-up speed with the AI (`npm run harness -- bench`)

1,000 ticks, 23 nations, the shipped AI for every nation: Node median
**1,217 ms**; Chromium median **911 ms** (worst 1,523 ms, first run includes JIT).
The greedy trader measured 679 ms / 464 ms at prompt 12. It is still under 2 s on
this machine; phones are several times slower (Gate 0 criterion 5, owner check).

## What moved, in plain terms

- **The cooperative AI wins far more than the old greedy trader did** (3.22x
  fair share, was 2.03x). It trades better, so the "no archetype over 1.5x" line
  fails harder while three archetypes trade badly on purpose. That line still
  needs the owner's or architect's ruling on its wording (GATE-2 criterion 2).
- **The free-rider no longer out-wins the cooperator.** It drops to 1.47x (was
  2.21x), just inside the line. The cooperator leads it in 73% of paired games by
  a median +1.4% (was +0.17%). The AI remembers who free-rode and trades
  less with them, so skipping the pools now costs something. The gap is still
  small.
- **Sabotage without closing trade pays in about one game in five.** This is
  GATE-2 F3 ("defection is nearly free") showing up with the real AI. Criterion 4
  still passes on the median.
- **Saudi Arabia still tops 22% of games.** The structural-baseline cause from
  prompt 09 and GATE-2 still holds. Nigeria (16.0%) and Canada (12.0%) are also
  over the 11.8% line now.

## Decision for the owner or architect (not made here)

Should criterion 4 be graded on the stealth spoiler too? Graded as "median
strictly lower", it would pass (1,116 vs 1,156). Graded as "never better off in
most games", 19% of pairs is the number to judge. This prompt only reports it.

## Full suite output

### Gate 2 suite: 200 games x 60 ticks, seeds 1-200 - FAIL

| Metric | Result | Pass line | |
|---|---|---|---|
| Seeded full-roster games (17 nations + 6 regions, 60 ticks, random archetypes) | 200 + 800 paired | 200 with no crashes | PASS |
| Crashes | 0 | 0 | PASS |
| Negative stocks or pools (every nation, every tick) | 0 | 0 | PASS |
| Crisis success (locked crises reaching full cover) | 56.4% of 1182 | 40-75% | PASS |
| Climate: success / partial / failure | 549 / 377 / 74 | info | see note |
| Pandemic: success / partial / failure | 118 / 22 / 42 | info | see note |
| Defection rate (playable nation-appeals paid under half their share) | 60.4% | info | see note |
| Broken pledges (of all pledges resolved) | 100.0% | info | see note |
| Retaliation rate (reciprocal answers scaled down after a short round) | 6.5% | info | see note |
| Most winning archetype (trader), tops / fair share | 3.22x | <= 1.50x | FAIL |
| Most frequent top scorer (saudi-arabia) | 22.0% | <= 11.8% (2x fair share) | FAIL |
| Reciprocal cooperator vs free-rider, same nation (median finalScore gap) | +1.41% | > 0 | PASS |
| Pairs where the cooperator scores higher | 73.0% | > 50% | PASS |
| Trailing nation: spoiler vs cooperator from mid-game (median finalScore) | 1066 vs 1156 | spoiler strictly lower | PASS |
| Spoiler pairs where sabotage paid | 0.0% | info | see note |
| Spoiler pairs where it sank a shared goal (fewer crises at full cover) | 7.0% | info | see note |
| World multiplier change from one spoiler (median) | -0.002 | info | see note |
| Trailing nation: stealth spoiler (keeps trading) vs cooperator from mid-game (median finalScore) | 1116 vs 1156 | info | see note |
| Stealth spoiler pairs where sabotage paid (scores higher; same or higher) | 19.0%; 38.0% | info | see note |
| Stealth spoiler rank change vs cooperator (better / worse; median rank) | 8.5% / 32.5%; 16.0 vs 15.0 (spoiler 17.0) | info | see note |
| Stealth spoiler pairs where it sank a shared goal; world multiplier change (median) | 7.5%; -0.000 | info | see note |
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
| trader | 628 | 119 | 3.22x | 1371 |
| hoarder | 651 | 13 | 0.34x | 1222 |
| isolationist | 718 | 0 | 0.00x | 1158 |
| exploiter | 673 | 5 | 0.13x | 1228 |
| freeRider | 730 | 63 | 1.47x | 1347 |

#### Sabotage from mid-game (the nation trailing at mid-game, 200 seeds)

| Trailing nation plays | Median final score | Median rank (1 = top) | Scores above the cooperator | Rank better / worse than as cooperator | Fewer crises at full cover |
|---|---|---|---|---|---|
| cooperator (the AI) | 1156 | 15.0 | - | - | - |
| spoiler (closes trade) | 1066 | 17.0 | 0.0% | 0.0% / 64.5% | 7.0% |
| stealth spoiler (keeps trading) | 1116 | 16.0 | 19.0% | 8.5% / 32.5% | 7.5% |

#### Top scorer share by nation

| Nation | Games topped |
|---|---|
| saudi-arabia | 22.0% |
| nigeria | 16.0% |
| canada | 12.0% |
| brazil | 11.0% |
| australia | 9.5% |
| china | 6.0% |
| indonesia | 5.0% |
| united-states | 5.0% |
| russia | 4.5% |
| india | 2.5% |
| south-africa | 2.0% |
| turkiye | 2.0% |
| egypt | 1.5% |
| germany | 0.5% |
| korea | 0.5% |
| japan | 0.0% |
| mexico | 0.0% |

#### Sample away recap (seed 1, china, away months 6-54, 117 words)

- Months 6-54: score 1508 -> 1262, world multiplier 1.36 -> 1.28.
- Climate crisis (severity 20): pool met 67% of target, partial; your monthly payments covered your share; your output -1.9% for 6 months.
- Climate crisis (severity 28): pool met 100% of target, success; your monthly payments covered your share; your output -1.6% for 6 months.
- Climate crisis (severity 36): pool met 100% of target, success; your monthly payments covered your share; your output -2.1% for 6 months.
- Climate crisis (severity 44): pool met 100% of target, success; your monthly payments covered your share; your output -2.5% for 6 months.
- Climate appeal open until month 54: your share is 193 Credit; your policy (fairShare) answers on the deadline.

#### Gate 1 suite rerun, seeds 1-200 (top scorer waived) - FAIL

| Metric | Result | Pass line | |
|---|---|---|---|
| Seeded full-roster games (17 nations + 6 regions, 60 ticks) | 200 + 400 paired | 200 with no crashes | PASS |
| Crashes | 0 | 0 | PASS |
| Negative stocks (every nation, every tick) | 0 | 0 | PASS |
| Food consumed / produced (world) | 92.2% | 75-100% | PASS |
| Energy consumed / produced (world) | 84.7% | 75-100% | PASS |
| Credit sinks / Credit income (world) | 0.4% | 0-25% | PASS |
| Same nation, trading vs isolating (median of paired runs) | +17.1% | >= +15% | PASS |
| Pairs at +15% or more | 59.0% | info | see note |
| Isolationists worse off (pairs where isolating scores lower) | 98.0% | > 50% | PASS |
| Isolationists alive (dead isolating runs) | 0 | 0 | PASS |
| Dead states (ownScore < 0.50 at game end) | 0.0% | < 2% | PASS |
| Most frequent top scorer (saudi-arabia) | 19.0% | <= 11.8% (2x fair share) | FAIL |
| Commands rejected by the sim (all bots) | 0 | info | see note |
| A trade in 3 taps or fewer | interface check (lane U) | <= 3 taps | see note |
| Gate 0 still passes | npm test: determinism, purity, save/load | all pass | see note |

##### Top scorer share by nation

| Nation | Games topped |
|---|---|
| saudi-arabia | 19.0% |
| brazil | 13.0% |
| nigeria | 12.5% |
| australia | 8.5% |
| russia | 8.0% |
| canada | 7.5% |
| indonesia | 5.5% |
| turkiye | 5.0% |
| united-states | 4.5% |
| india | 3.0% |
| korea | 3.0% |
| south-africa | 2.5% |
| germany | 2.0% |
| japan | 2.0% |
| egypt | 1.5% |
| mexico | 1.5% |
| china | 1.0% |

##### By strategy (random assignment)

| Strategy | Nation-games | Tops | Top share / fair share | Mean ownScore |
|---|---|---|---|---|
| trader | 845 | 171 | 3.44x | 1.111 |
| hoarder | 846 | 11 | 0.22x | 0.984 |
| isolationist | 831 | 1 | 0.02x | 0.936 |
| exploiter | 878 | 17 | 0.33x | 1.001 |

##### Trading vs isolating, median gain by nation (paired runs)

| Nation | Pairs | Median gain | Pairs at +15% or more |
|---|---|---|---|
| australia | 15 | +20.2% | 93.3% |
| brazil | 16 | +20.9% | 100.0% |
| canada | 13 | +19.5% | 84.6% |
| china | 10 | +13.3% | 40.0% |
| egypt | 13 | +17.6% | 61.5% |
| germany | 12 | +1.5% | 0.0% |
| india | 3 | +28.4% | 100.0% |
| indonesia | 15 | +21.4% | 93.3% |
| japan | 11 | +9.1% | 0.0% |
| korea | 10 | +5.6% | 0.0% |
| mexico | 12 | +5.9% | 16.7% |
| nigeria | 15 | +27.3% | 86.7% |
| russia | 14 | +17.2% | 92.9% |
| saudi-arabia | 7 | +53.8% | 85.7% |
| south-africa | 13 | +14.7% | 30.8% |
| turkiye | 13 | +4.8% | 15.4% |
| united-states | 8 | +19.4% | 100.0% |

