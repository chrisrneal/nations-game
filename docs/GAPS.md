# Gaps
Each entry: slice or prompt, what is missing or was shortcut, owning lane.
Nations-era gaps retired with the pivot (decision record P1); they are at commit
`67d1d92` in docs/GAPS.md. Entries before W1 were written for the airport game
(2026-10-06: gates are now docks, planes trucks, passengers orders, security
picking, the lounge packing); those still open apply to the warehouse under
the new names.

- Pivot 1, ~~Nations docs still in the tree until slice 8~~ Closed by slice 8. Lane D.
- Pivot 2, ~~the airport sim lives in packages/sim/src/airport beside the Nations sim~~ Closed by slice 8 (P10). Lane S.
- Pivot 2, ~~the harness's `--set` overrides sweep only the Nations tunables~~ Closed by slice 6. Lane H.
- Pivot 3, a tap reaches the sim on the next tick, up to 250 ms later; the card glows at once so it feels immediate. Lane P.
- Pivot 3, no component tests (no jsdom project, T4): the interface is covered by the Chromium phone check, which is not in CI because it needs a build and a browser. Lane U.
- Pivot 3, not yet checked on a real phone (iOS Safari and Android Chrome); the phone check is headless Chromium. Owner.
- Pivot 3, ~~the app icons are still the Nations placeholders~~ Closed by slice 7. Lane P.
- Pivot 6, the pacing bots tune the first airport; later cities are measured only as far as the greedy bot reaches in 90 minutes (two sales). A long-run report (several hours, every city) would show whether later runs stay interesting. Lane H.
- Pivot 6, an idle player (no taps, check-ins every 15 minutes) first sells at about 2 h 45 min, and one who checks in twice a day is held back by the 2-hour offline cap. Measured, not targeted (P9). Lanes D, H.
- Pivot 6, the bots value upgrades with the sim's own estimate, which is within 3% of measured idle income; a player reads the same estimate on screen. A real player's choices are untested until playtests. Owner.
- Pivot 7, haptics cannot work on iPhone (Safari has no vibration API) and sound was checked only for errors in headless Chromium, not by ear on a phone. Owner.
- Pivot 8, the `AirportHost` interface and `AirportUpdate` live in apps/web/src/platform, not in packages/contracts as the Nations `Host` did (S3). Nothing else implements them yet; move them to contracts if a second host (a server) ever appears. Lane C.
- Passenger flow, ~~the checkpoints are scenery~~ Security is a real queue with its own upgrade and tap (P12). Check-in and the arrivals checkpoints stay scenery, and arriving passengers still earn nothing. Lanes D, S.
- Passenger flow, people heading to a gate scrolled out of view walk to the edge of the gates and vanish there. Since the gates became stands, 8 gates fit a 740 px phone in two rows; the install banner still pushes the second row partly under the fold, and 9-12 gates (the `maxGates` band) would add a third row. Lane U.
- Boosts, with All hands on eight gates departures roughly double, and so do their cash pops, take-offs and flashes: the phone check reads 56-59 fps on a CPU slowed 4x (budget 55; 58-60 without boosts). If a real phone stutters, thin the effects when several gates depart in the same tick. Lane U.
- Boosts, the active-over-idle check samples four minutes of the greedy bot's game, and a tap's worth swings by about 1x from one minute's levels to the next (2.3-3.4x): the samples can land on a peak. The check now uses the no-boost path it was tuned on (P11); averaging over a window would be steadier. Lane H.
- Boosts, the bots use every boost the moment it is ready; a real player may save Rush hour for an empty lounge or Fare surge for a full one. Untested until playtests. Owner.
- Passenger flow, no lane captions ("Departures", "Arrivals"): the Exit and Check-in booths and the arrival booths' purple borders tell them apart; captions did not fit at 360 px. Lane U.
- Security line (P12), the time skip in Settings is a testing cheat anyone can use, with no limit. Before real players: hide it behind a setting or a build flag, or remove it. Owner, lanes U, P.
- Security line (P12), the version-1 save fixture has a long history, which now replays under today's rules instead of being proven against its old hash (old rules are not kept). The game's own saves are compact and still migrate exactly. Lane S.
- Security line (P12), the phone check's 60 fps run read 39.5 fps on this session's machine; the build before this change read the same 40-46 fps in the same scenario, so the machine, not the change, moved (earlier sessions read 56-59). The departure pops cost the most (about 8 fps when hidden). Recheck on a real phone. Lane U.
- Security line (P12), the maze shows at most 150 dots; a longer line squeezes up rather than adding rows. Lane U.
- Security line (P12), ~~with the taller concourse an 8-gate airport scrolls its gates on a 740 px phone~~ Closed by the gates as stands (two rows of four), except while the install banner shows. Lane U.
- Gates as stands, the `maxGates` note in RULES 12 and tunables.ts still says "8 fit a phone screen in two columns"; they now fit in two rows of four. Wording only. Lanes D, S.
- Gates as stands, a plane bigger than its stand's cabin (about 42 seats on a 360 px phone) shows the cabin full of squares, each standing for more than one seat; the "14/73" text gives the exact load. Lane U.
- Gates as stands, the plane's model shows once in the panel header (the newest plane); a gate still flying an older, smaller plane shows its own model only in its screen-reader label. Lane U.
- Big-phone layout, on a tall phone a parked plane's fuselage grows with its stand but its seats stay one 3 px square each, so a small or midsize plane fills only the front of it. Scaling the seats to the stand would make sizes comparable only within one phone. Lane U.
- Big-phone layout, the stands past the next gate show as faint outlines up to eight (two rows); past eight gates the third row appears only as gates open. Lane U.
- W1, the dashboard row (about 45 px) and the taller floor (the receiving lane) squeeze the docks on a 740 px phone while the install banner shows: only the top of the first row of bays is visible until the banner is closed or the app installed. Without the banner both rows fit. Lane U.
- W1, a PO is 20 s of put-away, so late in a warehouse a single PO holds thousands of units ("PO #6 · 301/2.7K"). Fine for the numbers; a player may expect POs to come more often. Lanes D, S.
- W1, receiving and picking start level (2.4 a second each), so the first time sales outgrow them the screen says "The shelves are running empty" before it says picking: the tie goes to stock. Lane S.
- W1, counter orders (a rushed dock loading when packing is empty) need no stock and no picking, kept from the airport's walk-ups so a tap always helps. Lanes D, S.
- W1, airport saves are not converted: the owner's airport is gone from the phone once this ships (W1). Owner.
- W1, the phone check's 60 fps run read 58.7 and 55.1 fps in two runs on this session's machine (budget 55), the second with one 233 ms frame. Recheck on a real phone. Lane U.
- W3, perk thresholds (1, 3, 6, 10, 15 stars) are set from the greedy bot's first two sales (3 then 4 stars); the pacing pass runs 90 minutes, so the 10- and 15-star perks are unmeasured. A long-run report (the Pivot 6 gap) would show when they arrive. Lanes D, H.
- W3, Quick charge, Express lane and Long shift change rules for a player who owns enough stars, so a save with a command log from before W3 would replay differently. The game's saves are compact, so none exist; noted in case history-carrying saves come back. Lane S.
- W3, a perk a sale unlocks is shown only by the sell sheet beforehand and the welcome sheet after; there is no special "perk unlocked" animation or sound. Lane U.
