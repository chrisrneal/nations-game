# Gate 1 balance, prompt 13: fair trade-gain rule

2026-09-28. Lanes S, D, H. Question: can a change to the trade-gain rule
(RULES 3.3) bring the most frequent top scorer to 11.8% or less on every graded
range, while trading still beats isolating by +15% or more?

Tuned only on seeds 1001-1800 (`gate1 --games 200 --seed 1001 --ranges 2`, and
`--ranges 4` for the finalists). Graded once on seeds 1-800.

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
