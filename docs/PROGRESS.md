# Progress
Current state: **the pivot is complete** (decision records P1-P10). The app is
the idle airport game: all eight slices are merged. Since then: the passenger
flow, boosts (P11), the security line as a real queue at the centre of the
screen (P12), and the gates as a panel of stands whose seats fill with people.
The Nations progress log, gate checklists and verdicts are at commit `67d1d92`
(docs/PROGRESS.md there).

## Slices (docs/ROADMAP.md)
- [x] 1. Pivot docs
- [x] 2. Airport sim
- [x] 3. Airport screen and upgrade sheet; Nations interface deleted
- [x] 4. Offline earnings and the away recap
- [x] 5. Prestige and the second city
- [x] 6. Pacing pass
- [x] 7. Juice and polish
- [x] 8. Remove the remaining Nations code; README

## Session log

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
