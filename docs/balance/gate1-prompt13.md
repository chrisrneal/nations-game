# Gate 1 balance, prompt 13: fair trade-gain rule

2026-09-28. Lanes S, D, H. Question: can a change to the trade-gain rule
(RULES 3.3) bring the most frequent top scorer to 11.8% or less on every graded
range, while trading still beats isolating by +15% or more?

Tuned only on seeds 1001-1800 (`gate1 --games 200 --seed 1001 --ranges 2`, and
`--ranges 4` for the finalists). Graded once on seeds 1-800.

## Verdict: FAIL, rule reverted

The chosen rule (candidates b + c below) is a little fairer than main. It raises
the trade advantage and doubles what Japan, Korea and Turkiye gain from trading.
But on the graded seeds the top scorer is still over 11.8% on **all four
ranges** (12.0 / 12.5 / 13.5 / 14.0%, against main's 12.5 / 13.0 / 15.0 / 14.0%).
Step 6 applies: the rule and its tests were reverted in this pull request
(rule f258f25 and tests acc5be9, reverted by 0e97a85 and c37a7b6). Main's game is
unchanged. One regression test stays: a small imbalance never out-earns a large one at
the same share, which main's rule already satisfies (4be78c0). The owner's
decision is at the end.

## 1. Design (written before the rule was coded)

### What the rule does today (prompt 09)

Each month, nation *i* gains `gainsFromTradeBp` (0.40%) x the share of its
*clearable* imbalance its trades cleared, capped at 0.40%. Clearable = value of
its whole surplus + value of its fair share of each deficit (RULES 2.8).

### What drives the top scorer today (seeds 1001-1400, 400 games)

A scratch diagnostic split every nation's final ownScore into two factors: the
trade gain (capacity / baseline capacity) and everything else, mostly the
shortfall it suffered against the shortfall its baseline expected.

| Group | Examples | Trader games: mean ownScore | Spread | Where wins come from |
|---|---|---|---|---|
| Exporters that trade | Brazil, Russia, Canada, Australia, United States | 1.19-1.22 | +/-0.002 to 0.03 | Every one sells its whole surplus every month and sits at the cap. Brazil tops 41% of its trader games on a 0.01 lead that repeats every game |
| Small importers with a big expected shortfall | Egypt, Saudi Arabia (food), Korea | 1.10-1.22 | +/-0.09 to 0.16 | Luck: when sellers cover their whole deficit, they beat a baseline that expected a 21-30% shortfall. They win as traders, hoarders and exploiters alike |
| Deep importers | China, India, Japan, Turkiye | 1.06-1.13 | +/-0.03 to 0.08 | Almost never: they clear only part of a huge fair share, so they get a fraction of the gain |

So the prompt's diagnosis is half right. A small imbalance does fill easily,
but the biggest single effect is the other side of the same coin: **whoever
fills 100% of its imbalance gets the whole gain, and everyone else gets a
straight-line fraction**. Exporters always fill 100% (the world is short), deep
importers never do.

### Candidate rules

**(a) Gain by value traded relative to own output, monthly cap.**
`gain_i = G x min(1, value cleared_i / (k x output_i))`. A small imbalance
earns a small gain, and the buyer's size never matters. *Sabotage:* the gain
depends only on *i*'s own trades and *i*'s own output, so harming *j* cannot
raise it. *What is different from prompt 09's (b)+(c):* nothing in the formula;
the difference would have to come from pairing it with a curve (c) so that
low-intensity economies (United States, China) can still reach the cap.

**(b) Share of own imbalance, with a floor on the import side.**
Today's rule, but a nation whose fair-share deficit is small compared with its
economy has to cover more of its real deficit (up to all of it) to earn the full
import-side gain: the import base is its fair share, raised to at least
`tradeGainImportFloorBp` of its own output, but never above its whole deficit.
A tiny import can no longer earn the full cap from one small delivery.
*Sabotage:* the base is fixed by *i*'s own flows, own output and the
structural cover, which reads baseline paths only (RULES 2.8), so nothing *j*
suffers moves it.

**(c) Diminishing returns: the first units cleared each month pay most.**
The cleared share runs through a concave curve, `1 - (1 - share)^p`, so the
first units of a deficit covered are worth the most (they avert the worst of a
shortfall) and the last few add little. A nation that clears half its imbalance
earns much more than half the gain, so the flat top where exporters sit and the
slope where importers sit move closer together. *Sabotage:* a curve of *i*'s
own share; nothing about *j* enters it.

**Chosen shape: (b) + (c), with separate curves for the two sides.** The
buyer side gets a steep curve (covering a deficit: the first units matter most),
the seller side a gentle one (selling spare goods is worth about the same per
unit). The import floor stops the steep buyer curve from making a tiny deficit
saturate the cap even more cheaply than today.

```
exportBase_i = value of i's whole structural surplus
importBase_i = min(value of i's whole deficit,
                   max(value of i's fair share of its deficits,
                       tradeGainImportFloorBp x i's potential output))
credit_i     = exportBase_i x (1 - (1 - sold_i / exportBase_i)^tradeGainSellCurve)
             + importBase_i x (1 - (1 - covered_i / importBase_i)^tradeGainBuyCurve)
gain_i       = gainsFromTradeBp x credit_i / (exportBase_i + importBase_i)   (never above gainsFromTradeBp)
```

Curve 1 on both sides and a floor of 0 is exactly the prompt 09 rule.

### What is different from prompt 09's "volume / own output"

Prompt 09 replaced "share of own imbalance" with "volume / own output". That
moved wins to economies whose trade is a large share of their output
(Australia, Canada, Saudi Arabia 15-25%), and cost trade advantage. This
prompt measured that again (variant a, below: Russia 16-25%, trade gain +14.5%
at k = 5%) and dropped it. The chosen rule keeps each nation's own imbalance
as its yardstick, so no economy size is favoured. It only uses output as a
*floor* on the import base, and changes the *shape* of the payout.

### Sabotage (D3), for the chosen rule

Every term (sold, covered, surplus, deficit, fair share, potential output) is
*i*'s own, apart from the structural cover, which reads baseline paths only.
No term is relative to another nation's score, output or trade. A hostile act
against *j* changes none of them for *i*, so RULES 5.3 holds unchanged. The
rule has no "everyone loses" clause.

## 2. Tuning (seeds 1001 and above only)

Every variant below is the chosen formula with different numbers: "sell" and
"buy" are the curve powers (1 = straight line), "floor" is the import floor in
basis points of output. "(a)" means the base is `k x output` instead of the
nation's imbalance, and "floor on both" means the floor applies to the whole
base, both sides. "JKT" is the median trade gain for Japan / Korea / Turkiye.
Main's rule is sell 1, buy 1, floor 0. Unless marked 800, each row is
`--seed 1001 --ranges 2` (400 games). Top scorer is per range, then pooled.

| # | Variant | Top scorer 1001-1200 / 1201-1400 | Pooled 400 | Trade gain (ranges) | JKT | Trader archetype |
|---|---|---|---|---|---|---|
| 0 | main (prompt 09 rule) | Indonesia 11.0 / Brazil 12.5 | Russia 10.8 | +18.0 / +17.8 | 5.3 / 4.5 / 3.8 | 2.90x |
| 1 | (a) k = 2%, straight | Indonesia 17.5 / Brazil 14.5 | Indonesia 14.8 | +21.1 / +19.5 | 8.8 / 6.5 / 5.9 | 3.06x |
| 2 | (a) k = 3%, straight | Indonesia 17.5 / Russia 16.0 | Indonesia 16.5 | +18.4 / +17.5 | 6.4 / 4.5 / 4.1 | 3.02x |
| 3 | (a) k = 5%, straight | Russia 25.0 / Russia 24.5 | Russia 24.8 | +14.3 / +14.7 | 4.1 / 2.7 / 2.2 | 3.02x |
| 4 | (a) k = 1%, both curves 2 | Saudi Arabia 15.0 / Brazil 13.5 | Saudi Arabia 13.0 | +21.9 / +21.9 | 13.5 / 10.3 / 8.7 | 2.97x |
| 5 | (a) k = 1.5%, both curves 3 | Saudi Arabia 15.0 / Brazil 14.0 | Saudi Arabia 13.3 | +21.9 / +21.9 | 11.1 / 10.1 / 8.7 | 2.99x |
| 6 | (a) k = 2%, both curves 2 / 3 / 4 | 13.5-15.5 / 13.5-14.5 | 12.5-13.8 | +21.0 to +21.9 | 11-13 / 8-10 / 7-9 | 2.95-3.00x |
| 7 | (a) k = 3%, both curves 3 / 4 | 14.0-16.0 / 12.0-14.0 | 12.3-13.3 | +20.7 to +21.5 | 11-12 / 8-9 / 7-8 | 2.96-3.03x |
| 8 | (a) k = 4%, both curves 4 | Indonesia 15.0 / Saudi Arabia 13.5 | Saudi Arabia 13.8 | +21.3 / +20.5 | 10.6 / 7.8 / 7.6 | 2.94x |
| 9 | (b) floor on both, 3% | Saudi Arabia 13.5 / Brazil 14.0 | Saudi Arabia 13.8 | +17.1 / +16.0 | 5.3 / 4.5 / 4.1 | 3.05x |
| 10 | (b) floor on both, 5% | Russia 23.0 / Russia 22.0 | Russia 22.5 | +14.2 / +13.9 | 4.3 / 2.7 / 2.6 | 3.05x |
| 11a | (c) half-way curve, x + 0.5x(1 - x) | Indonesia 12.5 / Egypt 12.0 | Egypt 11.5 | +18.9 / +18.7 | 6.7 / 5.7 / 5.5 | 2.91x |
| 11 | (c) both curves 2 | Indonesia 11.5 / Russia 12.5 | Russia 11.3 | +20.1 / +19.5 | 8.4 / 6.6 / 4.2 | 2.87x |
| 12 | (c) straight line with 1.5x slope, capped | Egypt 12.0 / Russia 13.0 | Egypt 11.8 | +20.5 / +19.3 | 8.0 / 6.2 / 3.9 | 2.86x |
| 13 | (c) straight line with 2x slope, capped | Egypt 13.0 / Brazil 12.0 | Egypt 12.0 | +21.4 / +20.6 | 10.8 / 8.0 / 6.6 | 2.77x |
| 14 | (c) both curves 3 | Egypt 11.5 / Egypt 11.5 | Egypt 11.5 | +21.0 / +20.7 | 10.7 / 8.0 / 6.6 | 2.78x |
| 15 | (c) both curves 4 | Korea 11.5 / Brazil 13.0 | Brazil 10.3 | +21.4 / +21.0 | 11.8 / 8.9 / 7.4 | 2.78x |
| 16 | (c) both curves 6 | Indonesia 11.5 / Brazil 14.5 | Brazil 11.8 | +21.4 / +21.4 | 13.4 / 9.7 / 8.5 | 2.95x |
| 16a | (c) both curves 8 | Korea 12.5 / Brazil 14.5 | Brazil 12.5 | +21.5 / +21.3 | 11.2 / 10.0 / 6.7 | 2.82x |
| 17 | (c) both curves 8, gain 28 | Korea 15.0 / Brazil 14.5 | Brazil 13.5 | +14.8 / +14.4 | 7.4 / 7.0 / 7.0 | 2.75x |
| 18 | (c) both 4, `gainsFromTradeBp` 25 / 30 / 34 | 12.0-13.0 / 12.5-13.5 | 11.5-12.3 | +12.6 to +18.0 | 7-10 / 5-8 / 5-7 | 2.73-2.77x |
| 19 | (c) both 3, gain 32; both 6, gain 30; both 2, gain 32; straight, gain 32 | 11.0-15.0 / 11.5-14.5 | 11.5-13.5 | +13.8 to +16.7 | 4-10 / 4-7 / 2-5 | 2.75-2.90x |
| 20 | (b)+(c) floor on both 2-4%, both curves 2 / 3 / 4 / 6 (7 runs) | 13.0-16.5 / 11.0-14.0 | 11.3-13.0 | +17.9 to +21.6 | 8-12 / 7-9 / 2-8 | 2.87-3.00x |
| 21 | sale pays only within the buyer's fair share; curves 1 / 2 / 4, and 3 with gain 34 | 12.0-15.0 / Brazil 13.5-16.0 | Brazil 12.3-15.3 | +14.7 to +20.5 | 2-8 / 2-5 / 1-5 | 2.85-2.99x |
| 22 | buy curve 2 / 3 / 4 / 6, sell straight | Egypt 12.5-15.5 / Egypt 11.5-14.5 | Egypt 12.8-14.2 | +17.4 to +18.4 | 8-11 / 7-10 / 7-8 | 2.50-2.72x |
| 23 | sell 2 or 3, buy 3 / 4 / 6 | Egypt 12.0-14.0 / Russia 12.5 | Egypt 11.8-12.8 | +18.2 to +20.6 | 10-13 / 8-10 / 4-9 | 2.62-2.74x |
| 24 | buy 2 / 3 / 4 / 6, floor on both 2-3.5% (8 runs) | 13.0-17.5 / 11.5-17.0 | Saudi Arabia 12.5 to Russia 17.0 | +16.0 to +20.0 | 8-13 / 7-10 / 4-8 | 2.79-3.08x |
| 25 | buy 4, import floor 2.5% | Egypt 11.0 / Egypt 11.0 | Egypt 11.0 | +18.5 / +17.6 | 11.7 / 9.2 / 6.9 | 2.71x |
| 26 | buy 4, import floor 3% | Russia 10.5 / Russia 11.5 | Russia 11.0 | +18.3 / +17.3 | 11.7 / 9.1 / 6.9 | 2.76x |
| 27 | buy 4, import floor 4% | Russia 11.0 / Russia 12.5 | Russia 11.8 | +17.8 / +16.7 | 10.4 / 7.6 / 6.5 | 2.82x |
| 28 | sell 2, buy 6, import floor 3% | Egypt 11.0 / Brazil 11.0 | Egypt 11.0 | +19.8 / +18.7 | 11.8 / 9.9 / 6.0 | 2.75x |

The finalists were then run on 800 tuning seeds (`--ranges 4`, seeds 1001-1800):

| Variant | 1001-1200 | 1201-1400 | 1401-1600 | 1601-1800 | Pooled 800 | Trade gain | JKT |
|---|---|---|---|---|---|---|---|
| main | Indonesia 12.0 | Brazil 12.5 | Saudi Arabia 14.0 | Egypt 12.0 | Russia 11.5 | +17.3 to +18.0 | 5.2 / 5.0 / 4.4 |
| both curves 4 | Korea 11.5 | Brazil 13.0 | Saudi Arabia 14.0 | Brazil 12.0 | Saudi Arabia 11.3 | +21.0 to +21.4 | 11.7 / 8.5 / 8.9 |
| buy 4, import floor 2.5% | Egypt 11.0 | Egypt 11.0 | Egypt 12.5 | Egypt 13.5 | Egypt 12.0 | +17.4 to +18.5 | 9.9 / 8.7 / 8.9 |
| buy 4, import floor 3% | Russia 10.5 | Russia 11.5 | Egypt 12.5 | Egypt 13.5 | Egypt 11.6 | +17.3 to +18.3 | 9.9 / 8.7 / 8.7 |
| sell 2, buy 4, import floor 3% | Brazil 10.5 | Brazil 11.5 | Egypt 12.5 | Egypt 12.5 | Egypt 11.4 | +18.4 to +19.6 | 10.0 / 8.4 / 8.7 |
| sell 2, buy 6, import floor 3% | Egypt 11.0 | Brazil 11.0 | Egypt 12.5 | Egypt 12.0 | Egypt 11.6 | +18.7 to +20.0 | 10.6 / 9.7 / 9.6 |
| sell 3, buy 6, import floor 3% | Egypt 11.5 | Brazil 11.0 | Saudi Arabia 13.5 | Brazil 12.5 | Brazil 11.1 | +19.2 to +19.9 | 10.4 / 9.4 / 9.6 |
| sell 4, buy 4, import floor 3% | Brazil 10.0 | Brazil 14.0 | Saudi Arabia 13.5 | Saudi Arabia 13.0 | Brazil 11.8 | +18.7 to +20.1 | 11.7 / 8.4 / 8.7 |
| sell 4, buy 4, import floor 3.5% | Egypt 10.5 | Brazil 14.0 | Saudi Arabia 13.5 | Brazil 13.0 | Brazil 11.9 | +18.8 to +19.7 | 10.6 / 8.0 / 8.1 |
| sell 3, buy 3, import floor 3.5% | Brazil 11.5 | Brazil 15.0 | Saudi Arabia 15.0 | Saudi Arabia 13.0 | Brazil 12.4 | +17.6 to +19.1 | 9.0 / 7.6 / 7.1 |
| sell 2, buy 6, import floor 4% | Brazil 10.0 | Russia 12.5 | Egypt 12.0 | Brazil 11.5 | Brazil 10.9 | +17.9 to +19.4 | 10.1 / 9.0 / 8.8 |
| **sell 2, buy 6, import floor 3.5% (chosen)** | **Korea 11.0** | **Russia 11.5** | **Egypt 12.5** | **Egypt 12.0** | **Egypt 11.1** | **+18.5 to +19.6** | **10.4 / 9.4 / 9.2** |

Chosen for the lowest worst range with a low pooled share and the largest gain
for Japan, Korea and Turkiye. (The rows above came from a scratch build with
slightly different integer rounding; there the chosen rule read Egypt 10.5 and
12.0 on the first and third ranges. The bold row is the committed code.) `gainsFromTradeBp` stays at 40.
Re-run on the committed code with the prompt's tuning command: 1001-1200
Korea 11.0%, 1201-1400 Russia 11.5%, trade gain +19.6% / +18.5%, PASS.

What the tuning showed:
- **(a) and (b) on their own make it worse.** Tying the gain to the size of the
  imbalance or the economy moves the win to nations that trade a large share of
  their output (Russia, Indonesia, Saudi Arabia: 14-25%) and away from the United
  States, China and Mexico (0-1%). This is what prompt 09 found, and it holds
  with any curve.
- **(c) helps the deep importers but not the top.** A curve lifts Japan, Korea
  and Turkiye from about +5% to +9-13% and the trade advantage to +21%. Then the
  easy fillers (Egypt) and the earliest exporter (Brazil) top instead.
- **Curve on the buyer side only brings exporters down** (Brazil 7.5-9%) and China
  up to 7-8.5%, but Egypt tops at 13-14%. The import floor (b, on the import
  side only) takes Egypt back to about 10-11%, and the four nations Egypt, Russia,
  Brazil and Saudi Arabia then sit at 10-11.5% each.
- That four-way tie is the floor of this family. With four nations at about 11%,
  a 200-game range puts one of them over 11.8% most of the time (each share
  swings about +/-2.2 points from range to range).

## 3. Graded once (seeds 1-800, `gate1 --games 200 --ranges 4`), chosen rule

No re-tuning after this run.

| Seeds | Trade gain (pass >= +15%) | Pairs at +15% | Top scorer (pass <= 11.8%) | Result |
|---|---|---|---|---|
| 1-200 | +20.0% | 71.0% | Saudi Arabia 12.0% | FAIL |
| 201-400 | +18.7% | 68.5% | Korea 12.5% (Saudi Arabia 12.5%) | FAIL |
| 401-600 | +19.5% | 64.0% | Russia 13.5% | FAIL |
| 601-800 | +18.4% | 71.0% | Egypt 14.0% | FAIL |
| pooled 1-800 | +19.0% | 68.6% | Russia 11.5% | (pass) |

Main on the same seeds (second Gate 1 review): top scorer 12.5 / 13.0 / 15.0 /
14.0%, trade gain +17.6 to +17.7%.

Every other Gate 1 metric passes on every range: 0 crashes, 0 negative stocks,
food consumed/produced 91.8-92.2%, energy 84.5-84.9%, Credit sinks 0.5%,
isolating scores lower in 95.0-96.0% of pairs, 0 dead isolationists, 0.0% dead
states, 0 commands rejected. `npm test` (308 tests) and `npm run check` passed
with the rule in.

Pooled top shares, seeds 1-800: Russia 11.5, Egypt 11.4, Saudi Arabia 11.1,
Korea 10.6, Brazil 9.4, Australia 6.8, Nigeria 6.5, Japan 5.6, Canada 5.0,
Germany 5.0, Indonesia 4.5, United States 3.9, South Africa 3.1, Mexico 2.4,
Turkiye 1.6, China 1.1, India 0.5.

### Also reported (step 7)

| | 1-200 | 201-400 | 401-600 | 601-800 | pooled | main (prompt 09/10, seeds 1-800) |
|---|---|---|---|---|---|---|
| Trader archetype top share / fair share (Gate 2 caps at 1.5x) | 2.82x | 2.87x | 2.69x | 2.84x | 2.80x | 2.84-2.94x |
| Japan, trading vs isolating | +11.7% | +8.4% | +9.2% | +10.0% | +10.0% | about +5% |
| Korea | +9.0% | +6.2% | +9.6% | +8.5% | +8.7% | about +4.5% |
| Turkiye | +9.6% | +9.6% | +7.2% | +9.2% | +9.2% | about +4.6% |

## 4. Why no trade-gain rule gets there

The diagnostic in section 1, repeated under the finalist variants, splits what
is left into two effects. Neither one is really about the trade gain:

1. **Luck in the baseline, not in the trade gain.** Egypt, Saudi Arabia and Korea
   top because their score has a wide spread (+/-0.09 to 0.16 ownScore), not a
   high average. Their baseline expects a 21-30% shortfall (RULES 2.8). In the
   games where sellers happen to cover their whole deficit, they beat that
   baseline by up to 26-43%. That upside comes from the shortfall penalty (2.7)
   and the structural baseline (2.8), which this prompt was not asked to change.
   It pays the same whether the nation trades, hoards or bargains hard, which is
   why these nations top as all three.
2. **Near-ties between exporters.** Every exporter that trades sells its whole
   surplus nearly every month. Any rule based on its own imbalance pays them all
   about the same, so the highest of them wins by a hair, game after game. Which
   one depends on when the AI's offer cycle first gets it selling (lane A).
   Making the gain depend on who they sell to (variant 21) made it worse.

Meanwhile China and India stay at 0-1%: they get less than their fair share of
energy in most games, so they finish below a baseline that assumed 80% of the
world's spare energy reaches a buyer (`structuralCoverSharePct`). With a quarter
of nations isolating and a quarter hoarding, much less than 80% reaches market.

## 5. Decision for the owner

Nothing irreversible changed: the game is exactly as it was before this prompt.

**Recommendation: waive Gate 1 criterion 5 (top scorer) in writing, and carry it to
Gate 2.** Reasons:
- Four prompts (06, 09, 11, 13) have now attacked it from the scoring rule, the
  AI and the trade-gain rule. The best result is about 11-12% in every range,
  down from India's 34.5-45%. Every nation can win, and the leader changes from
  range to range: Saudi Arabia, Korea, Russia and Egypt this time.
- What remains is mostly the structural baseline's upside for small importers
  and the harness's four fixed strategies. Gate 2 re-grades this criterion
  anyway, with archetypes, crises and a smarter AI, which will change both.
- Every other Gate 1 criterion passes with margin.

If you would rather not waive, the next thing to try is not the trade gain. It is:
1. **The baseline's upside** (lanes D, S): cap how far a nation can beat its
   structural shortfall, or measure the shortfall in value (prompt 09 tried a
   value-weighted penalty and it did worse, so this is a real design question).
2. **`structuralCoverSharePct`** (80%): the baseline assumes more spare energy
   reaches market than the harness's strategy mix delivers, which is why China
   and India almost never top.

The chosen rule is still worth keeping on file for Gate 2. It makes trade pay
twice as much for Japan, Korea and Turkiye (about +9-10% instead of +5%), which
matters for a player who picks one of them. To bring it back, revert commit
0e97a85 and c37a7b6.
