# Gate 2 balance report: prompt 15 (structural baseline upside)

2026-09-29. Lanes D, S, H. Tuned on seeds 1001-1400 only. Graded once, on seeds
1-200 and 201-400, with `npm run harness -- --suite gate2 --games 200` (the
suite reruns Gate 1), on commit e3c5f0b. Nothing was changed after those runs,
and they were not repeated.

## Verdict: FAIL, rule reverted

The rule fixes what the prompt diagnosed. Saudi Arabia no longer tops a quarter
of games, and the cooperative AI's average score per nation now spans 1.03-1.18
instead of 0.95-1.26. But the top-scorer line (11.8%) still fails on all four
graded checks. Every other pass line holds.

| Top scorer, graded once | Old rule (main) | New rule | Line |
|---|---|---|---|
| Archetype games, seeds 1-200 | Saudi Arabia 21.0% | Canada 14.0% | <= 11.8% |
| Archetype games, seeds 201-400 | Saudi Arabia 22.5% | Canada 12.0% | <= 11.8% |
| Gate 1 mix, seeds 1-200 | Saudi Arabia 19.0% | Egypt 14.0% | <= 11.8% |
| Gate 1 mix, seeds 201-400 | Saudi Arabia 15.0% | Germany 14.0% | <= 11.8% |

As the prompt requires, the rule is reverted in this pull request (rules, tests
and code: commits a06a052, ea90023 and e3c5f0b, reverted by c9f1c4b, 276f1bf and
40741f6). Main plays exactly as before. The owner's decision is at the end:
**waive the top-scorer line a second time, in writing.** The tuning also found
that the line cannot pass reliably with this roster, whatever the baseline rule
(section 5).

## 1. The diagnosis, confirmed (seeds 1001-1400)

A scratch diagnostic replayed the 400 archetype games and split each nation's
score into its trade gain and its shortfall against the shortfall its baseline
expected. The prompt's diagnosis holds, and it is sharper than earlier reports
said:

| Nation | Tops (archetypes) | Mean ownScore, all archetypes | As the cooperative AI | As hoarder / exploiter / isolationist | Baseline expects | Actual penalty as the AI |
|---|---|---|---|---|---|---|
| Saudi Arabia | **24.0%** | 0.995 | **1.26** (p90 1.34) | 0.86-0.88 | 20.8% | 12.0% |
| Canada | 12.0% | 1.045 | 1.17 | 0.96-0.98 | 0% | 0% |
| Nigeria | 9.8% | 1.000 | 1.19 | 0.91-0.94 | 6.0% | 2.1% |
| Egypt | 0.5% | 0.935 | 1.01 | 0.86-0.96 | 21.2% | 24.3% |
| Germany | 0.8% | 0.920 | 0.95 | 0.85-0.95 | 17.5% | 23.9% |
| Mexico | 0.0% | 0.906 | 0.95 | 0.86-0.94 | 20.0% | 25.8% |

- **Saudi Arabia's average is ordinary. Its upside is not.** It wins only as the
  AI (59 of 81 trader games, 37 of 69 free-rider games) and never as a bot. As
  the AI it gets 60% of its food deficit covered against the 35% its baseline
  expects, so it beats a baseline that expected a 21% shortfall by 26% on average
  and by up to 34%. Gate 1 mix: 16.8%, the same pattern.
- **Crises are not the cause** (confirmed in prompt 09 and unchanged).
- **The reason is how a nation pays, not the depth or size of its deficit.** How
  much of its deficit the cooperative AI got covered, against the 35-40% every
  importer's baseline expected:

| Pays with | Nations | Share of deficit covered as the AI |
|---|---|---|
| Its own spare goods (swaps) | Saudi Arabia, Nigeria, Indonesia (spare energy for food), South Africa, India (spare food for energy) | 37-99% (Saudi Arabia 60%, Nigeria 77%, Indonesia 50%, India 37%) |
| Credit only | China, Egypt, Mexico, Germany, Japan, Korea, Turkiye | 13-35% (Egypt 20-22%, Mexico 13-16%, Germany 17%) |

The AI's sellers ask for goods in return when the buyer has spare goods they
lack. So a nation with spare energy gets food through its own sales, and a
Credit buyer waits for someone to sell to it. Depth does not predict cover
(Saudi Arabia's food deficit is 92% of its demand and it is covered well; Korea's
is 86% and it is covered at 22%). Absolute size does not predict it either.

So the RULES 2.8 baseline, which expects the same share of cover for every
importer, is too pessimistic for swappers and too optimistic for Credit buyers.
Saudi Arabia is the extreme case: a large expected shortfall that it can remove
by itself.

## 2. The design (RULES 2.8, written before the code)

The fair share (the world's cover, the same for every importer) stays the trade
gain's yardstick (RULES 3.3), untouched. The baseline instead expects the cover
a trading nation normally gets, by how it pays:

```
credit_good   = cover_good * baselineCreditCoverPct / 100
fund_good     = min(1, value of own structural surplus of the other good
                       / value of own structural deficit of this good)       (at base prices)
expected_good = credit_good + (1 - credit_good) * baselineInKindCoverPct / 100 * fund_good
structuralUnmet_good = deficit_good * (1 - expected_good)
```

- **Two tunables, with bands.** `baselineCreditCoverPct` (45, band 25-100) and
  `baselineInKindCoverPct` (60, band 0-100). 100 and 0 are the prompt 09 rule.
- **Nothing a player does moves a baseline**, so RULES 5.3 holds: every term is
  the nation's own structural flows, the world cover (baseline paths only),
  fixed base prices and tunables. Tests pinned this, and that the trade gain's
  yardstick did not move.
- **D3, a small nation can still win.** Under the rule, small economies top in
  every graded run: Egypt 10.0-14.0%, Saudi Arabia 9.0-13.5%, Nigeria 6.0-6.5%,
  Australia 6.0-9.0%.
- **Play does not change.** No AI or bot reads the baseline, so crisis success,
  the trade gain and every trade are identical under any setting. Only the
  scores move.
- **As decision cards and standing policies:** nothing new. It is a yardstick.

Expected penalty at the start, prompt 09 rule -> this rule: Saudi Arabia 20.8% ->
11.3%, Nigeria and Indonesia about 6% -> 3%, India 11.4% -> 11.5%, China 11.6% ->
15.5%, Egypt and Mexico 20-21% -> 26-28%, Germany 17.4% -> 23.6%; Japan, Korea and
Turkiye stay at the 30% cap.

## 3. Tuning (seeds 1001-1400 only)

Each row is the full gate2 suite on the 400 tuning seeds (`--set`); "G1" is its
Gate 1 rerun. Top three nations by share of games topped.

| Credit / in-kind | Archetype games: top three | Gate 1 mix: top three |
|---|---|---|
| 100 / 0 (prompt 09 rule) | Saudi Arabia 24.0, Canada 12.0, Brazil 10.8 | Saudi Arabia 16.8, Brazil 14.2, Indonesia 10.8 |
| 100 / 40 | Saudi Arabia 16.5, Canada 16.0, Brazil 12.8 | Brazil 16.0, Saudi Arabia 13.3, Canada 11.8 |
| 60 / 40 | Saudi Arabia 18.8, Canada 12.3, China 9.3 | Saudi Arabia 14.0, Brazil 11.5, India 9.8 |
| 60 / 65 | Canada 14.8, Brazil 11.8, China 10.5 | Brazil 13.8, Canada 10.5, Saudi Arabia 9.3 |
| 60 / 80 | Canada 16.3, Brazil 12.0, China 10.8 | Brazil 14.8, Canada 12.0, Australia 9.3 |
| 50 / 50 | Saudi Arabia 14.0, China 11.8, Canada 10.8 | Saudi Arabia 12.5, Brazil 11.0, India 9.8 |
| 50 / 65 | Canada 13.3, China 11.8, Brazil 10.5 | Brazil 12.5, Canada 9.5, Saudi Arabia 9.3 |
| 50 / 70 | Canada 13.8, China 12.0, Brazil 10.8 | Brazil 13.0, Canada 10.5, China 9.0 |
| 50 / 80 | Canada 14.2, China 12.0, Brazil 10.8 | Brazil 14.0, Canada 10.8, China 9.3 |
| 45 / 55 | Saudi Arabia 13.5, China 12.0, Canada 10.8 | Saudi Arabia 11.0, Brazil 10.3, China 9.8 |
| **45 / 60 (chosen)** | **China 12.0, Canada 11.8, Saudi Arabia 11.8** | **Brazil 11.0, Saudi Arabia 10.8, China 9.8** |
| 45 / 65 | Canada 12.8, China 12.3, Saudi Arabia 10.5 | Brazil 11.0, Saudi Arabia 10.0, China 9.8 |
| 45 / 75 | Canada 13.8, China 12.3, Brazil 10.5 | Brazil 12.0, Canada 10.0, China 10.0 |
| 40 / 65 | China 13.3, Egypt 11.5, Canada 11.0 | Brazil 10.5, Saudi Arabia 10.0, China 9.5 |
| 40 / 80 | China 13.3, Canada 12.5, Egypt 12.3 | Brazil 12.0, Canada 10.0, China 9.8 |
| 30 / 75 | Egypt 15.5, China 14.5, Germany 12.5 | Egypt 11.8, China 10.8, Germany 10.8 |

What the sweep shows:
- **In-kind cover takes Saudi Arabia down** (24.0% -> about 10-12% from 60 up).
  Alone (credit 100), it hands the wins to Canada and Brazil, pure exporters with
  no deficit, which a baseline rule cannot touch.
- **Lower credit cover brings the Credit buyers into contention** (China, Egypt,
  Germany now win), and that spreads the wins. Below 45, China and then Egypt
  overshoot; above 50, the exporters take over.
- **45 / 60 is the best point**, but even there the top nation is at the line
  (12.0%) on the tuning seeds. Its worst single 200-game tuning range is 13.0%.

**Two more ideas, tested and dropped** (not committed):
- *Large buyers expect more cover.* China's energy deficit is 23% of the world's,
  and the AI's sellers rank buyers by need, so China is covered well. Giving a
  large share of world imports a higher expected cover takes China down, but its
  wins go to Canada, Brazil and Egypt (best 14.0%).
- *Exporters' baselines expect part of their sales gain.* A grid over all four
  knobs (credit, in-kind, large buyer, expected sales) found no setting with every
  200-game tuning range at or under 11.8%. The best worst range was 13.0%, the
  same as the two-knob rule. Two extra mechanisms for no gain are not worth their
  complexity.

These wider sweeps used an offline re-scorer (not committed). No player, AI or
bot reads the baseline, so each game's output could be recorded once and
re-scored under any baseline rule. The re-scorer reproduces the full suite's
numbers exactly for every setting checked.

## 4. Graded once (seeds 1-200 and 201-400), rule 45 / 60

Old rule = main, run on the same seeds with `--set baselineCreditCoverPct=100,baselineInKindCoverPct=0`
(the prompt 09 rule, which reproduces main exactly). For comparison only, not
for tuning.

| Pass line (prompt 15) | Seeds 1-200: old -> new | Seeds 201-400: old -> new | |
|---|---|---|---|
| Top scorer, archetype games <= 11.8% | Saudi Arabia 21.0% -> **Canada 14.0%** | Saudi Arabia 22.5% -> **Canada 12.0%** | **FAIL** |
| Top scorer, Gate 1 mix <= 11.8% | Saudi Arabia 19.0% -> **Egypt 14.0%** | Saudi Arabia 15.0% -> **Germany 14.0%** | **FAIL** |
| Gate 1 trade gain >= +15% | +17.1% -> +17.1% | +17.8% -> +17.8% | PASS |
| Isolationists worse off but alive | 98.0% of pairs, 0 dead -> same | 99.0%, 0 dead -> same | PASS |
| Crisis success 40-75% | 56.6% -> 56.6% | 59.7% -> 59.7% | PASS |
| Free-rider <= 1.5x and below the cooperator | 1.05x -> 0.58x | 1.15x -> 0.78x | PASS |
| Cooperator ahead of the free-rider (>= 70%, median >= +3%) | 90.5%, +5.47% -> 90.5%, +5.35% | 90.5%, +5.81% -> 91.0%, +6.12% | PASS |
| Spoiler strictly below the cooperator | 978 vs 1,105 -> 911 vs 1,244 | 993 vs 1,109 -> 919 vs 1,209 | PASS |
| Stealth spoiler strictly below the cooperator | 1,042 vs 1,105 -> 1,143 vs 1,244 | 1,050 vs 1,109 -> 1,182 vs 1,209 | PASS |
| Dead states < 2%, Credit sinks 0-25%, 0 crashes, 0 negative stocks | pass -> pass | pass -> pass | PASS |
| 24-hour absence | 0 / 0 / 0, <= 137 words -> same | 0 / 0 / 0, <= 129 words -> same | PASS |
| Gate 1 lines other than the top scorer | pass -> pass | pass -> pass | PASS |
| Archetype line (cooperator's own share; owner's ruling) | 3.90x -> 3.87x | 3.50x -> 3.40x | FAIL, as before |

No line newly fails. One reported line (no pass line) got worse and would matter
if the rule came back: **the stealth spoiler scores above the cooperator in more
pairs** (seeds 1-200: 8.5% -> 15.0%; 201-400: 13.5% -> 24.0%; tuning seeds 9.0% ->
20.8%). Its median is still strictly below. The cause is which nation trails at
mid-game: under the rule it is often a swapper playing a bot (Saudi Arabia as a
hoarder or isolationist scores about 0.77). When that nation switches to the AI's
trading, cooperator and stealth spoiler both gain a lot, and the stealth spoiler
saves its crisis payments. That points back to criterion 4's open question
(prompt 13), not to this rule.

Top-scorer shares under the rule, graded. The wins are spread wide, and the
failure is several nations each just over the line, not one outlier:

| Seeds | Archetype games | Gate 1 mix |
|---|---|---|
| 1-200 | Canada 14.0, China 12.0, Egypt 10.5, Saudi Arabia 10.5, Brazil 9.5, Australia 9.0, Germany 8.0 | Egypt 14.0, Saudi Arabia 13.5, Brazil 12.5, Germany 11.0, China 7.5 |
| 201-400 | Canada 12.0, Brazil 11.5, Germany 11.0, China 10.5, Egypt 10.0, Saudi Arabia 9.0, India 8.5 | Germany 14.0, Egypt 10.5, Saudi Arabia 9.5, Brazil 9.0, Australia 8.0, China 8.0 |

## 5. Why no baseline rule gets there

1. **Too few nations can realistically win.** Japan, Korea and Turkiye sit at the
   30% shortfall cap (RULES 2.7) in their baseline *and* in play, whatever they
   do. Cover moves neither side, so only the trade gain lifts them (about
   +4-6%). They top 0-2.5% under every rule tested. Mexico, South Africa and
   Indonesia rarely do. That leaves about 11-12 real contenders.
2. **With 11-12 contenders, 11.8% per 200-game range is mostly luck.** Draw the
   winner of 200 games at random from N equally likely nations, and see how
   often the most frequent one tops more than 11.8% of them:

   | Equally likely winners | Average top share per 200 games | One range over 11.8% | All four graded checks pass |
   |---|---|---|---|
   | 17 | 9.1% | 1% | 95% |
   | 14 | 10.6% | 13% | 58% |
   | 12 | 11.8% | 47% | 8% |
   | 11 | 12.6% | 76% | under 1% |

   Even a perfectly fair game with 12 contenders passes all four checks about
   one time in twelve.
3. **The contenders are not equal either.** The exporters (Canada, Brazil,
   Australia, the United States) sell their whole surplus every month, so as the
   AI they score about 1.16-1.18 every game with little spread. Credit buyers
   (China, Egypt, Germany) score less on average but with a wide spread. A
   baseline can move the second group up or down, but not change that one group
   is steady and the other is lucky. So one of the two leads by a point or two.

## 6. Decision for the owner

Nothing irreversible changed: the game plays exactly as it did before this
prompt.

**Recommendation: waive the top-scorer line (GATE-2 line 9b, Gate 1 criterion 5)
a second time, in writing.** Reasons:
- Five prompts (06, 09, 11, 13, 15) have attacked it from the scoring rule, the
  AI, the trade gain and now the baseline. The worst nation has come down from
  India's 34.5-45% to 12-14% in every range under this rule, and the wins are
  shared by 10 or more nations.
- Section 5 shows the 11.8%-per-200-games line is below what this roster can
  reliably reach: three nations sit at the shortfall cap and cannot win. Making
  them able to win is a design question about the cap (RULES 2.7), not the baseline.
- Every other Gate 1 and Gate 2 line the engine can grade passes, unchanged.

Two further choices, both optional and reversible:
1. **Bring the rule back anyway.** It does not pass, but it makes the game
   fairer to play: the cooperative AI's average per nation spans 1.03-1.18
   instead of 0.95-1.26, Egypt, Germany and Mexico can now win, and the worst
   nation drops from 15-22.5% to 12-14% on the graded seeds. The cost is that
   Saudi Arabia playing badly scores about 0.77 instead of 0.86 (still far from
   dead, 0.50), and the stealth spoiler's side-effect above. To bring it back,
   revert c9f1c4b, 276f1bf and 40741f6.
2. **Ask the architect to restate the line** (ROADMAP is architect-only), e.g.
   pooled over 800 games, or as "no nation tops more than 2x the fair share of
   the nations that can win". Either would make a pass mean fairness rather than
   luck.

## How to reproduce

```
npm run harness -- --suite gate2 --games 200            # the graded ranges: --seed 1 and --seed 201
npm run harness -- gate2 --games 400 --seed 1001 --set baselineCreditCoverPct=45,baselineInKindCoverPct=60
```

Both need the rule, i.e. the three reverts in this pull request reverted. On
main, `--set` does not know these two tunables.
