# Gate 1 balance: prompt 11, spread AI trade offers

2026-09-28. Lane A. Question: does the greedy AI's habit of offering its spare
to the biggest importers first cause the Gate 1 top-scorer failure
(docs/gates/GATE-1.md, criterion 5)?

**Answer: no. Spreading the offers makes it worse, so the change was not kept.**
The weighted draw and its tests are in commit 7397c25, and
commit d749508 reverts them. Main's AI is unchanged.

## What was built (commit 7397c25)
- `weightedOrder` in packages/ai/src/greedy.ts is a seeded draw without
  replacement. It uses integer weights and hash draws, with no Math.random.
- A seller draws its buyers in an order weighted by deficit size, so a nation
  short of twice as much is twice as likely to be offered first. Amounts, prices,
  the 3-offer fan-out and the numeric reasons are unchanged.
- packages/ai/src/spread.test.ts covers the fixture: one exporter, six importers
  of different sizes, and three nations with no deficit, across 60 seeds and
  8 months. The tests check four things. Every importer gets at least 3% of
  offers. A nation with no deficit never gets one. Bigger deficits get more.
  The biggest importer is first under 75% of the time. Three of these fail on the
  old AI and all pass on the new one. `npm test` gave 302/302 and `npm run check`
  was clean.
- No new tunable was needed.

## Tuning (seeds 1001-1400 only, `gate1 --games 200 --seed 1001 --ranges 2`)
| Variant | Seller's buyer order | Offer amount | Most frequent top scorer, pooled 1001-1400 | Trade gain (per range) |
|---|---|---|---|---|
| main (old) | biggest deficit first, 3% jitter | whole deficit | **Russia 10.8%** | +18.0 / +17.8% |
| prop (candidate) | weighted by deficit | whole deficit | Russia 13.8% | +15.9 / +15.9% |
| sqrt | weighted by √deficit | whole deficit | Egypt 15.3% | +15.0 / +15.0% |
| equal | seeded shuffle | whole deficit | Egypt 20.8% | +14.6 / +14.6% |
| relative | weighted by deficit / own demand | whole deficit | Saudi Arabia 19.5% | +14.9 / +15.1% |
| squared | weighted by deficit² | whole deficit | Russia 15.0% | +16.6 / +16.2% |
| power 1.5 | weighted by deficit^1.5 | whole deficit | Russia 15.5% | +16.3 / +16.0% |
| prop, rationed | weighted by deficit | spare split by deficit share | Saudi Arabia 22.3% | +17.2 / +17.2% |
| equal, rationed | seeded shuffle | spare split by deficit share | Saudi Arabia 15.3% | +16.5 / +16.3% |
| relative, rationed | by deficit / own demand | spare split by deficit share | Saudi Arabia 18.0% | +16.9 / +16.2% |
| old sell + weighted buy | old; buyers also draw sellers weighted by surplus | whole deficit | Brazil 15.3% | +17.6 / +17.7% |
| prop sell + weighted buy | weighted both ways | whole deficit | Turkiye 15.5% | +15.6 / +15.8% |

Every variant is worse than main on the tuning seeds. The prompt's own design
(weighted by deficit) was the least bad spread, so that is the candidate that was
graded.

## Graded once (seeds 1-800, `gate1 --games 200 --ranges 4`), candidate "prop"
No re-tuning after this run.

| Seeds | Trade gain (pass >= +15%) | Pairs at +15% | Top scorer (pass <= 11.8%) | Result |
|---|---|---|---|---|
| 1-200 | +15.5% | 56.0% | Egypt 16.0% | FAIL |
| 201-400 | +15.3% | 55.0% | Russia 16.0% | FAIL |
| 401-600 | **+14.9%** | 50.0% | Russia 19.0% | FAIL (both) |
| 601-800 | +15.5% | 56.0% | Russia 16.5% | FAIL |
| pooled 1-800 | +15.4% | 54.3% | Russia 16.0% | FAIL |

For comparison, main on the same seeds (second Gate 1 review) had a trade gain
of +17.6-17.7% and a top scorer of 12.5-15.0%. The candidate fails the top-scorer
criterion by more, and it breaks the trade criterion on one range. Everything else
still passes: 0 crashes, 0 negative stocks, 0 dead states, and isolating scores
lower in 99% of pairs. Pooled top shares: Russia 16.0, Egypt 13.4, Saudi Arabia
9.4, Indonesia 8.4 ... China 0.5, India 0.1. Archetypes: trader 2.69x fair share,
exploiter 0.80x, hoarder 0.54x, isolationist 0.01x.

## Why spreading hurts
The prompt 09 trade rule pays each side by the **share of its own imbalance**
that trade clears, capped per month.
- A nation with a small deficit (Egypt, Saudi Arabia's food, Turkiye) is fully
  covered by one offer. When offers spread out, small importers are drawn more
  often and more often reach the full monthly gain.
- Exporters (Russia, Brazil) sell to more partners, so more of their surplus
  clears.
- China, India and the other deep importers get only part of their huge deficits
  covered, so they lose the most.
- The old biggest-first order was quietly helping the nations the rule
  disadvantages.

The Gate 1 review's diagnosis ("the AI's buyer choice is the largest remaining
driver") was wrong. The imbalance comes from the scoring and trade-gain rule
(lane S), not from who the AI sells to.

## Decision for the owner
1. **Waive criterion 5 for Gate 1 in writing and carry it to Gate 2**, which
   grades balance again with archetypes. Main sits at 12.5-15%, down from India's
   34.5-45%, every nation can win, and the four ranges' winners differ.
2. **Change the trade-gain rule in lane S**, for example paying gains by the
   volume a nation's trades clear relative to its economy instead of by the
   share of its own imbalance. This means reopening prompt 09's design. It was
   tried in part there (docs/balance/gate1-prompt09.md, variant "(b)+(c)"), and
   it cost trade advantage.
