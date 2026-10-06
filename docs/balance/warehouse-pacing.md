# Warehouse pacing report (seed 1)

| Check | Result | Target | |
| --- | --- | --- | --- |
| First upgrade | 3.0 s | <= 10 s | PASS |
| First new dock (greedy) | 29.0 s | <= 2 min | PASS |
| Longest wait for something new before the first sale (greedy) | 4.4 min | <= 5 min | PASS |
| First sale (greedy) | 35.6 min, 3 stars | 30-60 min | PASS |
| First sale (idle, 15-minute check-ins) | 150.6 min, 3 stars | reported | PASS |
| First sale without boosts (greedy; idle) | 38.5 min; 180.5 min | reported | PASS |
| Active over idle income (tapping, at the no-boost greedy levels) | 2.14-2.57x | about 2-3x (1.8-3.2) | PASS |
| Active over idle income (tapping, at the boosted greedy levels) | 2.45-2.63x | reported | PASS |
| Check-ins that buy something (idle, every 15 min) | 100% | >= 90% | PASS |
| A 5-minute active session reaches a new dock, truck or contract (from each idle check-in) | 10/10 | >= 80% | PASS |
| Income estimate vs measured idle | +0%, +2%, 0%, +0% | within 20% | PASS |

## Greedy bot: what it reached and when
- 0.5 min: dock 2
- 2.8 min: truck 1
- 3.8 min: contract 1
- 3.9 min: dock 3
- 4.2 min: truck 2
- 5.0 min: contract 2
- 7.3 min: truck 3
- 8.1 min: dock 4
- 10.3 min: contract 3
- 11.5 min: truck 4
- 14.4 min: contract 4
- 17.4 min: dock 5
- 18.6 min: dock 6
- 19.4 min: truck 5
- 21.5 min: contract 5
- 21.9 min: star on offer
- 23.7 min: truck 6
- 27.9 min: contract 6
- 32.3 min: dock 7
- 33.4 min: truck 7
- 35.6 min: sold (3 stars)
- 35.6 min: sale 1
- 36.3 min: truck 1
- 36.7 min: contract 1
- 37.5 min: dock 3
- 37.6 min: truck 2
- 38.0 min: contract 2
- 38.4 min: truck 3
- 38.7 min: dock 4
- 39.5 min: contract 3
- 41.7 min: truck 4
- 42.9 min: contract 4
- 43.3 min: dock 5
- 43.8 min: dock 6
- 44.3 min: truck 5
- 45.2 min: contract 5
- 48.1 min: dock 7
- 49.6 min: dock 8
- 55.6 min: sold (4 stars)
- 55.6 min: sale 2
- 56.2 min: truck 1
- 56.6 min: contract 1
- 57.3 min: dock 3
- 57.4 min: truck 2
- 57.6 min: contract 2
- 57.9 min: truck 3
- 58.8 min: contract 3
- 60.8 min: dock 4
- 61.2 min: truck 4
- 62.0 min: contract 4
- 62.2 min: dock 5
- 62.9 min: truck 5
- 63.1 min: dock 6
- 66.1 min: contract 5
- 66.8 min: truck 6
- 68.0 min: contract 6
- 68.3 min: dock 7
- 68.7 min: truck 7
- 70.7 min: contract 7
- 71.2 min: truck 8
- 71.9 min: dock 8
- 74.8 min: contract 8
- 78.1 min: truck 9
- 81.0 min: contract 9

Ended at Highmoor Crossdock with 7 stars, levels {"docks":7,"truck":9,"loading":25,"sales":21,"picking":15,"receiving":15,"contract":9,"crew":18,"night":4}.

## Idle bot (no taps, a check-in every 15 minutes)
- 15.2 min: dock 2
- 15.2 min: truck 1
- 30.2 min: contract 1
- 30.2 min: dock 3
- 30.3 min: truck 2
- 45.3 min: contract 2
- 45.3 min: truck 3
- 45.3 min: dock 4
- 60.3 min: contract 3
- 60.3 min: truck 4
- 75.4 min: contract 4
- 90.4 min: dock 5
- 90.4 min: dock 6
- 90.4 min: truck 5
- 105.5 min: contract 5
- 105.5 min: truck 6
- 105.5 min: star on offer
- 120.5 min: contract 6
- 135.5 min: dock 7
- 135.5 min: truck 7
- 150.6 min: sold (3 stars)
- 150.6 min: sale 1
- 165.6 min: truck 1
- 165.6 min: contract 1
- 180.6 min: dock 3
- 180.6 min: truck 2
- 180.6 min: contract 2
- 180.7 min: truck 3
- 180.7 min: dock 4
- 195.7 min: contract 3
- 195.7 min: truck 4
- 195.7 min: contract 4
- 210.8 min: dock 5
- 210.8 min: dock 6
- 210.8 min: truck 5
- 210.8 min: contract 5
- 225.9 min: dock 7
- 225.9 min: dock 8

## Active over idle income (2 minutes of tapping from the greedy bot's warehouse at each minute; no boosts, with boosts)
- minute 2: 2.49x, 2.49x
- minute 10: 2.49x, 2.49x
- minute 30: 2.57x, 2.63x
- minute 60: 2.14x, 2.45x

Overall: PASS
