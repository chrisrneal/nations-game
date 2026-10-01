# Gaps
Each entry: slice or prompt, what is missing or was shortcut, owning lane.
Nations-era gaps retired with the pivot (decision record P1); they are at commit
`67d1d92` in docs/GAPS.md.

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
