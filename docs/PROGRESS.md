# Progress
Current state: **a warehouse simulator: the WMS is the whole game** (decision
record W8). The idle game (backlog, trucks, upgrades, boosts, stars) was
removed on 2026-10-07; it is at commit `b34368a`, and the entries below W8
describe it. On 2026-10-06 the airport game became a warehouse game (W1,
W2). The airport is at commit `5f78bce`; the entries below that date
describe it in airport words (gates, planes, passengers, security). The
Nations log is at commit `67d1d92`.

## Slices
- [x] Airport pivot slices 1-8 (docs/ROADMAP.md, History)
- [x] Warehouse pivot (W1), one pull request (W2)
- [x] Star perks (W3)
- [x] WMS, nine slices (W5, docs/wms-plan.md)
- [x] WMS Inbound, Outbound and Inventory pages (W6, wms-plan slice 10)
- [x] The WMS is home: a live floor drawn from the WMS, and the plan (W7, wms-plan slice 11)
- [x] The WMS is the game: tasks for every worker, a Crew page, dock appointments, the idle game removed (W8, wms-plan slice 12)

## Session log

### 2026-10-07 - The WMS is the whole game: workers' tasks, dock appointments, the idle game removed (lanes C, S, H, U, P, D; owner request, W8)
**What changed.** The idle game is gone: no docks screen, trucks, taps,
upgrades, boosts, selling or stars. The WMS now creates a task for every
piece of work (pick a line, count a PO line in at the dock, put it away in
its bin) and lines up the next few for each worker of the right role; every
worker keeps a record of tasks, units and time working, walking and idle.
Tap a worker on the floor, or open the new **Crew** tab, to see what they do
now, what is next and what they finished. Receivers now put away themselves
(you see them drive pallets into the racks). The warehouse has a clock (a
minute a second, day 1 opens at 06:00); new POs are booked into **dock
appointments** in the day (In > Dock schedule), and every time on screen is a
time of day. Shipments are the only income ($1 a unit times goodwill); the
Plan tab hires pickers and receivers and opens dock doors. The tabs are at
the bottom; the top bar shows the clock, cash and today's earnings. Away
time runs up to 8 hours (was 2-24 with the night shift). Old saves keep their
cash and time and open a fresh WMS (save schema 7).
**Checks.** `npm test` and `npm run check` pass (new: 10 task-engine tests,
property tests over random WMS play, appointment and receiving-task tests, a
real version-6 save migrated, a WMS report test; the idle tests and pacing
bots are gone). `npm run harness -- report`, seeds 1-8, 2 h: 82% OTIF, 97%
fill, pickers working 69% of the time, $210 a warehouse hour. Determinism:
1,000 warehouses identical in Node and Chromium. Phone check 47/47 at
360 x 740 (floor and busy floor at 58-60 fps with the CPU slowed 4x; reopens
after 10 hours away in 1.5-1.7 s); no sideways scroll on any page
(`e2e/wms-shots.ts`).
**How to see it.** Open the app; tap any numbered dot on the floor. Or the
Crew tab, then a worker. In > Dock schedule for the appointments.
**What is left.** Demand is fixed (an order every 20-30 warehouse minutes), so
hiring past what the orders need does little; growing demand, automation to
buy and dock hours are owner decisions (docs/GAPS.md, ROADMAP Next).

### 2026-10-07 - The WMS becomes the game: live floor, plan, home (lanes C, S, H, U, D; owner request, W7)
**What changed.** The app opens on the WMS. Its new Floor tab draws the
warehouse from what the WMS is doing: trucks at the two dock doors,
receivers counting them in, forklifts putting each line into its bin, the
real pickers walking to their line's bin and picking it (an arc fills), a
tote down the conveyor for each finished line, and every order past picking
as a carton moving from the pack bench to packed, staging and the truck,
which pulls out when its orders ship. Tap a picker or carton for its order,
a trailer for its PO, a bin for its SKU. A new Plan tab lets you change the
WMS's own decisions: pick order (priority, cutoff, nearest bin), release
(timed waves, continuous, manual) and crew (how many of the nine pick and
how many receive). Each change is logged (PLAN) and saved (schema 6). In
the sim, pickers now walk between bins (four aisles of 20 bays), and
allocation goes most urgent first. The old floor with the trucks and boosts
is the Docks screen (button at the bottom); the tabs are now Floor, In, Out,
Stock, Plan.
**Checks.** `npm test` and `npm run check` pass (new: 12 plan and walking
sim tests, 10 floor-model tests, a real version-5 save migrated). Idle WMS
over 2 h, seeds 1-8: 82% OTIF, 94% on time (was 84%, 95%); pacing targets
hold. Phone check 74/74 at 360 x 740 (the WMS floor at 60 fps with the CPU
slowed 4x; the plan changes in two taps); no sideways scroll on any WMS
page (`e2e/wms-shots.ts`).
**How to see it.** Open the app: it starts on the Floor. Watch the numbered
pickers walk and the cartons move along the bottom. Tap Plan, choose
Nearest bin and press + under Crew, then go back to Floor: a seventh picker
appears and the KPIs above show the effect. Docks (bottom left) has the
trucks and boosts.
**What is left.** Most of the money still comes from the Docks screen;
making the WMS the money-maker needs a pacing pass and the owner's go
(docs/GAPS.md, W7).

### 2026-10-07 - WMS Inbound, Outbound and Inventory (lanes C, S, H, U, D; owner request, W6)
**What changed.** The WMS's Orders | Countries toggle is now Inbound |
Outbound | Inventory. Outbound is the order grid as before (Countries is a
chip at the end of its filters; the wave countdown is in its KPI strip).
Stock no longer refills by magic: the WMS plans reorders every minute and
raises purchase orders to eight suppliers; trucks arrive on an ETA (some
late), wait for one of two dock doors, are counted in by three receivers
(some lines short or damaged) and put away into the bins. Inbound lists the
POs with status, supplier, % received, ETA and door; tap one for its lines
and history. Inventory lists every SKU with on hand, allocated, available,
inbound, units waiting, bin, picked, last cycle count and variance, with a
status chip; rolling cycle counts find and adjust small variances. Each page
has its own KPI strip. The activity feed opens a PO from an inbound line.
Save schema 5 (old saves keep their orders and stock and gain empty
inbound).
**Checks.** `npm test` and `npm run check` pass (new: 17 inbound and
inventory sim tests, 3 view tests, 3 grid tests, the version-4 save
migration with a real save file). Pacing targets hold (first sale 36.2 min).
An idle WMS ships 84% OTIF and 98% fill over 2 h (was 80% and 97%). 24 h
catch-up 568 ms in Node (496 ms for the build before on this machine). No
sideways page scroll at 360 px on any WMS page (`e2e/wms-shots.ts`).
**How to see it.** Tap WMS (bottom left), then Inbound or Inventory at the
top. Watch a PO go IN TRANSIT, ARRIVED, RECEIVING, PUTAWAY, CLOSED.
**What is left.** See docs/GAPS.md (W6): no inbound actions yet.

### 2026-10-07 - WMS slices 4-9: detail, activity, KPIs, actions, goodwill, polish (lanes C, S, H, U, P, D; owner request, W5)
**What changed.** The WMS is complete (docs/wms-plan.md). Tap an order for
its detail: summary, lines with shorts in red, its own activity, and
actions: priority, hold, expedite for cash (once, P1 and 5 more minutes),
and per line a picker to put on it or a two-tap cancel. Release... on the
grid releases chosen NEW orders as a wave. A console docked at the bottom
shows the latest 200 events, exceptions in red, tap to open the order. A
KPI strip shows open orders, lines an hour, fill, OTIF, exceptions and
pickers. Shipped WMS orders now pay 5% of an idle order's pay a unit times
their country's goodwill factor (x0.5-x1.5); goodwill moves with on-time,
in-full shipments, shown on a Countries tab; a toast says when a P1 order
ships or a P1/P2 order misses its cutoff. Cutoffs tightened to 3-8 min so
priorities matter (idle: about 93% on time, 80% OTIF). Save schema 4.
Polish: windowed grid rows, the floor paused under the WMS, 40 px controls,
empty states, reduced motion.
**Checks.** `npm test` (486) and `npm run check` pass; pacing targets hold
(first sale 36.2 min, was 36.3); no sideways page scroll at 360 px on any
WMS screen (`e2e/wms-shots.ts`); 300 orders and 2,000 lines scroll at
52-58 fps with the CPU slowed 4x (`e2e/wms-perf.ts`, budget 55).
**How to see it.** Tap WMS (bottom left). Countries is the tab at the top.
**What is left.** See docs/GAPS.md (W5): play it on a real phone.

### 2026-10-07 - WMS slices 2-3: orders move, and the order grid (lanes C, S, H, U, D; owner request, W5)
**What changed.** The WMS now runs (RULES 16): a new order every 20-30 s,
an automatic wave each minute (the first after 30 s), allocation from stock
with shorts and backorders, replenishment, six pickers picking lines by
priority then ship-by, the odd short pick, then pack, stage, load and ship,
with cutoff misses and OTIF counted. A WMS button in the bottom bar opens
the order grid: dense monospace rows, a sticky header and Order # column,
flags, colour-coded status chips, lines and percent picked with a bar, more
columns by scrolling sideways inside the grid, sort by any header, and
filters (All, Open, Picking, Exceptions, Shipped). Save schema 3.
**Checks.** `npm test` (457) and `npm run check` pass; 24 h catch-up takes
about 300 ms in Node (was 117 ms; budget 2 s on a phone); no sideways page
scroll at 360 px on the grid (`apps/web/e2e/wms-shots.ts`).
**How to see it.** Tap WMS (bottom left). The badge shows open orders, or
a red count of exceptions.
**What is left.** Slices 4-9: order detail, activity feed, KPI strip,
player actions, the feedback loop and polish.

### 2026-10-07 - WMS slice 1: orders, lines, stock and pickers in State (lanes C, S, H, U, D; owner request, W5)
**What changed.** The start of a warehouse management system (docs/wms-plan.md,
decision record W5). Every warehouse now opens with 10-15 key-account orders
to customers in 15 countries (O-10234 onward), each with 1-5 lines of SKUs
such as GRN-0042 wheat or CHP-2030 chips in bins like A-03-2B, P1-P3
priorities and a ship-by time, plus stock per bin (sometimes short of what
is ordered), six idle pickers and an ORD CRT log line per order. It is all in
State on its own seeded stream (save version 2; old saves gain a WMS and
nothing else), and nothing moves yet. The brief was written for the retired
Nations game, so nations became destination countries (W5).
**Checks.** `npm test` (404; new: the generator's 10 tests and the
version-1 save migration with a real save file) and `npm run check` pass;
the idle game's numbers are unchanged (the pacing test holds).
**How to see it.** Settings sheet: the "WMS (debug)" line counts orders,
lines, units, SKUs and pickers.
**What is left.** Slices 2-9: the tick engine, the order grid, detail,
activity feed, KPIs, player actions, the feedback loop and polish.

### 2026-10-07 - Bigger customers send bigger orders (architect, lanes C, S, H, U, D; owner request, W4)
**What changed.** Order size is now a real rule (RULES 3b). An order averages
1.2 items at Local shops, and each Better contracts level adds 0.15 (2.1 at
Overseas, 2.55 at Everything store). Every item is its own pick and its own
unit of stock, so a better contract pays 60% more an order but makes picking
and the racks work harder: the bottleneck moves to pickers or receiving
sooner. Pickers and receiving were raised 20% (2.88 items a second, 144-unit
shelves, 72 units at opening) so the first warehouse opens exactly as before.
On the floor each ticket is now one order, and its size is drawn so the totes
match the real average: about one in ten at Local shops, over 40% by
Overseas. The Better contracts card says "bigger orders".
**Tuning.** Every RULES 11 target holds on seeds 1-5: first sale 36.0-36.3
minutes (was 35.3-35.6), longest wait 4.3 min, tapping 2.1-3.2x idle,
estimate within 4%. At +0.2 items a level the wait for contract 6 passed 5
minutes, so the step is 0.15. Report: docs/balance/warehouse-pacing.md.
**Checks.** `npm test` (370; new: items per contract with worked numbers, a
tick at National retailer takes 1.8 units an order, the tote mix averages the
real figure, no totes at 1 item an order) and `npm run check` pass. Phone
check 64/65 at 360 x 740: the 60 fps run read 32.7-38.6 fps with the CPU
slowed 4x, but this session's machine reads 35.4-37.1 for the unchanged game
(earlier sessions read 56-58), so it is logged in docs/GAPS.md to recheck.
Forklifts now carry an average order's items each, so bigger orders do not
add forklifts; pickers filling totes still mean about 20% more goods moving
in the busy warehouse (104-109 against 86-87).
**How to see it.** Buy Better contracts a few times and watch the floor: more
pickers push totes, and the racks empty faster for the same orders.
**What is left.** See docs/GAPS.md (W4 entries).

### 2026-10-07 - Multi-item orders picked into totes (lanes U, D; owner request)
**What changed.** About a third of the orders a picker takes are now
multi-item orders of 2 to 4 items. The picker pushes a blue tote, walks to a
different rack location for each item (along the same aisle where it can,
otherwise out the aisle's left end and into the next), takes a carton at each
(that location empties and flashes), and the tote fills as it goes. Then it
takes the full tote down to staging like a single carton. Each item is one
ticket off the board and one unit of stock, so every count on screen is still
exact. This is a screen change only: in the game's rules every order is still
one unit (RULES 3), and RULES 14 now says how orders group into totes.
**Checks.** `npm test` (366; new: tote orders are 2-4 items, about a third of
orders, each item from a different location, and the 60 orders picked are
exactly 60 items) and `npm run check` pass. Phone check 65/65 at 360 x 740
(57.2 and 57.8 fps with the CPU slowed 4x). At 412 x 915 the 60 fps check
read 47.5-54.0 fps, against 54.4-54.6 for the unchanged game on this
machine; see docs/GAPS.md.
**How to see it.** Open the app and watch the pickers leave the order board:
some push a blue tote that fills with cartons, one rack location at a time.
**What is left.** Making big orders a real rule (more stock and picking time
per order) needs a decision record; see docs/GAPS.md.

### 2026-10-06 - Picked orders leave the racks on the left (lanes U, D; owner request)
**What changed.** A picker used to carry its carton out of the right end of
the aisle and down the same cross aisle the inbound forklifts use, so
receiving and staging looked like one straight line down the right side. Now
the picker walks back out of the aisle's left end, down past the order board,
and along a walkway above staging into its lane. Export and customs moved to
the left end of the staging row, so cartons pass them on that side first. The
right-hand cross aisle is now used only by put-away and replenishment. No sim
or rule change.
**Checks.** `npm test` (365; the picker test now checks that cartons leave by
the aisle's left end and never use the cross aisle) and `npm run check` pass.
Phone check 65/65 at 360 x 740 (57.5 fps with the CPU slowed 4x).
**How to see it.** Open the app and watch a picker: carton in hand, it heads
left toward the order board, down into staging, and through Export if a
contract adds it.
**What is left.** Nothing new.

### 2026-10-06 - Put-away, replenishment and floor picking on the floor (lanes U, D; owner request)
**What changed.** The racks are split: **floor pick** locations at the front
of each run (by the order board, marked on the floor) and **reserve** behind.
After quality check a yellow **forklift** carries each carton down the cross
aisle to a reserve location, sets it down (that location fills, with a short
flash) and backs out. When the floor pick locations run low, **reach trucks**
drive in, lift a pallet off a reserve location and set it down in a floor
pick location along the same aisle. **Pickers** now show as pale figures:
each walks to a floor pick location, takes a carton (that location empties)
and carries it to staging; when the floor is bare they pick from reserve.
The racks still hold exactly the real stock; only the floor/reserve split is
for show (RULES 14). No sim or rule change.
**Speed.** Nothing was capped or slowed. To pay for the new movement, the
racks, staging lanes and truck loads moved to a second canvas that redraws
only when they change (about 1 frame in 14). The floor's drawing now costs
about 2.4 ms a frame with the CPU slowed 4x, against 2.9 ms before.
**Checks.** `npm test` (365) and `npm run check` pass. Phone check 65/65 at
360 x 740 (56.0 and 57.6 fps with the CPU slowed 4x) and at 412 x 915 (55.6,
57.8 and 56.5 fps; the unchanged game read 54.3-58.2 there in this session).
New check: reach trucks are out replenishing in the busy warehouse.
**How to see it.** Open the app and watch the racks: yellow forklifts going
into reserve on the right, reach trucks carrying pallets left to the floor
pick area, pale pickers taking cartons from it.
**What is left.** See docs/GAPS.md (floor entries).

### 2026-10-06 - The floor flows like a warehouse (lanes U, D; owner request)
**What changed.** The airport-style picking maze is gone. The floor now runs
top to bottom the way a warehouse does: the **inbound dock** (cartons come off
the PO, through QC, and are put away), **storage racks** (three runs of
racking with two aisles; each carton slot is filled from the real stock),
**picking** (orders wait as tickets on an order board, the real backlog; a
picker walks the oldest one down an aisle, takes a carton off the rack and
carries it out), **staging** (one marked lane per dock where cartons wait
before loading) and the **outbound docks**. No new upgrades and no rule
changes: the sim is untouched, only what the screen shows.
**Checks.** `npm test` (363, after merging star perks) and `npm run check` pass. Phone check 64/64 at 360
x 740 (56.2 fps with the CPU slowed 4x); at 412 x 915 60/60 at 55.8 fps and
59/60 at 53.7 fps in a second run. The unchanged game read 48.5-52.8 fps on
this machine in the same session, so the machine is noisy; see docs/GAPS.md.
**How to see it.** Open the app: cartons walk from the PO into the racks,
blue order tickets queue on the board, pickers carry cartons through the
aisles to the staging lanes, and from there down to the trucks.
**What is left.** Play it on a real phone; see docs/GAPS.md (floor entries).
### 2026-10-06 - Star perks (architect, all lanes; owner request, W3)
**What changed.** Stars now unlock five permanent perks as you own more of
them, never spent: Head start (1 star: a new warehouse opens with $250),
Second dock (3: it opens with two docks), Quick charge (6: boosts recharge 25%
faster), Express lane (10: express trucks twice as often), Long shift (15:
offline cap x1.5). A ★ button by the site's name opens the stars sheet with
every perk and how many stars it needs; the sell sheet names the perks the
sale unlocks; the welcome sheet lists those owned. RULES 10a; nine tunables.
No State, command or save change: perks are worked out from the stars owned.
**Tuning.** Every RULES 11 target unchanged (the first warehouse has no
perks); the greedy bot's second sale is about 40 s sooner. Report:
docs/balance/warehouse-pacing.md.
**Checks.** `npm test` and `npm run check` pass. Phone check 64/64 at 360 x
740 (58.4 fps with the CPU slowed 4x), including the stars sheet and a sale
that opens Port Calder with two docks and Head start's cash.
**How to see it.** Tap ★ 0 at the top right, beside the gear. Sell a warehouse
worth 3 stars and the next one opens with two docks and $250.
**What is left.** Whether the thresholds feel right needs real play: the
greedy bot owns 7 stars after 90 minutes, so Express lane and Long shift are
a few sales away; see docs/GAPS.md.

### 2026-10-06 - The warehouse (architect, all lanes; owner request, W1)
**What changed.** The game is now Warehouse Idle. Orders come in and wait in
the backlog (the maze in the middle of the screen); pickers take each one's
unit off the shelves into packing; trucks at the docks fill box by box and pay
when they leave. New: purchase orders arrive at the receiving dock along the
top of the screen and are put away onto a live shelves bar, and empty shelves
stop the pickers (RULES 3a), with a ninth upgrade (Receiving bay, $20), a tap
on receiving for extra hands, and a new bottleneck, "The shelves are running
empty". Under the cash, a dashboard row: shipped, orders a minute, backlog,
stock; the one holding you back turns orange. Everything else is the airport
renamed with the same numbers (docks, trucks, pickers, packing, contracts,
stars, sites: Millbrook Depot, Port Calder Docks, Highmoor Crossdock, Sunvale
Outlet; boosts Flash sale, All hands, Peak rates). Packages are
`@warehouse/*`; saves start again at version 1 in a new database, and an
airport save file is refused with a message. docs/RULES.md is rewritten; W1
and W2 record the switch.
**Tuning.** Receiving at 2.4 a second (level with picking): every RULES 11
target holds on seeds 1-5, first sale at 35.3-35.6 minutes with 3 stars,
tapping 2.1-2.7x idle. Report: docs/balance/warehouse-pacing.md.
**Checks.** `npm test` and `npm run check` pass. Phone check 60/60 at 360 x
740 (55.1-58.7 fps with the CPU slowed 4x across two runs).
**How to see it.** Open the app: a new warehouse opens at Millbrook Depot with
PO #1 at the receiving dock and the shelves half full. Tap the receiving lane,
the picking maze or a dock to rush it.
**What is left.** Play it on a real phone; see docs/GAPS.md (W1 entries).

### 2026-10-03 - The airport fills a big phone (lane U; owner request)
**What changed.** On a Pixel 10 Pro XL (412 x 915) the airport sat in the top
half with a blank band under it and small text. Now the floor shares the
phone's spare height: about a third goes to the security maze (its rows spread
out) and two thirds to the gates, whose two rows of stands grow taller, with
longer planes that seat more rows. The labels on the floor (checkpoints,
Security, Lounge, Gates, the loads and timers) scale with the phone's width,
about 15% bigger at 412 px and unchanged at 360 px; the planes are wider and
the scanner lanes thicker. A taller lounge seats its crowd in up to five rows.
A new airport shows the stands still to build as faint numbered outlines, so
the gates panel holds its two rows from the start and nothing jumps when gate
5 opens. `apps/web/e2e/shots.ts` takes screenshots on both phones, and
`PHONE=pixel10xl npm run e2e --workspace web` runs the phone check at the
Pixel's size.
**Checks.** `npm test` (318) and `npm run check` pass. Phone check 56/56 at
360 x 740 (59.0 fps with the CPU slowed 4x) and 56/56 at 412 x 915.
**How to see it.** Open the app on a large phone: the security line and the
gates fill the screen down to the boosts.
**What is left.** A 73-seat plane fills only the front of a tall fuselage
(seats are drawn one square each); see docs/GAPS.md.

### 2026-10-02 - The gates as stands, like the security lanes (lanes U, D; owner request)
**What changed.** The gates are now a "Gates" panel drawn like the security
panel: its header names the plane the gates are getting ("Gates · Midsize
Twin", "Tap: rush"), and each gate is a narrow stand, two each side of a pier
down the middle. In each stand a plane sits nose up, seen from above, and its
seats are the load: one square per seat (a bigger plane looks bigger), filled
front rows first in blue, gold on a charter, green once full. The fill bar,
the departure timer bar and the turnaround bar are gone. The load ("14/73")
and the seconds to departure ("45s", in orange) are text, and an empty stand
shows its dashed markings and "Back 2s" while the next plane turns around.
People walk down the pier, along the walkway above their row and in at the
plane's nose; arriving passengers walk the same way out. A plane parks with a
short slide in and leaves nose first, up out of its stand. Cash pops are
centred and drop the word "full" (the green flash and colour still say it).
Eight gates take two rows instead of four, so the whole airport fits a 740 px
phone without scrolling once the install banner is closed.
**Checks.** `npm test` (318 tests; new: boarders keep to the pier and the
walkway and board at the stand's middle, each gate's load is kept for its
seats, seats fill front row first inside the fuselage) and `npm run check`
pass. Phone check 56/56: no horizontal scroll and every stand at least 44 px
with eight gates; 55.0 fps with eight gates, boosts and tapping on a CPU
slowed 4x (budget 55).
**How to see it.** Open the app: the gates are under the lounge. Watch a
plane's seats fill as people walk in, and tap a stand to rush it.
**What is left.** See docs/GAPS.md (gates as stands).

### 2026-10-02 - The security line: a real queue at the centre of the screen (lanes C, S, H, U, P, D; owner request, P12)
**What changed.** Security is now a real queue (RULES 3). Arrivals join a line,
security lets them into the lounge at its own speed, a full lounge holds the
line, and people turn back at the door rather than join a line longer than
30 s. A new upgrade, Security lanes ($25, +50% speed a level), fixes it; a
tap on the line opens an extra lane for 2.5 s (All hands opens it too);
passport control and preclearance each slow security 5%. "Long lines at
security" is a new bottleneck the screen names. On the phone the thin flow
strip is now the middle of the screen: a security maze where the dots
standing in line are the real line, shuffling forward into a bank of scanners
(one bar per two lanes levels), its length and wait written above ("1.1K in
line · 9s"); a bigger lounge with passport control beside it; arrivals walking
round the side to the exit. The away recap blames the right thing when people
turned back. For testing, Settings has a time skip (+5 min, +1 hour, +8 hours)
that runs the airport ahead exactly as a catch-up does and recaps it. Save
schema 3: the game's own saves migrate exactly (checked against their hash),
with the lanes level that keeps up with their terminal; a real version-2
autosave is the new fixture.
**Checks.** `npm test` (316 tests: 15 security rules with worked numbers, the
line and taps in the random-play properties, two real old saves, the maze
model, the time skip in the engine) and `npm run check` pass. Pacing, seeds
1-5: greedy first sale 34.1-34.4 min (was 33.5-33.9), longest wait for
something new 4.3-4.4 min, idle about 2 h 15 min, tapping 2.3-2.8x idle;
every RULES 11 target holds (docs/balance/airport-pacing.md). Phone check
55/56: the maze is a 318x87 px tap target, a tap opens a lane, the busy
airport's 1.1K line stands in the maze with six scanners, the time skip runs
an hour; no horizontal scroll and 44 px targets everywhere. The 60 fps run
read 38.7 fps on a CPU slowed 4x, but the build before this change reads the
same 40-46 fps on this machine (earlier sessions read 56-59), so it is logged
in docs/GAPS.md to recheck on a real phone.
**How to see it.** Open the app: the security maze is in the middle. Buy a
few Bigger terminal levels and watch the line build; buy Security lanes or tap
the maze to clear it. Settings > Testing: skip ahead to jump forward.
**What is left.** Hide the time skip before real players; a real-phone frame
rate check (docs/GAPS.md).

### 2026-10-02 - Boosts (lanes C, S, H, U, P, D; owner request, P11)
**What changed.** Three free boosts sit above the Upgrades button (RULES 15).
Rush hour: 3x passengers for 60 s, recharges in 5 minutes, ready from the
start. All hands: every gate rushed for 60 s with no taps, 5 minutes, opens at
3 gates. Fare surge: 2x fares for 60 s, 15 minutes, opens with the Regional
route. Each button shows Ready, a countdown while it runs (a gold bar draining)
or while it recharges (a bar refilling), or what opens it; the boost that fixes
the bottleneck glows. Starting one plays a rising sweep, buzzes, and says what
it does. While Rush hour runs the passenger flow brings 3x the people; while
All hands runs every gate glows; while any boost runs, the boosted income shows
in gold with a ⚡. Boost clocks are in State: hashed, saved, caught up offline
(a boost used on the way out pays for its minute away). Save schema 2 with a
tested migration from a real version-1 save. The pacing bots use boosts.
**Checks.** `npm test` (284 tests: 15 boost rules, boosts in the random-play
properties and the Node-vs-Chromium determinism run, the v1 save migration)
and `npm run check` pass. Pacing, seeds 1-5: greedy first sale 33.5-33.9 min
(was 35.5-35.9), idle about 2 h 15 min (was 2 h 45 min), every target holds.
Phone check 48/48: the boosts are in the bottom third with 44 px targets and
no horizontal scroll at 360 px, Rush hour starts with a one-minute countdown,
All hands lights all 8 gates, Fare surge turns the income gold; 56-59 fps with
eight gates, two boosts and a thumb tapping on a CPU slowed 4x (budget 55).
**How to see it.** Open the app and tap Rush hour (bottom left): the lounge
fills. Buy a third gate for All hands and the Regional route for Fare surge.
**What is left.** Playtests: whether players save boosts for the right moment
(docs/GAPS.md); thinning departure effects if a real phone stutters under All
hands.

### 2026-10-01 - Passenger flow: people walking through the airport (lanes C, S, U, D; owner request)
**What changed.** The terminal strip above the gates is replaced by a passenger
flow (RULES 14). Each dot is a passenger: departing ones come in at the left,
queue at check-in and security, sit on the lounge bench (its crowd is the real
waiting count) and walk down a walkway between the two columns of gates to the
gate that boards them; arriving ones step off each landed plane, walk up the
walkway and out through baggage claim to the exit (charter passengers in gold).
International routes (Continental on) add passport control and customs,
transoceanic ones (Transatlantic on) add preclearance, and the route toast
says which checkpoints opened. A full lounge turns people back at the door in
orange. One dot stands for 1, 2, 5, 10... people so the flow stays readable as
the airport grows. The checkpoints are scenery: the sim's rules, numbers,
State, saves and pacing are unchanged; the sim only adds the checkpoint list to
the View. The people are drawn on one canvas each animation frame (P7).
**Checks.** `npm test` (250 tests: the journey per route level in the sim, and
the flow model in the interface: one dot per person entering, turned away at a
full lounge, one per passenger boarding, deplaning, queues, quiet catch-ups and
the dot cap) and `npm run check` pass. Phone check 42/42, including 60.2 fps
with eight gates, 36 people walking and a thumb tapping on a CPU slowed 4x
(worst frame 17 ms), and no horizontal scroll at 360 px with all four
departure checkpoints.
**How to see it.** Open the app: the flow sits between the cash and the gates.
Buy routes up to Continental to see passport control appear.
**What is left.** The owner's call on whether checkpoints should become real
bottlenecks with their own upgrades (docs/GAPS.md).

### 2026-10-01 - Pivot slice 8, Nations removed; README (architect, P10)
**What changed.** The remaining Nations code and data are gone, each deletion in
its own commit: the harness's Gate 1 and Gate 2 suites, bots, metrics and
prediction reports; the AI package and docs/AI_DESIGN.md; the Nations sim
(world, economy, trade, crises, projects, scoring) and its contract types; the
2030 world data, the 100x plan, gate verdicts, balance reports, the playtest kit
and the Nations reviews. The airport sim moved up to packages/sim/src and the
packages are now `@airport/sim`, `@airport/contracts` and `@airport/harness`
(the lint rule and the purity test follow). The harness has three commands:
`pacing` (the default), `determinism` and `bench`. README rewritten for the
airport: what it is, how to run it, how to install it on a phone, how to play.
**Checks.** `npm test` (234 tests, including the 1,000-airport Node-vs-Chromium
determinism test and the pacing targets) and `npm run check` pass; the phone
check passes.
**What is left.** See docs/GAPS.md: a real-phone check (iOS and Android),
playtests, a long-run report across every city, and the owner's call on idle
pacing.

### 2026-10-01 - Pivot slice 7, juice and polish (lanes U, P)
**What changed.** A departing plane takes off from its gate and flies away; a
full flight flashes the card green (a charter gold) and its "+$954 full" pop
floats up; the cash counter bumps when fares land; a tap ripples under the
thumb; bought upgrades pulse; a gate, plane or route purchase shows a toast
("New route: Regional"). Haptics (on by default where the device can vibrate,
which is Android; iOS has no vibration API) and synthesized sounds (off by
default, at most five a second) come from a new platform module, so the
interface never touches device APIs; both are switches in Settings and are
remembered. Everything animates transform and opacity only, and
`prefers-reduced-motion` turns the effects off. New app icon (a plane taking
off over a runway) replaces the Nations placeholder.
**Phone check.** 39/39: sound off by default and on in one tap; 60.1 fps with
eight gates animating, take-offs, pops and a thumb tapping every 300 ms on a
CPU slowed 4x (worst frame 17 ms).
**How to see it.** Tap gates and watch them leave; Settings > Sound.
**What is left.** Cleanup (slice 8).

### 2026-10-01 - Pivot slice 6, the pacing pass (lanes H, S, D; architect for P9)
**What changed.** `npm run harness -- pacing` plays two bots and times every
milestone against RULES 11. The greedy bot taps three times a second and buys
the best income per dollar, looking one purchase ahead; the idle bot never taps
and checks in every 15 minutes. The report also measures active over idle
income, whether 30-second check-ins buy something, whether a 5-minute session
from each check-in reaches a new unlock, and the income estimate against
measured income. `--set` now sweeps the airport tunables. The first numbers
failed badly (a slot on offer at 5 minutes; unlocks every 30 s early and every
8 minutes late), so costs, the rush and slots were retuned (decision record P9)
and `pacing.test.ts` now holds every target on each build.
**Results** (seeds 1-5, docs/balance/airport-pacing.md for seed 1): first
upgrade 3 s; first new gate 19-29 s; longest wait for something new before the
first sale 4.4-4.5 min; first sale 35.5-35.9 min with 3 slots (+75% fares);
active 2.3-2.8x idle; every idle check-in buys something; every 5-minute
session reaches a new gate, plane or route; estimate within 3%. An idle player
first sells at about 2 h 45 min.
**How to see it.** `npm run harness -- pacing --seed 2`.
**What is left.** Juice (7) and cleanup (8).

### 2026-10-01 - Pivot slice 5, selling the airport and the cities (lanes S, U, P)
**What changed.** Selling was already in the sim (slice 2); now it is on the
phone. Once the airport is worth a slot, a gold "Sell +N" button joins
Upgrades in the thumb zone; the Upgrades sheet always ends with a "Sell the
airport" row showing the first slot's target. The sell sheet shows what the
airport is worth, progress to the next slot, the fare bonus now and after, the
next city and its twist, and what resets. After a sale, a welcome sheet names
the city's twist and the slots' bonus. Port Calder's plane and route rows now
say "Short runway" when they stop. Four cities cycle (Millbrook, Port Calder,
Highmoor Hub, Sunvale, then Millbrook II and so on).
**Tests.** Sim: the short-runway lock reason; five sales visit five cities and
name the second round. Phone check 37/37: an airport worth 3 slots sells in two
taps from the bottom bar and opens Port Calder with its twist, 3 slots and one
gate; no horizontal scroll and 44 px targets on the new screens.
**How to see it.** Play until "Sell +1" appears (about $10K earned), or load a
file. Time to the first sale is tuned in slice 6.
**What is left.** Tuning (6), juice (7), cleanup (8).

### 2026-10-01 - Pivot slice 4, offline earnings and the away recap (lanes U, P)
**What changed.** Any gap of a minute or more (the app closed, hidden, or the
phone asleep) is an absence: the host steps the airport through it quietly, up
to the offline cap from the night-shift level (2 h at first, 24 h at most), and
the time beyond the cap is lost. On return a sheet says, in three lines, how
long you were away and whether the cap cut it short, what the airport earned
from how many flights (and how many left full), and what happened: charters,
passengers a full terminal turned away, or the bottleneck with the upgrade that
fixes it. One tap collects. The recap uses lifetime stats, so it is right even
if the gap spans more than one airport.
**Tests.** Engine (fake clock): a 30 s gap plays live with no recap; an hour
away is caught up in full with a recap; 5 hours away runs only the 2-hour cap
and restarts the clock from now; a capped catch-up gives exactly the state of
stepping the capped ticks; reopening yesterday's save runs the cap. Recap lines
tested word for word.
**Phone check.** 29/29: closed for 3 hours (the autosave's clock moved back) an
8-gate airport reopens to the recap in 389 ms on a CPU slowed 4x (budget 2 s),
ran 2 of the 3 hours, three lines, one tap collects.
**How to see it.** Close the app for a few minutes and open it again.
**What is left.** Selling the airport (slice 5), tuning (6), juice (7), cleanup (8).

### 2026-10-01 - Pivot slice 3, the airport on the phone (lanes U, P)
**What changed.** The app is the airport. The Nations interface and its host
(AI director, journal, predictions, month clock) were deleted in their own
commit. New host: `AirportEngine` in the Web Worker steps the sim by the wall
clock every 250 ms, catching up quietly when a timer was late; `LocalHost`
continues the autosave on open (or opens a new airport), autosaves every 10 s and
when hidden, and exports and imports save files. New screen: cash and income
per second at the top, the terminal strip, the gates in two columns (fill bar,
departure timer, turnaround bar, charter badge, rush glow, "+$12" cash pops),
a dashed card for the next gate, and in the thumb zone the bottleneck, the next
goal with a countdown and the Upgrades button. The upgrade sheet shows each
upgrade's effect now and next, its catch, a buy button that fills as cash comes
in, and which upgrades fix the bottleneck. Settings: lifetime numbers, save to
and load from a file, start over. Fill bars, timers and cash are written to the
DOM directly with one-tick CSS transitions; React re-renders only when a plane
arrives or leaves or an upgrade changes (P7).
**Phone check** (`npm run build && npm run e2e --workspace web`, headless
Chromium at 360 x 740 with touch): 22/22. Installable; no horizontal scroll and
every button at least 44 px on the airport, both sheets and an 8-gate airport;
Upgrades in the bottom third; first upgrade bought 5.5 s after opening; a tap
rushes the gate; 60.2 fps with eight gates animating and the CPU slowed 4x
(worst frame 17 ms); export, clear site data, import; reopens offline.
**How to see it.** Open the Vercel address on a phone. Tap a gate to rush it;
open Upgrades to buy.
**What is left.** The away recap and the offline cap (slice 4), selling the
airport (slice 5), tuning (6), juice (7), cleanup (8).

### 2026-10-01 - Pivot slice 2, the airport sim (lanes C, S, H)
**What changed.** packages/sim/src/airport is the whole airport game as a pure
sim, tests written first: the terminal, gates, planes, boarding, the timer and
full-flight bonus, turnaround, the tap rush with walk-ups, charters from the
seeded RNG, all seven upgrades with geometric costs and the route-needs-planes
rule, selling for slots, the four city twists, the income estimate with the
named bottleneck, and an `AirportSession` with saves, migrations and fast
catch-up. Contracts gained the airport types (`airport.ts`). The harness's
Node-vs-Chromium determinism test now plays 1,000 airports (a scripted player
tapping, buying and selling for a minute, then an hour caught up), `npm run
harness -- bench` times airport catch-up, and `rules.test.ts` is back, checking
the airport tunables against the RULES table.
**Tests.** 47 sim tests: every RULES rule with worked numbers (the first plane
fills in 5 s and pays $12.50; the first upgrade is affordable by then), and
property tests over random play: cash, passengers and loads never negative or
over their limits, cash moves only by fares and purchases, the same seed and
commands give the same hash, catching up N ticks equals stepping N ticks, and
save-reload-continue equals an uninterrupted run. The income estimate is within
20% of measured idle income in eight configurations, one per city.
**How to see it.** `npx vitest run packages/sim/src/airport` and `npm run harness
-- bench`: 24 hours of a busy 8-gate airport catches up in about 100 ms in Node
and in Chromium (the phone budget is 2 s).
**What is left.** Nothing shows it yet: slice 3 puts it on the phone.

### 2026-10-01 - Pivot slice 1, the airport on paper (architect, P2)
**What changed.** The project is now an idle airport game. docs/RULES.md is
rewritten from scratch: the core loop (terminal, gates, boarding, departures),
the tap rush, seven upgrades with their catches and geometric costs, the income
estimate and named bottleneck, offline earnings with a cap, selling for slots,
four cities with twists, pacing targets, 60 tunables with bands and the
invariants. Decision records P1-P8 explain the pivot (the Nations game lives at
commit 67d1d92) and the airport's architecture calls. CLAUDE.md and ROADMAP.md
are rewritten for the airport. The Nations rules and their tunables test were
deleted in their own commit; the Nations progress and gaps logs were cleared
here (they remain in history).
**How to see it.** Read docs/RULES.md sections 1-7: that is the game. A float
prototype of these rules (not committed) put the first upgrade at 5 s, a new
gate, plane or route every 1-6 minutes, and tapping at 1.6-2.9x idle income.
**What is left.** Slices 2-8. Every number in RULES.md is a first guess that
slice 6 tunes with the harness.
