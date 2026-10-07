# Rules: Warehouse Idle

The game-rules spec. Every number here is a tunable in
`packages/sim/src/tunables.ts` with the band in section 12; a test keeps the two
in step. Formulas are written in plain units (seconds, orders, dollars) and
the code runs them in integer units (section 2). Decision record W1 explains
why the warehouse replaced the airport game; most rules carry over from it,
renamed.

## 1. The game in one paragraph

You run a warehouse. Customer **orders** come in and wait in the **backlog**
until a picker takes its items off the shelves (bigger customers send
bigger orders, section 3b); packed orders wait in
**packing** for a truck. Each **dock** holds one truck; loaders fill it at the
dock's loading rate. When the truck is full, or its departure timer runs out,
it leaves and pays for every order on board, with a bonus if it left full.
The dock then swaps in the next truck. Meanwhile **purchase orders (POs)**
arrive at the **receiving** dock, and receivers put their units away on the
**shelves**: every item picked takes one unit, so empty shelves stop the
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
- Orders, items and stock are integer **milli-units** (1 order = 1000
  milli-orders; 1 item = 1 unit of stock = 1000), so slow rates accumulate
  exactly. A truck pays for whole orders only.
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
- Pickers pick `pickingBase x pickingGrowth^pickingLevel` items a second
  (2.88/s at level 0, +50% a level, from More pickers), times `exportCheck`
  (x0.95) for each export station the contract adds: export paperwork from
  Cross-border (contract 5), customs checks from Overseas (contract 6). A
  tapped picking area, or All hands, sends extra pickers: `rushLoad` (2.5x) as
  fast (section 6). In orders, that is `S` = items a second / items per
  order (section 3b): 2.4 orders a second at level 0 with Local shops.
- **Each order picked takes one unit of stock per item** off the shelves
  (sections 3a, 3b). Picking takes `min(rate, backlog, stock / items per
  order, packing room)` orders a tick, and the stock they take is rounded up
  to a whole milli-unit.
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
  second (2.88/s at level 0, +50% a level, from the Receiving bay upgrade). A
  tapped receiving lane, or All hands, sends extra hands: `rushLoad` (2.5x).
- The shelves hold `shelfCapBase x shelfCapGrowth^receivingLevel` units (144
  at level 0, +50% a level). Full shelves hold the PO at the dock.
- A PO holds `ceil(R x poTicks)` units, `poTicks` (20 s) of put-away at the
  rate when it arrives (58 units at level 0). When its last unit is put away
  it counts as received and the next PO is at the dock at once, taking the
  rest of that tick's put-away. A bigger bay makes the next PO bigger, not the
  one being unloaded.
- POs are free: the stock belongs to your customers, and you are paid per
  order shipped. They are what keeps the pickers working.
- A new warehouse opens with `startingStock` units on the shelves (72) and PO 1
  at the dock. PO numbers keep counting across sites.

## 3b. Items per order: bigger customers send bigger orders

- An order is `items = itemsBase + itemsPerContract x contractLevel` items on
  average (1.2 at Local shops, +0.15 a contract level: 1.95 at Cross-border,
  2.55 at Everything store). Each item is one pick and one unit of stock.
- So a better contract pays 60% more an order, but each order takes longer
  to pick and more stock: in orders, picking and receiving slow by
  `items(n) / items(n+1)` (x0.89 from Local shops to Web shop). That is the
  catch of Better contracts beside its truck lock and the export stations.
- The sim works with the average (milli-items, P3); the floor shows it as a
  mix of one-item orders and totes of several (section 14).

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
| Better contracts | +60% pay per order | bigger orders: +0.15 items an order a level, so picking and stock go less far (section 3b); contract level n needs truck level n or more; from Cross-border each new export station slows picking 5% | $750 | x4.0 | 9 |
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

| Target | Measured (seeds 1-5, W4) |
| --- | --- |
| First upgrade within 10 s | 3 s |
| First new dock within 2 minutes | 19-29 s |
| Something new (a dock, truck, contract or sale) at least every 5 minutes before the first sale | longest wait 4.3 min |
| First sale at roughly 30-60 minutes (greedy) | 36.0-36.3 min, 3 stars (38.9-39.2 without boosts) |
| First sale for an idle player (no taps, check-ins every 15 min) | about 2 h 30 min, 3 stars (2 h 45 min without boosts; reported, no target) |
| Active income about 2-3x idle at the same levels (tapping; measured at the levels the greedy bot reaches without boosts) | 2.1-3.2x (2.3-2.9x at the levels it reaches with boosts, reported) |
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
| `startingStock` | 72 | 0 | 240 | Units on the shelves at opening: half the first shelves. |
| `orderBaseMilliPerTick` | 400 | 200 | 1000 | Milli-orders a tick at sales level 0 (1.6 a second). |
| `orderGrowthBp` | 13500 | 12000 | 15000 | Orders per sales level (+35%). |
| `stagingCapBase` | 40 | 20 | 100 | Packed orders the staging area holds at sales level 0. |
| `stagingCapGrowthBp` | 13500 | 12000 | 15000 | Staging space per sales level; matches orders so it holds the same seconds of them. |
| `pickingBaseMilliPerTick` | 720 | 400 | 1800 | Milli-items picked a tick at level 0 (2.88 a second: 2.4 Local shops orders of 1.2 items): ahead of level-0 orders, so the first minutes have no backlog. |
| `pickingGrowthBp` | 15000 | 12500 | 16000 | Picking per pickers level (+50%): ahead of sales's +35%, so pickers hired keep up for a while. |
| `itemsBaseMilli` | 1200 | 1000 | 2000 | Milli-items in an order at contract level 0 (1.2: most Local shops orders are one item, some a tote of several). |
| `itemsPerContractMilli` | 150 | 0 | 600 | Extra milli-items an order per contract level (+0.15; at +0.2 or more the wait for contract 6 passed 5 minutes): bigger customers send bigger orders, the catch that keeps +60% pay a trade-off. 0 turns the rule off. |
| `backlogWaitTicks` | 120 | 40 | 240 | The longest wait customers accept (30 s of picking): the backlog holds this many ticks of picking; beyond it new orders are cancelled. |
| `exportCheckBp` | 9500 | 6000 | 10000 | Picking speed for each export station (export paperwork, customs): x0.95 each. The catch of the big contracts. |
| `receiveBaseMilliPerTick` | 720 | 300 | 1800 | Milli-units put away a tick at receiving level 0 (2.88 a second), level with picking: at the old 2 orders a second the first bay came before the second dock (2.5 minutes). |
| `receiveGrowthBp` | 15000 | 12500 | 16000 | Put-away per receiving level (+50%), like picking: ahead of sales, so a bay bought keeps up for a while. |
| `shelfCapBase` | 144 | 40 | 480 | Units the shelves hold at receiving level 0 (about a minute of orders): a buffer for flash sales. |
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
| `wmsSampleOrdersMin` | 10 | 5 | 30 | WMS: fewest sample orders a new warehouse opens with (docs/wms-plan.md slice 1). |
| `wmsSampleOrdersMax` | 15 | 5 | 40 | WMS: most sample orders a new warehouse opens with: enough to fill a phone screen of the order grid. |
| `wmsLinesMax` | 5 | 1 | 12 | WMS: most lines an order has (1 to this many, each a different SKU). |
| `wmsQtyMin` | 4 | 1 | 50 | WMS: fewest units on an order line. |
| `wmsQtyMax` | 48 | 2 | 500 | WMS: most units on an order line. |
| `wmsPickers` | 6 | 1 | 20 | WMS: pickers in the pool (Picker 01..N); each works one line at a time. |
| `wmsCutoffMinTicks` | 720 | 240 | 14400 | WMS: shortest time to ship-by of a Standard (P3) order (3 min); High (P2) gets 3/4 of that, Expedite (P1) half. With 3-8 min an idle WMS ships about 93% on time and 80% OTIF (seeds 1-8, 2 h): misses happen, and priorities and expedites can save them. |
| `wmsCutoffMaxTicks` | 1920 | 480 | 28800 | WMS: longest time to ship-by of a Standard order (8 min). |
| `wmsExpediteChanceBp` | 1000 | 0 | 5000 | WMS: chance a new order is P1 Expedite (10%). |
| `wmsHighChanceBp` | 2500 | 0 | 5000 | WMS: chance a new order is P2 High (25%); the rest are P3 Standard. |
| `wmsStockCoverMinPct` | 60 | 0 | 100 | WMS: least stock a SKU opens with, as % of the units ordered of it: under 100 some lines will be short. |
| `wmsStockCoverMaxPct` | 180 | 100 | 400 | WMS: most stock a SKU opens with, as % of the units ordered of it. |
| `wmsEventsKept` | 200 | 50 | 1000 | WMS: activity events kept in State (the oldest drop off); bounds the save and the feed. |
| `wmsStepTicks` | 4 | 1 | 8 | WMS: it steps once every this many ticks (1 s): timestamps a WMS shows are seconds, and 24 h of catch-up stays cheap. |
| `wmsPickMilliPerSec` | 750 | 200 | 4000 | WMS: milli-units a picker picks a second once at the bin (0.75). Raised from 0.65 when pickers started walking between bins (W7), so an idle WMS ships as before: about 82% OTIF and 94% on time (seeds 1-8, 2 h; was 84% and 95%). Six pickers keep up with an order every 25 s with a little to spare, so a queue forms when luck runs bad. |
| `wmsFirstWaveTicks` | 120 | 0 | 1200 | WMS: ticks from opening to the first automatic wave (30 s): long enough to see NEW orders and release them by hand. |
| `wmsWaveTicks` | 240 | 40 | 2400 | WMS: ticks between automatic waves (60 s): every NEW order not on hold is released. |
| `wmsOrderMinTicks` | 80 | 20 | 1200 | WMS: shortest gap before the next order arrives (20 s). |
| `wmsOrderMaxTicks` | 120 | 40 | 2400 | WMS: longest gap before the next order arrives (30 s). |
| `wmsMaxOpenOrders` | 40 | 10 | 300 | WMS: no new order arrives while this many are open, so a long absence cannot swamp the floor. |
| `wmsKeepClosedOrders` | 40 | 0 | 300 | WMS: shipped and cancelled orders kept on the grid; older ones drop off. |
| `wmsPackTicks` | 20 | 0 | 240 | WMS: ticks from PICKED (or SHORT) to PACKED (5 s). |
| `wmsStageTicks` | 20 | 0 | 240 | WMS: ticks from PACKED to STAGED (5 s). |
| `wmsLoadTicks` | 20 | 0 | 240 | WMS: ticks from STAGED to LOADED (5 s). |
| `wmsShipTicks` | 20 | 0 | 240 | WMS: ticks from LOADED to SHIPPED (5 s). |
| `wmsShortPickChanceBp` | 300 | 0 | 2000 | WMS: chance a picker finds a bin short of what was allocated (3%): a SHORT PICK of 1 unit up to the whole line. |
| `wmsWalkTicksPerBay` | 1 | 0 | 8 | WMS (W7): ticks a picker takes to walk past one bay (4 bays a second). A line across the warehouse is about 30 bays (8 s); between bins in one aisle a few seconds. Walking is why the nearest-bin pick order picks more lines an hour. |
| `wmsReplenTicks` | 240 | 40 | 2400 | WMS: ticks between reorder planning runs (60 s, W6); the first runs at opening. |
| `wmsReorderUnits` | 80 | 0 | 500 | WMS: reorder point: a SKU whose position (available + inbound - units waiting) is under this gets a PO line (W6). At 80 an idle WMS ships as it did with instant replenishment at 40 (about 81% OTIF, 96% fill); at 40 the lead time cut OTIF to 64%. |
| `wmsReplenUnits` | 120 | 10 | 1000 | WMS: a PO line orders the SKU up to the reorder point plus this many units (W6). |
| `wmsGoodwillStart` | 50 | 0 | 100 | WMS: goodwill (0-100) every destination country starts at. |
| `wmsExpediteCostOrders` | 30 | 5 | 200 | WMS: an expedite costs the pay of this many orders at today's pay (about $30 at the start): real money, but small next to a truck. |
| `wmsExpediteLeadTicks` | 1200 | 0 | 7200 | WMS: an expedited order goes P1 and onto a later, faster truck: this much is added to its ship-by (5 min). |
| `wmsUnitPayBp` | 500 | 0 | 5000 | WMS: a shipped WMS order pays this share of an idle order's pay for each unit shipped (5%), times its country's goodwill factor: a bonus beside the trucks, small enough to leave the pacing targets in place. |
| `wmsGoodwillGain` | 3 | 0 | 20 | WMS: goodwill a country gains when its order ships on time and in full. |
| `wmsGoodwillLatePerMin` | 4 | 0 | 50 | WMS: goodwill lost for each whole minute (or part) an order ships after its cutoff. |
| `wmsGoodwillLateMax` | 20 | 0 | 100 | WMS: most goodwill one late order can cost. |
| `wmsGoodwillShortMax` | 15 | 0 | 100 | WMS: goodwill an order shipped with nothing would cost; a short order costs this times its share of units short. |
| `wmsPoLeadMinTicks` | 120 | 40 | 4800 | WMS inbound (W6): shortest promised lead time from raising a PO to its truck arriving (30 s). |
| `wmsPoLeadMaxTicks` | 360 | 40 | 9600 | WMS inbound: longest promised lead time (90 s). With 30-90 s and 6 units a second an idle WMS ships about 84% OTIF and 98% fill over 2 h (seeds 1-8); 1-2 min gave 81% and 96%. |
| `wmsPoLateChanceBp` | 1500 | 0 | 5000 | WMS inbound: chance a supplier's truck arrives after its ETA (15%). |
| `wmsPoLateMaxTicks` | 360 | 40 | 4800 | WMS inbound: most a late truck is late (90 s); it is at least 10 s late. |
| `wmsDockDoors` | 2 | 1 | 8 | WMS inbound: dock doors: a truck arriving with every door busy waits in the yard (ARRIVED). |
| `wmsReceivers` | 3 | 1 | 12 | WMS inbound: receivers (Rcvr 01..N); each counts in one PO line at a time. |
| `wmsReceiveMilliPerSec` | 6000 | 500 | 20000 | WMS inbound: milli-units a receiver counts in a second (6): a 200-unit line takes about 33 s. |
| `wmsPutawayTicks` | 40 | 0 | 480 | WMS inbound: ticks from a line being received to its units reaching the bin (10 s). |
| `wmsRcvShortChanceBp` | 500 | 0 | 5000 | WMS inbound: chance a supplier sends a line short (5%): 1 unit up to a quarter of it is missing. |
| `wmsDamageChanceBp` | 300 | 0 | 5000 | WMS inbound: chance some of a line arrives damaged (3%): written off, never put away. |
| `wmsDamageMaxUnits` | 4 | 1 | 50 | WMS inbound: most units of a line that arrive damaged. |
| `wmsKeepClosedPos` | 20 | 0 | 200 | WMS inbound: closed POs kept on the inbound grid; older ones drop off. |
| `wmsCountTicks` | 120 | 20 | 2400 | WMS inventory (W6): ticks between cycle counts (30 s); each counts the next SKU in turn, so every SKU is counted every 8 min. |
| `wmsCountVarianceBp` | 1000 | 0 | 5000 | WMS inventory: chance a cycle count finds the bin differs from the system (10%); two in three are losses. |
| `wmsCountVarianceMax` | 3 | 1 | 50 | WMS inventory: most units a cycle count adjusts by; a loss never takes allocated units. |

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
  as it is put away and pass quality check; a forklift takes each down the
  cross aisle at the racks' far end and along an aisle to a bare reserve
  location (a bare floor pick location when reserve is full), sets it down
  and backs out. The lane names the PO ("PO #12 · 30/48") and is a tap target
  (extra hands, section 6).
- **Storage and picking**: three runs of racking with two aisles. The front
  of each run, by the order board, is **floor pick** (the pick locations,
  marked on the floor; a bare one shows faintly); the rest is **reserve**.
  The full locations are the real stock, less what is still on a forklift
  and plus what a picker is on the way to take, so a location fills when its
  forklift sets it down and empties when its picker reaches it; a short
  outline flashes round it. The units and room show above ("62/120"). How
  the stock splits between floor pick and reserve is **for show** (the sim
  has one stock): a new warehouse opens with floor pick 85% full and the
  rest in reserve. When floor pick holds less than 60% of its room, counting
  what is on its way, a **reach truck** (up to two an aisle) drives in from
  the cross aisle, lifts a pallet (at most 12% of floor pick's room) off a
  reserve location and sets it down in a bare floor pick location along the
  same aisle, topping floor pick back up to 85%. New orders come in at the
  order desk at the order rate less those cancelled (shown fading at the
  door) and wait on the order board, oldest first. A picker (a pale figure)
  takes the oldest down an aisle, reaches into a full floor pick location (a
  reserve one when the floor is bare; the ticket becomes a carton) and
  carries it back out of the aisle's left end, past the board and down to
  staging (the cross aisle is the forklifts'). Orders of several items
  (section 3b) go in a **tote**: the picker reaches into a different
  location for each item, along the same aisle where it can or out and into
  the next aisle, and the tote fills as it goes. Each ticket is an order; its
  size is drawn so the mix averages the real items per order (at Local
  shops, one order in ten is a tote of 2 to 4 items; by Overseas over 40%
  are), so the racks empty at the real rate. Which orders are big is **for
  show** (the sim works with the average). Under the board, one picker figure per two
  pickers levels (up to six), and an extra one in green while extra pickers
  work. It shows the backlog and the wait ("34 waiting · 14 s"), "held:
  staging full" or "held: racks empty" when those stop it, and is the
  pickers' tap target.
- **Staging**: one lane per dock, marked on the floor, where picked cartons
  wait for a truck; any export stations stand at the row's left end, where
  the pickers come in. The packed count is shared out
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
- Display limits, not balance: at most 260 dots on screen (forklifts, reach
  trucks and pickers included) and 150 tickets on the order board (a longer
  backlog squeezes up), and none move for ticks caught up quietly (an absence
  or a late timer); the board and the racks are filled in from the real
  backlog and stock.

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

## 16. The WMS (warehouse management system)
A layer beside the idle flow (decision record W5, plan in docs/wms-plan.md):
key-account orders the player manages by hand. It does not change income,
picking, stock or pacing in RULES 3-11.
- **Opening.** Every new warehouse (and every migrated version-1 save) opens
  a WMS seeded from the warehouse seed plus the site, on its own RNG stream.
- **SKUs and bins.** 16 SKUs (`WMS_SKUS`), each in one bin; SKU `i` sits in
  a bin in `[37i, 37i + 36]`, shown aisle-bay-level+position (`A-03-2B`).
- **Sample orders.** `wmsSampleOrdersMin`-`wmsSampleOrdersMax` orders (10-15),
  numbered from O-10234, each to a random country of 15 (`WMS_DESTINATIONS`),
  source the current contract level, status NEW, no wave. Priority: P1
  Expedite `wmsExpediteChanceBp` (10%), P2 High `wmsHighChanceBp` (25%), else
  P3 Standard. Ship-by is a lead time drawn in
  `[wmsCutoffMinTicks, wmsCutoffMaxTicks]` (3-8 min) for P3, three
  quarters of a draw for P2, half for P1.
- **Lines.** 1 to `wmsLinesMax` (5) lines of different SKUs, each
  `wmsQtyMin`-`wmsQtyMax` units (4-48), status OPEN.
- **Stock.** Each SKU ordered is stocked at a random
  `wmsStockCoverMinPct`-`wmsStockCoverMaxPct` (60-180%) of the units ordered
  of it, rounded down, so some lines will run short; an SKU nobody ordered
  holds `wmsQtyMin`-`wmsQtyMax` units.
- **Pickers and receivers.** `wmsPickers` (6) and `wmsReceivers` (3), all
  idle, the pickers at the pick-and-drop point, and the default plan (W7); no purchase orders yet (the first planning run is the first step).
- **Log.** One ORD CRT event per order with its units; the latest
  `wmsEventsKept` (200) events are kept.
- **The step.** The WMS steps every `wmsStepTicks` ticks (1 s), on its own
  stream, in this order: a new order, a wave, reorder planning, inbound
  (arrivals, docking, put-away, receiving, receiver assignment, PO
  closing), a cycle count, allocation, picking, picker assignment, then
  each order's cutoff and timed moves.
- **New orders.** One arrives every `wmsOrderMinTicks`-`wmsOrderMaxTicks`
  ticks (20-30 s) from a customer on the current contract, unless
  `wmsMaxOpenOrders` (40) are open. Shipped and cancelled orders beyond the
  latest `wmsKeepClosedOrders` (40) drop off the grid.
- **Waves.** Under timed waves (the default release), the first automatic
  wave is `wmsFirstWaveTicks` after opening (30 s), then one every
  `wmsWaveTicks` (60 s): every NEW order not on hold is RELEASED in one wave
  (WAVE REL per order) and allocated at once. Under continuous release every
  NEW order is released as a wave of its own the step it arrives; under
  manual release only the player releases (W7).
- **Allocation.** Orders are allocated most urgent first (W7: by the plan's
  pick order, priority then ship-by under nearest bin), so a P1 released in
  the same wave as a P3 gets the stock first. Each open line takes what its SKU has available (on hand
  minus allocated), up to what it ordered (ALLOC). A line given less is short
  by the rest (ALLOC SHORT); a line given nothing is SHORT and tries again
  every step until stock comes or its order finishes picking. An order given
  nothing at all is a BACKORDER and tries again every step.
- **Reorder planning** (inbound, W6; this replaced the instant REPLEN of
  slice 2). At opening and then every `wmsReplenTicks` (60 s), each SKU's
  position is worked out: available (on hand minus allocated), plus units
  on open purchase orders not yet in the bin, minus the units order lines
  are waiting for (lines not yet given stock, on orders not yet past
  picking, NEW orders included). A SKU whose position is under the reorder
  point `wmsReorderUnits` (80) is ordered up to the reorder point plus
  `wmsReplenUnits` (120). Each SKU has one supplier (8 suppliers,
  `WMS_SUPPLIERS`); a run raises one PO per supplier, numbered from
  PO-50001 (PO CRT).
- **Trucks.** A PO's supplier promises an ETA `wmsPoLeadMinTicks`-
  `wmsPoLeadMaxTicks` (30-90 s) away. With chance `wmsPoLateChanceBp` (15%)
  the truck is late by 10 s to `wmsPoLateMaxTicks` (90 s), drawn when the PO
  is raised: once the ETA passes it logs PO LATE. A truck that arrives is
  ARRIVED, in the yard (ARRIVE), and docks at the lowest free door of
  `wmsDockDoors` (2), oldest arrival first (DOCK); it is then RECEIVING.
- **Receiving.** `wmsReceivers` (3) receivers each count in one PO line at a
  time at `wmsReceiveMilliPerSec` (6 units a second), oldest docked truck
  and lowest line first. At the end of a line (RCV): with chance
  `wmsRcvShortChanceBp` (5%) the supplier sent 1 unit up to a quarter of it
  short (RCV SHORT), and with chance `wmsDamageChanceBp` (3%) 1 to
  `wmsDamageMaxUnits` (4) of the rest arrived damaged (DAMAGE) and are
  written off. Once every line is counted in, the truck leaves its door and
  the PO is PUTAWAY.
- **Put-away.** A received line's good units reach its SKU's bin
  `wmsPutawayTicks` (10 s) after it was counted in (PUTAWAY); only then can
  they be allocated. Once every line is in its bin the PO is CLOSED (PO
  CLOSE). Closed POs beyond the latest `wmsKeepClosedPos` (20) drop off the
  inbound grid.
- **Cycle counts** (inventory, W6). Every `wmsCountTicks` (30 s) the next SKU
  in turn is counted (CYCLE CNT), so each is counted every 8 minutes. With
  chance `wmsCountVarianceBp` (10%) the bin differs from the system by 1 to
  `wmsCountVarianceMax` (3) units, two times in three a loss: on hand is
  adjusted to what is there (ADJUST). A loss never takes allocated units.
  Accuracy is the share of counts that matched.
- **Inventory status** (what the Inventory page shows). A SKU is SHORT when
  the units order lines wait for (NEW orders included) are more than is
  available, OUT when nothing is available, LOW when
  available is under the reorder point, else OK. Each SKU also keeps the
  units picked out of it since opening and the net adjustment of its
  counts.
- **Picking.** The pickers (`wmsPickers`, 6, unless the plan moves people)
  each pick one line at a time. An idle picker takes a waiting allocated line
  by the plan's pick order (below; by default the best priority, then the
  earliest ship-by, then the lowest order and line number) (PICK START; the
  order is PICKING). It first walks to the line's bin (W7): bins sit in four
  aisles A-D of 20 bays (bin `160a + 8(b-1) + k` is aisle `a`, bay `b`); the
  walk is the bays between two bins in one aisle, or out to the front cross
  aisle, across (`WMS_AISLE_GAP_BAYS`, 3 bays an aisle) and in again, at
  `wmsWalkTicksPerBay` (1) ticks a bay, from the bin the picker stands at (a
  new picker starts at the pick-and-drop point at the front of aisle A, bay
  0). Picking starts the step after it arrives, at `wmsPickMilliPerSec` (0.75
  units a second). At the end of the line the picker confirms it (PICK
  CONF): the allocated units leave the bin, but with chance
  `wmsShortPickChanceBp` (3%) 1 to all of them were not there (SHORT PICK):
  the line is short by those. A line with nothing picked goes back to
  waiting for stock. The picker stays at that bin until its next line.
- **Packing to shipping.** When no line of an order is waiting for or under
  a picker, the order is PICKED (SHORT if any unit is short; back to
  BACKORDER if nothing at all was picked). It then moves to PACKED, STAGED,
  LOADED and SHIPPED after `wmsPackTicks`, `wmsStageTicks`, `wmsLoadTicks`
  and `wmsShipTicks` (5 s each), logging PACK, STAGE, LOAD and SHIP.
- **Cutoffs and OTIF.** An open order whose ship-by tick passes logs CUTOFF
  MISS once and is late. A shipped order is on time if it was never late and
  in full if no line is short; on time and in full is OTIF. Totals since
  opening and per destination country are kept for the KPI strip.
- **Player actions** (a `wms` command; each logs an event, and a refused one
  says why):
  - *Release*: chosen NEW orders go out at once as one wave (WAVE REL); the
    automatic wave timer is unchanged.
  - *Priority*: P1, P2 or P3 for an open order (PRIO); pickers take lines by
    priority from then on.
  - *Hold* and *release hold*: an order ON HOLD is not allocated, picked or
    moved on, and its pickers leave it (a line half picked waits again, its
    count undone); its cutoff still runs. Released, it goes back to where it
    was (PICKING goes back to ALLOCATED) and timed moves start their delay
    again (HOLD, UNHOLD).
  - *Assign*: a chosen picker drops what it is doing (that line waits again)
    and starts the chosen allocated line (ASSIGN, PICK START).
  - *Cancel a line*: a line not yet picked, on an order not yet picked, is
    CANCELLED: its allocation goes back to stock and it no longer counts.
    Cancelling every line cancels the order (CANCEL).
  - *Plan*: see the operating plan below.
  - *Expedite*: once per order, not after its cutoff has passed, for the pay
    of `wmsExpediteCostOrders` (30) orders at today's pay: the order becomes
    P1 and moves to a later, faster truck, `wmsExpediteLeadTicks` (5 min)
    added to its ship-by (EXPEDITE).
- **The operating plan** (W7). Decisions the WMS otherwise makes itself,
  set by the player with a `wms` command (`policy`), one PLAN event for each
  setting changed; a plan that changes nothing is refused:
  - *Pick order*: **priority first** (the default: best priority, then
    earliest ship-by), **cutoff first** (earliest ship-by, then priority) or
    **nearest bin** (each idle picker, lowest id first, takes the waiting
    line with the shortest walk from where it stands, the most urgent
    breaking a tie). Allocation follows the same urgency (priority first
    under nearest bin).
  - *Release*: **timed waves** (the default), **continuous** or **manual**
    (see Waves). Going back to timed waves puts the next wave a full
    `wmsWaveTicks` away.
  - *Crew*: the crew is `wmsPickers + wmsReceivers` (9) people; the plan
    sets how many pick, 1 to crew - 1, and the rest receive. It takes
    effect at once: new pickers start idle at the pick-and-drop point, new
    receivers idle; the highest-numbered leave first, and the line each was
    on waits again with its count undone (a PO line half counted in is
    counted again from the start).
  Measured on an idle WMS (seeds 1-8, 2 h; OTIF, on time, fill): the
  default 82%, 94%, 97.4%; cutoff first 84%, 96%, 97.3%; nearest bin 81%,
  93%, 97.1% (the pickers have slack, so less walking matters only with a
  backlog, where it picks more lines; a test checks it); continuous release
  84%, 97%, 97.1% (work starts sooner, but stock goes to whichever order
  comes first); seven pickers and two receivers 85%, 98%, 97.3%; five
  pickers 65%, 74%, 97.4%.
- **Goodwill and pay** (slice 8). Each destination country has goodwill,
  0-100, starting at `wmsGoodwillStart` (50). A shipment pays the warehouse
  `wmsUnitPayBp` (5%) of an idle order's pay (stars and site included) for
  each unit shipped, times (50 + the country's goodwill)%: x0.5 at goodwill
  0, x1.5 at 100. The cash counts as earned, so it counts towards stars.
  Then goodwill moves: +`wmsGoodwillGain` (3) for on time and in full; a
  late shipment loses `wmsGoodwillLatePerMin` (4) a started minute late, at
  most `wmsGoodwillLateMax` (20); a short one loses `wmsGoodwillShortMax`
  (15) times its share of units short. The bonus is small next to the
  trucks: the RULES 11 targets hold (first sale 36.2 min, was 36.3).
