# Gaps
Each entry: slice or prompt, what is missing or was shortcut, owning lane.

**K1 (2026-10-20) replaced the warehouse with Snack Attack.** Every warehouse,
airport and Nations gap went with the code. They are in this file at commit
`734c848`.

## Snack Attack (K1)
- K1 / step 6, the owner's gate is open: nobody has played it yet. The owner and the 9-year-old to play several dailies and say what is fun, too easy, too hard or confusing. Owner.
- K1 / step 6, not yet checked on a real phone (iOS Safari, Android Chrome); the phone check is headless Chromium and is not in CI because it needs a build and a browser. Owner, lane P.
- K1 / step 6, the screen is plain on purpose: pattern diagrams for friends, emoji for snacks, letters for kids, and a simple flight replay. Art and real animation are step 8. Lane U.
- K1 / step 6, no profiles, streak or sticker book yet (steps 7, 11). The daily is "finished once" only because each day's daily keeps its own save slot on the device. Lanes P, U.
- K1 / step 6, Kindy mode is built in the sim (4x4, Straight only, picture wants, no failing; 1000 days checked) but has no way in from the screen yet (step 10). Spoken hints are not built. Lane U.
- K1 / step 6, the shop is a plain list in a sheet (step 9). Lane U.
- K1 / step 6, no hint button. The solver's witness is stored with every puzzle and could power one. Lanes S, U.
- K1 / K5, the solver is sound but not complete: boards whose only solutions need a 4-friend route or a friend used only to block are thrown away, never shown. About 0.7 seeds a day are skipped. Lane S.
- K1 / K5, the starting tray is sized to the planted solution, so its mix (say, three Bouncers) hints at the answer. Adding a decoy friend or two would hide it. Lanes S, D.
- K1 / generator, bonus rounds are evenly hard (about 4.6 friends every wave) instead of ramping; tune `routeAt` for bonus. Lane S.
- K1 / K4, clue cards run 2-7 words where the brief said 3-6, because the brief's own examples ("Something crunchy", "Same as the kid in the hat") fall outside 3-6. Owner to confirm. Lane D.
- K1 / step 6, the determinism test hashes 300 seeds of scripted games, not 1000 as the warehouse did, to keep `npm test` under a minute; the generator check covers 1600 days besides. Lane H.
- K1 / step 6, sounds are placeholder synth notes (fed, tummy ache, win, lose), off until turned on. Lane P.
- K6, Undo history is kept in memory only: a reload mid-setup empties it, and Clear board then counts friends placed before the reload as earlier ones (they stay). Keeping it would need the setup's starting friends in the save or the View. Lanes U, S.
- K6, while a friend is selected its lit squares take the tap (aim), so a friend or kid on one of them is not selected by tapping it; tap Done first, or use the kids' cards above the board. Watch whether the 9-year-old trips on it. Lane U.
- K6, the board's squares are never smaller than 44 px; on a phone shorter than about 680 px (or with the install banner showing and 3-4 kids) the board can run under the dock. The phone check covers 360 x 740 and 412 x 915 only. Lane U.
- K6, the drag tests use Chromium touch events from the DevTools protocol; real iOS Safari drag has not been tried (iOS gives pointer events since 13). Owner, lane P.
- K6, the setup controls are built for main mode. Kindy mode on screen (step 10) still needs its own 64 px tray and controls. Lane U.
