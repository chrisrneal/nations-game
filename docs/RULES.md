# Rules: Airport Idle

The game-rules spec. Every number here is a tunable in
`packages/sim/src/tunables.ts` with the band in section 12; a test keeps the two
in step. Formulas are written in plain units (seconds, passengers, dollars) and
the code runs them in integer units (section 2).

## 1. The game in one paragraph

You run a small airport. Passengers arrive in the terminal and wait. Each gate
holds one plane; passengers board it at the gate's boarding rate. When the plane
is full, or its departure timer runs out, it leaves and pays its fare for every
passenger on board, with a bonus if it left full. The gate then turns around and
a new plane taxis in. You spend cash on upgrades, each of which fixes one
bottleneck and usually moves the pressure somewhere else. The airport keeps
running while the app is closed, up to a cap. When the airport has earned enough
you can sell it for **slots**, which permanently raise your income, and start
again in a new city with its own twist.

Tapping a gate gives it a short **rush**. Playing actively earns about 2-3x what
idling earns; it is never required.

## 2. Time and units

- One tick is `tickMs` = 250 ms of wall clock: 4 ticks a second. The sim counts
  ticks and never reads a clock; the host decides when ticks happen (S4).
- Money is integer **cents**. The interface shows dollars (`$1.2K`, `$3.4M`).
- Passengers in the terminal and on a plane are integer **milli-passengers**
  (1 passenger = 1000), so slow rates accumulate exactly. A plane pays for whole
  passengers only.
- Rates are per tick in the code. This document quotes them per second.
- Growth is in basis points (10000 = x1.0). "Grows by g per level" means
  `value(n) = floor(value(n-1) x g / 10000)`, applied n times from the base, so
  every machine computes the same integers.
- Cash never exceeds `cashCapCents` (the vault is full); nothing in normal play
  gets near it.

## 3. The terminal

- Passengers arrive at `A = arrivalBase x arrivalGrowth^terminalLevel` per second
  (1.6/s at level 0, +35% a level).
- At most `W = terminalCapBase x terminalCapGrowth^terminalLevel` passengers wait
  (40 at level 0). Arrivals beyond that are **missed**: they rebook elsewhere and
  are counted for the recap.
- A new airport opens with `startingWaiting` passengers already in the terminal.

## 4. Gates and planes

- An airport has `1 + gateLevel` gates, at most `maxGates`.
- Each gate is in one of two phases: **boarding** (a plane is at the gate) or
  **turnaround** (the gate is being cleared and the next plane is taxiing in).
- A plane arriving at a gate takes the current plane size: `seats =
  planeSeatsBase x planeSeatsGrowth^planeLevel` (10 seats, +50% a level). Buying
  a bigger plane changes the next plane to arrive at each gate, not the ones
  already boarding.
- Its departure timer is `departBase + departPerSeat x seats` (15 s for 10
  seats; bigger planes wait longer).
- Each arriving plane is a **charter** with chance `charterChance` (5%), drawn
  from the seeded RNG in State. A charter pays `charterFare` (2x) its fares.
- Plane sizes have names (Puddle Jumper, Commuter, Regional Jet, ...) and so do
  routes; the names are design data in the sim, shown by the interface.

## 5. Boarding and departures

Every tick, in this order:

1. Arrivals join the terminal, capped at `W`; the excess is missed.
2. Gates are visited in a rotating order that starts at `tick mod gates`, so no
   gate is always first in line. A boarding gate moves `min(rate, seats left,
   waiting)` passengers from the terminal onto its plane, where `rate =
   boardBase x boardGrowth^boardingLevel` per second (2/s at level 0, +25% a
   level). A rushed gate boards faster (section 6).
3. A plane departs when it is full, or when its timer reaches zero with at least
   one passenger on board. (An empty plane waits for its first passenger; its
   timer stays at zero.)
4. It pays `pax x fare x multipliers`, where `fare = fareBase x
   fareGrowth^routeLevel` ($1.00 at level 0, +60% a level), and the
   multipliers are, all in basis points and applied in this order: full flight
   `+fullBonus` (+25%), charter x`charterFare`, city fare twist, and slots
   `+slotBonus` per slot (+10% each). Each is floored to whole cents.
5. The gate starts turnaround: `turn = (turnBase + seats / turnSeatsPerSecond) x
   crewTurn^crewLevel`, never below `turnMin` (4.5 s for 10 seats, -12% per crew
   level, at least 1 s). When it ends, a new plane arrives.

The trade-off between plane size and fill rate lives here: a bigger plane spends
fewer of its seconds in turnaround per passenger, but if passengers or boarding
cannot fill it before its timer runs out it leaves without the full-flight bonus.

## 6. Tapping: the rush

- Tapping a gate adds `rushPerTap` (2.5 s) of rush to it, up to `rushMax` (5 s).
- A rushed gate boards at `rushBoard` (3x) its rate. Passengers come from the
  terminal first; when the terminal is empty a rush also boards **walk-ups**
  from the check-in hall, up to the same rate. A rushed gate in turnaround runs
  its turnaround `rushTurn` (3x) as fast.
- So a rush helps whatever the bottleneck is: boarding, passengers or
  turnaround. Tapping every gate as its rush runs out earns about 2-3x idle
  income (section 11); not tapping at all is a complete, slower game.

## 7. Upgrades

Bought with cash, one level at a time, applied at the next tick. Cost of the
next level: `cost(n) = base x growth^n`, where n is the level owned now. Each
upgrade fixes one bottleneck and none is strictly better than the others:

| Upgrade | Effect per level | The catch | Base | Growth | Max level |
| --- | --- | --- | --- | --- | --- |
| More gates | +1 gate | gates share the same passengers: with a small terminal, more gates means emptier planes and lost full-flight bonuses | $100 | x5.0 | 7 |
| Bigger planes | +50% seats on the next plane at each gate | slower to fill, longer timer, longer turnaround; leaves without the bonus if it cannot fill in time | $100 | x4.5 | 9 |
| Faster boarding | +25% boarding rate (jet bridges, more agents) | only pays while passengers are waiting | $10 | x1.9 | 40 |
| Bigger terminal | +35% arrivals and +35% waiting room | only pays while the gates can board them | $30 | x2.0 | 40 |
| Better routes | +60% fare per passenger | route level n needs plane level n or more | $250 | x5.5 | 9 |
| Ground crew | -12% turnaround | worth most with small planes that fill fast | $60 | x2.2 | 20 |
| Night shift | doubles how long the airport runs while you are away (2 h, 4 h, 8 h, 16 h, 24 h) | earns nothing while you are playing | $500 | x10 | 4 |

The interface shows, for each upgrade, the effect now and after buying, the
catch in one line, and the cost. The bottleneck (section 8) tells the player
which upgrade the airport is waiting for.

## 8. Income estimate and the bottleneck

The top of the screen shows income per second. It is a steady-state estimate
from the current levels, not a running average, so it moves the moment an
upgrade is bought:

- One gate's cycle is `fill + turn`, where `fill = min(seats / rate, timer)`.
- Gate capacity `G = gates x min(seats, rate x timer) / cycle` passengers a
  second.
- If arrivals `A >= G` the gates are the bottleneck: throughput is `G`, and
  flights leave full when `seats / rate <= timer`.
- Otherwise passengers are the bottleneck: throughput is `A`, and flights leave
  full when the arrivals shared between gates fill a plane before its timer:
  `seats x gates / A - turn <= timer`.
- Income = throughput x fare x multipliers (the full-flight bonus only if flights
  leave full; charters at their expected 5%).

The bottleneck is named on screen in one line, with the upgrade that fixes it:

| Case | Says | Points to |
| --- | --- | --- |
| A < G | Planes are waiting for passengers | Bigger terminal |
| A >= G, fill is most of the cycle | Passengers are queuing at the gates | Faster boarding, or more gates |
| A >= G, turnaround is most of the cycle | Gates are busy turning planes around | Ground crew, or bigger planes |
| Flights leave not full | Planes leave before they fill | Bigger terminal or faster boarding |

The harness checks the estimate against measured idle income (within 20%).

## 9. Away: offline earnings and the recap

- Closing the app does not stop the airport. When it reopens, the host steps
  every tick the wall clock owes, up to the **offline cap**: `offlineBase x
  offlineGrowth^nightShiftLevel` minutes, at most `offlineMax` (2 h at level 0,
  24 h at most). Time beyond the cap is lost: the airport closed for the night.
- Catch-up is the same sim stepping the same ticks, only faster; the result is
  exactly what stepping one tick at a time would give (tested).
- After an absence of at least `recapMinAway` seconds (host setting, 60 s), a
  recap of three lines shows once:
  1. how long you were away, and whether the cap cut it short;
  2. cash earned, flights flown and how many left full;
  3. what happened: charters landed, passengers missed, and the bottleneck that
     cost the most, as a hint.

## 10. Selling the airport: slots and cities

- An airport is worth `slots = floor(sqrt(earnedThisAirport / slotUnit))` slots
  ($10K earned is 1 slot, $40K is 2, $1M is 10).
- Selling (one tap, then confirm) adds those slots to the slots you own, and
  opens a new airport in the next city: cash, levels, planes and the terminal all
  reset; slots and lifetime statistics stay.
- Each slot owned raises every fare by `slotBonus` (+10%), forever.
- Cities come in a fixed order, each with one twist, and repeat after the last:

| # | City | Twist |
| --- | --- | --- |
| 1 | Millbrook | None: a quiet regional field to learn on. |
| 2 | Port Calder | Short runway: planes stop at size `shortRunwayMaxPlane` (level 5), so routes stop there too, but every fare is +`shortRunwayFare` (+50%). Gates and terminal carry the rest. |
| 3 | Highmoor Hub | Hub: every full flight sends `hubTransfer` (20%) of its seats back into the terminal as connecting passengers. Full flights feed themselves. |
| 4 | Sunvale | Holiday waves: for `waveTicks` (60 s) of every `wavePeriod` (5 min) arrivals run at `waveArrival` (3x), and at `offWaveArrival` (0.6x) otherwise. A big terminal stores the wave. |

The first sale is meant for about 30-60 minutes into the game (section 11).

## 11. Pacing targets

Measured by the harness bots (`npm run harness -- pacing`), with a greedy bot
that taps and buys the best value upgrade, and an idle bot that never taps and
checks in every 15 minutes:

- First upgrade within 10 s.
- First new gate within 2 minutes.
- Something new to aim for at least every 5 minutes: a new gate, plane, route,
  a city, or the first sale.
- First sale at roughly 30-60 minutes for the greedy bot.
- Active income is about 2-3x idle income at the same levels.
- A 30-second check-in collects the away earnings and buys at least one upgrade;
  a 5-minute session can afford the next big unlock it was aiming at.

## 12. Tunables

`value`, `min`, `max` are integers in code units. The test
`packages/harness/src/rules.test.ts` fails if this table and `tunables.ts`
disagree.

| Tunable | Value | Min | Max | Unit and why |
| --- | --- | --- | --- | --- |
| `tickMs` | 250 | 100 | 1000 | Wall ms per tick. Short enough that a tap feels immediate, long enough that 24 h of catch-up is 345,600 cheap steps. |
| `maxCommandsPerTick` | 16 | 4 | 64 | Engine limit: commands one tick accepts. A frantic thumb taps 10 times a second at most. |
| `cashCapCents` | 9000000000000000 | 9000000000000000 | 9000000000000000 | Engine limit: the safe-integer ceiling. The vault is full. |
| `startingCashCents` | 0 | 0 | 10000 | Cash a new airport opens with. |
| `startingWaiting` | 10 | 0 | 40 | Passengers waiting at opening, so the first plane fills at once. |
| `arrivalBaseMilliPerTick` | 400 | 200 | 1000 | Milli-passengers a tick at terminal level 0 (1.6 a second). |
| `arrivalGrowthBp` | 13500 | 12000 | 15000 | Arrivals per terminal level (+35%). |
| `terminalCapBase` | 40 | 20 | 100 | Passengers who can wait at terminal level 0. |
| `terminalCapGrowthBp` | 13500 | 12000 | 15000 | Waiting room per terminal level; matches arrivals so the room holds the same seconds of arrivals. |
| `maxGates` | 8 | 4 | 12 | Most gates: 8 fit a phone screen in two columns. |
| `planeSeatsBase` | 10 | 6 | 20 | Seats at plane level 0. |
| `planeSeatsGrowthBp` | 15000 | 13000 | 18000 | Seats per plane level (+50%). |
| `maxPlaneLevel` | 9 | 5 | 12 | Biggest plane size (366 seats). |
| `departBaseTicks` | 40 | 20 | 120 | Departure timer before seats are added (10 s). |
| `departTicksPerSeat` | 2 | 1 | 4 | Extra departure timer per seat (0.5 s). |
| `boardBaseMilliPerTick` | 500 | 250 | 1000 | Boarding rate per gate at level 0 (2 passengers a second). |
| `boardGrowthBp` | 12500 | 11000 | 14000 | Boarding rate per boarding level (+25%). |
| `turnBaseTicks` | 16 | 8 | 40 | Turnaround before seats are added (4 s). |
| `turnSeatsPerTick` | 5 | 2 | 20 | Seats cleared per tick of extra turnaround (0.05 s a seat). |
| `crewTurnBp` | 8800 | 8000 | 9500 | Turnaround per crew level (-12%). |
| `turnMinTicks` | 4 | 1 | 8 | Shortest turnaround (1 s). |
| `fareBaseCents` | 100 | 50 | 500 | Fare per passenger at route level 0 ($1). |
| `fareGrowthBp` | 16000 | 13000 | 20000 | Fare per route level (+60%). |
| `fullBonusBp` | 2500 | 0 | 5000 | Extra fare on a flight that leaves full (+25%). The reward for filling, and the cost of a too-big plane. |
| `charterChanceBp` | 500 | 0 | 2000 | Chance an arriving plane is a charter (5%). |
| `charterFareBp` | 20000 | 10000 | 40000 | A charter's fare multiplier (2x). |
| `rushTicksPerTap` | 10 | 4 | 20 | Rush added by one tap (2.5 s). |
| `rushMaxTicks` | 20 | 8 | 40 | Most rush a gate can bank (5 s), so tapping ahead does not pay. |
| `rushBoardBp` | 30000 | 15000 | 50000 | Boarding speed while rushed (3x). |
| `rushTurnSpeed` | 3 | 1 | 5 | Turnaround ticks cleared per tick while rushed. |
| `gatesCostBase` | 10000 | 5000 | 50000 | Cents for the second gate ($100). |
| `gatesCostGrowthBp` | 50000 | 30000 | 80000 | Gate cost growth (x5). |
| `planeCostBase` | 10000 | 5000 | 50000 | Cents for plane level 1 ($100). |
| `planeCostGrowthBp` | 45000 | 30000 | 70000 | Plane cost growth (x4.5). |
| `boardCostBase` | 1000 | 500 | 5000 | Cents for boarding level 1 ($10): the first upgrade, affordable after the first flight. |
| `boardCostGrowthBp` | 19000 | 15000 | 25000 | Boarding cost growth (x1.9). |
| `terminalCostBase` | 3000 | 1000 | 10000 | Cents for terminal level 1 ($30). |
| `terminalCostGrowthBp` | 20000 | 15000 | 25000 | Terminal cost growth (x2.0). |
| `routeCostBase` | 25000 | 10000 | 100000 | Cents for route level 1 ($250). |
| `routeCostGrowthBp` | 55000 | 35000 | 80000 | Route cost growth (x5.5). |
| `crewCostBase` | 6000 | 2000 | 20000 | Cents for crew level 1 ($60). |
| `crewCostGrowthBp` | 22000 | 15000 | 30000 | Crew cost growth (x2.2). |
| `nightCostBase` | 50000 | 10000 | 200000 | Cents for night shift level 1 ($500). |
| `nightCostGrowthBp` | 100000 | 50000 | 200000 | Night shift cost growth (x10). |
| `maxBoardLevel` | 40 | 20 | 60 | Boarding levels. |
| `maxTerminalLevel` | 40 | 20 | 60 | Terminal levels. |
| `maxCrewLevel` | 20 | 10 | 30 | Crew levels; turnaround hits its floor first. |
| `maxNightLevel` | 4 | 2 | 6 | Night shift levels. |
| `offlineBaseMinutes` | 120 | 30 | 240 | Offline cap with no night shift (2 h). |
| `offlineGrowthBp` | 20000 | 15000 | 30000 | Offline cap per night shift level (x2). |
| `offlineMaxMinutes` | 1440 | 480 | 2880 | Longest offline run (24 h). |
| `slotUnitCents` | 1000000 | 100000 | 10000000 | Earnings for the first slot ($10K); n slots need n squared times this. |
| `slotBonusBp` | 1000 | 500 | 2500 | Fare per slot owned (+10%). |
| `shortRunwayMaxPlane` | 5 | 3 | 7 | Port Calder's biggest plane level. |
| `shortRunwayFareBp` | 15000 | 11000 | 20000 | Port Calder's fare multiplier (1.5x). |
| `hubTransferBp` | 2000 | 500 | 4000 | Highmoor Hub: share of a full flight's seats that come back as connecting passengers. |
| `wavePeriodTicks` | 1200 | 480 | 2400 | Sunvale: one wave cycle (5 min). |
| `waveTicks` | 240 | 60 | 600 | Sunvale: length of a wave (60 s). |
| `waveArrivalBp` | 30000 | 15000 | 50000 | Sunvale: arrivals during a wave (3x). |
| `offWaveArrivalBp` | 6000 | 3000 | 10000 | Sunvale: arrivals between waves (0.6x). |

## 13. Invariants

Checked by property tests on every build:

- Cash, waiting passengers and every plane's load are never negative; a plane
  never holds more than its seats; the terminal never holds more than `W`.
- The same seed and the same commands always give the same state hash, in Node
  and in Chromium.
- Catching up N ticks at once gives exactly the state that stepping N single
  ticks gives.
- A save reloads to the same state hash and continues identically.
- Cash only changes by fares (up) and purchases (down); a purchase never makes
  cash negative.
