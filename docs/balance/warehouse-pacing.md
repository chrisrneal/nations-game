# Warehouse pacing report (seed 1)

| Check | Result | Target | |
| --- | --- | --- | --- |
| First upgrade | 3.0 s | <= 10 s | PASS |
| First new dock (greedy) | 29.0 s | <= 2 min | PASS |
| Longest wait for something new before the first sale (greedy) | 4.3 min | <= 5 min | PASS |
| First sale (greedy) | 36.2 min, 3 stars | 30-60 min | PASS |
| First sale (idle, 15-minute check-ins) | 150.6 min, 3 stars | reported | PASS |
| First sale without boosts (greedy; idle) | 39.1 min; 165.5 min | reported | PASS |
| Active over idle income (tapping, at the no-boost greedy levels) | 2.12-2.92x | about 2-3x (1.8-3.2) | PASS |
| Active over idle income (tapping, at the boosted greedy levels) | 2.42-2.77x | reported | PASS |
| Check-ins that buy something (idle, every 15 min) | 100% | >= 90% | PASS |
| A 5-minute active session reaches a new dock, truck or contract (from each idle check-in) | 10/10 | >= 80% | PASS |
| Income estimate vs measured idle | -5%, -1%, 0%, -2% | within 20% | PASS |

## Greedy bot: what it reached and when
- 0.5 min: dock 2
- 2.8 min: truck 1
- 3.7 min: contract 1
- 4.1 min: dock 3
- 4.4 min: truck 2
- 5.0 min: contract 2
- 7.1 min: truck 3
- 9.0 min: contract 3
- 10.4 min: truck 4
- 14.3 min: contract 4
- 15.0 min: dock 4
- 17.3 min: dock 5
- 18.6 min: dock 6
- 19.4 min: truck 5
- 21.6 min: contract 5
- 21.8 min: star on offer
- 23.6 min: truck 6
- 27.9 min: contract 6
- 32.2 min: truck 7
- 36.2 min: sold (3 stars)
- 36.2 min: sale 1
- 36.9 min: truck 1
- 37.3 min: contract 1
- 38.1 min: dock 3
- 38.2 min: truck 2
- 38.5 min: contract 2
- 38.9 min: truck 3
- 39.7 min: contract 3
- 42.0 min: truck 4
- 43.5 min: contract 4
- 43.7 min: dock 4
- 44.0 min: dock 5
- 44.5 min: dock 6
- 45.1 min: truck 5
- 46.0 min: contract 5
- 48.9 min: dock 7
- 50.4 min: dock 8
- 56.4 min: sold (4 stars)
- 56.4 min: sale 2
- 57.0 min: truck 1
- 57.4 min: contract 1
- 58.1 min: dock 3
- 58.3 min: truck 2
- 58.6 min: contract 2
- 59.0 min: truck 3
- 59.6 min: contract 3
- 61.6 min: truck 4
- 62.7 min: contract 4
- 62.7 min: dock 4
- 63.0 min: dock 5
- 63.7 min: truck 5
- 63.8 min: dock 6
- 67.0 min: contract 5
- 67.7 min: truck 6
- 68.8 min: contract 6
- 69.2 min: truck 7
- 69.4 min: dock 7
- 71.1 min: contract 7
- 71.8 min: truck 8
- 73.1 min: dock 8
- 76.0 min: contract 8
- 79.1 min: truck 9
- 82.1 min: contract 9

Ended at Highmoor Crossdock with 7 stars, levels {"docks":7,"truck":9,"loading":25,"sales":21,"picking":17,"receiving":17,"contract":9,"crew":18,"night":4}.

## Idle bot (no taps, a check-in every 15 minutes)
- 15.2 min: dock 2
- 15.2 min: truck 1
- 30.2 min: contract 1
- 30.3 min: dock 3
- 30.3 min: truck 2
- 45.3 min: contract 2
- 45.3 min: truck 3
- 60.3 min: contract 3
- 60.3 min: truck 4
- 75.3 min: contract 4
- 75.4 min: dock 4
- 90.4 min: dock 5
- 90.4 min: dock 6
- 90.5 min: truck 5
- 105.5 min: contract 5
- 105.5 min: truck 6
- 105.5 min: star on offer
- 120.5 min: contract 6
- 135.5 min: truck 7
- 150.6 min: sold (3 stars)
- 150.6 min: sale 1
- 165.6 min: truck 1
- 165.6 min: contract 1
- 180.7 min: dock 3
- 180.7 min: truck 2
- 180.7 min: contract 2
- 180.7 min: truck 3
- 195.7 min: contract 3
- 195.7 min: truck 4
- 210.7 min: contract 4
- 210.8 min: dock 4
- 210.8 min: dock 5
- 210.8 min: dock 6
- 225.8 min: truck 5
- 225.9 min: contract 5
- 225.9 min: dock 7

## Active over idle income (2 minutes of tapping from the greedy bot's warehouse at each minute; no boosts, with boosts)
- minute 2: 2.42x, 2.42x
- minute 10: 2.92x, 2.62x
- minute 30: 2.60x, 2.63x
- minute 60: 2.12x, 2.77x

Overall: PASS
