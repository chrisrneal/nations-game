# Rules: Warehouse Idle

The game-rules spec. Every number here is a tunable in
`packages/sim/src/tunables.ts` with the band in section 12; a test keeps the two
in step. Formulas are written in plain units (seconds, orders, dollars) and
the code runs them in integer units (section 2). Decision record W1 explains
why the warehouse replaced the airport game; most rules carry over from it,
renamed.

## 1. The game in one paragraph

You run a warehouse. Customer **orders** come in and wait in the **backlog**
until a picker takes the item off the shelves; packed orders wait in
**packing** for a truck. Each **dock** holds one truck; loaders fill it at the
dock's loading rate. When the truck is full, or its departure timer runs out,
it leaves and pays for every order on board, with a bonus if it left full.
The dock then swaps in the next truck. Meanwhile **purchase orders (POs)**
arrive at the **receiving** dock, and receivers put their units away on the
**shelves**: every order picked takes one unit, so empty shelves stop the
pickers. You spend cash on upgrades, each of which fixes one bottleneck and
usually moves the pressure somewhere else. The warehouse keeps running while
the app is closed, up to a cap. When it has earned enough you can sell it for
**stars**, which permanently raise the pay per order, and start again at a new
site with its own twist.

Tapping a dock gives it a short **rush**; tapping picking sends extra pickers
and tapping receiving extra hands. Playing actively earns about 2-3x what
idling earns; it is never required. Three free **boosts** (section 15) each fix
one bottleneck for a minute, then recharge.

## 2. Time and units

- One tick is `tickMs` = 250 ms of wall clock: 4 ticks a second. The sim counts
  ticks and never reads a clock; the host decides when ticks happen (S4).
- Money is integer **cents**. The interface shows dollars (`$1.2K`, `$3.4M`).
- Orders and stock are integer **milli-units** (1 order = 1 unit of stock =
  1000), so slow rates accumulate exactly. A truck pays for whole orders only.
- Rates are per tick in the code. This document quotes them per second.
- Growth is in basis points (10000 = x1.0). "Grows by g per level" means
  `value(n) = floor(value(n-1) x g / 10000)`, applied n times from the base, so
  every machine computes the same integers.
- Cash never exceeds `cashCapCents` (the safe is full); nothing in normal play
  gets near it.

## 3. Orders: the backlog, picking and packing

Orders arrive, join the **backlog**, and the pickers pick them into
**packing**, where they wait for a dock. The backlog is the game's queue: it is
in State, it grows when picking falls behind, and it is what the middle of the
screen shows (section 14).

- Orders arrive at `A = orderBase x orderGrowth^salesLevel` per second (1.6/s
  at level 0, +35% a level, from the More sales upgrade) and join the backlog.
- Pickers pick `S = pickingBase x pickingGrowth^pickingLevel` per second
  (2.4/s at level 0, +50% a level, from More pickers), times `exportCheck`
  (x0.95) for each export station the contract adds: export paperwork from
  Cross-border (contract 5), customs checks from Overseas (contract 6). A
  tapped picking area, or All hands, sends extra pickers: `rushLoad` (2.5x) as
  fast (section 6).
- **Each order picked takes one unit of stock** off the shelves (section 3a).
  Picking takes `min(rate, backlog, stock, packing room)` a tick.
- Customers will not wait behind a backlog longer than `backlogWait` (30 s) of
  picking: the backlog holds at most `L = S x backlogWait` (the rate before
  extra pickers). Orders beyond that are **cancelled** (counted as missed for
  the recap).
- At most `W = stagingCapBase x stagingCapGrowth^salesLevel` packed orders wait
  in packing (40 at level 0). When it is full, picking stops and the backlog
  builds behind it.
- A new warehouse opens with `startingStaged` orders already packed and no
  backlog.

## 3a. Purchase orders and the shelves

- One PO at a time stands at the receiving dock. Receivers put its units away
  onto the shelves at `R = receiveBase x receiveGrowth^receivingLevel` per
  second (2.4/s at level 0, +50% a level, from the Receiving bay upgrade). A
  tapped receiving lane, or All hands, sends extra hands: `rushLoad` (2.5x).
- The shelves hold `shelfCapBase x shelfCapGrowth^receivingLevel` units (120
  at level 0, +50% a level). Full shelves hold the PO at the dock.
- A PO holds `ceil(R x poTicks)` units, `poTicks` (20 s) of put-away at the
  rate when it arrives (48 units at level 0). When its last unit is put away
  it counts as received and the next PO is at the dock at once, taking the
  rest of that tick's put-away. A bigger bay makes the next PO bigger, not the
  one being unloaded.
- POs are free: the stock belongs to your customers, and you are paid per
  order shipped. They are what keeps the pickers working.
- A new warehouse opens with `startingStock` units on the shelves (60) and PO 1
  at the dock. PO numbers keep counting across sites.

## 4. Docks and trucks

- A warehouse has `1 + docksLevel` docks, at most `maxDocks`.
- Each dock is in one of two phases: **loading** (a truck is at the dock) or
  **swapping** (the truck has left and the next one is backing in).
- A truck arriving at a dock takes the current truck size: `parcels =
  truckParcelsBase x truckParcelsGrowth^truckLevel` (10 parcels, +50% a level).
  One parcel is one order. Buying bigger trucks changes the next truck to
  arrive at each dock, not the ones already loading.
- Its departure timer is `departBase + departPerParcel x parcels` (15 s for 10
  parcels; bigger trucks wait longer).
- Each arriving truck is an **express** with chance `expressChance` (5%), drawn
  from the seeded RNG in State (10% with the Express lane perk, section 10a).
  An express pays `expressPay` (2x).
- Truck models (Cargo bike, Courier van, Panel van, ...) and contracts have
  names; the names are design data in the sim, shown by the interface.

## 5. Loading and departures

Every tick, in this order:

1. New orders join the backlog (x3 during Flash sale, section 15), capped at
   `L`; the excess is cancelled. Receiving then puts away `min(R, PO left,
   shelf room)` (section 3a), and picking moves `min(S, backlog, stock,
   packing room)` from the head of the backlog into packing (section 3).
2. Docks are visited in a rotating order that starts at `tick mod docks`, so
   no dock is always first in line. A loading dock moves `min(rate, parcels
   left, packed)` orders onto its truck, where `rate = loadBase x
   loadGrowth^loadingLevel` per second (2/s at level 0, +25% a level). A
   rushed dock loads faster (section 6).
3. A truck departs when it is full, or when its timer reaches zero with at
   least one order on board. (An empty truck waits for its first order; its
   timer stays at zero.)
4. It pays `orders x pay x multipliers`, where `pay = payBase x
   payGrowth^contractLevel` ($1.00 at level 0, +60% a level), and the
   multipliers are, all in basis points and applied in this order: full truck
   `+fullBonus` (+25%), express x`expressPay`, site pay twist, stars
   `+starBonus` per star (+25% each), and Peak rates x`surgePay` while it runs
   (section 15). Each is floored to whole cents.
5. The dock starts its swap: `swap = (turnBase + parcels / turnParcelsPerSecond)
   x crewTurn^crewLevel`, never below `turnMin` (4.5 s for 10 parcels, -12% per
   yard crew level, at least 1 s). When it ends, a new truck arrives.

The trade-off between truck size and fill rate lives here: a bigger truck
spends fewer of its seconds swapping per order, but if orders or loading
cannot fill it before its timer runs out it leaves without the full-truck
bonus.

## 6. Tapping: the rush

- Tapping a dock adds `rushPerTap` (2.5 s) of rush to it, up to `rushMax` (5 s).
- A rushed dock loads at `rushLoad` (2.5x) its rate. Orders come from packing
  first; when packing is empty a rush also loads **counter orders** (local
  trade customers collecting at the dock), up to the same rate. A rushed dock
  that is swapping runs its swap `rushTurn` (3x) as fast.
- A dock is also rushed, with no taps, while the All hands boost runs
  (section 15); taps bank rush as usual meanwhile.
- Tapping picking sends extra pickers, and tapping receiving extra hands: the
  same `rushPerTap` and `rushMax`, and that station works `rushLoad` (2.5x) as
  fast while it lasts. All hands sends both.
- So a rush helps whatever the bottleneck is: loading, orders, picking, stock
  or swaps. Tapping every station as its rush runs out earns about 2-3x idle
  income (section 11); not tapping at all is a complete, slower game.

## 7. Upgrades

Bought with cash, one level at a time, applied at the next tick. Cost of the
next level: `cost(n) = base x growth^n`, where n is the level owned now. Each
upgrade fixes one bottleneck and none is strictly better than the others:

| Upgrade | Effect per level | The catch | Base | Growth | Max level |
| --- | --- | --- | --- | --- | --- |
| More docks | +1 dock | docks share the same orders: with few sales, more docks means emptier trucks and lost full-truck bonuses | $100 | x4.0 | 7 |
| Bigger trucks | +50% parcels on the next truck at each dock | slower to fill, longer timer, longer swap; leaves without the bonus if it cannot fill in time | $300 | x3.5 | 9 |
| Faster loading | +25% loading rate (forklifts, loaders) | only pays while packed orders are waiting | $10 | x1.9 | 40 |
| More sales | +35% orders and +35% packing space | only pays while picking, stock and the docks keep up: more orders make the backlog longer | $30 | x2.0 | 40 |
| More pickers | +50% picking speed, and so +50% backlog customers will wait behind | only pays while orders are queuing | $25 | x1.8 | 40 |
| Receiving bay | +50% put-away, +50% shelf space, +50% PO size | only pays while the shelves run low | $20 | x1.8 | 40 |
| Better contracts | +60% pay per order | contract level n needs truck level n or more; from Cross-border each new export station slows picking 5% | $750 | x4.0 | 9 |
| Yard crew | -12% swap time | worth most with small trucks that fill fast | $60 | x2.2 | 20 |
| Night shift | doubles how long the warehouse runs while you are away (2 h, 4 h, 8 h, 16 h, 24 h) | earns nothing while you are playing | $500 | x10 | 4 |

The interface shows, for each upgrade, the effect now and after buying, the
catch in one line, and the cost. The bottleneck (section 8) tells the player
which upgrade the warehouse is waiting for.

## 8. Income estimate and the bottleneck

The top of the screen shows income per second. It is a steady-state estimate
from the current levels, not a running average, so it moves the moment an
upgrade is bought:

- One dock's cycle is `fill + swap`, where `fill = min(parcels / rate, timer)`.
- Dock capacity `G = docks x min(parcels, rate x timer) / cycle` orders a
  second.
- Supply is what reaches packing: `min(A, S, R)` (sections 3, 3a).
- If supply `>= G` the docks are the bottleneck: throughput is `G`, and
  trucks leave full when `parcels / rate <= timer`.
- Otherwise supply is the bottleneck, held back by stock when `R <= S` and `R
  <= A`, by picking when `S <= A`: throughput is the supply, and trucks leave
  full when it, shared between docks, fills a truck before its timer:
  `parcels x docks / supply - swap <= timer`.
- Income = throughput x pay x multipliers (the full-truck bonus only if trucks
  leave full; expresses at their expected 5%). The dashboard's "Per min" is
  the same throughput.

The bottleneck is named on screen in one line, with the upgrade that fixes it:

| Case | Says | Points to |
| --- | --- | --- |
| A < G, A < S, A < R | Trucks are waiting for orders | More sales |
| S <= A, S < R, S < G | Orders are piling up at picking | More pickers |
| R <= A, R <= S, R < G | The shelves are running empty | Receiving bay |
| A >= G, fill is most of the cycle | Packed orders are queuing at the docks | Faster loading, or more docks |
| A >= G, the swap is most of the cycle | Docks are busy swapping trucks | Yard crew, or bigger trucks |
| Trucks leave not full (picking and stock not the limit) | Trucks leave before they fill | More sales or faster loading |

The harness checks the estimate against measured idle income (within 20%).

## 9. Away: offline earnings and the recap

- Closing the app does not stop the warehouse. When it reopens, the host steps
  every tick the wall clock owes, up to the **offline cap**: `offlineBase x
  offlineGrowth^nightShiftLevel` minutes, at most `offlineMax` (2 h at level 0,
  24 h at most; x1.5 with the Long shift perk, section 10a). Time beyond the
  cap is lost: the warehouse closed for the night.
- Catch-up is the same sim stepping the same ticks, only faster; the result is
  exactly what stepping one tick at a time would give (tested).
- After an absence of at least `recapMinAway` seconds (host setting, 60 s), a
  recap of three lines shows once:
  1. how long you were away, and whether the cap cut it short;
  2. cash earned, trucks sent and how many left full, POs taken in;
  3. what happened: express trucks, orders cancelled, and the bottleneck that
     cost the most, as a hint.
- A testing time skip in Settings (+5 min, +1 hour, +8 hours) runs the
  warehouse ahead at once, exactly as a catch-up does but with no cap, and
  shows the same recap. It is a host cheat for playtesting (the sim is
  unchanged); see docs/GAPS.md.

## 10. Selling the warehouse: stars and sites

- A warehouse is worth `stars = floor(sqrt(earnedThisWarehouse / starUnit))`
  stars ($600K earned is 1 star, $2.4M is 2, $5.4M is 3, $60M is 10).
- Selling (one tap, then confirm) adds those stars to the stars you own, and
  opens a new warehouse at the next site: cash, levels, trucks, the backlog,
  packing and the shelves all reset; stars and lifetime statistics stay.
- Each star owned raises the pay per order by `starBonus` (+25%), forever,
  and stars unlock perks (section 10a).
- Sites come in a fixed order, each with one twist, and repeat after the last:

| # | Site | Twist |
| --- | --- | --- |
| 1 | Millbrook Depot | None: a small depot to learn the ropes. |
| 2 | Port Calder Docks | Narrow yard: trucks stop at size `narrowYardMaxTruck` (level 5), so contracts stop there too, but every order pays +`narrowYardPay` (+50%). Docks and sales carry the rest. |
| 3 | Highmoor Crossdock | Crossdock: every full truck brings back `crossdock` (20%) of its parcels as cross-dock orders, straight into packing (they need no picking and no stock). Full trucks feed themselves. |
| 4 | Sunvale Outlet | Sale season: for `waveTicks` (60 s) of every `wavePeriod` (5 min) orders run at `waveOrder` (3x), and at `offWaveOrder` (0.6x) otherwise. The backlog, packing and full shelves store the rush. |

The first sale is meant for about 30-60 minutes into the game (section 11).

## 10a. Star perks

Stars also unlock **perks**: permanent bonuses that switch on when the stars
you own reach each threshold. Stars are never spent on them, so every star
still raises pay by `starBonus`. A perk counts from the tick the stars are
owned; the two that shape a new warehouse (Head start, Second dock) apply from
the next warehouse opened. The stars sheet (tap the stars by the site's name)
lists them all; the sell sheet names the ones a sale would unlock.

| Stars owned | Perk | Effect |
| --- | --- | --- |
| `perkHeadStartStars` (1) | Head start | A new warehouse opens with `perkHeadStartCents` ($250) more cash. |
| `perkSecondDockStars` (3) | Second dock | A new warehouse opens with two docks (docks level 1), each with a truck loading; the next dock costs what a third always does. |
| `perkQuickChargeStars` (6) | Quick charge | Every boost's recharge x`perkQuickCharge` (0.75), never shorter than the boost runs. A boost already recharging keeps its clock. |
| `perkExpressStars` (10) | Express lane | An arriving truck is an express with chance `expressChance` x `perkExpress` (10%); the estimate counts it. |
| `perkLongShiftStars` (15) | Long shift | The offline cap x`perkLongShift` (1.5), still at most `offlineMaxMinutes`; the Night shift row shows it. |

Perks are worked out from the stars in State, so they add nothing to State,
the hash or saves. The first warehouse has none: the pacing targets of
section 11 are unchanged.

## 11. Pacing targets

Measured by the harness bots (`npm run harness -- pacing`;
packages/harness/src/pacing.test.ts holds them on every build). The greedy bot
taps three times a second, looks at its upgrades once a second, buys the best
income per dollar (one purchase ahead), taps whichever of the docks, the
pickers (while orders queue) and receiving (while the shelves are under half
full) has the least rush banked, and sells once a sale adds at least half
again to pay (3 stars the first time) and the next star is further away than
a quarter of the warehouse's age. The idle bot never taps, checks in every 15
minutes, and sells at the first check-in where the sale adds half again. Both
use every boost that is ready: the greedy bot at once, the idle bot as it
leaves each check-in.

| Target | Measured (seeds 1-5, W1) |
| --- | --- |
| First upgrade within 10 s | 3 s |
| First new dock within 2 minutes | 19-29 s |
| Something new (a dock, truck, contract or sale) at least every 5 minutes before the first sale | longest wait 4.3-4.4 min |
| First sale at roughly 30-60 minutes (greedy) | 35.3-35.6 min, 3 stars (38.2-38.5 without boosts) |
| First sale for an idle player (no taps, check-ins every 15 min) | about 2 h 30 min, 3 stars (2 h 45 min to 3 h without boosts; reported, no target) |
| Active income about 2-3x idle at the same levels (tapping; measured at the levels the greedy bot reaches without boosts) | 2.1-2.7x (2.4-2.7x at the levels it reaches with boosts, reported) |
| A 30-second check-in buys at least one upgrade | 100% of idle check-ins |
| A 5-minute session reaches its next unlock | 10 of 10 idle check-ins at the first warehouse, every seed (target 80%) |
| Income estimate within 20% of measured idle income | within 4% |

## 12. Tunables

`value`, `min`, `max` are integers in code units. The test
`packages/harness/src/rules.test.ts` fails if this table and `tunables.ts`
disagree.

| Tunable | Value | Min | Max | Unit and why |
| --- | --- | --- | --- | --- |
| `tickMs` | 250 | 100 | 1000 | Wall ms per tick. Short enough that a tap feels immediate, long enough that 24 h of catch-up is 345,600 cheap steps. |
| `maxCommandsPerTick` | 16 | 4 | 64 | Engine limit: commands one tick accepts. A frantic thumb taps 10 times a second at most. |
| `cashCapCents` | 9000000000000000 | 9000000000000000 | 9000000000000000 | Engine limit: the safe-integer ceiling. The safe is full. |
| `startingCashCents` | 0 | 0 | 10000 | Cash a new warehouse opens with. |
| `startingStaged` | 10 | 0 | 40 | Orders packed and staged at opening, so the first truck fills at once. |
| `startingStock` | 60 | 0 | 200 | Units on the shelves at opening: half the first shelves. |
| `orderBaseMilliPerTick` | 400 | 200 | 1000 | Milli-orders a tick at sales level 0 (1.6 a second). |
| `orderGrowthBp` | 13500 | 12000 | 15000 | Orders per sales level (+35%). |
| `stagingCapBase` | 40 | 20 | 100 | Packed orders the staging area holds at sales level 0. |
| `stagingCapGrowthBp` | 13500 | 12000 | 15000 | Staging space per sales level; matches orders so it holds the same seconds of them. |
| `pickingBaseMilliPerTick` | 600 | 400 | 1500 | Milli-orders picked a tick at level 0 (2.4 a second): ahead of level-0 orders, so the first minutes have no backlog. |
| `pickingGrowthBp` | 15000 | 12500 | 16000 | Picking per pickers level (+50%): ahead of sales's +35%, so pickers hired keep up for a while. |
| `backlogWaitTicks` | 120 | 40 | 240 | The longest wait customers accept (30 s of picking): the backlog holds this many ticks of picking; beyond it new orders are cancelled. |
| `exportCheckBp` | 9500 | 6000 | 10000 | Picking speed for each export station (export paperwork, customs): x0.95 each. The catch of the big contracts. |
| `receiveBaseMilliPerTick` | 600 | 300 | 1500 | Milli-units put away a tick at receiving level 0 (2.4 a second), level with picking: at 2 a second the first bay came before the second dock (2.5 minutes). |
| `receiveGrowthBp` | 15000 | 12500 | 16000 | Put-away per receiving level (+50%), like picking: ahead of sales, so a bay bought keeps up for a while. |
| `shelfCapBase` | 120 | 40 | 400 | Units the shelves hold at receiving level 0 (about a minute of orders): a buffer for flash sales. |
| `shelfCapGrowthBp` | 15000 | 12500 | 16000 | Shelf space per receiving level; matches put-away so the shelves hold the same seconds of it. |
| `poTicks` | 80 | 20 | 240 | A purchase order is this many ticks of put-away (20 s), so a new PO reaches the dock every 20 s or so. |
| `maxDocks` | 8 | 4 | 12 | Most docks: 8 fit a phone screen in two rows of four. |
| `truckParcelsBase` | 10 | 6 | 20 | Parcels a truck holds at truck level 0. |
| `truckParcelsGrowthBp` | 15000 | 13000 | 18000 | Parcels per truck level (+50%). |
| `maxTruckLevel` | 9 | 5 | 12 | Biggest truck (366 parcels). |
| `departBaseTicks` | 40 | 20 | 120 | Departure timer before parcels are added (10 s). |
| `departTicksPerParcel` | 2 | 1 | 4 | Extra departure timer per parcel (0.5 s). |
| `loadBaseMilliPerTick` | 500 | 250 | 1000 | Loading rate per dock at level 0 (2 orders a second). |
| `loadGrowthBp` | 12500 | 11000 | 14000 | Loading rate per loading level (+25%). |
| `turnBaseTicks` | 16 | 8 | 40 | Truck swap before parcels are added (4 s). |
| `turnParcelsPerTick` | 5 | 2 | 20 | Parcels of truck per tick of extra swap time (0.05 s a parcel). |
| `crewTurnBp` | 8800 | 8000 | 9500 | Swap time per yard crew level (-12%). |
| `turnMinTicks` | 4 | 1 | 8 | Shortest swap (1 s). |
| `payBaseCents` | 100 | 50 | 500 | Pay per order at contract level 0 ($1). |
| `payGrowthBp` | 16000 | 13000 | 20000 | Pay per contract level (+60%). |
| `fullBonusBp` | 2500 | 0 | 5000 | Extra pay on a truck that leaves full (+25%). The reward for filling, and the cost of a too-big truck. |
| `expressChanceBp` | 500 | 0 | 2000 | Chance an arriving truck is an express (5%). |
| `expressPayBp` | 20000 | 10000 | 40000 | An express truck's pay multiplier (2x). |
| `rushTicksPerTap` | 10 | 4 | 20 | Rush added by one tap (2.5 s). |
| `rushMaxTicks` | 20 | 8 | 40 | Most rush a station can bank (5 s), so tapping ahead does not pay. |
| `rushLoadBp` | 25000 | 15000 | 50000 | Speed while rushed: loading, picking and receiving (2.5x). |
| `rushTurnSpeed` | 3 | 1 | 5 | Swap ticks cleared per tick while rushed. |
| `docksCostBase` | 10000 | 5000 | 50000 | Cents for the second dock ($100). |
| `docksCostGrowthBp` | 40000 | 30000 | 80000 | Dock cost growth (x4): the eighth dock around the first sale. |
| `truckCostBase` | 30000 | 5000 | 50000 | Cents for truck level 1 ($300). |
| `truckCostGrowthBp` | 35000 | 30000 | 70000 | Truck cost growth (x3.5). |
| `loadCostBase` | 1000 | 500 | 5000 | Cents for loading level 1 ($10): the first upgrade, affordable after the first truck. |
| `loadCostGrowthBp` | 19000 | 15000 | 25000 | Loading cost growth (x1.9). |
| `salesCostBase` | 3000 | 1000 | 10000 | Cents for sales level 1 ($30). |
| `salesCostGrowthBp` | 20000 | 15000 | 25000 | Sales cost growth (x2.0). |
| `pickingCostBase` | 2500 | 1000 | 20000 | Cents for pickers level 1 ($25). |
| `pickingCostGrowthBp` | 18000 | 15000 | 25000 | Pickers cost growth (x1.8), a little under the x2 of the sales it keeps up with. |
| `receivingCostBase` | 2000 | 1000 | 20000 | Cents for receiving level 1 ($20). |
| `receivingCostGrowthBp` | 18000 | 15000 | 25000 | Receiving cost growth (x1.8), like pickers. |
| `contractCostBase` | 75000 | 10000 | 200000 | Cents for contract level 1 ($750). |
| `contractCostGrowthBp` | 40000 | 35000 | 80000 | Contract cost growth (x4). |
| `crewCostBase` | 6000 | 2000 | 20000 | Cents for yard crew level 1 ($60). |
| `crewCostGrowthBp` | 22000 | 15000 | 30000 | Yard crew cost growth (x2.2). |
| `nightCostBase` | 50000 | 10000 | 200000 | Cents for night shift level 1 ($500). |
| `nightCostGrowthBp` | 100000 | 50000 | 200000 | Night shift cost growth (x10). |
| `maxLoadLevel` | 40 | 20 | 60 | Loading levels. |
| `maxSalesLevel` | 40 | 20 | 60 | Sales levels. |
| `maxPickingLevel` | 40 | 20 | 60 | Pickers levels, as many as sales. |
| `maxReceivingLevel` | 40 | 20 | 60 | Receiving levels, as many as sales. |
| `maxCrewLevel` | 20 | 10 | 30 | Yard crew levels; the swap hits its floor first. |
| `maxNightLevel` | 4 | 2 | 6 | Night shift levels. |
| `offlineBaseMinutes` | 120 | 30 | 240 | Offline cap with no night shift (2 h). |
| `offlineGrowthBp` | 20000 | 15000 | 30000 | Offline cap per night shift level (x2). |
| `offlineMaxMinutes` | 1440 | 480 | 2880 | Longest offline run (24 h). |
| `starUnitCents` | 60000000 | 1000000 | 400000000 | Earnings for the first star ($600K); n stars need n squared times this. |
| `starBonusBp` | 2500 | 1000 | 5000 | Pay per star owned (+25%): three stars at the first sale make the next warehouse 75% richer. |
| `perkHeadStartStars` | 1 | 1 | 3 | Star perk Head start: stars owned that unlock it. The first sale always reaches it. |
| `perkHeadStartCents` | 25000 | 5000 | 100000 | Head start: extra cash a new warehouse opens with ($250): a second dock and a few upgrades at once, so a sold warehouse is never slow to start. |
| `perkSecondDockStars` | 3 | 2 | 6 | Star perk Second dock: stars owned that unlock it. The greedy first sale is worth 3. |
| `perkQuickChargeStars` | 6 | 4 | 12 | Star perk Quick charge: stars owned that unlock it (about the second sale). |
| `perkQuickChargeBp` | 7500 | 5000 | 9500 | Quick charge: boost recharge multiplier (x0.75, 25% faster). Never shorter than the boost runs. |
| `perkExpressStars` | 10 | 6 | 20 | Star perk Express lane: stars owned that unlock it. |
| `perkExpressBp` | 20000 | 12500 | 30000 | Express lane: express truck chance multiplier (x2, 5% to 10%). |
| `perkLongShiftStars` | 15 | 8 | 30 | Star perk Long shift: stars owned that unlock it. |
| `perkLongShiftBp` | 15000 | 12500 | 20000 | Long shift: offline cap multiplier (x1.5, 2 h to 3 h), still at most offlineMaxMinutes. |
| `narrowYardMaxTruck` | 5 | 3 | 7 | Port Calder's biggest truck level. |
| `narrowYardPayBp` | 15000 | 11000 | 20000 | Port Calder's pay multiplier (1.5x). |
| `crossdockBp` | 2000 | 500 | 4000 | Highmoor Crossdock: share of a full truck's parcels that come back as cross-dock orders, already packed. |
| `wavePeriodTicks` | 1200 | 480 | 2400 | Sunvale: one sale-season cycle (5 min). |
| `waveTicks` | 240 | 60 | 600 | Sunvale: length of a sale (60 s). |
| `waveOrderBp` | 30000 | 15000 | 50000 | Sunvale: orders during a sale (3x). |
| `offWaveOrderBp` | 6000 | 3000 | 10000 | Sunvale: orders between sales (0.6x). |
| `flashSaleTicks` | 240 | 80 | 480 | Boost: how long Flash sale runs (60 s). Long enough to watch the backlog fill. |
| `flashSaleRechargeTicks` | 1200 | 480 | 4800 | Boost: Flash sale recharge, counted from use (5 min): about once per unlock. |
| `flashSaleOrderBp` | 30000 | 15000 | 50000 | Boost: orders during Flash sale (3x). Past the backlog they are cancelled, and full shelves store more of it. |
| `allHandsTicks` | 240 | 80 | 480 | Boost: how long All hands rushes every station (60 s). |
| `allHandsRechargeTicks` | 1200 | 480 | 4800 | Boost: All hands recharge (5 min): a minute of tapping for a one-handed or idle player. |
| `allHandsMinDocks` | 3 | 1 | 4 | Boost: docks before All hands opens (about minute 2), so the boost bar fills in one at a time. |
| `surgeTicks` | 240 | 80 | 480 | Boost: how long Peak rates runs (60 s). |
| `surgeRechargeTicks` | 3600 | 1200 | 7200 | Boost: Peak rates recharge (15 min): one per idle check-in. |
| `surgePayBp` | 20000 | 15000 | 30000 | Boost: pay multiplier during Peak rates (2x). |
| `surgeMinContract` | 1 | 0 | 3 | Boost: contract level before Peak rates opens (the first new contract, about minute 4). |

## 13. Invariants

Checked by property tests on every build:

- Cash, the backlog, packed orders, stock and every truck's load are never
  negative; a truck never holds more than its parcels; packing never holds
  more than `W`; the shelves never hold more than their space; a PO is never
  received past its units; the backlog never holds more than `L` at contract
  level 0 (a new export contract can slow picking below a backlog already
  standing); a rush is never banked past `rushMax`.
- The same seed and the same commands always give the same state hash, in Node
  and in Chromium.
- Catching up N ticks at once gives exactly the state that stepping N single
  ticks gives.
- A save reloads to the same state hash and continues identically.
- Cash only changes by pay (up) and purchases (down); a purchase never makes
  cash negative.
- A boost's time left is never negative and never more than its recharge left.
- Saves are version 1 (W1). An airport save is refused with a message saying
  so. The migration mechanism (compact saves checked against their hash, then
  replayed under today's rules) is tested with a made-up version step until a
  real warehouse migration exists.

## 14. The floor (what the screen shows)

Under the cash, a **dashboard** row of four tiles: orders shipped by this
warehouse, orders a minute at today's levels (the estimate of section 8), the
backlog, and how full the shelves are. The tile that names the bottleneck
(backlog for picking, stock for empty shelves, per minute for orders) turns
orange.

The middle of the screen, above the docks, shows goods moving across the
floor in the order a real warehouse moves them: inbound dock, storage racks,
picking, staging, outbound docks. The **backlog is real** (section 3): the
tickets waiting on the order board are the backlog in State, so the board
fills when picking or stock falls behind, empties when pickers are hired, and
backs up when staging is full. The full rack slots are the real stock, the
cartons in the staging lanes the real packed count, and the PO line the real
PO. The order desk, quality check and the export stations are **scenery**:
they never hold anything (export paperwork and customs only slow picking,
section 3). "Packing" in sections 3-8 is the staging area on screen.

- **Inbound** (the top lane): cartons leave the PO at the inbound dock as fast
  as it is put away, pass quality check, go down the cross aisle at the
  racks' far end and along an aisle into an empty rack slot. The lane names
  the PO ("PO #12 · 30/48") and is a tap target (extra hands, section 6).
- **Storage and picking**: three runs of racking with two aisles; each slot
  holds a carton while the shelves have stock for it (slots fill in a fixed
  scattered order, so a part-full rack has gaps here and there), with the
  units and space above ("Storage 62/120"). New orders come in at the order
  desk at the order rate less those cancelled (shown fading at the door) and
  wait on the order board, oldest first. A picker takes the oldest down an
  aisle, reaches into a full slot (the ticket becomes a carton) and carries it
  down the cross aisle. Under the board, one picker figure per two pickers
  levels (up to six), and an extra one in green while extra pickers work. It
  shows the backlog and the wait ("34 waiting · 14 s"), "held: staging full"
  or "held: racks empty" when those stop it, and is the pickers' tap target.
- **Staging**: one lane per dock, marked on the floor, where picked cartons
  wait for a truck, past any export stations. The packed count is shared out
  evenly between the lanes and stacked from the dock end; a carton walks from
  a dock's lane down the aisle between the docks for each order its truck
  loads.
- **Docks** (outbound): bays two each side of the aisle; each parked truck is
  seen from above, cab up, and its trailer fills box by box with its real
  load (gold on an express, green once full). It leaves cab first.
- **Stations by contract level** (design data in `catalog.ts`, not tunables):

| From contract level | Orders pass |
| --- | --- |
| 0 (Local shops) | Order desk, Picking; stock passes the inbound dock, Quality check |
| 5 (Cross-border) | Export paperwork (slows picking) |
| 6 (Overseas) | Customs checks (slows picking) |

- One dot stands for 1, 2, 5, 10, 20, 50... orders or units, picked so a few
  dots a second move however big the warehouse grows; packing shows the scale.
- Display limits, not balance: at most 260 dots on screen and 150 tickets on
  the order board (a longer backlog squeezes up), and none move for ticks
  caught up quietly (an absence or a late timer); the board is filled in from
  the real backlog.

## 15. Boosts

Three free boosts sit in the thumb zone above the Upgrades button. A tap starts
one: it runs for a minute, then recharges. Each fixes one bottleneck of
section 8, so the screen points at the one the warehouse needs now. Boosts
cost nothing and are never required; they give a 30-second check-in something
to do and an active player a burst to plan around.

| Boost | While it runs | Length | Recharge | Opens | Fixes |
| --- | --- | --- | --- | --- | --- |
| Flash sale | orders x`flashSaleOrder` (3x); past the backlog they are cancelled | `flashSaleTicks` (60 s) | `flashSaleRechargeTicks` (5 min) | at once | Trucks are waiting for orders; trucks leave before they fill |
| All hands | every dock, picking and receiving are rushed as if tapped (section 6), counter orders included | `allHandsTicks` (60 s) | `allHandsRechargeTicks` (5 min) | at `allHandsMinDocks` docks (3) | Packed orders queuing at the docks; docks busy swapping; orders piling up at picking; shelves running empty |
| Peak rates | every order's pay x`surgePay` (2x), after every other multiplier | `surgeTicks` (60 s) | `surgeRechargeTicks` (15 min) | with contract level `surgeMinContract` (1, Web shop) | any bottleneck |

- The recharge counts from the tick the boost is used, so it includes the
  minute the boost runs. That tick is the boost's first. The Quick charge
  perk (section 10a) shortens every recharge by a quarter.
- A boost cannot be used while it runs, while it recharges, or before it
  opens; the command is rejected and nothing changes.
- Boost clocks are ticks in State, so a boost keeps running and recharging
  while the app is closed, exactly as if it were open (P4). Use one on the way
  out and it pays during the first minute away.
- Selling the warehouse opens the next one with every boost ready.
- The headline income stays the plain estimate of section 8. While a boost
  runs, the screen also shows the boosted estimate: the same formulas with the
  boost applied, as if it ran for good.
