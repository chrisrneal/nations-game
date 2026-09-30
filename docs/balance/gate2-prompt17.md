# Gate 2 balance report: prompt 17 (a real budget: self-reliance vs trade)

2026-09-30. Lanes D, C, S, A, H. Tuned on seeds 1001-1400 only. Graded once, on
seeds 1-200 and 201-400, with `npm run harness -- gate2 --games 200` on commit
`5fb24a3`. Nothing was changed after those two runs, and they were not repeated.

## Verdict: FAIL, rule reverted

The rule did what it was designed to do. Credit now has a second use that
competes with trade, and the four Credit buyers get a lever of +20-30% where they
had +4-6%. But two pre-registered lines failed on seeds 1-200, so the rule is
reverted in this pull request, as prompt 15 did. The harness lines stay.

| Failed on seeds 1-200 | Result | Line |
|---|---|---|
| Target 2: never investing vs the best fixed rate, median nation | 2.7% below, and only 7 of 17 nations at least 3% below | 3% below (needs 9 of 17) |
| Target 5: the reworded defecting-archetype line (decision record G1) | free-rider **1.61x** its fair share (main: 1.05x) | 1.5x |

Seeds 201-400 passed target 2 (3.3%, 9 nations) and the archetype line (free-rider
1.46x, main 1.15x), so both lines are knife-edge, not lost by a wide margin. The
reasons they are knife-edge are structural, and are the useful result of this
prompt (sections 4 and 5).

**The state on `main` after this pull request plays exactly as before it.** The
reverted run reproduces prompt 14 and 15's numbers to the last digit (cooperator
3.90x and 3.50x, free-rider 1.05x and 1.15x, crisis success 56.6% and 59.7%, trade
+17.1% and +17.8%). What stays is the measuring: the two permanent lines
(AI vs idle, decision density), the G1 archetype wording in the harness and the
AI's check, and `--set` reaching AI-only tunables.

To bring the rule back for the owner's decision (section 6):
`git checkout 5fb24a3 -- packages docs/RULES.md` and delete
`packages/harness/src/idle-suite*.ts`. Commit `5fb24a3` stays in `main`'s history
because the pull request is merged with a merge commit.

## 1. The design, as graded

Written in docs/RULES.md first (2.9, and 3.3, 5.3, 7.5, 8 and 11), then coded.
Preserved at `5fb24a3`. In brief:

- **What.** A nation spends Credit to raise its own Food or Energy production, in
  *points* (1% of that good's demand; stored in basis points).
- **Cost, with diminishing returns.**
  `base = potentialOutput * investCostBp / 10000` for the first point;
  `price(k) = base * (100 + investEscalationPct * k) / 100` for the point after
  `k` committed. A ceiling of `investMaxPct` points per good. Integers.
- **Lag.** Paid when ordered, online `investLagTicks` months later. Pending
  capacity counts as committed.
- **Effect.** Added to real production, so shortfalls, stocks and the "deficits
  met" goal see it. **Not** in the baseline, the structural cover, the fair share
  or the imbalance a trade clears (RULES 5.3, 3.3): a builder beats a baseline
  that did not move, and building never shrinks what a trade is worth clearing,
  it only shrinks what the nation still needs to buy.
- **Named sink.** `creditSpentInvestment`, in the conservation invariant (a
  property test, 150 random worlds, exact).
- **Upkeep (tuning revision 1, section 3).** Every 10 points online cost
  `investUpkeepBpPer10` basis points of output a month.
- **One dial, one card.** Dial 3 became a budget dial with a second slider
  (`investBp`, share of income into the good with the larger gap); dial 2 breaks
  ties. One new card, "home investment", two taps. No sixth dial.
- **Command and AI.** `invest { good, bp }`. The AI decides from its own View: a
  running average of the shortage it has suffered, four plans scored against the
  shortfall cap's dead zone, a share of spare Credit a month on the best plan,
  a numeric `why` on every order.
- **Schema 5** with a migration; a save that must replay is refused.

Final values (all inside their bands, RULES 11 and `tunables.ts` agreed, and
`rules.test.ts` fails if they drift): `investCostBp` 1300, `investEscalationPct`
1, `investMaxPct` 100, `investLagTicks` 3, `investUpkeepBpPer10` 18,
`defaultInvestBp` 250, `aiInvestSharePct` 25, `aiInvestReserveTicks` 1,
`aiInvestPaybackPct` 55, `aiInvestSmoothTicks` 4, `aiInvestCoverPriorPct` 40.

**RULES 5.3 is pinned by a test** (`packages/sim/src/invest.test.ts`): two worlds,
one where a nation builds and one where it does not; every baseline, the
structural cover, and every other nation's private record are identical, tick by
tick, for 40 ticks; the builder alone produces more and beats an unmoved
baseline; every Credit that left it is in the sink.

## 2. The fixed-rate strategies, and how they were defined

Target 2 needs strategies that invest at a fixed rate. They are the shipped AI's
trade and crisis play with its investment plan replaced by a flat rule
(`invest0`, `invest10`, `invest25`, `invest50`, `invest100`), so a rate is a dose:

- **Rate of income, not of stock.** First defined as a percent of the Credit in
  the treasury. That saturated: nations hold 50-60 months of output, so 10% of the
  stock a month buys everything worth buying within a few months, every rate from
  10% up gave the same result, and the sweep could not tell a small dose from a
  large one. Redefined (on tuning seeds, before any graded run) as that percent
  of last month's income, taken out of the Credit that is spare, like the dial.
- **No stopping rule but the ceiling.** It builds in the good with the larger
  gap, then the other, and does not stop when a gap closes. That is what lets too
  high a rate cost something.
- **"Best rate" is the lowest rate within 0.5% of the top median**, so a nation
  for which building changes nothing is "best at 0", not at a rate picked by
  noise. Fixed before the graded runs.
- **"The median nation"** is the median over the 17 playable nations of
  (best - rate) / best, read literally.

## 3. Tuning (seeds 1001-1400 only)

Two things were learned before any of the numbers below meant anything.

**First finding: Credit alone is not a cost.** The first design charged Credit
only. Score is output against a baseline, and Credit is not scored; nations end a
game holding 50-60 months of output. So building past what trade leaves uncovered
cost nothing: with stock-based rates, every rate from 10% to 100% scored the same
(34 games: never investing 0.0% below the best rate, the highest rate 0.4%
below, sinks 3.5%). **Revision 1 added upkeep**, a cost paid in output, the thing
that is scored. That is why the rule now has one more tunable and one more line
in RULES 2.9 than the prompt's sketch.

**Second finding: the AI's lever is far larger than the target.** Target 3 asks
for 8%; every setting tried gave the four Credit buyers 19-32% over idle (table
B). That did not fail target 3. It caused the fifth-target failure (section 5).

### A. First design (Credit cost only), 34 games

| cost / escalation / ceiling / lag | Sinks | AI vs idle: overall; weakest of the four | Fixed rates: distinct bests; never / highest below best |
|---|---|---|---|
| 1000 bp / 3% / 60 / 6 months, payback 100 | 3.5% | +16.9%; Korea +6.7%, Turkiye +6.6% | 3; 0.0% / 0.4% |

### B. The AI side: cost and payback hurdle (170 games, no upkeep, lag 6)

| investCostBp | aiInvestPaybackPct | Sinks | AI vs idle: overall; weakest of the four |
|---|---|---|---|
| 400 | 20 | 4.2% | +19.2%; +22.9% |
| 700 | 20 | 6.6% | +20.7%; +22.7% |
| 1000 | 20 | 9.1% | +21.2%; +21.2% |
| 1000 | 50 | 7.8% | +21.0%; +20.0% |
| 1500 | 10 | 12.8% | +21.7%; +19.3% |
| 2000 | 10 | 15.2% | +22.1%; +19.3% |
| 2500 | 10 | 17.1% | +20.4%; +14.3% |

Sinks of 8-25% (target 1) need a cost of about 1000-2500 basis points at a low
hurdle; the AI's lever is huge at every one of them.

### C. Fixed rates: upkeep, ceiling, lag, escalation (170-400 games)

Upkeep is shown in basis points of output per 10 points online; "hurt" is the
number of the 17 nations at least 3% below their best rate at that end.

| Change | Distinct bests | Never invest below best (hurt) | Highest rate below best (hurt) |
|---|---|---|---|
| cost 1000-1500, rates as % of stock, upkeep 0-50 | 3 | 0.0% | 0.2% at upkeep 0, 4.9-5.8% at upkeep 50 |
| rates as % of income, upkeep 0 | 4 | 3.4% (9) | 0.7% (3) |
| upkeep 20 | 4 | 2.7% (7) | 2.3% (4) |
| upkeep 30 | 4 | 2.1% (7) | 3.6% (9) |
| upkeep 50 | 5 | 1.4% (5) | 5.1% (10) |
| ceiling 100, lag 3, upkeep 12 | 4 | 2.9% (8) | 2.6% (6) |
| ceiling 100, lag 3, upkeep 16 | 4 | 3.1% (9) | 3.1% (10) |
| ceiling 100, lag 3, upkeep 20 | 4 | 3.1% (9) | 3.8% (12) |
| ceiling 100, lag 3, upkeep 25 | 4 | 2.4% (8) | 4.7% (13) |
| lag 2 vs 3 (upkeep 16-20) | 4 | 3.0-3.1% (8-9) | 3.1-3.8% (10-12) |
| escalation 0 / 1 / 2 / 5 (lag 2, upkeep 20) | 4-5 | 2.6 / 2.6 / 3.3 / 1.8% | 4.0 / 4.3 / 3.9 / 3.2% |
| cost 900 / 1100 / 1200 / 1400 (lag 2-3, upkeep 16-20) | 4-5 | 2.8 / 2.3 / 3.2 / 3.0% | 3.9 / 3.6 / 3.9 / 3.3% |

Lines are read from 400 tuning games, but a graded range is 200, so each setting
was also **bootstrapped**: 1,000 resampled 200-game ranges from its own rows
gave the chance that all of target 2 passes. It ranged from 0.01 to 0.94; the
best scored 0.94 (lag 3, cost 1200, escalation 1, upkeep 18), and the setting
finally kept, after section D moved the cost to 1300, 0.89. The bootstrap only
resamples the tuning games, so it flatters a setting that was picked on them; on
the two tuning ranges the kept setting passed the clause once (3.2%, 9 nations)
and failed once (2.5%, 8), which is the honest odds.

### D. The full suite on the tuning ranges found the fifth-target problem

With the setting above and the AI's hurdle at 15%, the whole gate2 suite on the
tuning ranges (seeds 1001-1200 and 1201-1400) passed every line except one: the
reworded archetype line. The free-rider took **1.76x and 1.78x** (main on the same
seeds: 1.25x and 1.37x). The wins had moved onto the four deep importers:
Saudi Arabia (30%), Japan (28%), Turkiye (20%) and Korea (8%) took 86% of the
games, and whichever archetype held those seats, the free-rider's 5% cover
penalty was small next to a 30% gain.

| aiInvestPaybackPct | Free-rider share (200 games) | Sinks |
|---|---|---|
| 15 | 1.76x | 9.5% |
| 40 | 1.59x | 8.8% |
| 60 | 1.18x | 7.9% |
| 90 | 1.20x | 5.9% |

A hurdle of 55-60 brought the share back to main's level (with Japan out of the
top three) but took sinks to the edge of the 8% floor; the dial default
(`defaultInvestBp` 250) and cost 1300 lifted them to 8.5%. Final results on the
two tuning ranges: free-rider 1.18x and 1.20x, sinks 8.5%, all four Credit
buyers over 19%. Saudi Arabia still topped 35% of games there.

### E. Final, on the tuning ranges (whole gate2 suite)

| | Seeds 1001-1200 | Seeds 1201-1400 |
|---|---|---|
| Fixed rates: distinct bests / never / highest | 4 / 3.2% (9) / 3.2% (11) | 4 / **2.5% (8)** / 3.2% (12) |
| Free-rider share | 1.18x | 1.20x |
| AI vs idle; sinks | +20.6%; 8.5% | +20.5%; 8.5% |
| Every other Gate 1 and Gate 2 line | pass | pass |

Target 2's median clause failed on one of the two tuning ranges. That was a
warning; nothing further was tuned to it.

## 4. Graded results (seeds 1-200 and 201-400, once)

"Today" is `main` before this prompt (the reverted run, which reproduces prompt 14
and 15's tables exactly).

| Target | Seeds 1-200 | Seeds 201-400 | Today (1-200 / 201-400) | |
|---|---|---|---|---|
| 1. Credit sinks 8-25% of income, AI playing (all-AI world) | 8.5% (investment 7.8%) | 8.5% (7.8%) | 0.7% / 0.7% | PASS |
| 2a. At least 3 rates each best for at least 2 nations | 4 rates (0%: 8, 10%: 2, 25%: 1, 50%: 3, 100%: 3 nations) | 4 (same counts) | n/a | PASS |
| 2b. Never investing at least 3% below the best rate, median nation | **2.7%, 7 of 17 nations** | 3.3%, 9 of 17 | n/a | **FAIL on 1-200**, PASS |
| 2c. Highest rate at least 3% below the best rate, median nation | 3.3% (10 of 17) | 3.3% (10 of 17) | n/a | PASS |
| 3. AI vs idle, each of Japan, Korea, Mexico, Turkiye at least +8% | +23.7%, +20.2%, +30.3%, +27.4% | +23.1%, +19.8%, +30.3%, +27.3% | +6.4, +4.0, +3.5, +5.9% / +6.6, +5.2, +4.6, +4.5% | PASS |
| 3. AI vs idle, overall at least +10% | +20.6% | +20.4% | +14.6% / +14.5% | PASS |
| 4. Trading vs isolating at least +15% (isolationist on the default dial) | +21.5% | +21.8% | +17.1% / +17.8% | PASS |
| 5. Crisis success 40-75% | 56.5% | 59.6% | 56.6% / 59.7% | PASS |
| 5. Cooperator ahead of the free-rider in 70%+ of pairs, median +3% | 96.0%, +4.90% | 96.5%, +4.91% | 90.5%, +5.47% / 90.5%, +5.81% | PASS |
| 5. Spoiler and stealth spoiler strictly below the cooperator (median score from mid-game) | 1,009 and 1,299 vs 1,389 | 1,021 and 1,288 vs 1,382 | 978 and 1,042 vs 1,105 / 993 and 1,050 vs 1,109 | PASS |
| 5. 24-hour absence 0 / 0 / 0, recap at most 6 lines and 150 words | 0 / 0 / 0, 137 words | 0 / 0 / 0, 137 words | 137 / 129 words | PASS |
| 5. Dead states under 2%; crashes 0; negative stocks 0 | 0.0%; 0; 0 | 0.0%; 0; 0 | pass | PASS |
| 5. Determinism (`npm test`, 1,000 seeds, Node vs Chromium) | pass | | pass | PASS |
| 5. **Defecting archetypes at most 1.5x and no more often than the cooperator (G1)** | free-rider **1.61x**; hoarder 0.03x, exploiter 0.00x, isolationist 0.00x; cooperator 3.52x | free-rider 1.46x; hoarder 0.05x, others 0.00x; cooperator 3.48x | free-rider 1.05x / 1.15x; hoarder 0.18x / 0.25x; exploiter 0.10x / 0.10x; isolationist 0.00x; cooperator 3.90x / 3.50x | **FAIL on 1-200**, PASS |
| 5. Gate 1 lines other than the top scorer | pass | pass | pass | PASS |
| 6. Top scorer (report only, not tuned) | Saudi Arabia **38.5%** (Gate 1 mix 23.0%) | Saudi Arabia **38.5%** (26.0%) | 21.0% (19.0%) / 22.5% (15.0%) | reported |

Target 2 needs all three of its clauses, and target 5 all of its lines, so the
rule fails on the graded seeds and is reverted. It would have passed on
201-400 alone; nothing is re-tuned on either range.

**AI vs idle, by nation** (median of (played - idle) / played; 12 pairs a nation):

| Nation | 1-200 today | 1-200 with the rule | 201-400 today | 201-400 with the rule |
|---|---|---|---|---|
| Australia | +10.9% | +17.2% | +10.9% | +17.1% |
| Brazil | +15.9% | +17.4% | +15.6% | +17.4% |
| Canada | +14.4% | +17.1% | +14.6% | +17.2% |
| China | +20.1% | +9.6% | +19.5% | +9.4% |
| Egypt | +23.4% | +31.0% | +23.4% | +31.4% |
| Germany | +10.8% | +27.1% | +7.3% | +27.1% |
| India | +20.1% | +25.1% | +21.4% | +25.2% |
| Indonesia | +18.3% | +20.5% | +18.2% | +20.4% |
| Japan | +6.4% | +23.7% | +6.6% | +23.1% |
| Korea | +4.0% | +20.2% | +5.2% | +19.8% |
| Mexico | +3.5% | +30.3% | +4.6% | +30.3% |
| Nigeria | +18.2% | +20.9% | +18.3% | +21.0% |
| Russia | +14.7% | +14.0% | +14.5% | +14.1% |
| Saudi Arabia | +25.5% | +34.0% | +24.9% | +33.6% |
| South Africa | +13.2% | +12.6% | +13.2% | +12.6% |
| Turkiye | +5.9% | +27.4% | +4.5% | +27.3% |
| United States | +11.7% | +12.1% | +11.7% | +12.0% |

China is the one nation whose gap falls (+20% to +10%): the AI's plan builds for
China where trade gains were worth more (China's median score, seeds 1-200: 1,505
as the AI, 1,636 never investing). The plan does not price the trade gain a
builder gives up (RULES 3.3); that is a flaw in the AI's plan, not in the rule.

**Decision density for an idle nation** (the second permanent line):

| Per game | Today (1-200 / 201-400) | With the rule (1-200 / 201-400) |
|---|---|---|
| Trade offers received | 25.9 / 26.1 | 14.5 / 14.1 |
| Crisis appeals with a share to pay | 5.9 / 5.9 | 5.9 / 5.9 |
| Appeals already paid in full when they open | 73.9% / 74.7% | 73.8% / 74.7% |
| Months the home-investment card would be open | n/a | 37.2 / 36.9 |

The rule did nothing for the 74% of appeals paid before the player sees them,
and cut the offers an idle nation receives by 45% (AI sellers rank buyers by
deficit, and a builder has a smaller one). Its card would sit open for 37 of 60
months on an idle nation, so a phone card needs throttling.

**Collaboration against self-reliance** (median final score, same nation, paired
seeds; reported, not graded): the trader that trades and builds beat the
self-reliant AI (builds by its own plan, trade closed) by **+16.6% and +16.5%**,
and the isolationist bot by +26.0% and +25.7%. So the theme held: depending on
partners beat paying to be self-reliant, on average, by a wide margin.

**Who benefits from a fixed rate** (median gain of the best rate over never
investing, seeds 1-200): Saudi Arabia +22.5% (best 50%), Korea +16.2% (100%),
Turkiye +13.9% (100%), Japan +12.2% (100%), Egypt +8.7% (50%), Germany +7.9%
(25%), Mexico +7.2% (50%). Then India +2.7% (3.4% on 201-400), which is marginal,
and the United States +2.9%, which has no deficit at all and so is noise. Nothing
for China, Nigeria, South Africa, Indonesia or the other exporters; they lose
2-11% at the highest rate.

## 5. Why it failed, and what the failures say

1. **Target 2's median clause needs nine nations to gain 3% from building, and
   the roster has seven.** Six nations have no deficit worth closing (Australia,
   Brazil, Canada, Russia, the United States, South Africa), and China,
   Indonesia and Nigeria have shortages so small (average penalty 3-6%) that
   trade already covers them and building costs them their trade gains.
   The seven that gain: Saudi Arabia, Korea, Turkiye, Japan, Egypt, Germany,
   Mexico. India is at 2.7-3.4%, and the ninth "gainer" on 201-400 was the
   United States, by noise. So the clause is a coin flip by construction: it
   passed on one range and failed on the other. No setting inside the bands
   changes how many nations have a deficit.
2. **Target 5's free-rider line fell because the lever is too strong, not
   because free-riding got cheaper.** The cooperator's lead over the free-rider
   in the same nation is unchanged (+4.9%, was +5.5%). What changed is who wins:
   the deep importers, whose baselines expect the shortfall at the 30% cap,
   beat it by 20-30% once they can build. Whichever archetype seat holds one of
   them tops the game, and the free-rider's 5% penalty is small next to that.
   Saudi Arabia goes from 21% to 38.5% of games, and Turkiye, which topped 0-2.5%
   of games on `main` (prompt 15, section 5), to 13% and second place.
   That is the top-scorer problem prompt 15 tried to solve, moved rather than
   fixed (target 6). The free-rider share is also noisy: it moves by 0.3x
   between 200-game ranges even on `main` (1.05x, 1.15x, 1.25x, 1.37x on the
   four ranges seen). The retune of section D brought it to 1.18x and 1.20x on the
   tuning ranges, and did not carry to the graded ones (1.61x and 1.46x, against
   `main`'s 1.05x and 1.15x on the same seeds): a setting picked as the best of
   a dozen noisy readings reads better on them than it is. The honest size of the
   rule's effect is about +0.2 to +0.4x.
3. **Credit was never the constraint, and that is the finding behind the whole
   prompt.** A nation ends a game holding 50-60 months of output, so a cost
   paid only in Credit is not a cost. What competes in this economy is goods,
   not money: the world is short of energy and food, so what matters is who
   supplies whom, and Credit only pays for it. Upkeep worked because it charges
   output. The unresolved part is the original ask, that investment should
   compete "with imports and with crisis-pool payments for the same Credit": it
   does not, because those are 5-10% of income and building 8%.

## 6. Decision for the owner

Nothing irreversible changed. `main` plays as before, and gains the measuring.

**Recommendation: keep it reverted for now, and re-run the idea as prompt 17b
with two changes made by the architect before any run**, because the rule works
and the two pre-registered lines that failed are the ones this design cannot
meet as written:

1. **Reword target 2's median clause.** Say what the roster can support: at
   least 6 nations gain 3% or more from their best rate, and at least 6 lose 3%
   or more at the highest, or grade it pooled over 800 games. The literal
   clause needs 9 of 17 nations to have a deficit worth closing and only 7 do.
2. **Ask for a weaker lever.** Target 3 asked for 8% and every setting gave
   19-32%. A lever of about 10-12% for the four Credit buyers would still
   clear the target and would keep the podium spread. The knobs, in order:
   the AI's payback hurdle (60 gave the free-rider back at 1.18x), a lower
   ceiling (40-60 points, which leaves the deepest importers in the shortfall
   cap's dead zone), a higher cost. Retune on seeds 1001-1400 first, as before.

Two other ways to spend the next prompt:

- **Restore the rule as it stands** (`git checkout 5fb24a3 -- packages docs/RULES.md`),
  and accept the failed lines with a written waiver. Not recommended: it makes
  Saudi Arabia the winner of 38.5% of games.
- **Drop investment and attack the real constraint,** which is goods: joint
  projects (Phase 3) create supply, and would be a Credit sink that competes
  for the reason above. This is the change GO-NO-GO did not consider.

Either way, lane U must not start prompt 18 on the reverted state: it says so
itself ("If prompt 17 reverted its rule, change nothing").

## 7. How to reproduce

```
# the two permanent lines and the whole gate2 suite, on main (rule reverted)
npm run harness -- gate2 --games 200 --seed 1
npm run harness -- gate2 --games 200 --seed 201
# the graded state, with the rule (a checkout of 5fb24a3; also `npm run harness -- invest`)
git checkout 5fb24a3 -- packages docs/RULES.md
npm run harness -- gate2 --games 200 --seed 1
npm run harness -- invest --games 400 --seed 1001 --set investCostBp=1300   # tuning, one setting
```

The invest command, `--no-rates`, the fixed-rate and self-reliant strategies and
their tests exist only at `5fb24a3`.
