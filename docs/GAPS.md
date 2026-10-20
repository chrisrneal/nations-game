# Gaps
Each entry: slice or prompt, what is missing or was shortcut, owning lane.

**K1 (2026-10-20) replaced the warehouse with Snack Attack.** Every warehouse,
airport and Nations gap went with the code. They are in this file at commit
`734c848`.

## Snack Attack (K1)
- K1 / step 6, the owner's gate is open: nobody has played it yet. The owner and the 9-year-old to play several dailies and say what is fun, too easy, too hard or confusing. Owner.
- K1 / step 6, not yet checked on a real phone (iOS Safari, Android Chrome); the phone check is headless Chromium and is not in CI because it needs a build and a browser. Owner, lane P.
- K1 / step 11, no sticker book or cosmetics yet. Profiles and the streak came in step 7 (K7). Lanes S, U.
- K1 / step 6, the shop is a plain list in a sheet (step 9). Lane U.
- K1 / K5, the solver is sound but not complete: boards whose only solutions need a 4-friend route or a friend used only to block are thrown away, never shown. About 0.7 seeds a day are skipped. Lane S.
- K1 / K4, clue cards run 2-7 words where the brief said 3-6, because the brief's own examples ("Something crunchy", "Same as the kid in the hat") fall outside 3-6. Owner to confirm. Lane D.
- K1 / step 6, the determinism test hashes 300 seeds of scripted games, not 1000 as the warehouse did, to keep `npm test` under a minute; the generator check covers 1600 days besides. Lane H.
- K1 / step 6, sounds are placeholder synth notes (fed, tummy ache, win, lose), off until turned on. Lane P.
- K6, Undo history is kept in memory only: a reload mid-setup empties it, and Clear board then counts friends placed before the reload as earlier ones (they stay). Keeping it would need the setup's starting friends in the save or the View. Lanes U, S.
- K6, while a friend is selected its lit squares take the tap (aim), so a friend or kid on one of them is not selected by tapping it; tap Done first, or use the kids' cards above the board. Watch whether the 9-year-old trips on it. Lane U.
- K6, the board's squares are never smaller than 44 px; on a phone shorter than about 680 px (or with the install banner showing and 3-4 kids) the board can run under the dock. The phone check covers 360 x 740 and 412 x 915 only. Lane U.
- K6, the drag tests use Chromium touch events from the DevTools protocol; real iOS Safari drag has not been tried (iOS gives pointer events since 13). Owner, lane P.

## Profiles, daily completion and streaks (step 7, K7)
- K7, the picker opens on launch only when there is more than one profile (the step 7 prompt). RULES 12 (L) said the avatar row is always the first screen; with one profile it now goes straight to the game. Owner to confirm.
- K7, a profile's mode can't be changed after it is made (RULES 12); to move a child from Kindy to Main, a grown-up makes a new profile. Owner.
- K7, the Grown-ups press-and-hold (D17) stops a 4-year-old, not a 9-year-old who has watched a parent do it; there is no PIN by design. Owner.
- K7, old daily and bonus slots are never cleaned up: one per profile per day, a few kilobytes each (a year is a few megabytes). A cleanup older than, say, 30 days would need care with clocks set backwards. Lane P.
- K7, the countdown to midnight uses today's timezone offset, so on a daylight-saving night it can be an hour out; when it reaches 0 the done screen checks the day again and offers the new puzzle only if it has really changed. Lane P.
- K7, a clock set forward lets a child play a later day's puzzle early, and flying west can show yesterday's puzzle again. Both are allowed (the prompt: don't try to prevent clock cheating). Owner.
- K7, a profile book that can't be read (damaged, or written by a newer version after a downgrade) is copied to `profiles-unread` and the app starts a fresh book; the first profile finds its saves again, but other profiles' saves can only be recovered by hand. Lane P.
- K7, the migration from the pre-profile save is tested in Node and once in headless Chromium (the phone check seeds an old database); not yet on a real phone that had the old version installed. Owner, lane P.
- K7, there is no way to back up or move profiles to another phone (no server, by design). Lane P.
- K7, the Grown-ups button needs a press-and-hold, which a keyboard or switch-access user can't do (Enter only shows the hint). Fine for a family phone; a long Enter press could be added. Lane U.
- K7, saves an old cached copy of the app might still write after the migration (slots without a profile) are left in place and ignored, never deleted. Lane P.

## Kindy mode on screen (step 10, K8)
- K8, the picker is shared with the main-mode child, so it keeps its "Who's playing?" heading, the optional names under the pictures and the Grown-ups button. A Kindy child needs only their picture there, and the no-text check covers every Kindy screen, not the picker. Owner to say if the picker should lose its words too. Lane U.
- K8, no sticker book yet (step 11): the prompt's "its own sticker book per profile" waits for it. The done screen shows a star per finished day of the week instead. Lanes S, U.
- K8, the spoken hints use the Web Speech API and were tested with a stand-in voice in headless Chromium only. Real iOS Safari (speech after the first tap) and Android Chrome voices still need trying; the hand works without them. Owner, lane P.
- K8, the voice preference is one per phone, not per child. Lane P.
- K8, a hint off the plan (a kid left waiting) comes from the solver: it may feed only the kid who waited longest that wave, and is not always the shortest way. Lane S.
- K8, the moon on the done screen moves every 30 seconds by the fraction of the day gone; like the main countdown it can be an hour out on a daylight-saving night (K7). Lane U.
- K8, about 1 Kindy day in 8 now takes a later seed than before (the never-stuck check); nobody had played Kindy yet, so nothing visible changed. Lane S.

## Shop screen (step 9, K9)
- K9, **open question for the owner: "modify before buying".** The first brief said a friend could be picked from a catalogue and modified before buying. The spec defines nothing to modify (a friend is a type plus a facing, and the facing is set on the board), so nothing was invented. Recommended default: leave it so. If a hat or colour per friend was meant, that is a cosmetic for step 11 and must never change play. Owner.
- K9, refunds are allowed until Go for anything bought in this setup (the prompt's default, as the spec was silent). After Go the points stay spent, even if the friend was never used. Owner to confirm.
- K9, every main-mode puzzle sells all five friends, so the catalogue never changes from day to day; "that day's catalogue" (RULES 8) could later vary by seed (say, no Bouncer on some days). The harness already checks a catalogue is fixed by the seed and sells what the solution buys. Lanes S, D.
- K9, swipe-down to close (every sheet now) was tested with Chromium touch events in the phone check only, not yet on a real iPhone or Android phone. Owner, lane P.
- K9, a friend bought, placed, aimed and then given back loses its place and facing; buying again puts a new one in the tray. Lane U.

## Art and animation (step 8, K10)
- K10, the art and the replay are checked in headless Chromium only (the CPU slowed 4x stands in for a mid-range Android phone). Real iOS Safari and Android Chrome still need a look: SVG drawing, the Web Animations API and the frame rate. Owner, lane P.
- K10, the visual check (`apps/web/e2e/visual-check.ts`), like the phone check, needs a build and a Chromium, so it is run by hand and not in CI. Its pictures are from this machine's fonts; another machine may need `UPDATE=1` once. Lane P.
- K10, the school gate at the top of the path and home at the bottom (RULES 3) are not drawn; kids walk off the bottom edge of the board to go home. Lane U.
- K10, which obstacle a square shows (tree, bench or sandpit) is picked by the screen from the square's number; the sim has one kind of obstacle, so the picture means nothing for play. Lane U.
- K10, a kid with a tummy ache walks in a straight line to the nearest parents' table, over whatever is in between (pictures only, nothing in the sim moves). Lane U.
- K10, the kids' skin and hair are picked from their id (sisters share theirs). They are looks only and never a clue; the owner may want to choose the mix. Owner, lane U.
- K10, main-mode kids keep their letter badge (A, B...), so the cards above the board can name them; Kindy kids have none. Lane U.
- K10, sounds are unchanged (the placeholder synth notes of step 6). Lane P.

## Hints, tray decoys and the bonus ramp (K11)
- K11, the prompt's play-test feedback section was the empty template, so no play-test notes were applied. The owner's gate (step 6) is still open. Owner.
- K11, the prompt names docs/snack-attack.md, which doesn't exist; docs/RULES.md was used as the spec. Owner to confirm. Lane D.
- K11, hint tier 2 shows the lunchbox, which says which snack the kid wants. Whether that comes too early (before a friend is placed) is for play-testing with the 9-year-old. Owner.
- K11, off the plan (a healed kid staying, other friends bought) the hint's setup comes from the solver; its tier 3 may move a friend the player had placed for another kid, if the solver's setup doesn't use it. Lane S.
- K11, the day's hint count goes on the profile record for the daily only. Bonus and practice hints are counted in their saves and shown on the result card, but not recorded. Lanes S, U.
- K11, the bonus ramp ends at 5 friends a wave, not 6 (both kids on 3-friend routes): at 6 a bonus day skipped about 23 seeds on average and up to 115 of the 200 allowed. Raising `routeMax` would allow more, slower. Lane S.
- K11, Kindy keeps its given friends (D15), so its tray still gives the answer away on about half its waves (report). Owner to say if Kindy should get a decoy. Owner, lane S.
- K11, the second decoy is any throwing type, so on some days it is a type the solution buys later and gets used: the report counts 1.6-1.7 never-used tray friends a day, never fewer than 1. Lane S.
- K11, the hint button, the purple lit squares and Undo of a hint are checked in headless Chromium only, not yet on a real phone. Owner, lane P.
