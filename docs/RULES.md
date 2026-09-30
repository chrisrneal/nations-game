# Rules

How the game actually works, in plain language, on top of `data/world-2030.json`.

This is the layer between `docs/DECISIONS.md` (which says *what* was decided) and
the code in `packages/sim` and `packages/ai` (which says *how*). Every rule here
names the **gate metric** that proves it works, because a rule nobody can test is a
wish. Every number here has a starting value and a band, collected in
[Tunables](#11-tunables) in the shape `packages/sim/src/tunables.ts` expects.

Read it in order. Sections 2 to 7 and 9 are the game; section 8 is what it looks
like on a phone; section 11 lists every tunable; section 12 is what the owner still
has to decide.

---

## 1. Decisions taken

The owner settled these on **2026-09-27**, before the draft was written.

| # | Question | Ruling |
|---|---|---|
| 1 | How many nations are modelled individually? | **17.** The 16 that cover every region plus Canada, so both halves of USMCA are on the board. Fair share for the balance harness is 1/17 = 5.9%, so Gate 1's "no nation tops the score in more than 2x its fair share" means no nation above 11.8% of games |
| 2 | How many resources? | **Four:** Food, Energy, Credit, Resilience. Critical minerals stay in the data but are not a fifth stock — they enter as a production multiplier (§2.5) |
| 3 | How long is a tick? | **One world month.** A full game is 60 ticks, which is the five years 2030-2035 |
| 4 | Contested territories? | Ruled **case by case**, not by one blanket policy. All seven rulings are recorded in `data/SOURCES.md` next to the figures they affect. The game has no territory, border or claim objects, so none of them produces anything a player sees |

The seven territory rulings, in one line: Taiwan's figures are folded into China's;
Crimea, the occupied Ukrainian oblasts and Northern Cyprus follow each publisher's
own treatment with the split noted; Palestine, Western Sahara and Kosovo are counted
inside their regional aggregate under the publisher's own label; Jammu and Kashmir
is left exactly as the IMF and UN publish it with no reallocation.

---

## 2. The four resources

Four numbers in one strip, and nothing else competes for that space (D8). Each one
traces back to a field in `data/world-2030.json`.

| Resource | What it is | Where it comes from in the data |
|---|---|---|
| **Food** | A stock, measured in units. One unit feeds one million people for one month | `food.selfSufficiencyIndex` and `population2030` |
| **Energy** | A stock, measured in units. One unit powers one unit of economic output for one month | `energy.selfSufficiencyIndex` and `gdp2030PppBn` |
| **Credit** | A stock. The money. Income arrives every tick and pays for imports, resilience and crisis contributions | `gdp2030PppBn` and `baselineGrowth` |
| **Resilience** | A level from 0 to 100, not a flow. How well the nation absorbs a crisis | `climate.exposureIndex` and `pandemic.preparednessIndex` |

**Output** is not a resource. It is the scoreboard: the nation's economic output per
tick, which is what Credit income is made of and what §8 scores. It appears above
the strip, not in it.

### 2.1 Output per tick

```
output = gdp2030PppBn * outputScaleBp / 10000
```

`outputScaleBp` starts at 833, which is one twelfth — one month of a year's GDP.
The United States starts at 3,139 output per tick, China at 4,830, India at 2,182,
Australia at 204, all rounded. Everything else in the game is priced against this
number, and it is an integer (S5).

Output grows each tick at the nation's own baseline, then is modified by trade,
minerals, shortfalls, resilience spending and crisis damage:

```
baselineGrowthPerTick = baselineGrowth.basisPoints / 12    (integer bp)
```

### 2.2 Food

```
demand     = population2030 in millions * foodDemandPerMillionPeople
production = demand * food.selfSufficiencyIndex / selfSufficiencyPivot
```

The pivot is 50, so an index of 50 means production exactly meets demand. Worked
examples at the starting values:

| Nation | Index | Demand | Production | Position |
|---|---|---|---|---|
| Australia | 100 | 28 | 56 | surplus 28 |
| United States | 66 | 356 | 470 | surplus 114 |
| Germany | 50 | 83 | 83 | balanced |
| Egypt | 19 | 127 | 48 | deficit 79 |
| Saudi Arabia | 5 | 37 | 4 | deficit 33 |

Saudi Arabia importing about 90% of its cereal and Australia exporting roughly two
thirds of what it grows are both real; this formula reproduces them from one index.

### 2.3 Energy

```
demand     = output * energyDemandPerOutput / 100
production = demand * energy.selfSufficiencyIndex / selfSufficiencyPivot
```

Japan's index of 5 gives it one tenth of the energy it needs. Saudi Arabia's 100
gives it double. Germany's 9 is the sharpest thing in the game: the fourth largest
economy on the board produces under a fifth of the energy it burns.

### 2.4 Credit

Income per tick is `output`. It is spent on imports (§3), resilience (§2.6) and
crisis contributions (§4). Credit can go to zero but never negative; a nation with
no Credit cannot buy its way out of a shortfall, which is the whole point of the
resource.

### 2.5 Where minerals enter

Minerals are not traded and are not a stock. They are two multipliers, and this is
the only place in the game they apply:

```
energyProduction *= 1 + (minerals.endowmentIndex / 10) * mineralsEnergyBonusBpPer10 / 10000
output           *= 1 + (minerals.refiningLeverageIndex / 10) * mineralsOutputBonusBpPer10 / 10000
```

At the starting values both cap at +10%. Australia's endowment of 100 gives it the
maximum energy bonus; China's refining leverage of 100 gives it the maximum output
bonus. That is a real 2030 chokepoint expressed without adding a number to the
phone strip.

### 2.6 Resilience

```
start = (pandemic.preparednessIndex * resilienceStartWeightPreparedness
         + (100 - climate.exposureIndex) * (100 - resilienceStartWeightPreparedness)) / 100
```

At the starting weight of 50 that is the plain average of preparedness and the
inverse of exposure. The United States starts at 72, Australia 70, Canada 71,
Japan 62, India 48, Nigeria 44, Egypt 40.

Resilience decays by `resilienceDecayPerTick` every tick, so leaving it alone is a
decision. It is rebuilt by spending Credit at `resilienceCostPerPoint`, and by
crisis pool payouts (§4.3).

### 2.7 Shortfalls

Unmet demand in Food or Energy, after imports, costs output:

```
unmetPct = 100 * (demand - production - netImports) / demand
penalty  = min(maxShortfallPenaltyPct, unmetPct * shortfallPenaltyBpPerPct / 100)
output  *= (1 - penalty / 100)
```

At the starting values, 10% of demand unmet costs 2% of output, and food and
energy both fully unmet cost 40%. The cap (60%) is out of reach: it is a safety
net, not a plateau. *(Decision record H3: until then the slope was 35 and the cap
30%, and Japan, Korea and Turkiye sat on the cap, where their first 70 points of
cover were worth nothing.)* A nation is never killed by a shortfall; it is made
poorer, which keeps Gate 1's "dead states under 2%" achievable while still making
every unit of a deficit hurt.

**Gate metric.** Gate 1: 200 seeded full-roster games with no crashes, no negative
stocks, and sources and sinks in band. The conservation invariant is: for each
resource, total production plus imports equals total consumption plus exports plus
named sinks, every tick, exactly, in integers.

### 2.8 The structural world and each nation's fair share

*(Prompt 09, the top-scorer fairness rule.)* The 2030 world is net short: world
Energy production covers about 82% of demand and Food about 87%. So in any game
some importers must go short, and before this rule the ones that did scored
badly for their geography, not their play.

The **structural world** is every nation, background regions included, sitting on
its own baseline path with no play at all. For each good the sim works out, every
month, how much of the world's structural deficit the world's structural surplus
could cover:

```
cover_good = min(100%, sum(surplus) * structuralCoverSharePct / 100 / sum(deficit))
```

`structuralCoverSharePct` (80) allows for spare goods that never reach a buyer:
background regions answer offers but never make them (§12 Q1). Cover reads
baseline paths only, so nothing any player does moves it.

A nation's **fair share** of a deficit is `deficit * cover`. The part beyond it is
what the world cannot supply to anyone who is not taking more than their share:

```
structuralUnmet_good = deficit_good - fairShare_good
structuralPenalty    = the §2.7 penalty on structuralUnmet (food and energy together)
```

Exporters and balanced nations expect no penalty. At the start of the real game,
with the §11 values, the world can cover 35% of its food deficits and 40% of its
energy deficits. With the H3 slope, Japan and Korea expect about 22%, Turkiye
17%; Egypt, Saudi Arabia and Mexico about 11-12%; Germany 10%; China and India
6-7%; Indonesia and Nigeria 3%; South Africa under 1%. (At the old slope and cap,
Japan, Korea and Turkiye expected the 30% cap.)

The actual shortfall penalty (§2.7) is unchanged: a nation that goes short still
loses that output, and the world still loses it. What changes is the yardstick
it is scored against (§5.1).

---

## 3. Trade

Trade is the whole of the MVP's first half (D7). It is bilateral and it never
assumes anyone is online (D1, S8).

### 3.1 An offer

An offer is a State object, not a conversation:

```
{ id, fromNation, toNation,
  give: { resource, amount },
  get:  { resource, amount },
  createdTick, expiryTick }
```

`expiryTick = createdTick + offerLifeTicks`. At the starting value of 3 an offer
lives three world months. When it expires it is simply gone, and the nation that
ignored it loses a little trust — ignoring is an answer.

A nation may have `maxOpenOffersPerNation` offers outstanding at once (6 to start).
That cap is what stops an AI from spamming and a player from treating the board as a
spreadsheet.

### 3.2 Price

The sim keeps a reference price per resource, moved by world-wide scarcity. An offer
within `priceBandPct` of the reference is *fair*; outside it is a *hard bargain*.
Hard bargains are legal and sometimes correct. They cost trust when repeated, and
the AI remembers (§7).

### 3.3 What a trade is worth

A trade in Food or Energy from a nation with a structural surplus to one with a
structural deficit makes both of them permanently more productive. **Each side
gains by the share of its own imbalance that the trade clears, never by the size
of the other side:**

```
clearable_i = value of i's whole surplus + value of i's fair share of each deficit (§2.8)
gain_i      = gainsFromTradeBp * value cleared by i this month / clearable_i
              capped at gainsFromTradeBp a month
```

Values are at reference prices (§3.2). A seller clears the units it sells, up to
its monthly surplus; a buyer clears the units it receives, up to its monthly
deficit. A credit leg clears nothing. The gain is added to the nation's capacity,
so it lasts.

So a nation that sells its whole surplus, or covers its fair share of its deficits,
grows `gainsFromTradeBp` (0.40%) a month faster than its baseline, whether it is
India or South Africa. The buyer gains a second way too: covering a deficit avoids
the shortfall penalty (§2.7), and covering more than its fair share lifts it above
its baseline (§5.1).

*Why not the old rule.* Prompt 06 paid both sides `gainsFromTradeBp * (share of
the receiver's deficit covered)`, as a share of each side's own capacity. A giant
seller that covered a small nation's whole deficit then gained 0.40% of a giant
economy for a few units of food, many times a month: India's capacity grew 88%
from trade in a 60-month game while Australia's grew 4%. That, with the scarce
world of §2.8, is why India topped the score in 35-45% of games.

This is the mechanism Gate 1 measures.

### 3.4 Answering when nobody is home

Every nation has standing policies, and they are the default answer (S8):

- **Auto-accept fair offers that cover a deficit** — on by default.
- **Auto-accept anything from a nation above `autoAcceptTrustThreshold`** — off by
  default, threshold 55.
- **Auto-reject everything** — the isolationist setting, which Gate 1 requires to be
  worse but survivable.
- **Cover deficit priority** — Food before Energy, or the reverse.
- **Keep us supplied** *(100x slice 6)* — each month, send fair offers for next
  month's shortfall of each good (priority good first) to the playable nations
  with a surplus the nation trusts most: up to `autoImportOffersPerGood` a good,
  never two open offers to one partner, only what it can pay. Off by default (the
  AI trades for itself); the phone turns it on for the player, so routine imports
  stop being a monthly card. It reads only what the nation could see: public
  flows and its own stocks.

A player who never opens the app still trades, because their policies do. Since
Phase 2 prompt 09, a policy **answers every offer** on its last month: an offer
that meets no auto-accept condition is declined with its reason, never left to
lapse, so an absent nation never pays the ignored-offer trust cost.

### 3.5 Trust from trading

| Event | Trust change |
|---|---|
| Trade completed | `+trustPerTrade` (2) |
| Offer left to expire | `-trustPerIgnoredOffer` (1) |
| Accepted then reneged | `-trustPerRenege` (12) |
| Every tick | drift `trustDecayPerTick` (1) back towards `baseTrust` |

Reneging costs six completed trades to repair. That asymmetry is deliberate: it is
what makes a reputation worth having.

**Gate metric.** Gate 1: the same nation, on paired seeds, does 15% or more better
against its own baseline trading than isolating; isolationists end worse off but
alive; a trade takes three taps or fewer.

---

## 4. Crises

Two crises, deliberately different speeds, both beaten the same way — by a pool
nobody controls alone.

### 4.1 Climate: the slow ratchet

A climate event fires every `climateEventIntervalTicks` (12 — once a world year).
It gets worse as the game goes on:

```
severity = climateBaseSeverity + climateRampPerYear * yearsElapsed
```

Starting at 20 and ramping 8 a year, the first event is severity 20 and the last is
52. Damage lands on each nation separately:

```
damage_i = severity * climate.exposureIndex_i / 100
           * (1 - ownCover_i)
           - resilience_i / 2
```

where `ownCover_i` is the pool's cover as it reaches nation *i* (§4.3 rule 1): all of
`poolCover` for a nation that paid its share, less for one that did not.

and is spread over `climateDamageSpreadTicks` (6) as an output penalty. Slow means
you see it coming and you feel it for half a year.

Nigeria's exposure of 49 takes about 1.75 times the hit Canada's 28 does from the
same event. That ratio comes straight from ND-GAIN, not from a designer's opinion.

### 4.2 Pandemic: the fast spike

A pandemic fires with probability `pandemicChanceBpPerTick` (167 basis points, about
one in 60 ticks, so roughly one per game) and resolves inside
`pandemicWindowTicks` (3):

```
damage_i = pandemicBaseSeverity * (100 - pandemic.preparednessIndex_i) / 100
           * (1 - ownCover_i)
```

applied at once to output and to population growth. Egypt's preparedness of 28 takes
three times the damage of the United States' 76.

The critical difference from climate: **the health pool has to be full before the
event.** Contributions made after the trigger count at `lateContributionEffectPct`
(40%). Climate rewards steady funding; a pandemic rewards having funded it already.

### 4.3 The shared pool

One pool per crisis type — `adaptationPool` and `healthPool`. Any nation, including
the background aggregates, may put Credit in at any time.

```
poolTarget = sum over all nations of (exposureIndex_i * output_i) * poolTargetScaleBp / 10000
poolCover  = min(poolCoverMaxPct, 100 * pooled / poolTarget) / 100
```

Three rules make it collective rather than a market:

1. **The pool pays out by exposure, and only in proportion to what you paid.**
   Damage is cut by how full the pool is, and it is still shared out by exposure, so
   a nation that put nothing in is not left with nothing. But the cut a nation gets is
   scaled by how much of its own appeal share (§4.4) it paid into that pool this
   round. *(Prompt 14: until then a nation was protected whatever it paid, so skipping
   the pools was free: GATE-2 F3.)*

   ```
   keep_i     = nonPayerCoverPct + (100 - nonPayerCoverPct) * min(paid_i, share_i) / share_i     (percent)
   ownCover_i = poolCover * keep_i / 100
   ```

   A nation that paid its whole share gets the whole `poolCover`. One that paid
   nothing gets `nonPayerCoverPct`% of it. In between it is a straight line. A nation
   with no share (nothing was asked of it) keeps all of it. `paid_i` is everything the
   nation put into that pool since the pool last locked: its monthly contribution, an
   appeal answer, a pledge collected. Free-riding is still possible, still visible,
   and now costs the free-rider its own protection, not only other nations' trust.
2. **You can never buy full immunity.** `poolCoverMaxPct` caps at 80%. Some damage
   always lands, so resilience and trade still matter.
3. **Contributing is separately rewarded.** `contributorResilienceBonus` (3) and
   `contributorTrustBonus` (2) go to contributors only, and every nation's crisis
   card lists who contributed and who did not. Free-riding is possible, visible, and
   remembered by the AI (§7).

The rule adds no dial, card or screen (the depth budget). The **decision card** is the
appeal card that already exists: *Pay your share* now says the full pool cover reaches
you; *Decline* says how much of it does not. The **standing policies** are the
existing ones: the monthly contribution (§8.2 dial 3, default `defaultContributionBp`)
already pays a nation's share several times over before a deadline, so a player who is
away, or never touches the dial, keeps full cover. Only a nation that turns its
contribution off *and* answers every appeal with no takes the loss.

### 4.4 Appeals, pledges and the crisis rule *(Phase 2 prompt 09)*

Every crisis is an **appeal**: a State object with a deadline, never a
conversation (S8).

- **Opening.** A climate appeal opens in month `climateFirstOpenTick` of every
  world year (months 3, 15, 27, 39, 51) and locks `crisisResponseTicks` (3) later.
  A pandemic opens on a seeded roll of `pandemicChanceBpPerTick` whenever none is
  open, and locks `pandemicWindowTicks` (3) later. Every nation, background regions
  too, is asked for its **share**: its part of `sum(exposure_i / 100 x output_i)`,
  where exposure is `climate.exposureIndex` for the adaptation pool and
  `100 - pandemic.preparednessIndex` for the health pool. The **target** is that sum
  x `poolTargetScaleBp` / 10,000 (the `/ 100` on the index was implicit in §4.3).
- **Answering.** A nation answers by paying (`contribute`), promising (`pledge`) or
  saying no (`declineAppeal`). On the deadline month, its standing **crisis rule**
  answers for it if it has not: `fairShare` pays what it still owes of its share;
  `reciprocal` (the default) pays in full if the world met at least
  `reciprocalMatchPct` of this pool's target last round, and in proportion below it;
  `none` pays nothing. Money a nation paid this round (including its monthly
  contribution) counts towards its share.
- **Monthly contribution.** Dial 3 of §8.2: `contributionBp` of each month's income
  (default `defaultContributionBp`) goes to one pool or is split between both. It is
  the only steady way to fill the health pool before a pandemic.
- **Pledges.** A promise to pay an amount into a pool by a deadline at most
  `maxPledgeTicks` ahead, one open pledge per pool per nation. Money paid into that
  pool counts towards it. On the deadline month the rest is **collected
  automatically** if the nation holds the Credit, so an absent player keeps their
  word. A pledge paid in full is **honoured**: every other nation trusts the pledger
  `trustPerPledgeHonoured` more. A pledge withdrawn, or unpaid because the Credit is
  not there, is **broken**: every other nation trusts the pledger
  `trustPerPledgeBroken` less. Like all trust, the damage fades by
  `trustDecayPerTick` a month.
- **Locking.** On the deadline month the pool is spent up to its target (late
  pandemic money at `lateContributionEffectPct`; leftover money stays for the next
  round). `poolCover = min(poolCoverMaxPct, 100 x counted / target)`. The crisis is
  a **success** when the pool reaches full cover (counted money at least
  `poolCoverMaxPct`% of the target), a **partial success** at `crisisPartialPct`% or
  more, and a **failure** below that. Contributors are those that paid at least
  `contributorMinSharePct`% of their share this round. Success, partial success and
  failure grade the pool, not any one nation, so the rule in §4.3 rule 1 does not
  change them.
- **Damage.** In basis points of output, per month it lasts:
  `severity x exposure x (1 - ownCover) x (200 - resilience) / 200`, where `ownCover`
  is the nation's own cover from §4.3 rule 1 (the whole `poolCover` for a nation that
  paid its share), so resilience
  100 halves it (the §4.1 "- resilience / 2" read as a proportional cut, because
  subtracting it outright cancelled almost every event). Climate damage lasts
  `climateDamageSpreadTicks` (6) months from the lock; a pandemic hits the lock
  month only. Population growth is not modelled, so a pandemic lands on output
  alone (docs/GAPS.md). Crisis damage is on top of the shortfall penalty and the
  baseline never expects it.

**Gate metric.** Gate 2: crisis success between 40% and 75% of events; reciprocal
cooperators finish ahead of free-riders, and free-riding must not pay: a nation that
pays nothing into the pools but trades normally must not top the score in more than
1.5x its fair share, must finish below the cooperator in at least 70% of paired games
by a median of at least 3%, and a stealth spoiler (trades like the cooperator, pays
nothing, pledges and withdraws) must finish strictly below the cooperator (prompt 14).
Gate 3: crisis success stays in band once joint projects exist.

---

## 5. Scoring

D3, in arithmetic.

### 5.1 Your own baseline

Each nation has a baseline path from `baselineGrowth.basisPoints` — what the IMF
expects it to do — in the structural world of §2.8. Each month:

```
baselineOutput_i = baseline potential_i * (1 - structuralPenalty_i)
```

So the baseline already expects a nation's usual deficit: Japan's baseline knows
Japan imports its energy in a world that is short of it. ownScore then measures
play, not geography. An importer that covers exactly its fair share, and an
exporter that sells nothing, both sit at 1.00 before trade gains.

ownScore is read from a smoothed path, not from the final month alone. Every month
the sim moves each nation's smoothed output and smoothed baseline output
`1/scoreSmoothingTicks` of the way (1/12) towards that month's values:

```
smoothed = smoothed + (thisMonth - smoothed) / scoreSmoothingTicks   (the first month seeds it)
ownScore_i = smoothedOutput_i / smoothedBaselineOutput_i
```

A score read from one month let a lucky or unlucky last delivery decide a
five-year game: the importers with the most variable shortfalls topped far more
often than their average play deserved. With a 12-month average, the last year
counts most and no single month decides.

1.00 means you did exactly as well as the projections said. 1.15 means you beat your
own future by 15%. **Nigeria beating its baseline scores the same as the United
States beating its baseline.** That is what lets a small nation win, and it is why
the baseline data had to be sourced rather than invented.

### 5.2 The collective multiplier

Four world-level goals, each scored 0 to 1:

| Goal | Measure |
|---|---|
| Climate damage avoided | 1 − (damage dealt / damage that would have landed with an empty pool) |
| Pandemic damage avoided | same, for the health pool |
| Nations above their own baseline | share of playable nations with `ownScore ≥ baselineToleranceBp/10000` (0.95) |
| Deficits met | 1 − (world unmet Food and Energy demand / world demand), averaged over the game |

Both crisis goals are measured in output lost over the game so far, against the
same crises with empty pools; before the first crisis locks, or in a game with no
pandemic, that goal counts as met. `collective` is their mean. Then:

```
multiplier = (collectiveFloorBp + (collectiveCeilingBp - collectiveFloorBp) * collective) / 10000
```

Floor 0.70, ceiling 1.40. A world that cooperates well doubles the score of a world
that does not, for everybody.

```
finalScore_i = round(scoreScale * ownScore_i * multiplier)
```

### 5.3 Why sabotage never pays

The claim is not "sabotage is punished". It is stronger: **there is no rule in this
game by which one nation's loss becomes another nation's gain.** No resource
transfers without the owner's consent. No score is relative to another nation's
score. Nothing is ranked. That is the load-bearing clause, and everything below
follows from it.

Suppose nation *i* takes a hostile act that costs nation *j* a fraction *d* of its
output. Then:

- **`ownScore_i` does not change.** There is no transfer, so *i* gains nothing
  directly. This is the clause above.
- **`multiplier` falls, for *i* as much as for anyone.** *j*'s loss pushes it towards
  or below its own baseline, cutting the "nations above baseline" term; and *j* now
  buys less and imports less, raising world unmet demand, cutting the "deficits met"
  term. The multiplier is a shared factor in `finalScore_i`, so *i* pays the same
  proportional price it inflicted on the world.
- **`ownScore_i` then falls too.** *i* loses trust with *j* and with every nation
  sharing a bloc with *j* (§6), which lowers the rate at which *i*'s own offers are
  accepted, which lowers *i*'s gains from trade (§3.3).

So `finalScore_i = scoreScale × ownScore_i × multiplier`, where the hostile act
leaves the first factor unchanged-then-falling and strictly reduces the second.

The §2.8 baseline does not open a way round this. Structural cover is computed
from every nation's baseline path, which no play can move, so starving *j* never
lowers *i*'s baseline. And a trade gain (§3.3) depends only on the share of *i*'s
own imbalance it clears, never on anyone else's position.
The derivative is negative for every *i*, at every position on the board. A
**trailing** nation is not an exception: it cannot close a gap by widening it,
because its score is measured against its own baseline and nobody else's, so pulling
*j* down moves *i*'s score down and leaves *i*'s target where it was.

Two constraints this places on future work:

- **`collectiveFloorBp` must stay above zero.** If the multiplier could reach zero,
  a nation with nothing left to lose could take the world with it. That is the
  "everyone loses" rule D3 forbids.
- **Phase 4 war must destroy, never transfer.** Limited war (D4) may take output away
  from a nation. The moment it moves that output to the attacker, this whole section
  stops being true. Any war design must preserve it or it needs a new decision record.

**Gate metric.** Gate 2: a trailing nation gains nothing by sabotage. The harness
runs a saboteur archetype against a cooperative archetype on paired seeds, playing
the same nation from the same position, and requires the saboteur's median
`finalScore` to be strictly lower. Gate 4: warmonger and betrayer archetypes each at
or under 1.5x fair share and neither topping the score more often than the
reciprocal cooperator, with nations assigned at random (decision record G1).


### 5.4 The World Accord: the shared threshold *(100x slice 7)*

The vision is co-opetition: a shared threshold plus an individual ranking. The
multiplier is continuous and stays so (D3: never a binary "everyone loses"), so
the threshold is a verdict on top of it, not a rule inside it:

```
the world made it  <=>  collective (the mean of the four goals) >= worldAccordBp at the end
```

The end of a game reads as both: whether the world made the Accord, and where
you ranked. *Victory* is the world making it with you first; *podium* is the world
making it with you in the top three; *shared success* is the world making it; *the
world fell short* is anything else, whatever your rank. Scores are unchanged, so
5.3 still holds: a nation that drags the world under the line loses its own
multiplier with everyone else's.

At `worldAccordBp` 8,500, all-AI worlds end at 83-92% and worlds with free-riders,
hoarders and isolationists at 59-80%, so whether the world makes it is decided by
how the players behave.

---

## 6. Starting trust

Trust is a number from `trustMin` (5) to `trustMax` (90) for each ordered pair. It
starts symmetric and diverges in play.

```
trust = baseTrust                                            (35)
      + trustSharedAlliance      if any alliance in common    (+25)
      + trustSharedBlocEach * blocs in common, capped at trustSharedBlocCap  (+10 each, max +25)
      + trustTradePartner        if j is in i's topTradePartners  (+12)
      + trustTradePartner        if i is in j's topTradePartners  (+12)
      + trustBothG20             if both are in g20            (+5)
      - trustNoTiesPenalty       if no bloc and no partner in common  (-10)
```

Worked from the data:

| Pair | Ties | Starting trust |
|---|---|---|
| Japan – United States | `us-japan` alliance, 3 blocs, Japan lists the US as a partner, both G20 | 90 (clamped from 102) |
| Japan – Australia | 5 blocs (capped), Australia lists Japan, both G20 | 77 |
| Germany – Türkiye | both in NATO (+25), one bloc in common, Türkiye lists Germany as a partner, both G20 | 87 |
| Nigeria – Japan | nothing in common | 25 |
| India – China | 3 blocs in common (capped), India lists China as a partner, both G20 | 77 |

That last row is the important one. **Trust here is built only from positive
structural ties and their absence.** There is no list of who dislikes whom, no
sanctions table, no political judgement. Two nations with deep trade and shared
blocs start trusting each other even where a newspaper would say otherwise, because
the alternative is baking the assistant's or the designer's politics into the board.
What happens after tick 0 is the players' business.

**Gate metric.** At tick 0, every playable nation's mean trust across the other 16
lies between 25 and 72, so nobody starts friendless and nobody starts universally
loved. Measured on the current data: Nigeria lowest at 30.3, China highest at 70.1.
Checked as an invariant in the harness on every build, so a later change to blocs or
trade partners cannot quietly break it.

---

## 7. AI personalities, derived from the data

D5 and D9: deterministic utility AI, personality from structural facts, never
stereotypes, no real people.

### 7.1 Eight structural inputs, all from the data file

```
importDependence    = (200 - food.selfSufficiencyIndex - energy.selfSufficiencyIndex) / 2
exportConcentration = max(food.SSI, energy.SSI, minerals.endowmentIndex) - 50, floored at 0
tradeOpenness       = min(100, count(blocs) * 8)
allianceDensity     = min(100, count(alliances) * 20)
exposure            = climate.exposureIndex
preparedness        = pandemic.preparednessIndex
growthHeadroom      = min(100, baselineGrowth.basisPoints / 10)
weight              = min(100, gdpShareWorldPct * 4)
```

### 7.2 Mapped onto the roadmap's personality fields

```
cooperativeness = clamp(30 + 0.35*importDependence + 0.20*tradeOpenness
                           + 0.10*allianceDensity - 0.15*weight)
risk            = clamp(50 + 0.30*growthHeadroom - 0.40*exposure)
timeHorizon     = clamp(40 + 0.40*preparedness + 0.20*weight - 0.20*exposure)

reciprocity = strict     if allianceDensity >= aiReciprocityAllianceThreshold (40)
            = forgiving  else if importDependence >= aiForgivingImportThreshold (60)
            = exploiter  else if exportConcentration >= aiExploiterExportThreshold (30)
                              and importDependence < aiExploiterImportCeiling (40)
            = strict     otherwise

priorities  = the two resources with the largest gap between demand and own
              production, recomputed every aiGoalRescoreTicks (3)
```

`exploiter` names a **negotiating stance**, not a nation: it is what the model calls
any player who holds a surplus others need and needs little in return. It is reached
only through those two numeric thresholds, and the thresholds are tunables the
harness may sweep.

### 7.3 Three worked examples

| | Japan | Nigeria | Australia |
|---|---|---|---|
| importDependence | 94 | 37 | 0 |
| exportConcentration | 0 | 40 | 50 |
| tradeOpenness | 48 | 24 | 40 |
| allianceDensity | 20 | 0 | 40 |
| exposure | 35 | 49 | 30 |
| preparedness | 60 | 38 | 71 |
| growthHeadroom | 6 | 42 | 20 |
| weight | 12 | 5 | 4 |
| **cooperativeness** | **73** | **47** | **41** |
| **reciprocity** | **forgiving** | **exploiter** | **strict** |
| **risk** | **38** | **43** | **44** |
| **timeHorizon** | **59** | **46** | **63** |
| **priorities** | Energy, Food | Food, Resilience | Resilience, Credit |

Japan is highly cooperative and forgiving because it cannot feed or power itself, so
a broken relationship costs it more than a bad deal does. Australia is the least
cooperative of the three and strictly reciprocal because it needs nothing and has
alliance commitments to honour. Nigeria bargains hard because it holds an energy
surplus and has few blocs to lose. Not one of those sentences says anything about a
country's character; every one of them is a consequence of a row in the data file.

### 7.4 Hard prohibitions

- No national or cultural character traits anywhere in the code, the data or the
  text. If a trait cannot be computed from §7.1, it does not exist.
- No real people. No current or historical political figures, no named officials,
  no leaders. Nations act; nobody speaks for them.
- No religion or ethnicity in any field, index or string.
- Every AI explanation string is built from numbers: "my food deficit is 79 units
  and your surplus is 114" is legal; "we are a proud trading nation" is not. The
  harness asserts that every logged AI decision carries at least one numeric reason.

**Gate metric.** Gate 2: the owner predicts AI responses correctly 70% of the time
after one game, and the AI is legible without being farmable. Plus the numeric-reason
assertion above, on every build.

---

## 8. What the player actually does

Everything above has to arrive as a decision card or a standing policy (D8), or it
gets simplified until it does.

### 8.1 Decision cards

| Card | When it appears | Taps to resolve |
|---|---|---|
| **Offer received** | another nation sends an offer | 2 — open, accept or decline |
| **Shortfall** | Food or Energy will not cover demand next tick | 2 — open, pick the suggested cover |
| **Crisis opened** | a climate event or pandemic fires | 2 — open, contribute the suggested amount |
| **Crisis closing** | one tick before a pool locks | 2 — open, top up or pass |
| **Trade opportunity** | a partner's surplus matches your deficit | 3 — open, set amount, send |
| **Resilience slipping** | resilience falls below the policy floor | 2 — open, fund or accept |
| **Away recap** | first open after an absence | 1 — read, dismiss |
| **Project invitation** (13.2) | a host invites you to a forming project | 2 — open, join or decline |
| **Host a project** (13.1) | you may host a goods project and nations short of that good exist | 2 — open, found it with the suggested partners (or pick them on the Projects screen) |
| **Partner walked out** (13.3) | a member left a project you are building | 2 — open, cover the gap or carry on |

Nothing is more than three taps from home, and the primary action sits in the bottom
third of the screen.

### 8.2 Standing policies

Five dials, and they answer everything while the player is away:

1. **Trade answer** — auto-accept fair deficit-covering offers / auto-accept from
   trusted above threshold / auto-reject all.
2. **Cover priority** — Food first or Energy first.
3. **Contribution share** — percent of income that goes to the crisis pools each
   tick, and which pool gets it.
4. **Resilience floor** — the level below which the nation funds resilience
   automatically.
5. **Hard bargains** — whether to send offers outside the fair price band.

**Gate metric.** Gate 0: the owner completes three sample decisions one-handed.
Gate 1: a trade in three taps or fewer. Gate 2: the 24-hour absence test passes with
a recap readable in under a minute, and the depth budget and 60 fps hold.

---

## 9. Time

| | Value | Why |
|---|---|---|
| One tick | one world month | Enough happens in a month to be worth a card; not so much that a missed tick is a missed game |
| A game | 60 ticks = 2030 to 2035 | Five years is long enough for climate to ratchet four times and short enough to finish |
| Single-player 1x | one tick per 30 minutes of wall clock | A full game is about 30 hours of elapsed time |
| Single-player 4x | one tick per 7.5 minutes | For a session where the player wants to push on |
| Multiplayer | one tick per 6 hours | A full game runs 15 days, inside D2's "days to weeks"; a 24-hour absence is 4 ticks, not a third of the game |

Note for the architect: Gate 0's "1,000 catch-up ticks under 2 s" no longer maps to
a game length now that a whole game is 60 ticks. It remains a useful raw stress
budget — it is about 17 games' worth of stepping — but it is no longer "an absence".
Logged in `docs/GAPS.md`.

---

## 10. What this does not cover yet

Phase 4 systems (treaties, alliances forming in play, blocs, limited war) are
named in D7 and are deliberately absent here. Joint projects (Phase 3) are
section 13. When they arrive they
must preserve §5.3: nothing may transfer one nation's output to another without
consent.

---

## 11. Tunables

Every number in this document, in the shape `packages/sim/src/tunables.ts` expects,
so lane S can transcribe it without inventing anything. Values are integers.
Percentages are whole percents; rates are basis points (bp, hundredths of a percent)
wherever they feed economy maths.

### Time and scale

| id | value | min | max | note |
|---|---|---|---|---|
| `tickMonths` | 1 | 1 | 3 | One world month per tick. Longer ticks mean fewer, heavier decisions and a harsher absence |
| `gameLengthTicks` | 60 | 24 | 120 | Five world years. Below 24 the climate ratchet never bites; above 120 a multiplayer game outlasts anyone's patience |
| `outputScaleBp` | 833 | 500 | 1250 | One twelfth of annual PPP GDP as monthly output. The band lets the harness compress or stretch the whole economy without touching anything else |

### Food and energy

| id | value | min | max | note |
|---|---|---|---|---|
| `foodDemandPerMillionPeople` | 1 | 1 | 3 | One food unit feeds one million people for a month. Raising it makes food scarcer for everyone equally |
| `energyDemandPerOutput` | 100 | 60 | 150 | Energy demand as a percent of output. The band covers a world that electrifies fast and one that does not |
| `selfSufficiencyPivot` | 50 | 40 | 60 | The index value at which production equals demand. Moving it shifts the whole world into surplus or deficit |
| `shortfallPenaltyBpPerPct` | 20 | 10 | 120 | Output cost per percent of unmet demand. At 20, a 10% shortfall costs 2% of output. Prompt 09 tuning (seeds 1001-1400 only): 40 -> 35; H3: 35 -> 20, with the cap out of reach, so every unit of cover counts for every nation |
| `structuralCoverSharePct` | 80 | 50 | 100 | Share of the world's structural surplus counted as reachable when setting each importer's fair share and its baseline (§2.8). 100 assumes every spare unit reaches a buyer; lower allows for goods that never reach market. Prompt 09 tuning (seeds 1001-1400 only) |
| `maxShortfallPenaltyPct` | 60 | 10 | 60 | Cap on the shortfall penalty, so no nation is killed by one bad tick (Gate 1: dead states under 2%). H3: 30 -> 60, out of reach at a slope of 20 |
| `mineralsEnergyBonusBpPer10` | 10 | 0 | 40 | Energy production bonus per 10 points of mineral endowment. Caps at +10% at the starting value |
| `startingStockTicks` | 1 | 0 | 6 | Starting Food and Energy as months of own production, starting Credit as months of output. Above 0 so nobody starts a game already short |
| `mineralsOutputBonusBpPer10` | 10 | 0 | 40 | Output bonus per 10 points of refining leverage. Caps at +10%. Set both to 0 to test a world where minerals do not matter |

### Resilience

| id | value | min | max | note |
|---|---|---|---|---|
| `resilienceStartWeightPreparedness` | 50 | 0 | 100 | Percent weight on pandemic preparedness versus inverse climate exposure in the starting level. 50 is a plain average |
| `resilienceDecayPerTick` | 1 | 0 | 3 | Points lost per tick if unfunded, so neglect is a choice. At 0 resilience becomes a one-time purchase |
| `resilienceCostPerPoint` | 6 | 2 | 20 | Credit cost of one resilience point. The band decides whether resilience competes with trade for money |
| `defaultResilienceFloor` | 40 | 0 | 80 | Starting position of the resilience-floor dial (§8.2). 0 turns automatic funding off |
| `resilienceMax` | 100 | 80 | 120 | Ceiling. Above 100 a nation can over-prepare, which the harness may want to test |

### Trade

| id | value | min | max | note |
|---|---|---|---|---|
| `offerLifeTicks` | 3 | 1 | 12 | Three world months to answer. Short enough to keep the board moving, long enough for an absent player's policies to catch it (S8) |
| `maxOpenOffersPerNation` | 6 | 2 | 20 | Caps spam from AI and spreadsheet play from humans |
| `priceBandPct` | 35 | 10 | 60 | Width of the fair-price band either side of the reference price. Narrow bands make hard bargains common and trust volatile |
| `gainsFromTradeBp` | 40 | 5 | 40 | Monthly output bonus for a nation whose trades clear its whole imbalance: all its surplus and its fair share of each deficit (§3.3). Each side gains by the share of its own imbalance cleared, capped at this rate a month. The number Gate 1's 15% trade advantage is tuned with (prompt 06: 15 -> 40; prompt 09 kept 40) |
| `foodBasePriceMilli` | 100 | 20 | 500 | Reference price of one food unit in thousandths of a Credit when world supply meets demand (§3.2). 100 puts world food spending near 4% of output |
| `energyBasePriceMilli` | 60 | 10 | 300 | Reference price of one energy unit in thousandths of a Credit at balance. 60 puts world energy spending near 6% of output |
| `autoAcceptTrustThreshold` | 55 | 30 | 80 | Trust level at which the trusted-partner standing policy fires |
| `autoImportOffersPerGood` | 2 | 1 | 4 | Most offers the "keep us supplied" policy sends for one good in a month (3.4) |

### Trust

| id | value | min | max | note |
|---|---|---|---|---|
| `baseTrust` | 35 | 20 | 50 | Trust between two nations with no ties at all, and the level trust drifts back to |
| `trustSharedAlliance` | 25 | 10 | 40 | Bonus for any defence alliance in common. The largest single term, because it is the strongest real-world tie |
| `trustSharedBlocEach` | 10 | 3 | 20 | Bonus per trade bloc in common |
| `trustSharedBlocCap` | 25 | 10 | 50 | Cap on the bloc bonus, so a nation in six groupings does not start trusting everyone |
| `trustTradePartner` | 12 | 5 | 25 | Bonus per direction when one nation is among the other's top three partners |
| `trustBothG20` | 5 | 0 | 15 | Small bonus for both sitting in the G20, a proxy for "they talk regularly" |
| `trustNoTiesPenalty` | 10 | 0 | 25 | Penalty when two nations share no bloc and no trade tie |
| `trustMin` | 5 | 0 | 20 | Floor. Above 0 so a relationship is never unrecoverable |
| `trustMax` | 90 | 70 | 100 | Ceiling. Below 100 so no relationship is unbreakable |
| `trustPerTrade` | 2 | 1 | 5 | Gained per completed trade |
| `trustPerIgnoredOffer` | 1 | 0 | 3 | Lost when an offer is left to expire. Ignoring is an answer |
| `trustPerRenege` | 12 | 5 | 30 | Lost for accepting and then failing to deliver. Six trades to repair at the starting values |
| `trustDecayPerTick` | 1 | 0 | 3 | Drift back towards `baseTrust`, so memory fades (the roadmap's decaying belief) |
| `trustPerPledgeHonoured` | 2 | 0 | 6 | Trust every other nation gains in a pledger who pays in full by the deadline (§4.4). Small, like a completed trade, because keeping a promise is expected. Phase 2 prompt 09 |
| `trustPerPledgeBroken` | 12 | 5 | 30 | Trust every other nation loses in a pledger who withdraws or cannot pay (§4.4). Matches `trustPerRenege`: six kept pledges repair one broken. Phase 2 prompt 09 |

### Climate

| id | value | min | max | note |
|---|---|---|---|---|
| `climateEventIntervalTicks` | 12 | 6 | 24 | One climate event per world year |
| `climateBaseSeverity` | 20 | 10 | 40 | Severity of the first event |
| `climateRampPerYear` | 8 | 0 | 20 | Added severity per world year, which is what makes climate a ratchet rather than weather. At 0 it stops ratcheting |
| `climateDamageSpreadTicks` | 6 | 1 | 12 | Ticks over which damage is felt. Six months is what makes climate the slow crisis |
| `climateFirstOpenTick` | 3 | 0 | 11 | Month of each world year in which the climate appeal opens (tick modulo `climateEventIntervalTicks`). 3 lets the last event of a 60-month game lock and land inside the game. Phase 2 prompt 09 |
| `crisisResponseTicks` | 3 | 1 | 6 | Months from a climate appeal opening to its pool locking. Long enough for an absent player's policy to answer; short enough that the appeal is news. Phase 2 prompt 09 |

### Pandemic

| id | value | min | max | note |
|---|---|---|---|---|
| `pandemicChanceBpPerTick` | 167 | 83 | 417 | About one in 60 ticks, so roughly one pandemic per game. The band spans one per two games to two and a half per game |
| `pandemicWindowTicks` | 3 | 2 | 6 | Ticks from trigger to resolution. Three months is what makes it the fast crisis |
| `pandemicBaseSeverity` | 35 | 15 | 60 | Damage scale before preparedness and pool cover |
| `lateContributionEffectPct` | 40 | 0 | 70 | Effectiveness of money paid in after the trigger. Below 100 is the whole point: a pandemic rewards having funded the pool already |

### Crisis pools

| id | value | min | max | note |
|---|---|---|---|---|
| `poolCoverMaxPct` | 80 | 50 | 95 | Maximum damage a full pool can prevent. Never 100, so resilience and trade still matter |
| `poolTargetScaleBp` | 1000 | 500 | 2000 | Scales how much Credit a full pool needs relative to world exposure and output. The main lever on Gate 2's 40-75% crisis success band |
| `contributorResilienceBonus` | 3 | 0 | 10 | Resilience given to contributors only, so cooperating pays something private |
| `contributorTrustBonus` | 2 | 0 | 6 | Trust gained with every other contributor |
| `crisisPartialPct` | 50 | 25 | 90 | Share of the target, in percent, a pool must reach for a crisis to count as a partial success rather than a failure. Reaching full cover is a success (§4.3). Phase 2 prompt 09 |
| `contributorMinSharePct` | 50 | 10 | 100 | Share of its own fair share a nation must pay in a round to count as a contributor for the bonuses, so one token Credit cannot farm them. Phase 2 prompt 09 |
| `nonPayerCoverPct` | 50 | 0 | 100 | Percent of the pool's cover that reaches a nation that paid none of its own share; the cover scales in a straight line up to all of it at a full share (§4.3 rule 1). 100 is the old rule, where paying was optional. Prompt 14; tuning (seeds 1001-1400 only): 100 (old rule) -> 50. 75 leaves the free-rider at 1.61x fair share; 25 and 0 only push the cooperator's share of tops higher (docs/balance/gate2-prompt14.md) |
| `defaultContributionBp` | 110 | 0 | 200 | Starting position of the monthly contribution dial (§8.2 dial 3), in basis points of income, split between the pools. Steady funding is what fills the health pool before a pandemic. Phase 2 prompt 09; gate2 tuning (seeds 1001-1100 only): 20 -> 110, the main lever on crisis success |
| `reciprocalMatchPct` | 50 | 25 | 100 | How much of its target the world must have met in a pool's last round, in percent, for a reciprocal policy to pay its full share this round. Below it, it pays in proportion. Phase 2 prompt 09 |
| `maxPledgeTicks` | 12 | 3 | 24 | Furthest ahead a pledge deadline may be set. A year: long enough to promise for the next climate event, short enough that a promise is soon tested. Phase 2 prompt 09 |

### Scoring

| id | value | min | max | note |
|---|---|---|---|---|
| `collectiveFloorBp` | 7000 | 5000 | 9000 | Multiplier when the world achieves nothing (0.70). Must stay above zero — see §5.3 |
| `collectiveCeilingBp` | 14000 | 11000 | 20000 | Multiplier when the world achieves everything (1.40). The gap to the floor is how much cooperation is worth |
| `baselineToleranceBp` | 9500 | 9000 | 9900 | `ownScore` counted as "at baseline" for the collective goal (0.95) |
| `scoreScale` | 1000 | 100 | 10000 | Cosmetic multiplier so final scores read as four digits |
| `worldAccordBp` | 8500 | 5000 | 9500 | The World Accord (5.4): the shared goals' mean at the end at or above which the world made it. Presentation only; never changes a score |
| `scoreSmoothingTicks` | 12 | 1 | 24 | Window of the monthly exponential average ownScore is read from (§5.1). 1 is the old final-month reading. Prompt 09 tuning (seeds 1001-1400 only) |

### AI

| id | value | min | max | note |
|---|---|---|---|---|
| `aiGoalRescoreTicks` | 3 | 1 | 12 | How often an AI re-scores its goals. Staggered across nations to stay inside the per-tick compute budget |
| `aiNoiseBp` | 300 | 0 | 1000 | Random jitter on action scores, so the AI is legible but not farmable. At 0 it is perfectly predictable |
| `aiReciprocityAllianceThreshold` | 40 | 20 | 60 | Alliance density at or above which an AI is strictly reciprocal |
| `aiForgivingImportThreshold` | 60 | 40 | 80 | Import dependence at or above which an AI forgives |
| `aiExploiterExportThreshold` | 30 | 10 | 50 | Export concentration at or above which an AI will bargain hard |
| `aiExploiterImportCeiling` | 40 | 20 | 60 | Import dependence below which hard bargaining is safe for it |
| `aiStockBufferTicks` | 2 | 1 | 6 | Months of own demand the greedy trader keeps in stock before it sells a surplus or stops buying. Higher is safer and trades less |
| `aiRetaliationWindowTicks` | 2 | 1 | 6 | Latest tick, counted from a broken deal, by which a strict reciprocator has visibly retaliated (prompt 10, docs/AI_DESIGN.md) |
| `aiPunishTicks` | 6 | 2 | 24 | Months of refused trade after a broken deal, half that after a skipped crisis pledge |
| `aiForgiveLimit` | 1 | 0 | 3 | Offences a forgiving AI lets pass inside its memory before it retaliates. Above 1 becomes farmable |
| `aiMemoryDecayPct` | 4 | 1 | 20 | Percent of remembered grievance fading each tick; 4 halves a grudge in about 17 months |
| `aiGrudgePerBreak` | 40 | 10 | 100 | Grievance for a deal broken against the AI; at or above this level a partner counts as an unforgiven offender |
| `aiGrudgePerSkip` | 20 | 0 | 60 | Grievance for skipping a crisis pledge the AI paid into. 0 forgets crisis free-riding in trade |
| `aiTrustPriceBpPerPoint` | 20 | 0 | 60 | Price generosity per point of trust above `baseTrust` (stricter below). At 20, trust 75 accepts 8% worse terms |
| `aiCounterRangePct` | 20 | 0 | 40 | How far below its reservation price an offer still gets a counter rather than a rejection. 0 turns counters off |
| `aiExploiterMarkupPct` | 0 | 0 | 50 | Markup a hard-bargaining AI asks over the reference price. Above `priceBandPct` its offers become hard bargains. Prompt 10 tuning (seeds 1001-1400 only): 20 -> 0 |
| `aiBudgetUnitsPerTick` | 4000 | 500 | 20000 | Work units the whole AI roster may spend per tick; due nations that do not fit wait a tick |
| `aiPledgeMaxIncomePct` | 10 | 0 | 30 | Most of one month's income an AI pledges to a crisis pool at once |
| `aiConditionalPledgePct` | 50 | 20 | 80 | A strict reciprocator pledges its full fair share only when at least this percent of nations paid into the last crisis |
| `aiFreeRideCoverPct` | 70 | 40 | 100 | A hard bargainer skips a pledge once the pool is this percent funded. 100 never free-rides |

### Engine limits

| id | value | min | max | note |
|---|---|---|---|---|
| `maxCommandsPerNationPerTick` | 8 | 1 | 32 | Caps one nation's intent per tick so a buggy or hostile client cannot flood a step; a real player needs a handful at most (prompt 03) |
| `crisisHistoryKept` | 12 | 4 | 24 | Locked crises kept in State and the View for crisis cards and recaps. Not balance: a 1,000-month stress run must not grow State without end. Phase 2 prompt 09 |
| `recapMaxLines` | 6 | 3 | 10 | Most lines an away recap shows. Six short sentences read in well under a minute (Gate 2 absence test). Phase 2 prompt 09 |

The five rows added by prompt 10 (`foodBasePriceMilli`, `energyBasePriceMilli`,
`startingStockTicks`, `defaultResilienceFloor`, `aiStockBufferTicks`) ratify numbers
prompt 06 had to invent for the code. Every tunable in `tunables.ts` now has a row
here with the same starting value and band, and `packages/harness/src/rules.test.ts`
fails if the two ever disagree.

---

### Joint projects (section 13)

| id | value | min | max | note |
|---|---|---|---|---|
| `aiProjectMinTrust` | 30 | 0 | 60 | Mean trust in a project's host and members below which an AI will not join: they may walk out mid-build |
| `aiProjectMinYield` | 40 | 0 | 200 | Smallest monthly yield an AI host founds a goods project for |
| `projectFormingTicks` | 3 | 1 | 6 | Months an invitation stays open |
| `projectMinMembers` | 3 | 2 | 5 | Members, host included, needed to start building at the deadline |
| `projectSlots` | 4 | 3 | 6 | Most members, host included |
| `projectBuildTicks` | 9 | 4 | 18 | Build months at a template's 100% |
| `projectYieldPct` | 40 | 10 | 80 | Total yield as a percent of the host's surplus at a template's 100% |
| `projectMinSurplusPct` | 10 | 0 | 50 | Surplus, as a percent of the host's own demand, needed to host a goods project |
| `projectFoodUnitCost` | 10 | 4 | 60 | Credit per unit of monthly food yield. A unit a rich importer goes short of costs it about 0.8 Credit of output a month, one it would have bought about 0.1, so a food project pays back in one to three years depending on how short the buyer really is |
| `projectEnergyUnitCost` | 3 | 1 | 20 | Credit per unit of monthly energy yield. At H3's 20 bp a unit of energy an importer goes short of saves it about 0.15 Credit a month, so about 20 months to pay back when the shortage is real |
| `projectShieldCostPct` | 20 | 5 | 100 | A shield member's due as a percent of its own monthly output. Its benefit scales with output, so its price does too. 100x slice 9: 10 -> 20, which took the early-warning network from 80% of games to 20%, every template at 45% or less (Gate 3) |
| `projectShieldBp` | 2500 | 1000 | 5000 | Crisis damage a shield cuts for its members |
| `projectMaxHosted` | 2 | 1 | 4 | Projects a nation may host that start building, per game |
| `projectTrustBuilt` | 4 | 0 | 10 | Trust every pair of members gains when a project completes |
| `projectTrustLeave` | 12 | 5 | 30 | Trust each remaining member loses in a nation that leaves mid-build. Matches a broken pledge |

## 12. Open questions for the owner

Answered so far: roster size, resource count, tick length and all seven contested
territory rulings (§1). These are what the draft surfaced and still need a decision.
None of them blocks lane S from starting on §2 and §3.

1. **Do the six background aggregates make offers of their own, or only answer
   them?** Offering makes the world feel alive and roughly triples the number of
   cards a player sees. Answering only is calmer and cheaper. Recommendation:
   answer only for the MVP, revisit at Gate 2.
2. **Should a player be able to see another nation's Resilience level?** Seeing it
   makes crisis bargaining much richer; hiding it makes free-riders harder to spot.
   Recommendation: visible, because §4.3 depends on free-riding being visible.
3. **Is a 30-hour single-player game at 1x too long?** It is five world years at one
   tick per half hour. The alternative is a shorter game (40 ticks) or a faster
   default. Recommendation: keep 60 ticks and make 4x the default for single player.
4. **Should `exploiter` be renamed?** It is the roadmap's own word for a negotiating
   stance, and the derivation is purely numeric, but it will appear in the interface
   next to a real nation's name. Alternatives: "hard bargainer", "opportunist".
   Recommendation: rename to "hard bargainer" in anything the player sees, keep
   `exploiter` as the internal id so the roadmap still matches.
5. **Do you want the minerals data rebuilt from the USGS tables before Phase 1, or
   is the curated index good enough to build against?** It is the weakest data in
   the file (`data/SOURCES.md`, Estimates). Recommendation: build against it now,
   rebuild before Gate 1, because minerals only move two multipliers.
6. **Should blocs and alliances be verified against each organisation's membership
   page before starting trust is coded?** Starting trust is derived entirely from
   them (§6). Recommendation: yes, and it is a small job — 20 pages.

Answers get written into this file, in §1, before the next build session touches
anything that depends on them.

---

## 13. Joint projects *(Phase 3; decision records H2 and H4)*

The second collaboration verb. Trade moves goods the world already has; a joint
project makes goods the world does not have, or armour against the crises it
cannot avoid. It is where Credit finally has something to compete for.

### 13.1 The catalogue

Seven templates, design data in `packages/sim/src/projects.ts` and in every
View. Build time, yield and cost are percentages of the tunables in 13.6.

| Template | Kind | Build | Yield | Cost | Who may host |
|---|---|---|---|---|---|
| Solar and storage belt | energy | 67% (6 months) | 63% (25% of the host's surplus) | 100% | energy surplus |
| Cross-border grid link | energy | 100% (9) | 88% (35%) | 90% | energy surplus; every member shares a bloc or alliance with the host |
| Green hydrogen corridor | energy | 133% (12) | 125% (50%) | 110% | energy surplus and minerals endowment 50 or more |
| Grain corridor and reserve | food | 67% (6) | 75% (30%) | 100% | food surplus |
| Desalination and smart irrigation | food | 133% (12) | 113% (45%) | 110% | food surplus |
| Climate early-warning network | climate shield | 67% | - | 100% | anyone |
| Vaccine manufacturing network | pandemic shield | 100% | - | 50% | anyone |

A nation has a **surplus** in a good when its production exceeds its demand by at
least `projectMinSurplusPct` of that demand (public flows, at founding).

### 13.2 Founding and forming

A playable nation **proposes** a project from a template it may host, naming up
to `projectSlots - 1` invitees (playable nations only; for a grid link, only
nations that share a bloc or alliance with it). There are never more invitations
than free seats, so every invitation is a seat held for that nation, and a
decline costs the host a member. At that moment the sim
fixes:

```
buildTicks = projectBuildTicks * template.build / 100
yield      = hostSurplus * projectYieldPct / 100 * template.yield / 100      (goods)
cost       = yield * unitCost(good) * template.cost / 100                     (goods)
unitCost   = projectFoodUnitCost or projectEnergyUnitCost
```

A shield has no single price: its benefit scales with each member's output, so
each member's **due** is `output_i * projectShieldCostPct / 100 * template.cost / 100`,
and the shield's cost is the sum of its members' dues when building starts.

A nation may be in only one shield of each kind (forming, building or active):
protection does not stack.

The project is **forming** for `projectFormingTicks` months. Only invitees may
**join**; an invitee may **decline** (a clear no, costs nothing). It starts
**building** as soon as `projectSlots` nations (host included) have joined, or at
the forming deadline if at least `projectMinMembers` have; otherwise it **lapses**
and nothing was paid. A nation may have one forming project as host at a time and
may host at most `projectMaxHosted` projects that start building in a game.

Nothing waits for anyone to be online (S8): an absent invitee simply has not
joined when the deadline comes.

### 13.3 Building

When building starts each member's **due** is fixed: `ceil(cost / membersAtStart)`
for a goods project, its own share of output for a shield (13.2). Each building
month every member pays its **installment** automatically:

```
installment_i = ceil(due_i / buildTicks)
cap_i         = 2 * due_i (goods)  or  due_i (shields)   (the most one member may pay in total)
```

and may pay more at any time with **fund project** (up to its cap), which both
speeds the build and raises its share. The project completes the month total
paid reaches `cost`; the last payments are trimmed so it never passes it. A
member that cannot pay an installment is **dropped**: it counts as leaving.
Installments keep being collected up to each member's cap, so the members who stay
cover a vacancy over the extra months it takes.

A member other than the host may **leave** while the project is forming (free)
or building. Leaving mid-build forfeits everything it paid (the money is already
concrete) and every remaining member's trust in it falls by
`projectTrustLeave`. The remaining members' installments do not change, so a
goods build takes longer: a partner walking out costs everyone time, which is the
risk of choosing partners. A shield's cost falls by the leaver's unpaid due, and the
leaver is not protected. The host may not leave its own project.

Money paid into a project is a named Credit sink (`creditSpentProjects`).

### 13.4 Active

When it completes, every pair of members gains `projectTrustBuilt` trust, and
the project is **active** until the game ends. Shares follow money:

```
share_i = paid_i / totalPaid
```

- **Goods projects** add `floor(yield * share_i)` to member *i*'s production of
  that good every month, cut by the climate damage the host is taking that month
  (`yield * (10000 - hostClimateBp) / 10000`). A drought at the host is a drought
  at the plant, which ties the adaptation pool to what you built. Production is a
  source in the conservation invariant like any other.
- **Shield projects** cut every member's damage from crises of their kind by
  `projectShieldBp` when the damage is scheduled (RULES 4.4), after pool cover.
  The damage an empty pool would have done is unchanged, so the world's
  "damage avoided" goal counts it.

### 13.5 What it does to scoring and to 5.3

Nothing new in the formula. A member's extra production lowers its shortfall
penalty (2.7) or gives it goods to sell (3.3); both raise its output, and the
world's unmet demand falls, which raises the "deficits met" goal for everyone.
Baselines read the structural world (2.8), which project yields never enter, so
no play moves any baseline. Nothing transfers between nations: each member's
Credit goes into the ground and each member's yield is new production. 5.3 holds.

**Gate metric.** Gate 3 (with H2): no project built in over 50% of games (a single
template is not a dominant strategy); crisis success stays in band; withdrawal is
sometimes rational (the AI leaves in some games) and always costs trust;
invariants hold. Reported with every balance change: how often each template is
built, Credit sinks as a share of income, and how often invitations are accepted.

### 13.6 Tunables

In section 11, under "Joint projects", where `rules.test.ts` checks them against
`tunables.ts`.
