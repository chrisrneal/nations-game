# Airport pacing report (seed 1)

| Check | Result | Target | |
| --- | --- | --- | --- |
| First upgrade | 3.0 s | <= 10 s | PASS |
| First new gate (greedy) | 29.0 s | <= 2 min | PASS |
| Longest wait for something new before the first sale (greedy) | 4.5 min | <= 5 min | PASS |
| First sale (greedy) | 35.9 min, 3 slots | 30-60 min | PASS |
| First sale (idle, 15-minute check-ins) | 165.4 min, 3 slots | reported | PASS |
| Active over idle income | 2.54-2.70x | about 2-3x (1.8-3.2) | PASS |
| Check-ins that buy something (idle, every 15 min) | 100% | >= 90% | PASS |
| A 5-minute active session reaches a new gate, plane or route (from each idle check-in) | 11/11 | >= 80% | PASS |
| Income estimate vs measured idle | +1%, +0%, -2%, +0% | within 20% | PASS |

## Greedy bot: what it reached and when
- 0.5 min: gate 2
- 2.5 min: gate 3
- 3.4 min: plane 1
- 4.0 min: route 1
- 4.7 min: plane 2
- 7.6 min: route 2
- 7.9 min: gate 4
- 8.7 min: plane 3
- 10.5 min: route 3
- 10.9 min: gate 5
- 11.9 min: plane 4
- 16.4 min: route 4
- 18.1 min: plane 5
- 18.5 min: gate 6
- 21.9 min: route 5
- 22.4 min: slot on offer
- 22.8 min: gate 7
- 24.6 min: plane 6
- 29.0 min: route 6
- 32.7 min: plane 7
- 35.9 min: sold (3 slots)
- 35.9 min: sale 1
- 36.9 min: gate 2
- 37.4 min: gate 3
- 39.5 min: plane 1
- 39.7 min: route 1
- 40.0 min: plane 2
- 40.5 min: route 2
- 40.7 min: gate 4
- 41.0 min: plane 3
- 41.6 min: route 3
- 43.0 min: gate 5
- 43.4 min: plane 4
- 44.4 min: route 4
- 45.0 min: plane 5
- 45.1 min: gate 6
- 46.5 min: route 5
- 48.4 min: gate 7
- 51.0 min: gate 8
- 57.9 min: sold (4 slots)
- 57.9 min: sale 2
- 58.8 min: gate 2
- 59.2 min: gate 3
- 61.1 min: plane 1
- 61.4 min: route 1
- 61.7 min: plane 2
- 62.2 min: route 2
- 62.3 min: gate 4
- 62.5 min: plane 3
- 64.8 min: route 3
- 65.0 min: gate 5
- 65.3 min: plane 4
- 66.2 min: route 4
- 66.7 min: plane 5
- 66.8 min: gate 6
- 69.8 min: route 5
- 70.5 min: plane 6
- 71.8 min: route 6
- 71.9 min: gate 7
- 73.1 min: plane 7
- 75.2 min: route 7
- 75.3 min: gate 8
- 76.5 min: plane 8
- 79.0 min: route 8
- 81.8 min: plane 9
- 85.6 min: route 9

Ended at Highmoor Hub with 7 slots, levels {"gates":7,"plane":9,"boarding":23,"terminal":21,"route":9,"crew":17,"night":4}.

## Idle bot (no taps, a check-in every 15 minutes)
- 15.2 min: gate 2
- 15.2 min: gate 3
- 30.2 min: plane 1
- 30.2 min: route 1
- 30.2 min: plane 2
- 45.3 min: route 2
- 45.3 min: gate 4
- 45.3 min: plane 3
- 60.3 min: route 3
- 60.3 min: gate 5
- 75.3 min: plane 4
- 90.3 min: route 4
- 90.3 min: plane 5
- 90.3 min: gate 6
- 105.3 min: route 5
- 105.4 min: gate 7
- 105.4 min: slot on offer
- 120.4 min: plane 6
- 135.4 min: route 6
- 150.4 min: plane 7
- 165.4 min: sold (3 slots)
- 165.4 min: sale 1
- 180.4 min: gate 2
- 180.5 min: gate 3
- 195.5 min: plane 1
- 195.5 min: route 1
- 195.5 min: plane 2
- 195.5 min: route 2
- 195.5 min: gate 4
- 210.5 min: plane 3
- 210.5 min: route 3
- 210.6 min: gate 5
- 210.6 min: plane 4
- 225.6 min: route 4
- 225.6 min: plane 5
- 225.6 min: gate 6

## Active over idle income (2 minutes from the greedy bot's airport at each minute)
- minute 2: 2.57x
- minute 10: 2.61x
- minute 30: 2.70x
- minute 60: 2.54x

Overall: PASS
