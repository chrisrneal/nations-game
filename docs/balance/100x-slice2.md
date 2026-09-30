# Balance report: 100x slice 2, no dead zone in the shortfall penalty (H3)

2026-09-30. `shortfallPenaltyBpPerPct` 35 -> 20, `maxShortfallPenaltyPct` 30 -> 60,
both inside their bands. Measured with the whole gate2 suite (which reruns Gate 1)
on seeds 1001-1100, before and after, using `--set` so both runs share one build:

```
npm run harness -- gate2 --games 100 --seed 1001
npm run harness -- gate2 --games 100 --seed 1001 --set shortfallPenaltyBpPerPct=20,maxShortfallPenaltyPct=60
```

Under H2 the fairness lines are reported, not blocking; the invariants and
"trading beats isolating" must hold, and they do.

| Line | Before (35 / 30%) | After (20 / 60%) |
|---|---|---|
| AI vs idle: Japan | +5.4% | **+16.9%** |
| AI vs idle: Korea | +4.4% | **+13.6%** |
| AI vs idle: Turkiye | +3.2% | +6.1% |
| AI vs idle: Mexico | +5.4% | +4.1% |
| AI vs idle: overall | +14.2% | +14.5% |
| AI vs idle: Saudi Arabia (the most frequent winner) | +35.6% | +26.2% |
| Trading vs isolating, same nation (Gate 1, at least +15%) | +18.2% | +17.4% |
| Isolating scores lower | 100% | 100% |
| Crisis success (40-75%) | 58.7% | 60.8% |
| Cooperator ahead of the free-rider, median gap | +6.74% | +6.82% |
| Spoiler vs cooperator (median, from mid-game) | 991 vs 1134 | 954 vs 1054 |
| Stealth spoiler: pairs where sabotage paid | **10.0%** | **2.0%** |
| Defecting archetypes (tops / fair share) | free-rider 1.04x, others 0.00-0.11x | free-rider 1.09x, others 0.00x |
| Most frequent top scorer, archetype games (waived) | Saudi Arabia 25.0% | Saudi Arabia 22.0% |
| Most frequent top scorer, Gate 1 mix (waived) | Saudi Arabia 15.0% | Canada 14.0% |
| Crashes, negative stocks, dead states | 0, 0, 0 | 0, 0, 0 |

**Reading.** The change does what H3 says. Japan and Korea, which sat on the old
30% cap, now gain as much from good play as the median nation (their first units of
cover used to be worth nothing). Sabotage pays less often (a trailing nation that
pulls the world down now feels every unit it costs itself). Trading still beats
isolating comfortably. Mexico and Turkiye still have a small lever: their deficits
are moderate and mostly covered by trade already; joint projects (slice 3) are the
lever meant for them. Japan, Korea and Turkiye still top 0% of games; the ranking
floor is a later question.
