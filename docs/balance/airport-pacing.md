# Airport pacing report (seed 1)

| Check | Result | Target | |
| --- | --- | --- | --- |
| First upgrade | 3.0 s | <= 10 s | PASS |
| First new gate (greedy) | 29.0 s | <= 2 min | PASS |
| Longest wait for something new before the first sale (greedy) | 4.4 min | <= 5 min | PASS |
| First sale (greedy) | 34.4 min, 3 slots | 30-60 min | PASS |
| First sale (idle, 15-minute check-ins) | 135.5 min, 3 slots | reported | PASS |
| First sale without boosts (greedy; idle) | 37.1 min; 150.5 min | reported | PASS |
| Active over idle income (tapping, at the no-boost greedy levels) | 2.49-2.56x | about 2-3x (1.8-3.2) | PASS |
| Active over idle income (tapping, at the boosted greedy levels) | 2.29-2.86x | reported | PASS |
| Check-ins that buy something (idle, every 15 min) | 100% | >= 90% | PASS |
| A 5-minute active session reaches a new gate, plane or route (from each idle check-in) | 9/9 | >= 80% | PASS |
| Income estimate vs measured idle | +0%, -1%, -1%, +2% | within 20% | PASS |

## Greedy bot: what it reached and when
- 0.5 min: gate 2
- 2.8 min: plane 1
- 3.7 min: route 1
- 3.8 min: gate 3
- 4.3 min: plane 2
- 7.0 min: route 2
- 7.3 min: gate 4
- 8.1 min: plane 3
- 9.9 min: route 3
- 10.7 min: plane 4
- 13.7 min: route 4
- 15.9 min: gate 5
- 17.1 min: gate 6
- 18.6 min: plane 5
- 20.0 min: route 5
- 20.4 min: slot on offer
- 22.1 min: plane 6
- 26.3 min: route 6
- 30.7 min: gate 7
- 31.8 min: plane 7
- 34.4 min: sold (3 slots)
- 34.4 min: sale 1
- 35.4 min: gate 2
- 35.8 min: plane 1
- 36.1 min: route 1
- 37.0 min: gate 3
- 37.1 min: plane 2
- 37.6 min: route 2
- 37.7 min: gate 4
- 38.0 min: plane 3
- 38.8 min: route 3
- 40.3 min: plane 4
- 41.4 min: route 4
- 41.6 min: gate 5
- 42.1 min: gate 6
- 42.7 min: plane 5
- 43.6 min: route 5
- 46.4 min: gate 7
- 47.9 min: gate 8
- 53.8 min: sold (4 slots)
- 53.8 min: sale 2
- 54.7 min: gate 2
- 55.1 min: plane 1
- 55.5 min: route 1
- 56.1 min: gate 3
- 56.2 min: plane 2
- 56.5 min: route 2
- 56.7 min: gate 4
- 57.0 min: plane 3
- 59.3 min: route 3
- 59.6 min: plane 4
- 60.6 min: route 4
- 60.6 min: gate 5
- 61.4 min: plane 5
- 61.5 min: gate 6
- 64.5 min: route 5
- 65.2 min: plane 6
- 66.5 min: route 6
- 67.0 min: gate 7
- 67.9 min: plane 7
- 70.0 min: route 7
- 70.1 min: gate 8
- 70.8 min: plane 8
- 72.7 min: route 8
- 75.9 min: plane 9
- 79.6 min: route 9

Ended at Highmoor Hub with 7 slots, levels {"gates":7,"plane":9,"boarding":25,"terminal":22,"security":16,"route":9,"crew":18,"night":4}.

## Idle bot (no taps, a check-in every 15 minutes)
- 15.2 min: gate 2
- 15.2 min: plane 1
- 30.2 min: route 1
- 30.2 min: gate 3
- 30.3 min: plane 2
- 45.3 min: route 2
- 45.3 min: gate 4
- 45.3 min: plane 3
- 60.3 min: route 3
- 60.3 min: plane 4
- 75.3 min: route 4
- 75.4 min: gate 5
- 90.4 min: gate 6
- 90.4 min: plane 5
- 90.4 min: route 5
- 90.4 min: slot on offer
- 105.4 min: plane 6
- 105.4 min: route 6
- 120.5 min: gate 7
- 120.5 min: plane 7
- 135.5 min: sold (3 slots)
- 135.5 min: sale 1
- 150.5 min: gate 2
- 150.6 min: plane 1
- 150.6 min: route 1
- 165.6 min: gate 3
- 165.6 min: plane 2
- 165.6 min: route 2
- 165.6 min: gate 4
- 165.6 min: plane 3
- 180.7 min: route 3
- 180.7 min: plane 4
- 180.7 min: route 4
- 195.7 min: gate 5
- 195.7 min: gate 6
- 195.7 min: plane 5
- 195.8 min: route 5
- 210.8 min: gate 7
- 210.8 min: gate 8

## Active over idle income (2 minutes of tapping from the greedy bot's airport at each minute; no boosts, with boosts)
- minute 2: 2.49x, 2.49x
- minute 10: 2.53x, 2.51x
- minute 30: 2.56x, 2.86x
- minute 60: 2.51x, 2.29x

Overall: PASS
