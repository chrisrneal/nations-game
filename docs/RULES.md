# Rules: the warehouse (a WMS simulator)

The game-rules spec. Every number here is a tunable in
`packages/sim/src/tunables.ts` with the band in section 12; a test keeps the two
in step. Formulas are written in plain units (seconds, units, dollars) and
the code runs them in integer units (section 2). Decision record W10 explains
the outbound doors and the busier warehouse; W8 why the idle game was
removed and the warehouse management system (WMS) became the whole game;
W5-W7 how the WMS was built, and W1 (and P1 before it) the earlier pivots.

## 1. The game in one paragraph

You run a warehouse through its **warehouse management system**. Customers
abroad send **orders**, each a few lines of SKUs; the WMS releases them to the
floor, allocates stock from the bins, and creates a **pick task** for every
line it can fill. Suppliers send **purchase orders (POs)**, which the WMS
raises itself when stock runs low and books into a **dock appointment** in
the warehouse day; when a truck docks, the WMS creates a **receive task** for
every line, and once a line is counted in, a **put-away task** to take it to
its bin. Picked orders are packed and **staged at an outbound door**, where a
**load task** puts each onto the door's trailer; every trailer leaves on its
schedule with what is loaded on it (W10). The **crew** does the tasks:
pickers pick; the dock crew load trailers, receive and put away. The WMS
lines up the next few tasks for every worker and keeps a record of each
one's work, and a tap on any worker shows their tasks. Every shipment pays,
more for customers whose goodwill is high, and goodwill rises with orders shipped on
time and in full (OTIF) and falls with late and short ones. You set the
operating plan (the pick order, how orders are released and how often the
waves go, how many people pick and how many work the dock, and whether the WMS
moves people to where the work is), move single workers between picking and
the dock, step in on single orders (priority, hold, expedite,
cancel a line, put a picker on a line), and spend what shipments earn on more
people, inbound dock doors and outbound doors. The warehouse keeps running while the app is
closed, up to a cap. Single player, offline-first, no backend.

## 2. Time, units and the warehouse clock

- One tick is `tickMs` = 250 ms of wall clock at 1x: 4 ticks a second. The sim
  counts ticks and never reads a clock; the host decides when ticks happen (S4).
- The WMS steps once every `wmsStepTicks` (4) ticks: once a warehouse minute.
- **The warehouse clock** (W8): a warehouse minute passes every
  `wmsMinuteTicks` (4) ticks. A new warehouse opens on day 1 at
  `wmsDayStartMinute` (06:00). Every time on screen (ship-by, appointments,
  the log) is a time of this clock; the day changes at midnight, when today's
  totals become yesterday's (a `newDay` event). Rates (lines, units and cash
  an hour) are per warehouse hour.
- **Speed** (W9, a host setting, not a sim rule): the host runs the warehouse
  at 1, 5 or 10 warehouse minutes a real second, or pauses it; a new game runs
  at 5, so a warehouse hour is 12 real seconds and a day under 5 real
  minutes. Speed changes only how much wall time a tick takes (50 ms at 5):
  the same ticks give the same warehouse at any speed. The speed is kept with
  the save, and the warehouse runs at it while the app is closed too.
- Money is integer **cents**. The interface shows dollars (`$1.2K`, `$3.4M`).
- Stock and order quantities are whole **units**.
- Cash never exceeds `cashCapCents` (the safe is full); nothing in normal play
  gets near it.

## 3. A new warehouse

- **Seed.** Everything is drawn from the WMS's own seeded stream, from the
  warehouse seed: the same seed opens the same warehouse.
- **SKUs and bins.** 16 SKUs (`WMS_SKUS`), each in one bin; SKU `i` sits in a
  bin in `[37i, 37i + 36]`, shown aisle-bay-level+position (`A-03-2B`). Bins
  sit in four aisles A-D of 20 bays (bin `160a + 8(b-1) + k` is aisle `a`,
  bay `b`).
- **Sample orders.** `wmsSampleOrdersMin`-`wmsSampleOrdersMax` (20-30) NEW
  orders, numbered from O-10234 (section 4 says how orders are drawn).
- **Stock.** Each SKU ordered is stocked at a random
  `wmsStockCoverMinPct`-`wmsStockCoverMaxPct` (60-180%) of the units ordered
  of it, rounded down, so some lines will run short; a SKU nobody ordered
  holds `wmsQtyMin`-`wmsQtyMax` units.
- **Crew.** `wmsStartPickers` (14) pickers, W01-W14, and `wmsStartReceivers`
  (6) on the dock, W15-W20, all idle at the pick-and-drop point by the dock,
  with no tasks and a blank record. The default plan (section 8).
- **Dock.** `wmsDoors` (2) inbound dock doors, no purchase orders yet:
  reorder planning raises the first at the first step.
- **Outbound doors** (W10). `wmsShipDoors` (3) outbound doors, S1-S3, each
  with a trailer (TR-0001...) whose first departure is spread over the first
  `wmsTrailerTicks` (S1 at 20 warehouse minutes, S2 at 40, S3 at an hour).
- **Cash.** `startingCashCents` ($0).
- **Log.** One ORD CRT event per order with its units; the latest
  `wmsEventsKept` (400) events are kept (State cuts the log back in batches
  of up to 100, W10; the screens show the latest 400).

## 4. Orders: arrival, release, allocation, picking, shipping

- **The step.** Each WMS step runs, in this order: a new day, a new order,
  release, reorder planning, inbound (arrivals, PO closing, docking), a cycle
  count, allocation, every worker's work, the task plan, then each order's
  cutoff and timed moves.
- **New orders.** One arrives every `wmsOrderMinTicks`-`wmsOrderMaxTicks`
  ticks (6-10 warehouse minutes since W10), unless `wmsMaxOpenOrders` (80) are open.
  Each goes to a random country of 15 (`WMS_DESTINATIONS`) from a random
  customer of 8 (`WMS_CUSTOMERS`), status NEW. Priority: P1 Expedite
  `wmsExpediteChanceBp` (10%), P2 High `wmsHighChanceBp` (25%), else P3
  Standard. Ship-by is a lead time drawn in
  `[wmsCutoffMinTicks, wmsCutoffMaxTicks]` (3-8 warehouse hours) for P3,
  three quarters of a draw for P2, half for P1. 1 to `wmsLinesMax` (5) lines
  of different SKUs, each `wmsQtyMin`-`wmsQtyMax` (4-48) units, status OPEN.
  Shipped and cancelled orders beyond the latest `wmsKeepClosedOrders` (40)
  drop off the grid.
- **Release.** Under timed waves (the default), the first wave is
  `wmsFirstWaveTicks` after opening, then one every wave interval of the plan
  (section 8; `wmsWaveTicks`, a warehouse hour, to start): every NEW order not
  on hold is RELEASED in one wave (WAVE REL per order). Under continuous release every NEW order is released as a
  wave of its own the step it arrives; under manual release only the player
  releases.
- **Allocation.** Orders are allocated most urgent first by the plan's pick
  order (priority then ship-by under nearest bin), so a P1 released in the
  same wave as a P3 gets the stock first. Each open line takes what its SKU
  has available (on hand minus allocated), up to what it ordered (ALLOC), and
  the WMS creates a **PICK task** for it (section 6). A line given less is
  short by the rest (ALLOC SHORT); a line given nothing is SHORT and tries
  again every step until stock comes or its order finishes picking (getting
  a task when it does). An order given nothing at all is a BACKORDER and
  tries again every step.
- **Picking** is done by the pickers' PICK tasks (section 6): a line under a
  picker is PICKING, and so is its order. At the end of the line the picker
  confirms it (PICK CONF): the allocated units leave the bin, but with chance
  `wmsShortPickChanceBp` (3%) 1 to all of them were not there (SHORT PICK):
  the line is short by those. A line with nothing picked goes back to
  waiting for stock.
- **Packing and staging.** When no line of an order is waiting for or under a
  picker, the order is PICKED (SHORT if any unit is short; back to BACKORDER
  if nothing at all was picked). It is PACKED `wmsPackTicks` later (PACK),
  and `wmsStageTicks` after that STAGED at an outbound door (STAGE, with the
  door): the door whose trailer will take it soonest. A trailer takes it if
  the units already headed for its door (staged or loaded there) leave room
  for it in `wmsTrailerUnits` (300) and it can be loaded before the trailer
  leaves (its units at the loading rate); if not, that door's next trailer,
  or the one after for every trailer's worth already waiting. A tie goes to
  the door with least headed for it, then the lowest number. Staging creates
  the order's **LOAD task** (section 6).
- **Loading** (W10). A dock hand walks to the door and loads the order's
  picked units at `wmsLoadMilliPerSec` (8 units a warehouse minute); at the
  end it is LOADED (LOAD). A load starts only if it fits on the trailer: the
  units loaded and being loaded plus its own within `wmsTrailerUnits` (an
  order bigger than a trailer goes on an empty one).
- **Trailers and shipping** (W10). Each outbound door's trailer leaves at its
  time: every LOADED order on it ships at once (SHIP each; DEPART for the
  trailer, with its orders and units), and the next trailer backs in to leave
  `wmsTrailerTicks` (a warehouse hour) later. An order not loaded in time
  goes with the next trailer at its door; a held order on a trailer stays
  for the next. An empty trailer just waits for its next time.
- **Cutoffs and OTIF.** An open order whose ship-by passes logs CUTOFF MISS
  once and is late. A shipped order is on time if it was never late and in
  full if no line is short; on time and in full is OTIF. Totals since opening,
  for today, and per destination country are kept.

## 5. Inbound: purchase orders, dock appointments, receiving and put-away

- **Reorder planning** (W6). At opening and then every `wmsReplenTicks` (a
  warehouse hour), each SKU's position is worked out: available, plus units
  on open purchase orders not yet in the bin, minus the units order lines
  wait for (lines not yet given stock, on orders not yet past picking, NEW
  orders included). A SKU whose position is under the reorder point
  `wmsReorderUnits` (80) is ordered up to it plus `wmsReplenUnits` (120). Each
  SKU has one supplier (8 suppliers, `WMS_SUPPLIERS`); a run raises one PO per
  supplier, numbered from PO-50001 (PO CRT).
- **Dock appointments** (W8). The warehouse day is cut into appointment slots
  of `wmsApptSlotTicks` (30 warehouse minutes). A new PO books the first slot
  starting at or after its supplier's lead time (drawn in
  `wmsPoLeadMinTicks`-`wmsPoLeadMaxTicks`, 30-90 warehouse minutes from now)
  with fewer POs booked than the warehouse has dock doors: a slot takes at
  most one truck a door. The dock schedule shows each slot from the one under
  way, with its POs.
- **Trucks.** A truck arrives up to `wmsPoEarlyMaxTicks` (10 warehouse
  minutes) before its appointment; with chance `wmsPoLateChanceBp` (15%) it
  misses it, arriving 10 minutes to `wmsPoLateMaxTicks` (90 minutes) after, by
  a draw made when the PO is raised. Once the appointment passes without it,
  it logs PO LATE. A truck that arrives is ARRIVED, in the yard (ARRIVE).
- **Docking.** A PO frees its door once every line is counted in (it is then
  PUTAWAY), and closes once every line is in its bin (PO CLOSE). Then trucks
  in the yard dock at the lowest free door, earliest appointment first (DOCK),
  and are RECEIVING: the WMS creates a **RECEIVE task** for every line, at the
  dock (section 6).
- **Receiving.** A dock hand counts a line in at `wmsReceiveMilliPerSec` (6
  units a second). At the end of the line (RCV): with chance
  `wmsRcvShortChanceBp` (5%) the supplier sent 1 unit up to a quarter of it
  short (RCV SHORT), and with chance `wmsDamageChanceBp` (3%) 1 to
  `wmsDamageMaxUnits` (4) of the rest arrived damaged (DAMAGE) and are written
  off. The line is RECEIVED, and the WMS creates a **PUTAWAY task** for its
  good units (none for a line with none: it is STORED at once).
- **Put-away.** A dock hand walks the line to its bin and sets it down in
  `wmsPutawayDropTicks` (3 s); the units are in the bin (PUTAWAY) and only
  then can be allocated. Closed POs beyond the latest `wmsKeepClosedPos` (20)
  drop off the inbound grid.
- **Cycle counts** (W6). Every `wmsCountTicks` the next SKU in turn is counted
  (CYCLE CNT). With chance `wmsCountVarianceBp` (10%) the bin differs from the
  system by 1 to `wmsCountVarianceMax` (3) units, two times in three a loss:
  on hand is adjusted to what is there (ADJUST). A loss never takes allocated
  units. Accuracy is the share of counts that matched.
- **Inventory status.** A SKU is SHORT when the units order lines wait for
  (NEW orders included) are more than is available, OUT when nothing is
  available, LOW when available is under the reorder point, else OK.

## 6. Tasks and the crew (W8)

- **Tasks.** The WMS creates every piece of work as a task, numbered from
  T-00001: a PICK task per allocated order line (its bin, its allocated
  units), a RECEIVE task per line of a docked PO (at the dock, its expected
  units), a PUTAWAY task per line counted in (its bin, its good units), and a
  LOAD task per order staged at an outbound door (at the door, the order's
  picked units; W10). A task is OPEN (waiting for a worker), QUEUED (lined up
  for one), ACTIVE (being worked), then DONE or CANCELLED. Finished tasks move
  to a history after each step and command, the latest `wmsTasksKept` (400)
  of them kept (cut back in batches of up to 100), so every worker's page
  shows its recent work.
- **Roles.** Each worker picks or works the dock. Pickers do PICK tasks; the
  dock crew do LOAD, RECEIVE and PUTAWAY tasks. The plan's crew split sets
  how many pick (section 8).
- **The balance plan** (W9). Under the plan's *balance by need* labour, every
  `wmsBalanceTicks` (15 warehouse minutes), after the workers have worked and
  before the task plan, the WMS counts the tasks waiting for each side (lined
  up but not started, or open and ready to start) and the people on it. If
  one side has at least `wmsBalanceGap` (3) more tasks waiting a head than the
  other, and the other has two people or more, one person moves to it: one
  with no task first, then whoever has least lined up, the highest number on
  a tie (MOVE, marked balance). At most one person moves a look.
- **The task plan.** Every step, after the workers have worked, tasks whose
  line is gone, cancelled or done are cancelled. Then, for each role, the
  plan is redone when tasks wait for a worker and a worker of the role has
  room in its queue, or (under priority or cutoff first) a pick task that
  came in since the last step is more urgent than one already queued (for the
  dock crew: a load came in), or when a worker has nothing to do while
  another has tasks lined up. Only new work is looked at for that (W10):
  older work already lost to what was queued when the plan was last made.
  A priority change, an expedite or a hold released gives back what the crew
  has lined up, so the next step redoes the plan in full. Redoing it, every QUEUED task of the role
  goes back to the pool, and, round by round, each worker of the role (lowest
  id first) is given one more task until it holds `wmsTaskQueue` (3), its
  active task included. Pick tasks go most urgent first under the plan's pick
  order, or, under nearest bin, the one with the shortest walk from where the
  worker will stand once it has done what it holds (the most urgent breaking
  a tie). The dock crew's loads go first, the trailer that leaves soonest
  first (W10); then receive and put-away tasks, oldest first. Last, every
  worker with no task starts the first of its queue.
- **Working a task.** A worker starting a task walks to it: to the task's bin,
  or to the dock (the pick-and-drop point at the front of aisle A) for a
  receive, or to its outbound door for a load (W10). A walk is the bays
  between two spots in one aisle, or out to the front cross aisle, across
  (`WMS_AISLE_GAP_BAYS`, 3 bays an aisle) and in again, at
  `wmsWalkTicksPerBay` (1) ticks a bay; the outbound doors are down the
  front cross aisle past aisle D (3 bays more), then 2 bays a door along
  the shipping dock. Work starts the step after it arrives: picking at
  `wmsPickMilliPerSec` (1.1 units a second; PICK START when the task
  starts), counting at the receiving rate, loading at the loading rate,
  setting a pallet down in `wmsPutawayDropTicks`. A finished task is DONE and the worker
  starts the next in its queue at once. A worker stays where its last task
  was until its next.
- **The record.** Every step of every worker counts as idle (no task),
  walking, or working (at its bin or the dock); each finished task adds one
  task and its units. A worker's page shows these as shares of its time.
- **Taking work away.** A task whose order is put on hold, whose line is
  cancelled, whose worker changes role, or whose line is given to another
  picker by hand goes back to OPEN (or CANCELLED), and a line half picked or
  half counted starts again from nothing.

## 7. Goodwill and pay

- Each destination country has goodwill, 0-100, starting at
  `wmsGoodwillStart` (50).
- A shipment pays `wmsUnitPayCents` ($1) for each unit shipped, times (50 +
  the country's goodwill before it)%: x0.5 at goodwill 0, x1.5 at 100. The
  cash counts towards today's and the warehouse's earnings.
- Then goodwill moves: +`wmsGoodwillGain` (3) for on time and in full; a late
  shipment loses `wmsGoodwillLatePerHour` (4) a started warehouse hour late,
  at most `wmsGoodwillLateMax` (20); a short one loses `wmsGoodwillShortMax`
  (15) times its share of units short.

## 8. Player actions and the operating plan

A `wms` command; each logs an event, and a refused one says why.

- *Release*: chosen NEW orders go out at once as one wave (WAVE REL); the
  automatic wave timer is unchanged.
- *Priority*: P1, P2 or P3 for an open order (PRIO); pick tasks are handed out
  by priority from then on.
- *Hold* and *release hold*: an order ON HOLD is not allocated, picked,
  loaded or shipped; its pick tasks (and a staged order's load task, W10) go
  back to OPEN and wait (a line half picked starts again); a held order on a
  trailer stays behind when the trailer leaves; its cutoff still runs.
  Released, it goes back to where it was (PICKING goes back to ALLOCATED),
  timed moves start their delay again, and a loaded order leaves with its
  door's next trailer (HOLD, UNHOLD).
- *Assign*: a chosen picker drops what it holds (its active task and its
  queue go back to the pool) and starts the chosen allocated line's task at
  once, taking it from whoever had it (ASSIGN, PICK START). A dock hand cannot
  be assigned a pick.
- *Cancel a line*: a line not yet picked, on an order not yet picked, is
  CANCELLED with its task: its allocation goes back to stock and it no longer
  counts. Cancelling every line cancels the order (CANCEL).
- *Expedite*: once per order, not after its cutoff has passed, for
  `wmsExpediteCostCents` ($40): the order becomes P1 and moves to a later,
  faster truck, `wmsExpediteLeadTicks` (5 warehouse hours) added to its
  ship-by (EXPEDITE).
- *Move a worker* (W9): a chosen worker, or the one the WMS picks (worker 0:
  no task first, then least lined up), moves to picking or the dock. It
  drops its tasks, which wait for someone else (a line half done starts
  again), and the plan's split follows (MOVE, with the tasks waiting where it
  went). Each side keeps at least one person.
- *Hire* and *open a door*: section 9.
- **The operating plan** (W7), one PLAN event for each setting changed; a plan
  that changes nothing is refused:
  - *Pick order*: **priority first** (the default: best priority, then
    earliest ship-by), **cutoff first** (earliest ship-by, then priority) or
    **nearest bin** (section 6). Allocation follows the same urgency (priority
    first under nearest bin).
  - *Release*: **timed waves** (the default), **continuous** or **manual**
    (section 4). Going back to timed waves puts the next wave a full wave
    interval away.
  - *Wave interval* (W9): `wmsWaveMinTicks` (30 warehouse minutes),
    `wmsWaveTicks` (an hour, the default) or `wmsWaveMaxTicks` (2 hours). A
    shorter interval brings the next wave forward to at most that far away; a
    longer one leaves the next wave where it is.
  - *Labour* (W9): **fixed** (the default: people stay where the split and
    the moves put them) or **balance by need** (section 6).
  - *Crew*: how many of the crew pick, 1 to crew - 1; the rest work the dock.
    It takes effect at once: the highest-numbered dock hands move to picking,
    or the highest-numbered pickers to the dock, each dropping its tasks.

## 9. Growing: hiring and doors (W8, W10)

- *Hire* a picker or a dock hand: the next number (W21, W22, ...), idle at the
  pick-and-drop point, for `wmsHireCostCents` ($2,000) grown by
  `wmsHireCostGrowthBp` (x1.15) for each worker hired before, up to
  `wmsMaxCrew` (40) (HIRE). Hiring a picker raises the plan's pickers by one.
- *Open an inbound dock door*: the third door costs `wmsDoorCostCents`
  ($2,000), each further one `wmsDoorCostGrowthBp` (x2) more, up to
  `wmsMaxDoors` (4) (DOOR, line 1). A door takes one more truck an
  appointment slot, and one more truck at once.
- *Open an outbound door* (W10): the fourth costs `wmsShipDoorCostCents`
  ($1,500), each further one `wmsShipDoorCostGrowthBp` (x2) more, up to
  `wmsMaxShipDoors` (6) (DOOR, line 2). Its first trailer backs in at once and
  leaves in the middle of the longest wait between the trailers already on
  the timetable over the next `wmsTrailerTicks` (the earliest such wait on a
  tie): one more trailer an hour, so packed orders wait less and a big wave
  has room.
- Growth is in basis points: "grows by g" means `cost(n) = floor(cost(n-1) x
  g / 10000)`, so every machine computes the same integers.

## 10. The screens (what the WMS shows)

- **The bar on top:** the warehouse clock (day and time), pause and the speed
  (W9: a tap steps 1x, 5x, 10x), cash, today's earnings, settings.
- **The tabs**, in the bottom third: Floor, In, Out, Stock, Crew, Plan, with a
  KPI strip under the bar for the page on show and the activity console over
  the tabs (newest first; tapping a line opens its order, PO or worker).
- **Floor** (W7, W8). Drawn only from the WMS View. Inbound across the top:
  the trucks on the road (a count), the yard (ARRIVED POs), each dock door
  with the PO being received and its % counted in. The racks: aisles A-D of
  20 bays, every SKU's bin filled to its stock (green OK, amber LOW, red OUT
  or SHORT). Every worker is a numbered disc that walks the route the sim
  times and arrives when it says: pickers blue walking, green picking (with
  an arc for the share of the task done; a gold or blue ring for a P1 or P2
  order), the dock crew orange at the door of the truck they count (with an
  arc), yellow carrying a pallet to its bin on a put-away (the bin flashes
  when it lands), teal at an outbound door loading (with an arc; they walk
  down the front cross aisle to the shipping dock, W10), grey with no task.
  When a pick task is done its tote runs along the aisle to the front and
  down the conveyor to packing. Outbound along the bottom: the pack bench,
  packed, then a column for each outbound door (S1...) with the minutes until
  its trailer leaves, its lane of staged orders and its trailer with a fill
  bar. Every order past picking is a carton (gold P1, blue P2, cardboard P3;
  a red edge if short) where its status puts it; when a trailer leaves it
  pulls out down off the floor with its cartons, their pay rises from it, and
  the next backs in. A tap on a worker opens their tasks, on a
  carton its order, on a docked trailer its PO, on a bin its SKU, name and
  stock. Over the floor a line names the plan; a tap opens it.
- **In:** the purchase orders, open first by appointment, with status,
  appointment, supplier and progress; filters; the dock schedule; a PO's page
  with its lines and history.
- **Out:** the order grid (status, lines, %, priority, wave, ship-by), filters,
  **Trucks** (W10: each outbound door's trailer, when it leaves, how full it
  is, the orders on board and staged, who is loading; a tap opens an order)
  and the countries' goodwill; an order's page with its lines (and the worker
  on each), its outbound door and trailer time, actions and history.
- **Stock:** every SKU's bin, on hand, allocated, available, inbound, demand,
  counts and status.
- **Crew** (W8): every worker with their role, what they are doing (working,
  walking or idle), their task and how far through it, how many tasks are
  lined up next, tasks done and their share of time working. A worker's page:
  their record (tasks, units, working, walking and idle time, where they are),
  the task they work now, the tasks the WMS has lined up next in order, and
  the tasks they finished lately; tapping a task opens its order or PO. Over
  the list, where the work is (W9): each side's people, idle people and tasks
  waiting (and a head), the side that is behind lit, and "+ 1 here" to move
  someone over; a worker's page has "Move to the dock" (or picking).
- **Plan:** the pick order, release (with the wave interval and "Release a
  wave now"), the crew split and the labour plan with where the work is (W9),
  each with what it does and its catch; hiring, inbound doors and outbound
  doors with their prices.

## 11. Away, the offline cap, the recap; the report targets

- Closing the app does not stop the warehouse. When it reopens, the host steps
  every tick the wall clock owes at the speed it ran at, up to the ticks of
  `offlineCapMinutes` (8 hours at 1x: 20 warehouse days, which is 1 h 36 m of
  real time at 5x); time beyond the cap is lost, and a paused warehouse owes
  nothing (W9). Catch-up is the same sim stepping the same ticks,
  only faster; the result is exactly what stepping one tick at a time would
  give (tested).
- After an absence of at least 60 s (host setting), a recap of three lines
  shows once: how long you were away (and whether the cap stopped it, in
  warehouse days and in real time at the speed, and how many warehouse days
  went by); orders shipped, the share OTIF and what they
  earned; POs that came in, and orders that missed their cutoff, if any.
- A testing time skip in Settings (+5 min, +1 hour, +8 hours, of time at 1x
  whatever the speed) runs the warehouse ahead at once, exactly as a catch-up does but with no cap, and
  shows the same recap (a host cheat for playtesting; docs/GAPS.md).
- **The report** (`npm run harness -- report`; packages/harness/src/report.test.ts
  holds the targets on every build): an untouched warehouse with the default
  plan, seeds 1-8, 2 hours.

| Target | Measured (seeds 1-8, 2 h, W10) |
| --- | --- |
| On time and in full 75-95%: misses happen, and the plan and the order actions can save them | 84% (82-85%; on time 95-98%) |
| Fill rate 95% or more | 96% |
| Pickers working (not walking or idle) 50-90% of the time | 61% |
| Dock crew working 5-80% of the time | 48% |
| The first hire paid for by 2-10 warehouse hours of shipments | 2.8 ($717 a warehouse hour) |

The report also lists, per seed, the trailers that left and how full they
were (W10: about 337 trailers in 120 warehouse hours, 64% full).

## 12. Tunables

`value`, `min`, `max` are integers in code units. The test
`packages/harness/src/rules.test.ts` fails if this table and `tunables.ts`
disagree.

| Tunable | Value | Min | Max | Unit and why |
| --- | --- | --- | --- | --- |
| `tickMs` | 250 | 100 | 1000 | Wall ms per tick. Short enough that a tap feels immediate, long enough that 8 h of catch-up is 115,200 cheap steps. |
| `maxCommandsPerTick` | 16 | 4 | 64 | Engine limit: commands one tick accepts. A frantic thumb taps 10 times a second at most. |
| `cashCapCents` | 9000000000000000 | 9000000000000000 | 9000000000000000 | Engine limit: the safe-integer ceiling. The safe is full. |
| `startingCashCents` | 0 | 0 | 100000 | Cash a new warehouse opens with: nothing; the first shipments pay for the first hire. |
| `offlineCapMinutes` | 480 | 30 | 1440 | The warehouse runs while the app is closed for at most this long (8 h, a shift and a night): the catch-up is the same sim stepped fast (P4), so the cap bounds how long reopening takes. |
| `wmsMinuteTicks` | 4 | 1 | 60 | WMS clock (W8): ticks to a warehouse minute (one a real second at 1x, five at the default 5x, W9), so a warehouse day is 24 real minutes at 1x and the dock schedule, cutoffs and appointments read as times of day. |
| `wmsDayStartMinute` | 360 | 0 | 1439 | WMS clock: the minute of the day a new warehouse opens at (06:00, day 1). |
| `wmsSampleOrdersMin` | 20 | 5 | 30 | WMS: fewest sample orders a new warehouse opens with (docs/wms-plan.md slice 1; 20 since W10, the busier warehouse). |
| `wmsSampleOrdersMax` | 30 | 5 | 40 | WMS: most sample orders a new warehouse opens with: a morning's backlog for a crew of twenty (W10). |
| `wmsLinesMax` | 5 | 1 | 12 | WMS: most lines an order has (1 to this many, each a different SKU). |
| `wmsQtyMin` | 4 | 1 | 50 | WMS: fewest units on an order line. |
| `wmsQtyMax` | 48 | 2 | 500 | WMS: most units on an order line. |
| `wmsCutoffMinTicks` | 720 | 240 | 14400 | WMS: shortest time to ship-by of a Standard (P3) order (3 warehouse hours, 3 real minutes); High (P2) gets 3/4 of that, Expedite (P1) half. With 3-8 h an untouched WMS ships about 96% on time and 82% OTIF (W8 report, seeds 1-8, 2 h): misses happen, and priorities and expedites can save them. |
| `wmsCutoffMaxTicks` | 1920 | 480 | 28800 | WMS: longest time to ship-by of a Standard order (8 warehouse hours). |
| `wmsExpediteChanceBp` | 1000 | 0 | 5000 | WMS: chance a new order is P1 Expedite (10%). |
| `wmsHighChanceBp` | 2500 | 0 | 5000 | WMS: chance a new order is P2 High (25%); the rest are P3 Standard. |
| `wmsStockCoverMinPct` | 60 | 0 | 100 | WMS: least stock a SKU opens with, as % of the units ordered of it: under 100 some lines will be short. |
| `wmsStockCoverMaxPct` | 180 | 100 | 400 | WMS: most stock a SKU opens with, as % of the units ordered of it. |
| `wmsEventsKept` | 400 | 50 | 1000 | WMS: activity events kept in State (the oldest drop off); bounds the save and the feed. 400 since W10: three times the orders log three times the events. |
| `wmsStepTicks` | 4 | 1 | 8 | WMS: it steps once every this many ticks (1 s, a warehouse minute): the clock moves a minute a step, and 8 h of catch-up stays cheap. |
| `wmsPickMilliPerSec` | 1100 | 200 | 4000 | WMS: milli-units a picker picks a second once at the bin (1.1). 0.75 until W10; raised with three times the orders so fourteen pickers keep up with a little to spare: an untouched warehouse ships about 82% OTIF with pickers working about 61% of the time (W10 report, seeds 1-8, 2 h). |
| `wmsFirstWaveTicks` | 120 | 0 | 1200 | WMS: ticks from opening to the first automatic wave (30 warehouse minutes): long enough to see NEW orders and release them by hand. |
| `wmsWaveTicks` | 240 | 40 | 2400 | WMS: ticks between automatic waves (a warehouse hour): every NEW order not on hold is released. |
| `wmsWaveMinTicks` | 120 | 40 | 1200 | WMS plan (W9): the shortest wave interval the Plan offers (30 warehouse minutes): orders reach the floor sooner, in smaller waves, so a P1 has less company to beat to the stock. |
| `wmsWaveMaxTicks` | 480 | 240 | 4800 | WMS plan (W9): the longest wave interval the Plan offers (2 warehouse hours): big waves let the most urgent take the stock first, but orders wait longer to start. |
| `wmsBalanceTicks` | 60 | 20 | 960 | WMS labour (W9): under the balance plan the WMS looks at the work waiting every this many ticks (15 warehouse minutes) and moves at most one person, so the crew does not churn. |
| `wmsBalanceGap` | 3 | 1 | 20 | WMS labour (W9): the balance moves a person when one side has at least this many more tasks waiting a head than the other. At 3 a full queue on every picker (2 waiting a head) does not pull receivers off an empty dock by itself. |
| `wmsOrderMinTicks` | 24 | 20 | 1200 | WMS: shortest gap before the next order arrives (6 warehouse minutes; 20 before W10, the busier warehouse). |
| `wmsOrderMaxTicks` | 40 | 40 | 2400 | WMS: longest gap before the next order arrives (10 warehouse minutes; an order every 8 minutes on average, about 7 an hour, three times W9's). |
| `wmsMaxOpenOrders` | 80 | 10 | 300 | WMS: no new order arrives while this many are open, so a long absence cannot swamp the floor (80 since W10: about 11 warehouse hours of orders; it also bounds the backlog a catch-up plans, so 8 hours away with half the pickers stays under a second in Node). |
| `wmsKeepClosedOrders` | 40 | 0 | 300 | WMS: shipped and cancelled orders kept on the grid; older ones drop off. |
| `wmsPackTicks` | 20 | 0 | 240 | WMS: ticks from PICKED (or SHORT) to PACKED (5 s). |
| `wmsStageTicks` | 20 | 0 | 240 | WMS: ticks from PACKED to STAGED (5 s). |
| `wmsLoadMilliPerSec` | 8000 | 1000 | 40000 | WMS outbound (W10): milli-units a dock hand loads onto a trailer a second (8): an order of 80 units takes 10 warehouse minutes. |
| `wmsShortPickChanceBp` | 300 | 0 | 2000 | WMS: chance a picker finds a bin short of what was allocated (3%): a SHORT PICK of 1 unit up to the whole line. |
| `wmsWalkTicksPerBay` | 1 | 0 | 8 | WMS (W7): ticks a picker takes to walk past one bay (4 bays a second). A line across the warehouse is about 30 bays (8 s); between bins in one aisle a few seconds. Walking is why the nearest-bin pick order picks more lines an hour. |
| `wmsReplenTicks` | 240 | 40 | 2400 | WMS: ticks between reorder planning runs (a warehouse hour, W6); the first runs at opening. |
| `wmsReorderUnits` | 180 | 0 | 500 | WMS: reorder point: a SKU whose position (available + inbound - units waiting) is under this gets a PO line (W6). 80 until W10; raised with three times the orders, so fill stays at 96% (at 160 it fell to 95%). |
| `wmsReplenUnits` | 240 | 10 | 1000 | WMS: a PO line orders the SKU up to the reorder point plus this many units (W6; 120 until W10). |
| `wmsGoodwillStart` | 50 | 0 | 100 | WMS: goodwill (0-100) every destination country starts at. |
| `wmsExpediteLeadTicks` | 1200 | 0 | 7200 | WMS: an expedited order goes P1 and onto a later, faster truck: this much is added to its ship-by (5 warehouse hours). |
| `wmsGoodwillGain` | 3 | 0 | 20 | WMS: goodwill a country gains when its order ships on time and in full. |
| `wmsGoodwillLatePerHour` | 4 | 0 | 50 | WMS: goodwill lost for each started warehouse hour (a real minute) an order ships after its cutoff. |
| `wmsGoodwillLateMax` | 20 | 0 | 100 | WMS: most goodwill one late order can cost. |
| `wmsGoodwillShortMax` | 15 | 0 | 100 | WMS: goodwill an order shipped with nothing would cost; a short order costs this times its share of units short. |
| `wmsReceiveMilliPerSec` | 6000 | 500 | 20000 | WMS inbound: milli-units a receiver counts in a second (6): a 200-unit line takes about 33 s. |
| `wmsRcvShortChanceBp` | 500 | 0 | 5000 | WMS inbound: chance a supplier sends a line short (5%): 1 unit up to a quarter of it is missing. |
| `wmsDamageChanceBp` | 300 | 0 | 5000 | WMS inbound: chance some of a line arrives damaged (3%): written off, never put away. |
| `wmsDamageMaxUnits` | 4 | 1 | 50 | WMS inbound: most units of a line that arrive damaged. |
| `wmsKeepClosedPos` | 20 | 0 | 200 | WMS inbound: closed POs kept on the inbound grid; older ones drop off. |
| `wmsCountTicks` | 120 | 20 | 2400 | WMS inventory (W6): ticks between cycle counts (30 s); each counts the next SKU in turn, so every SKU is counted every 8 min. |
| `wmsCountVarianceBp` | 1000 | 0 | 5000 | WMS inventory: chance a cycle count finds the bin differs from the system (10%); two in three are losses. |
| `wmsCountVarianceMax` | 3 | 1 | 50 | WMS inventory: most units a cycle count adjusts by; a loss never takes allocated units. |
| `wmsStartPickers` | 14 | 1 | 30 | WMS crew (W8): workers a new warehouse opens with on picking (W01..W14 since W10). Fourteen keep up with an order every 8 minutes with a little to spare. |
| `wmsStartReceivers` | 6 | 1 | 20 | WMS crew: workers a new warehouse opens with on the dock (W15..W20 since W10): they receive, put away and load the outbound trailers. |
| `wmsMaxCrew` | 40 | 20 | 60 | WMS crew: the most workers the warehouse can hire (40 since W10); the floor draws them all and the Crew page lists them. |
| `wmsHireCostCents` | 200000 | 5000 | 500000 | WMS crew: cents for the first worker hired ($2,000, about three warehouse hours of shipments at W10's volume; $500 before). |
| `wmsHireCostGrowthBp` | 11500 | 10500 | 30000 | WMS crew: each further hire costs this much more (x1.15 since W10, x1.5 before: a crew of 40 is 20 hires). |
| `wmsTaskQueue` | 3 | 1 | 8 | WMS tasks (W8): tasks the WMS lines up for each worker, the one it works on included. The plan is redone every second, so a new urgent task still goes to the front; at 1 a worker only gets its next task when it finishes. |
| `wmsTasksKept` | 400 | 20 | 1000 | WMS tasks: finished and cancelled tasks kept in State (the oldest drop off), so each worker shows its latest work; bounds the save. 400 since W10, for a crew of 20-40. |
| `wmsPutawayDropTicks` | 12 | 0 | 240 | WMS inbound (W8): ticks a worker takes to set a received line down in its bin after walking it there (3 s). |
| `wmsDoors` | 2 | 1 | 8 | WMS inbound: dock doors a new warehouse opens with; each appointment slot books at most one truck a door. |
| `wmsMaxDoors` | 4 | 2 | 8 | WMS inbound: the most dock doors; four fit the floor on a 360 px phone. |
| `wmsDoorCostCents` | 200000 | 20000 | 2000000 | WMS inbound: cents for the third dock door ($2,000). |
| `wmsDoorCostGrowthBp` | 20000 | 11000 | 40000 | WMS inbound: each further door costs this much more (x2). |
| `wmsShipDoors` | 3 | 1 | 6 | WMS outbound (W10): outbound dock doors a new warehouse opens with, each with a trailer on a schedule; staggered, so with 3 a trailer leaves every 20 warehouse minutes. |
| `wmsMaxShipDoors` | 6 | 2 | 8 | WMS outbound (W10): the most outbound doors; six fit the floor on a 360 px phone. |
| `wmsShipDoorCostCents` | 150000 | 20000 | 2000000 | WMS outbound (W10): cents for the first outbound door bought ($1,500). |
| `wmsShipDoorCostGrowthBp` | 20000 | 11000 | 40000 | WMS outbound (W10): each further outbound door costs this much more (x2). |
| `wmsTrailerTicks` | 240 | 60 | 960 | WMS outbound (W10): a trailer leaves each outbound door this often (a warehouse hour), with whatever is loaded on it; the doors are staggered. |
| `wmsTrailerUnits` | 300 | 100 | 2000 | WMS outbound (W10): units a trailer holds. Three doors carry 900 units a warehouse hour against about 560 ordered: room for a wave. With two doors an untouched warehouse falls to about 74% OTIF; with one, orders pile up at the dock. |
| `wmsApptSlotTicks` | 120 | 40 | 960 | WMS inbound (W8): a dock appointment slot (30 warehouse minutes); reorder planning books each PO into the first slot after its lead time with a door free. |
| `wmsPoLeadMinTicks` | 120 | 40 | 4800 | WMS inbound: shortest lead time from raising a PO to the earliest appointment it may book (30 warehouse minutes). |
| `wmsPoLeadMaxTicks` | 360 | 40 | 9600 | WMS inbound: longest lead time (90 warehouse minutes). With 30-90 min an idle WMS keeps its SKUs stocked. |
| `wmsPoEarlyMaxTicks` | 40 | 0 | 240 | WMS inbound: an on-time truck arrives up to this early for its appointment (10 min). |
| `wmsPoLateChanceBp` | 1500 | 0 | 5000 | WMS inbound: chance a supplier's truck misses its appointment (15%). |
| `wmsPoLateMaxTicks` | 360 | 40 | 4800 | WMS inbound: most a late truck is late (90 min); it is at least 10 min late. |
| `wmsUnitPayCents` | 100 | 10 | 1000 | WMS pay (W8): cents a shipped unit pays at goodwill 50 ($1), times (50 + goodwill)%: an order of about 80 units pays about $80. |
| `wmsExpediteCostCents` | 4000 | 500 | 50000 | WMS: an expedite costs this ($40): real money, about half an order's pay. |

## 13. Invariants

Checked by property tests on every build:

- Cash and every bin's stock are never negative; allocated stock is never more
  than on hand; a line never picks more than it ordered.
- Every queued or active task is held by exactly one worker, of the task's
  role, and no worker holds more than `wmsTaskQueue` tasks; a line being
  picked has exactly one active pick task. Each side of the crew keeps at
  least one person, and the plan's pickers is the number on picking.
- Only live tasks are in the task list; finished ones are in the history
  (W10). Every staged or loaded order is at an outbound door that exists, and
  no trailer holds more than `wmsTrailerUnits` (an order bigger than a whole
  trailer aside, alone on it).
- Cash only changes by shipments (up) and what the player pays for (down: an
  expedite, a hire, a door), and cash = opening cash + earned - spent.
- The same seed and the same commands always give the same state hash, in Node
  and in Chromium.
- Catching up N ticks at once gives exactly the state that stepping N single
  ticks gives.
- A save reloads to the same state hash and continues identically.
- Saves are version 9 (W10). Version 8 gains the outbound doors and their
  first trailers, its staged and loaded orders go back to PACKED to be staged
  at a door, finished tasks move to the history, and the crew is topped up
  to the opening crew (14 picking, 6 on the dock) for free; version 7 first
  gains the plan's wave interval (an hour) and fixed labour (W9); versions
  1-6 (the idle game with the WMS beside it) migrate to a fresh WMS at the
  save's tick, keeping its cash; an airport save is refused with a message
  saying so. Old histories replay under today's rules and are re-hashed.
