# Snack Attack: game design spec

Status: **locked, 2026-10-20.** The owner's decisions are marked (L); the
defaults D1-D20 in section 13 were all accepted by the owner the same day and
are locked too. In build step 0 this file replaces docs/RULES.md (see
conflict C4) and a decision record (K1) retires the warehouse.

## 1. The game in one paragraph

A cute daily puzzle with chess-like moves, for two kids sharing one phone. The
board is a grid: the school path and the playground. Hungry kids stand on the
path. Snacks start in lunchboxes. The player places **friends** on the grid,
and each friend throws or passes a snack in a fixed pattern, like a chess
piece. In main mode each kid wants exactly one snack, which the player works
out from a short clue. In Kindy mode the snack is pictured over the kid's
head. The player sets up the board, then presses Go and watches the wave play
out without touching anything. There is one daily puzzle per profile (the same
for everyone on that date), plus unlimited practice boards. Every board has
been proved solvable by a solver before anyone sees it.

## 2. Core principle (L)

Two things are kept apart and never mixed:

- **What a snack is** is decided by where it starts: its lunchbox.
- **How a snack moves** is decided by the type of friend carrying it: that
  friend's throw pattern.

A friend's type never changes which snack it carries. A snack is the same snack
from its lunchbox to the kid.

## 3. The board

A grid of squares: 6 wide by 8 tall in main mode (a portrait phone, default
D1), and 4 by 4 in Kindy mode (L). Each square is one of:

| Square | Who can be there | Effect on a throw |
|---|---|---|
| Open (playground) | a friend, or nothing | passes through when empty; a friend there catches |
| Path | kids only | the kid there receives the snack; an empty path square lets it through |
| Lunchbox | fixed by the puzzle; holds one snack type (L) | stops the snack, which is lost |
| Obstacle (tree, bench, sandpit) | nothing | stops the snack, which is lost |
| Parents' table | the parents; fixed by the puzzle | stops the snack, which is lost |

Each puzzle fixes the layout: path, lunchboxes, obstacles, tables (L). Friends
go only on open squares.

## 4. Snacks

The main-mode snack pool has 6 snacks. Each daily puzzle uses 3 of them
(default D14). Every snack has four visible attributes that clues can point at
(L):

| Snack | Colour | Feel | Taste | Shape |
|---|---|---|---|---|
| Apple | red | crunchy | sweet | round |
| Cookie | brown | crunchy | sweet | round |
| Banana | yellow | soft | sweet | long |
| Cheese stick | orange | soft | salty | long |
| Pretzel | brown | crunchy | salty | twisty |
| Grapes | green | soft | sweet | round |

The pool is tunable data. The rule that matters is that the 3 snacks chosen
for a day must each be pinned down by the clue templates in section 6. The
generator checks this.

## 5. Friends and throws (L)

Every friend has a **type** and a **facing**. The player sets the facing when
placing the friend (tap to turn it) and can change it between waves. A facing
is one direction, so each friend sends every snack it holds the same way. That
one rule settles the "more than one direction" edge case.

| Friend | Pattern | Facings | Where the snack goes |
|---|---|---|---|
| Straight | rook line | 4 (up, down, left, right) | along the line to the first thing in the way |
| Diagonal | bishop line | 4 diagonals | along the diagonal to the first thing in the way |
| Short | king step | 8 | the one square next to it in that direction |
| Bouncer | knight L | 8 L-hops | the target square, jumping over anything between |
| Nurse | does not throw | none | see section 7 |

**What a snack does when it arrives at a square**, in this order:

1. **Off the board:** the snack is lost.
2. **A friend who throws:** the friend catches it and throws it on, using its
   own pattern and facing. That counts as one **pass**.
3. **A Nurse:** the snack stops and is lost. Nurses don't pass snacks (D7).
4. **A kid:** the kid receives it (section 7).
5. **A lunchbox, obstacle or table:** the snack is lost.
6. **An empty square:**
   - For Straight and Diagonal it is not an arrival: the snack keeps flying.
     Lines have no range limit (D6).
   - For Short and Bouncer it is where the snack lands, and it is lost.

**Blocking and line of sight are deliberate (L).** A Straight or Diagonal
throw stops at the first friend, kid or obstacle on its line. A kid standing in
the way takes the snack, even one meant for someone further on. A Bouncer
ignores everything between it and its target.

**Loops (L):** a snack that has been passed **12 times** (tunable `passCap`)
is dropped and lost. With one facing per friend, any loop repeats forever, so
the cap always ends it. The setup screen warns about a loop before Go (D12).

**Picking up (L):** at the start of a wave, every throwing friend that shares a
side with a lunchbox (default D4: 4 neighbours, not 8) takes **one** snack of
that lunchbox's type and throws it. That friend is a **picker**.

- A friend may not touch two lunchboxes. The placement is refused, with the
  reason shown.
- One snack per picker per wave (D5). The board is static during a wave, so a
  second snack from the same picker would only follow the same route.
- A Nurse next to a lunchbox picks up nothing.

## 6. Kids and clues

Each kid wants exactly one snack (L). A kid has a look made of a shirt colour
and optional features: a hat, glasses, a backpack, and a sibling marker
(matching shirts). Relational clues point at these.

**Main mode (L):** each kid shows a clue card of 3 to 6 words, needing at most
one logic step, written for a grade-4 reader. Clue templates:

| Kind | Example | What it needs |
|---|---|---|
| Attribute | "Something crunchy" | exactly one of today's snacks is crunchy |
| Two attributes | "Sweet and long" | exactly one matches both |
| Not | "Not red, not soft" | exactly one is left |
| Same as | "Same as the kid in the hat" | that kid's snack is pinned by their own clue; only one kid on the board wears a hat |
| Not the same as | "Not the same as their sister" | together with another plain clue, leaves one |

**One-step rule:** a clue may use another kid's answer only if that kid's
answer comes from their own clue alone. No chains of two relational clues. The
**clue checker** (part of the solver) proves that every kid on the board has
exactly one possible snack, using only today's 3 snacks and the clues on the
board.

**Kindy mode (L):** no clue card. The snack picture floats over the kid's head.
The picture appears **only** in Kindy mode (L).

## 7. A wave: what happens after Go (L: watch-only)

Once Go is pressed the player can't change anything. The wave is resolved in
full at the moment Go is pressed. The animation then replays the result:
snacks arcing, kids wobbling, happy dances, the parent walking over. Nothing
random happens anywhere in resolution (L).

1. **Pickups:** every picker takes one snack.
2. **Flight:** each snack is followed from square to square under section 5
   until it is lost or a kid receives it. Every snack is followed separately,
   and the board never changes during a wave, so the order never changes a
   route.
3. **Who got there first:** a kid accepts only the **first** snack to reach
   them. "First" means:
   - fewest squares travelled from the lunchbox;
   - a tie goes to the snack whose picker is higher on the board, then the
     one further left (D8).
   
   This order also decides the animation's timing.
4. **Receiving:**
   - **Main mode:**
     - The right snack: the kid is **fed**, eats, does a happy dance and earns
       points.
     - The wrong snack: the kid gets a **tummy ache** (L).
     - Any later snack, right or wrong, is **wasted**: no penalty, just a lost
       throw (L).
   - **Kindy mode:**
     - A wrong snack bounces off and the kid shakes their head. It doesn't
       count as the kid's one snack, so a later right snack still feeds them
       (L).
5. **End of wave, main mode:**
   - Fed kids walk home happy and free their path square.
   - A kid with a tummy ache goes to the parents' table. If a **Nurse** has the
     kid within range (default: the 8 squares around the Nurse, tunable
     `nurseRange`; L, tuned later), the Nurse heals the kid. A healed kid
     **stays** for the next wave, still hungry for the same snack (D3). If no
     Nurse is in range, the kid **goes home hungry** (L: an unhealed tummy ache
     counts as hungry).
   - A kid who got no snack at all goes home hungry (D2: one wave of patience).
6. **End of wave, Kindy mode:** fed kids go home happy. Hungry kids simply
   wait for the next wave. Kindy can't be failed (L).

## 8. A day (L)

- **Main mode:** 10 waves. The board, friends and their facings carry over from
  wave to wave. 1 or 2 new kids arrive at the start of each wave, so the day
  gets harder as it goes (L). The run fails when the 4th kid goes home hungry
  (more than 3; L).
- **Bonus round:** clearing all 10 waves unlocks a harder 10-wave bonus round
  for that day (L). It is a fresh board made from the same date seed with a
  "bonus" salt (D11).
- **Between waves**, the player can place friends from the tray, move them,
  turn them, put them back in the tray, and visit the shop (L: only between
  waves).
- **The tray** is the row of unplaced friends at the bottom of the screen, in
  the thumb zone. Each puzzle sets the starting tray.

### The shop (L: this day only)

- Points come from fed kids: 1 point each, tunable (D20).
- Points buy friends from that day's catalogue, at these default prices
  (tunable):

  | Friend | Price |
  |---|---|
  | Short | 1 |
  | Straight | 2 |
  | Diagonal | 2 |
  | Bouncer | 3 |
  | Nurse | 3 |

- The catalogue is part of the puzzle, so everyone has the same tools on the
  same day (L).
- Everything bought, and all points, reset when the day ends (L).

## 9. Daily, practice, streaks, cosmetics

- **Daily (L):** one puzzle per profile per day. Everyone on that date gets the
  same seed. The host passes in the day as a whole number: the sim never reads
  a clock. A finished daily can't be played again; it shows its result.
  - Failing isn't final: the player retries from the start of the failed wave
    as often as they like (D10).
  - The **streak** counts days in a row with the daily finished (D10).
- **Practice (L):** unlimited random boards from random seeds. It earns no
  streak and no stickers.
- **Cosmetics (L):** the only things that last from day to day. Hats, outfits
  and sticker-book entries, earned by finishing dailies. They never change
  play.

## 10. The solver and the generator (L: no unsolvable board, ever)

Every board is checked before any player sees it: daily, practice, bonus and
Kindy. There are two checkers.

- **Clue checker** (main mode): proves each kid has exactly one possible snack
  (section 6).
- **Placement solver:** proves the day can be won. "Won" means there is a
  sequence of between-wave setups that feeds **every** kid in every wave
  (D13). It uses only:
  - the starting tray;
  - friends bought with points earned in earlier waves;
  - legal facings.
  
  The 3-hungry allowance is slack for the player, never needed by the
  solution.
  - It searches wave by wave, working backwards from each kid to a lunchbox
    with the right snack (the "reverse throw" squares of each pattern). It
    prunes on the friends and points available.
  - It returns a witness solution, which the tests keep and which can later
    power a hint.

**Generator:** "plant a solution, then check it".

- From a seed, build a layout, place a hidden solution, and put kids where the
  solution feeds them.
- Write clues that pin each kid's snack, and set the tray and catalogue so the
  solution is affordable.
- Run both checkers. On any failure, move to the next seed (seed, then
  seed + 1, and so on), so the board is still the same for everyone.
- A **difficulty score** sets each wave's place in the day:
  - fewest friends needed;
  - passes in the shortest route;
  - how few winning setups there are;
  - relational clues.

**Budget:** a daily board is generated and checked in under 1 second on a
phone with the CPU slowed 4x. The harness checks that every one of 1000 seeds
yields a board that passes.

## 11. Kindy mode (L)

- A 4x4 board, Straight friends only: no Diagonal, Short, Bouncer or Nurse.
- The wanted snack is a picture over each kid's head, with no text anywhere in
  play.
- No timer and no way to fail. A wrong snack bounces off and the kid shakes
  their head.
- Hints are spoken or animated, never text. The default is the phone's
  built-in voice plus an animated hand that shows the move, and the animation
  alone when sound is off (D16).
- Big tap targets everywhere: at least 64 px for a 4-year-old, above the
  44 px main-mode minimum.
- Its own profile, its own daily (from the date seed with a "kindy" salt) and
  its own sticker book. The default is 5 waves of 1 kid each, friends given
  per wave and no shop (D15).

## 12. Profiles (L)

- Each child has a profile with their own dailies, streak, completion status
  and sticker book. The mode is set when the profile is made: main or Kindy.
- The first screen is a row of big avatar pictures; tap yours to play. No
  reading or PIN is needed.
- Adding or deleting a profile is behind a grown-up press-and-hold, so a
  4-year-old can't delete a sibling's progress (D17).
- Each profile has its own save: snapshot plus command log, as in S9.

## 13. Defaults the owner accepted (all yes, 2026-10-20)

| # | Decision | Answer |
|---|---|---|
| D1 | Main board is 6 wide by 8 tall | yes |
| D2 | A kid who gets no snack in a wave goes home hungry at the end of that wave (no waiting a second wave) | yes |
| D3 | A Nurse-healed kid stays one more wave, still wanting the same snack; range is the 8 squares around the Nurse | yes |
| D4 | "Next to a lunchbox" means sharing a side (4 squares, not 8); a friend can't touch two lunchboxes | yes |
| D5 | Each picker takes one snack per wave | yes |
| D6 | Straight and Diagonal throws have no range limit; they fly until something stops them | yes |
| D7 | A Nurse in a throw's path stops the snack (it's lost); a snack landing on an empty square from Short or Bouncer is lost | yes |
| D8 | Two snacks reaching a kid together: fewer squares travelled wins, then the higher picker, then the one further left | yes |
| D9 | Kids stand still on path squares during a wave (no walking). Walking kids could be a later variant | yes |
| D10 | A failed daily can be retried from the failed wave, as often as wanted; the streak counts finished dailies | yes |
| D11 | The bonus round is a fresh board, doesn't affect the streak, and can be retried | yes |
| D12 | During setup each friend shows where its next throw lands (one hop, not the whole route), and a loop gets a warning before Go | yes |
| D13 | Every board must be winnable with zero hungry kids; the 3-kid allowance is slack | yes |
| D14 | A pool of 6 snacks with 3 used each day; the snack list in section 4 | yes |
| D15 | Kindy day: 5 waves, 1 kid each, friends given, no shop; a kid not fed waits for the next wave | yes |
| D16 | Kindy hints use the phone's built-in voice plus an animated hand, with no recorded audio | yes |
| D17 | Profiles have no PIN; adding and deleting needs a grown-up press-and-hold | yes |
| D18 | The daily changes at the device's local midnight | yes |
| D19 | The game is called Snack Attack | yes |
| D20 | 1 point per fed kid; shop prices Short 1, Straight 2, Diagonal 2, Bouncer 3, Nurse 3 | yes |

## 14. Conflicts with what was already written or built, and how each is resolved

### With the code and docs in this repository (the warehouse simulator)

| # | Conflict | Resolution |
|---|---|---|
| C1 | The whole repository is the warehouse WMS sim: packages/sim/src/wms, the contracts warehouse.ts and wms.ts, the harness wms-load and report, and the UI in apps/web/src/ui | It is removed in build step 0. Kept: the npm workspace layout, purity rules and their tests (T3), the seeded RNG, the state hash, the Node-vs-Chromium determinism test, the save format and migrations (S9), the Web Worker host, the PWA shell and the phone check. Git history keeps the warehouse at commit `734c848`. |
| C2 | P4 and S4: the host owns a wall clock, and time away is caught up by stepping the sim fast. CLAUDE.md states this as an architecture rule | Dropped. Nothing happens while the app is closed. A wave is resolved in one go when Go is pressed and replayed as animation. The determinism and integer rules stay. The clock rule needs record K1 and a CLAUDE.md edit by the architect. |
| C3 | P3: 250 ms ticks and money in cents | Replaced by animation **beats**, one square a beat for playback only, and whole-number points. |
| C4 | docs/RULES.md is the warehouse rules, and packages/harness/src/rules.test.ts checks its tunables table against the code | That's why this spec is a separate file for now. In step 0, RULES.md is replaced by this spec, with a new tunables table (`passCap`, `nurseRange`, board sizes, prices, points, hungry allowance), and the test keeps working. |
| C5 | The harness report targets (on-time-in-full, fill rate, money an hour) | Replaced by generator checks: 1000 seeds, 100% solvable, generation time, difficulty spread. |
| C6 | ROADMAP.md, DECISIONS.md and CLAUDE.md describe the warehouse and are architect-only | Not edited in this pass. Step 0 writes record K1 (warehouse to Snack Attack) and rewrites the roadmap and the first paragraph of CLAUDE.md. The owner's go-ahead to step 0 is the authority for that. |
| C7 | One save per device (S9) | One save per profile, each in the same snapshot-plus-log format. |
| C8 | The date: the sim may not read Date | The host passes the day number in a command. The daily seed is derived from it inside the sim. |
| C9 | Package names `@warehouse/*` and root name `warehouse-idle` | Renamed `@snacks/*` in step 0, which is cheap now that the code is going anyway. |
| C10 | The big-number formatting rule (1.2K, 3.4M) | Harmless and kept, though scores stay small. |

### With what I proposed earlier in this conversation

| # | What I proposed | What it is now |
|---|---|---|
| C11 | After your first answer I said "not chess" and dropped chess moves | Throw patterns are chess moves (rook, bishop, king, knight). Play is not chess: no capturing, no opponent. |
| C12 | Kids walking a fixed path from A to B | Kids stand on path squares and don't move during a wave (D9). The path is where they stand and what blocks lines. |
| C13 | Tapping the kid, then the parent, during a wave to fix a tummy ache | Waves are watch-only. The Nurse heals tummy aches, and the parent walks over in the animation. |
| C14 | Throws in all 8 directions within a range | Each friend type has its own pattern and one facing. Lines have no range limit (D6); only the Nurse has a range. |
| C15 | Your earlier "pieces hit within a range, only diagonal or horizontal" | Covered by Straight (including up and down, as decided) and Diagonal. |
| C16 | Your earlier "5–10 rounds" and "2 rounds of 10 waves" | 10 waves plus a 10-wave bonus round, as decided. |
| C17 | Your earlier "bonus points to modify your character mix" | Points buy friends for that day only. Lasting changes are cosmetic. |
| C18 | Your earlier "in kindy mode they just win" | A wrong snack bounces off and the kid waits. Kindy has no tummy ache and no failing. |

## 15. Build order

The engine and the solver come first. No art, shop UI or Kindy mode until both
work on hand-made test boards (L). Each step is a pull request that passes
`npm test` and `npm run check`.

0. **Reset.**
   - Write record K1.
   - Rewrite ROADMAP.md and CLAUDE.md, and replace RULES.md with this spec.
   - Remove the warehouse code and keep the skeleton (C1).
   - Rename the packages.
   - Leave a blank app screen.
1. **Contracts.**
   - Board, squares, friends, facings, snacks, kids, clues.
   - Commands: place, move, turn, return to tray, buy, Go, start a day.
   - The wave result as a list of events, which also serves as the
     animation script.
2. **Resolution engine, tests first.**
   - About 25 hand-made boards, one or more per rule in sections 5 and 7. Edge
     cases: blocking, catching, the board edge, the pass cap, ties, wrong then
     right, the Nurse, two lunchboxes refused.
   - Property tests:
     - every snack ends in exactly one way;
     - the same board always gives the same result;
     - Node and Chromium agree.
3. **Placement solver.** One wave first, then a whole day with points and
   the shop catalogue. It is tested on the hand-made boards and on boards
   built to be unsolvable.
4. **Clue checker and clue writer.** The snack pool, the templates, the
   one-step rule and a reading-level word list.
5. **Generator.**
   - Plant a solution and run both checkers.
   - Difficulty ramp across the 10 waves, plus the bonus salt.
   - Harness report over 1000 seeds, with the time budget.
6. **A plain playable screen.** Grey squares and letters, no art. The owner and
   the 9-year-old test whether the puzzle is fun before any art is made.
   **Gate:** the owner says it's fun, or says what to change.
7. **Daily, practice, profiles and saves.**
8. **Art and wave animation**, outside React, as in P7.
9. **Shop screen.**
10. **Kindy mode:** the 4x4 rules in the engine and generator, the pictures,
    the spoken and animated hints.
11. **Sticker book, cosmetics and streak.**
12. **Phone check and polish:** 360 px, safe areas, 60 fps with the CPU
    slowed 4x, tap sizes.
