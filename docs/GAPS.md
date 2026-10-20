# Gaps
Each entry: slice or prompt, what is missing or was shortcut, owning lane.

**K1 (2026-10-20) replaced the warehouse with Snack Attack.** Every warehouse,
airport and Nations gap went with the code. They are in this file at commit
`734c848`.

## Snack Attack (K1)
- K1 / step 6, the owner's gate is open: nobody has played it yet. The owner and the 9-year-old to play several dailies and say what is fun, too easy, too hard or confusing. Owner.
- K1 / step 6, not yet checked on a real phone (iOS Safari, Android Chrome); the phone check is headless Chromium and is not in CI because it needs a build and a browser. Owner, lane P.
- K1 / step 6, the screen is plain on purpose: pattern diagrams for friends, emoji for snacks, letters for kids, and a simple flight replay. Art and real animation are step 8. Lane U.
- K1 / step 11, no sticker book or cosmetics yet. Profiles and the streak came in step 7 (K7). Lanes S, U.
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

## Profiles, daily completion and streaks (step 7, K7)
- K7, the picker opens on launch only when there is more than one profile (the step 7 prompt). RULES 12 (L) said the avatar row is always the first screen; with one profile it now goes straight to the game. Owner to confirm.
- K7, a profile's mode can't be changed after it is made (RULES 12); to move a child from Kindy to Main, a grown-up makes a new profile. Owner.
- K7, the Grown-ups press-and-hold (D17) stops a 4-year-old, not a 9-year-old who has watched a parent do it; there is no PIN by design. Owner.
- K7, a Kindy profile opens a "coming soon" picture screen until Kindy mode is on screen (step 10). Lane U.
- K7, the avatars are emoji on coloured circles; art comes in step 8. Lane U.
- K7, old daily and bonus slots are never cleaned up: one per profile per day, a few kilobytes each (a year is a few megabytes). A cleanup older than, say, 30 days would need care with clocks set backwards. Lane P.
- K7, the countdown to midnight uses today's timezone offset, so on a daylight-saving night it can be an hour out; when it reaches 0 the done screen checks the day again and offers the new puzzle only if it has really changed. Lane P.
- K7, a clock set forward lets a child play a later day's puzzle early, and flying west can show yesterday's puzzle again. Both are allowed (the prompt: don't try to prevent clock cheating). Owner.
- K7, a profile book that can't be read (damaged, or written by a newer version after a downgrade) is copied to `profiles-unread` and the app starts a fresh book; the first profile finds its saves again, but other profiles' saves can only be recovered by hand. Lane P.
- K7, the migration from the pre-profile save is tested in Node and once in headless Chromium (the phone check seeds an old database); not yet on a real phone that had the old version installed. Owner, lane P.
- K7, there is no way to back up or move profiles to another phone (no server, by design). Lane P.
