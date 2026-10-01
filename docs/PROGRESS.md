# Progress
Current state: **pivot in progress** to the idle airport game (decision record
P1). Slices 1-3 of 8 are done: the deployed app is now the airport.
The Nations progress log, gate checklists and verdicts are at commit `67d1d92`
(docs/PROGRESS.md there).

## Slices (docs/ROADMAP.md)
- [x] 1. Pivot docs
- [x] 2. Airport sim
- [x] 3. Airport screen and upgrade sheet; Nations interface deleted
- [ ] 4. Offline earnings and the away recap
- [ ] 5. Prestige and the second city
- [ ] 6. Pacing pass
- [ ] 7. Juice and polish
- [ ] 8. Remove the remaining Nations code; README

## Session log

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
