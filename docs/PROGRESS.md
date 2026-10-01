# Progress
Current state: **the pivot is complete** (decision records P1-P10). The app is
the idle airport game: all eight slices are merged.
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
