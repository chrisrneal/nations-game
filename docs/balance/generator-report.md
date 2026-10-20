# Generator report

| Kind | Days | Passed | Seeds skipped (mean, worst) | ms a day (median, 99th) | Kids a day | Tray | Decoys |
|---|---|---|---|---|---|---|---|
| main daily | 1000 | 1000 | 0.8, 8 | 17.8, 68.7 | 15.5 | 5.2 | 1.7 |
| main bonus | 1000 | 1000 | 2.3, 23 | 16.6, 54.1 | 20.0 | 6.2 | 1.6 |
| kindy daily | 1000 | 1000 | 1.1, 10 | 1.4, 4.0 | 5.0 | 1.8 | 0.0 |

Difficulty by wave (mean friends in the solver’s setup plus relational clues):

- main daily: 1.0 · 1.0 · 1.4 · 2.3 · 2.3 · 3.1 · 4.3 · 4.4 · 4.5 · 4.5
- main bonus: 3.4 · 3.4 · 3.5 · 4.5 · 4.6 · 4.6 · 4.8 · 5.8 · 5.9 · 5.9
- kindy daily: 1.0 · 1.0 · 1.5 · 1.5 · 1.5

## Does the tray give the answer away? (K9)

A wave gives it away when the friends you own at its start (the tray plus what the stored solution bought earlier) are exactly the ones its solution places: nothing is spare, so “use everything” is the answer. A day’s tray gives it away when every friend in it is placed by the solution on some wave: it holds nothing but the answer’s pieces. Kindy’s friends are given (D15) and keep no decoys.

| Kind | Waves giving it away | Days whose tray is only the answer | Decoys a day (mean, fewest) |
|---|---|---|---|
| main daily | 0 of 10000 (0.0%) | 0 of 1000 (0.0%) | 1.7, 1 |
| main bonus | 0 of 10000 (0.0%) | 0 of 1000 (0.0%) | 1.6, 1 |
| kindy daily | 2471 of 5000 (49.4%) | 1000 of 1000 (100.0%) | 0.0, 0 |

## The bonus round’s ramp (K9)

- Planned (`bonusFriendsFirst` 3 to `bonusFriendsLast` 5): the two kids’ shortest routes add up to 3 · 3 · 3 · 4 · 4 · 4 · 4 · 5 · 5 · 5 friends.
- Measured, main daily: 1.0 · 1.0 · 1.4 · 2.3 · 2.3 · 3.1 · 4.3 · 4.4 · 4.5 · 4.5

```
main daily  wave  1 ███████                        1.0
main daily  wave  2 ███████                        1.0
main daily  wave  3 ██████████                     1.4
main daily  wave  4 ███████████████                2.3
main daily  wave  5 ███████████████                2.3
main daily  wave  6 █████████████████████          3.1
main daily  wave  7 █████████████████████████████  4.3
main daily  wave  8 █████████████████████████████  4.4
main daily  wave  9 ██████████████████████████████ 4.5
main daily  wave 10 ██████████████████████████████ 4.5
```

- Measured, main bonus: 3.4 · 3.4 · 3.5 · 4.5 · 4.6 · 4.6 · 4.8 · 5.8 · 5.9 · 5.9

```
main bonus  wave  1 █████████████████              3.4
main bonus  wave  2 █████████████████              3.4
main bonus  wave  3 ██████████████████             3.5
main bonus  wave  4 ███████████████████████        4.5
main bonus  wave  5 ███████████████████████        4.6
main bonus  wave  6 ████████████████████████       4.6
main bonus  wave  7 ████████████████████████       4.8
main bonus  wave  8 █████████████████████████████  5.8
main bonus  wave  9 ██████████████████████████████ 5.9
main bonus  wave 10 ██████████████████████████████ 5.9
```

## Targets

| Target | Measured | Met |
|---|---|---|
| main daily: no wave where the tray gives the answer away (0%) | 0 of 10000 waves, 0.0% | yes |
| main daily: no day whose tray is only the answer (0%) | 0 of 1000 days, 0.0% | yes |
| main bonus: no wave where the tray gives the answer away (0%) | 0 of 10000 waves, 0.0% | yes |
| main bonus: no day whose tray is only the answer (0%) | 0 of 1000 days, 0.0% | yes |
| bonus: the last three waves at least 1.5 harder than the first three (not flat) | 3.4 → 5.9 | yes |
| bonus: wave 10 harder than the daily’s wave 10 | 5.9 against 4.5 | yes |

## Difficulty sanity, wave by wave (K9)

From each day’s stored solution: kids arriving, friends it places, clue-logic steps (one per fact on a card; a card pointing at another kid adds that kid’s facts), the pass chain each fed snack travels (friends from the picker to the kid), the friends owned but left spare, and the share of days where that wave places every friend owned.

### main daily (1000 days)

| Wave | Kids | Friends needed | Clue steps | Pass chain (mean, longest) | Spare friends | Tray tells |
|---|---|---|---|---|---|---|
| 1 | 1.0 | 1.0 | 1.0 | 1.0, 1 | 4.2 | 0.0% |
| 2 | 1.0 | 1.0 | 1.0 | 1.0, 1 | 4.4 | 0.0% |
| 3 | 1.0 | 1.4 | 1.0 | 1.4, 3 | 4.4 | 0.0% |
| 4 | 1.5 | 2.1 | 1.9 | 1.4, 3 | 4.2 | 0.0% |
| 5 | 1.5 | 2.1 | 2.4 | 1.4, 3 | 4.7 | 0.0% |
| 6 | 1.5 | 3.0 | 2.4 | 2.0, 3 | 4.4 | 0.0% |
| 7 | 2.0 | 4.0 | 3.4 | 2.0, 3 | 4.1 | 0.0% |
| 8 | 2.0 | 4.0 | 3.4 | 2.0, 3 | 4.7 | 0.0% |
| 9 | 2.0 | 4.1 | 3.4 | 2.1, 3 | 5.1 | 0.0% |
| 10 | 2.0 | 4.1 | 3.3 | 2.1, 3 | 5.4 | 0.0% |

Decoys (starting-tray friends the solution never places): 1.7 a day, fewest 1.

### main bonus (1000 days)

| Wave | Kids | Friends needed | Clue steps | Pass chain (mean, longest) | Spare friends | Tray tells |
|---|---|---|---|---|---|---|
| 1 | 2.0 | 3.0 | 2.6 | 1.5, 3 | 3.2 | 0.0% |
| 2 | 2.0 | 3.1 | 2.7 | 1.5, 3 | 4.0 | 0.0% |
| 3 | 2.0 | 3.1 | 2.8 | 1.5, 3 | 4.7 | 0.0% |
| 4 | 2.0 | 4.1 | 2.9 | 2.0, 3 | 4.5 | 0.0% |
| 5 | 2.0 | 4.0 | 3.7 | 2.0, 3 | 5.1 | 0.0% |
| 6 | 2.0 | 4.0 | 3.9 | 2.0, 3 | 5.5 | 0.0% |
| 7 | 2.0 | 4.1 | 4.1 | 2.0, 3 | 5.8 | 0.0% |
| 8 | 2.0 | 5.0 | 4.2 | 2.5, 3 | 5.2 | 0.0% |
| 9 | 2.0 | 5.1 | 4.3 | 2.5, 3 | 5.6 | 0.0% |
| 10 | 2.0 | 5.1 | 4.4 | 2.5, 3 | 5.8 | 0.0% |

Decoys (starting-tray friends the solution never places): 1.6 a day, fewest 1.

### kindy daily (1000 days)

| Wave | Kids | Friends needed | Clue steps | Pass chain (mean, longest) | Spare friends | Tray tells |
|---|---|---|---|---|---|---|
| 1 | 1.0 | 1.0 | 0.0 | 1.0, 1 | 0.8 | 18.0% |
| 2 | 1.0 | 1.0 | 0.0 | 1.0, 1 | 0.8 | 18.0% |
| 3 | 1.0 | 1.5 | 0.0 | 1.5, 2 | 0.3 | 70.8% |
| 4 | 1.0 | 1.5 | 0.0 | 1.5, 2 | 0.3 | 70.2% |
| 5 | 1.0 | 1.5 | 0.0 | 1.5, 2 | 0.3 | 70.1% |

Decoys (starting-tray friends the solution never places): 0.0 a day, fewest 0.

Every day passed every check.
