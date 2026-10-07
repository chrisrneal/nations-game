# Gaps
Each entry: slice or prompt, what is missing or was shortcut, owning lane.
Nations-era gaps retired with the pivot (decision record P1); they are at commit
`67d1d92` in docs/GAPS.md. Entries before W1 were written for the airport game
(2026-10-06: gates are now docks, planes trucks, passengers orders, security
picking, the lounge packing); those still open apply to the warehouse under
the new names.

**W8 (2026-10-07) removed the idle game.** Gaps about docks, trucks, taps,
boosts, upgrades, stars, perks, sites, the idle floor, the receiving bay and
the pacing bots went with it; they are in this file at commit `b34368a`.
The gaps below still apply. Where an older entry says "picker" it now means a
worker on picking, and the WMS is the whole game.

- Pivot 3, a tap reaches the sim on the next tick, up to 250 ms later; the card glows at once so it feels immediate. Lane P.
- Pivot 3, no component tests (no jsdom project, T4): the interface is covered by the Chromium phone check, which is not in CI because it needs a build and a browser. Lane U.
- Pivot 3, not yet checked on a real phone (iOS Safari and Android Chrome); the phone check is headless Chromium. Owner.
- Pivot 7, haptics cannot work on iPhone (Safari has no vibration API) and sound was checked only for errors in headless Chromium, not by ear on a phone. Owner.
- Pivot 8, the `AirportHost` interface and `AirportUpdate` live in apps/web/src/platform, not in packages/contracts as the Nations `Host` did (S3). Nothing else implements them yet; move them to contracts if a second host (a server) ever appears. Lane C.
- Security line (P12), the time skip in Settings is a testing cheat anyone can use, with no limit. Before real players: hide it behind a setting or a build flag, or remove it. Owner, lanes U, P.
- W5 / WMS slice 1, the brief asks to turn trade deals, aid and joint projects into orders; this game has none (Nations retired, P1), so every WMS order is a generated sample and "destination nation" is a customer's country. Owner to confirm the reading. Lane D.
- W5 / WMS slice 3, ~~the grid's ship-by and created columns show WMS time (T+mmss since the warehouse opened)~~ Since W8 they show the warehouse clock's time of day, not a countdown, so rows do not re-render every second; a late order's ship-by is red. Lane U.
- W5 / WMS slice 4, an order's activity comes from the WMS log, which keeps the latest 200 events (about 4-5 minutes of a busy warehouse); older events for an order scroll out, and the detail says so. A per-order history would need more State. Lane S.
- W5 / WMS slice 7, a hold or a picker reassignment undoes the line's partial pick (the units go back to the bin and the line starts again); a real WMS would keep them in the tote. Lane S.
- W5 / WMS slice 9, a fast fling through 300 orders and 2,000 lines reads 52-58 fps with the CPU slowed 4x on this machine (budget 55; the floor alone reads 58-59 here). The remaining cost is the browser's layout of the sticky grid while scrolling both ways. Recheck on a real phone; if it stutters, drop the sticky Order # column while flinging. Lane U.
- W5 / WMS, the View carries every WMS order and line on every tick (4 a second), even with the WMS closed; at 300 orders the floor still reads 58-59 fps here. If phones struggle, send the WMS part only when it changes (once a second). Lanes U, P.
- W6 / WMS inbound, the player can only watch inbound and inventory: there is no action to expedite a truck, raise a PO by hand, choose a door or recount a SKU. Each would be a new `wms` action. Lanes C, S, U.
- W6 / WMS inbound, inbound log lines keep the PO number in the event's `order` field (the code says which kind it is) so old saves' logs need no migration; the View splits them. A new inbound event code must be added to `INBOUND_EVENTS` in packages/sim/src/wms/view.ts. Lane S.
- W7, the plan's choices are close on an idle WMS (OTIF 81-85% for every pick order and release mode; the crew split moves it 65-85%): the pickers have slack, so nearest bin and cutoff first matter only with a backlog. A busier WMS (more orders, or fewer pickers to start) would make the plan a sharper game. Lanes S, H.
- W7, the reorder point and PO size are still fixed (`wmsReorderUnits`, `wmsReplenUnits`): a "stock level" choice on the Plan page was left out because nothing yet makes stock cost money, so deep stock would always win. Lanes S, U.
- W7, the floor draws the WMS's 16 bins but not what each holds (a tap shows the SKU); at 15 px a bay there is no room for codes on a 360 px phone. Lane U.
- W7, W8, the e2e scripts (`phone-check.ts`, `wms-shots.ts`, `wms-perf.ts`, `shots.ts`) are still not in CI (they need a build and a browser). Since W8 they start on the WMS and use its tabs. Lane U.
- W7, an `npx tsx e2e/...` run leaves its `vite preview` server running (the script kills `npx`, not vite), so the next run on the same port may test the old build. Kill stray `vite preview` processes between runs. Lane U.

- W8, demand is fixed: an order every 20-30 warehouse minutes whatever the warehouse does, so hiring beyond what the orders need only raises idle time, and goodwill changes pay but not volume. Demand that grows with goodwill (more customers as service improves) would make growth a real loop. Owner decision, then lanes S, H.
- W8, the only things to buy are workers and dock doors. Automation (conveyors, a sorter, pick-to-light shortening task times), shifts and breaks, worker skills and dock hours that close receiving at night are ideas in ROADMAP Next; each needs a decision record. Owner.
- W8, with the opening crew the receivers work about 20% of the time and the pickers about 69% (report, seeds 1-8): the Plan's crew split is the lever, and the report's targets are wide (5-80% for receivers). A real warehouse would cross-train people to pick when the dock is quiet (flexible roles); left out to keep roles legible. Lanes S, D.
- W8, the plan is redone only when work waits, a more urgent task comes in or a worker runs dry, so a task queued for one worker stays with it even if another worker becomes nearer (under nearest bin) a moment later; a full re-plan every second cost 3x the catch-up time. Measured OTIF is within a point of the full re-plan's (82.8% against 84.5% over 2 h, 84.8% over 4 h). Lane S.
- W8, old saves (versions 1-6) keep their tick and cash but open a fresh WMS: the old orders, stock, goodwill and log are not carried over, and commands other than WMS actions are dropped from the log. The owner's own save is the only one affected. Owner, lane S.
- W8, the offline cap is a fixed 8 hours (the night shift upgrade went with the idle game). 8 hours of a busy warehouse reopen in 1.5-1.7 s with the CPU slowed 4x in headless Chromium (budget 2 s); a full day would not fit. Recheck on a real phone. Lanes S, P.
- W8, catch-up is about 1.5x slower than the idle game's for the same hours (the task plan every second): 8 hours of a new warehouse take 370-480 ms in Node on this machine. Lane S.
- W8, the WMS performance check (`e2e/wms-perf.ts`, a fling through 300 orders with the CPU slowed 4x) reads 10-11 fps on this session's machine; the build before W8 reads 12.8 fps on the same machine (earlier sessions read 44-58), so the machine, not the change, moved. The floor of the same warehouse reads 57-58 fps. Recheck on a real phone. Lane U.
- W8, the floor's data-standing attribute (worker id and position, written once a WMS step) exists only so the phone checks can tap a worker on the canvas. Lane U.
- W8, a worker's page lists the latest 8 finished tasks, and only those the WMS still keeps (`wmsTasksKept`, 150 across the crew): a busy crew's oldest work scrolls out. The record (tasks, units, time) is kept since hiring. Lane S.
- W8, appointments are 24 hours a day: no dock hours, so trucks come at night too. Lanes S, D.
- W8, the KPI strips show rates per warehouse hour (a real minute): lines an hour now read about 8-10 where they read 480-600 before W8. Same work, different clock. Lane U.
- W9, balance by need counts tasks only: a truck waiting in the yard for a door, or stock about to run out, does not pull people to receiving until its lines are docked. On an idle warehouse balance trades about a point of fill for a point of on time. Lanes S, H.
- W9, at 5x and 10x the WMS screens re-render up to four times a second (once an update that carries a WMS step) instead of once; the floor still reads 60 fps with the CPU slowed 4x here, but the order grid fling (`e2e/wms-perf.ts`) was not re-measured at speed. Recheck on a real phone. Lane U.
- W9, the offline cap is the same ticks at any speed, so in real time it shrinks with the speed: 8 hours at 1x, 1 h 36 m at 5x, 48 m at 10x (20 warehouse days each). A phone left overnight at 5x stops after 1 h 36 m. Owner decision if a longer real-time cap is wanted (it costs catch-up time on reopening). Lanes P, S.
- W9, the testing time skip (+5 min, +1 hour, +8 hours) is still time at 1x whatever the speed: "+1 hour" runs 60 warehouse hours. Lane U.
- W9, the speed is a host setting outside the sim, so it is not in the command log or the state hash: a replay of a save does not know how fast it was played (it does not need to). Lane P.
