# Gate 2 balance report: prompt 14 (free-riding must not pay)

2026-09-29. Lanes D, S, H. Tuned on seeds 1001-1400 only. Graded once, on seeds
1-200, with `npm run harness -- --suite gate2 --games 200` (92 s). Nothing was
changed after that run, and it was not repeated.

**Result: the rule passes every target this prompt set.** The free-rider drops to
1.05x its fair share, the cooperator beats it in 90.5% of paired games by a
median +5.47%, and the stealth spoiler finishes strictly below the cooperator.
Three things did not improve or got worse, and are set out under "What fails or
needs a ruling": the archetype line (the cooperator's own share rose to 3.90x),
the top scorer, and one nation in 200 still beating its own cooperative game by
closing its trade.

## The design

**One rule, no new surface.** The pool still pays out by exposure, but the cut a
nation gets is scaled by how much of its own appeal share it paid into that pool
since the pool last locked (RULES 4.3 rule 1):

```
keep_i     = nonPayerCoverPct + (100 - nonPayerCoverPct) * min(paid_i, share_i) / share_i    (percent)
ownCover_i = poolCover * keep_i / 100
```

- A nation that paid its whole share gets all of the pool's cover. One that paid
  nothing gets `nonPayerCoverPct`% (50) of it. In between it is a straight line.
- A nation that was asked for nothing keeps all of it. Paying more than the share
  earns nothing extra.
- `paid` counts money at face value: the monthly contribution, an appeal answer,
  a pledge collected. Late pandemic money counts less for the pool
  (`lateContributionEffectPct`) but at face value for the nation that paid it.
- The pool itself is graded as before. Cover, success, partial success, failure
  and the contributor list do not change (a test pins this), so crisis success
  is unchanged by construction.

**As decision cards plus standing policies (the depth budget).** No new dial,
card or screen.
- Decision card: the appeal card that already exists. *Pay your share* now means
  the pool's full cover reaches you. *Decline* costs the difference.
- Standing policies: the existing monthly contribution (dial 3, default 110 bp)
  and crisis rule. On the defaults a nation's share is paid several times over
  before the deadline, so an absent player keeps full cover: the 24 hour absence
  test is unchanged (0 lapsed, 0 unanswered). Only a nation that switches its
  contribution off and answers every appeal with no takes the loss.
- The recap tells a nation when it got less than the pool's cover ("only 50% of
  the pool's cover reached you"), so the extra damage has a reason on screen.

**Why D3 still holds.** Nothing moves from one nation to another. A non-payer's
own damage rises, and the world "damage avoided" goals it shares fall with it, so
the rule can only lower a saboteur's score, never raise anyone's.

**What was not changed.** No contributor bonus was resized (`contributorResilienceBonus`,
`contributorTrustBonus`): the one rule was enough. No AI code changed (see GAPS).

## Tuning (seeds 1001-1400, 400 games each)

Old rule = `nonPayerCoverPct` 100, run on `main` before the change. Every run
plays the same 400 games; only the number changes (`--set nonPayerCoverPct=N`).

| `nonPayerCoverPct` | Free-rider tops / fair | Cooperator tops / fair | Cooperator ahead | Median gap | Stealth spoiler median (vs cooperator) | Stealth beats cooperator | Crisis success | Gate 1 trade gain |
|---|---|---|---|---|---|---|---|---|
| 100 (old rule) | 1.88x | 2.79x | 67.0% | +1.58% | 1,123 vs 1,184 | 19.0% | 59.3% | +17.8% |
| 75 | 1.61x | 3.08x | 83.0% | +3.22% | 1,086 vs 1,165 | 14.0% | 59.5% | +17.8% |
| **50** | **1.31x** | 3.49x | **91.8%** | **+5.42%** | 1,044 vs 1,129 | 9.0% | 59.5% | +17.8% |
| 25 | 1.10x | 3.71x | 95.8% | +7.55% | 1,000 vs 1,097 | 6.3% | 59.5% | +17.8% |
| 0 | 0.89x | 3.92x | 96.8% | +10.03% | 958 vs 1,059 | 5.0% | 59.5% | +17.8% |

Targets: free-rider <= 1.5x and below the cooperator; cooperator ahead >= 70%
with median >= +3%; stealth spoiler strictly below; crisis success 40-75%;
Gate 1 trade gain >= +15%.

- **75 fails** the free-rider line (1.61x), and its median gap (+3.22%) barely
  clears +3%.
- **50 passes every line with margin** and is the mildest value tested that does.
  60 was not run: it interpolates to about 1.4x, too close to the 1.5x line for a
  200-game grade to tell it from failing.
- **25 and 0 pass too**, but only push the cooperator's share of tops higher
  (3.71x, 3.92x) for no gain the targets need. The smallest change that passes
  is the right one, so 50.
- Nothing else moves across the sweep: crisis success stays at 59.3-59.5% and the
  Gate 1 trade gain at +17.8%, as it must, since the rule changes who is hurt by
  a crisis, not how well the pool is funded or what trade is worth.

## Graded run (seeds 1-200, not tuned)

Before = prompt 13 on the same seeds (`docs/balance/gate2-prompt13.md`).

| Target | Line | Before | Now | |
|---|---|---|---|---|
| Free-rider tops / fair share | <= 1.5x | 1.47x | **1.05x** | PASS |
| Free-rider below the cooperator | free-rider < cooperator | 1.47x vs 3.22x | 1.05x vs 3.90x | PASS |
| Cooperator ahead of the free-rider (200 pairs) | >= 70% | 73.0% | **90.5%** | PASS |
| Cooperator vs free-rider, median gap | >= +3% | +1.41% | **+5.47%** | PASS |
| Stealth spoiler strictly below the cooperator (median final) | strictly lower | 1,116 vs 1,156 | **1,042 vs 1,105** | PASS |
| Crisis success | 40-75% | 56.4% | 56.6% of 1,182 | PASS |
| Gate 1 rerun: trading vs isolating, median | >= +15% | +17.1% | +17.1% | PASS |
| Gate 1 rerun: everything else except the waived top scorer | pass | pass | pass | PASS |
| 24 hour absence (40 runs) | 0 / 0 / 0, <= 6 lines, <= 150 words | <= 121 words | <= 137 words | PASS |
| Spoiler that closes trade: median final | strictly lower | 1,066 vs 1,156 | 978 vs 1,105 | PASS |
| Dead states, Credit sinks | < 2%, 0-25% | 0.0%, 0.7% | 0.0%, 0.7% | PASS |

**The cooperator's own ratio, reported separately (as asked): 3.90x** fair share
(628 nation-games, 144 tops). It was 3.22x in prompt 13 and 2.79x on the tuning
seeds before the change. Whether it counts under the 1.5x archetype line is the
owner's ruling, not made here. Two things to weigh:
- It rose because the other archetypes now lose more, not because the
  cooperator plays differently. Mean final score by archetype, prompt 13 -> now:
  cooperator 1,371 -> 1,311, free-rider 1,347 -> 1,237, hoarder 1,222 -> 1,117,
  exploiter 1,228 -> 1,127, isolationist 1,158 -> 1,104. The cooperator's own
  score fell too (about 4%; the three non-payers fell about 8%), because the
  free-riders' extra damage lowers the world "damage avoided" goals and so the
  multiplier everyone shares (D3 working as designed).
- The harder the rule bites, the higher this goes (tuning table), which is the
  reason to keep the change at 50.

**Sabotage from mid-game (the nation trailing at mid-game, 200 seeds):**

| Trailing nation plays | Median final | Median rank (of 17) | Scores above the cooperator | Rank better / worse | Fewer crises at full cover |
|---|---|---|---|---|---|
| cooperator (the AI) | 1,105 | 14.0 | - | - | - |
| spoiler (closes trade) | 978 | 17.0 | 0.5% | 0.0% / 76.0% | 6.0% |
| stealth spoiler (keeps trading) | 1,042 | 16.0 | **8.5%** (was 19.0%) | 5.5% / 53.5% (was 8.5% / 32.5%) | 6.5% |

The stealth spoiler scores the same or higher in 11.0% of pairs (was 38.0%).

**Descriptive check (seeds 1-60, not used for tuning): who gets the cover.**
Mean share of the pool's cover that reached a nation: cooperator 99.2%,
isolationist 99.9%, background regions 99.9%, free-rider, hoarder and exploiter
50.1% each (the tunable, as designed). The cooperator fell short of full cover
in 4.4% of its crisis hits, mostly Nigeria (31% of its hits) and Indonesia (22%),
where a share is large next to income and the AI's per-appeal cap
(`aiPledgeMaxIncomePct`) stops it paying all of it. That is why the longest away
recap grew from 121 to 137 words (limit 150).

## What fails or needs a ruling

1. **Archetype line (GATE-2 criterion 2) still fails**, on the cooperator: 3.90x
   against 1.5x. The free-rider, the defect this prompt targeted, now passes.
   The line cannot pass while three archetypes trade or pay badly on purpose and
   the cooperator does neither; the change makes that gap wider, not narrower.
   Needs the owner's ruling on the wording (a DECISIONS record).
2. **Top scorer (9b) is unchanged**: Saudi Arabia 21.0% (was 22.0%), limit 11.8%.
   This rule is not aimed at it.
3. **Sabotage still pays in a few games.** The closing-trade spoiler beat its own
   cooperative game in 1 pair in 200 (0.5%, was 0 of 200); the stealth spoiler in
   17 of 200 (8.5%, was 38 of 200, 19.0%). The median is strictly lower in both, which is what
   the criterion grades, but D3's "never gains" is true of the median, not of every
   game. Games diverge after mid-game, so a lucky trajectory is possible. Whether
   criterion 4 should grade the stealth spoiler stays with the owner (prompt 13).
4. **Recap word margin fell** to 13 words under the 150 limit, from 29.

## How to reproduce

```
npm run harness -- --suite gate2 --games 400 --seed 1001 --set nonPayerCoverPct=50   # a tuning point
npm run harness -- --suite gate2 --games 200                                          # the graded run
```

`--set id=value[,id=value]` is new (packages/harness/src/overrides.ts): it
replaces sim tunables for one run, inside their bands, so sweeps can run in
parallel. It reaches numbers the sim reads directly; the View's copy of the
rules is taken at load, so a number only the AI reads does not sweep this way.
