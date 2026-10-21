# Rules: Snack Attack

The game-rules spec (decision record K1). The owner's decisions of 2026-10-20
are marked (L), and the twenty defaults the owner accepted the same day keep
their numbers D1-D20 (section 13). Section 7a lists the rules the engine
needed that the owner's brief left open (decision record K4). Every number
lives in section 14 and in `packages/sim/src/tunables.ts`; a test keeps them
identical.

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

A grid of squares: 6 wide by 8 tall in main mode (D1, `mainWidth`,
`mainHeight`) and 4 by 4 in Kindy mode (L, `kindySize`). Each square is one
of:

| Square | Who can be there | Effect on a throw |
|---|---|---|
| Open (playground) | a friend, or nothing | passes through when empty; a friend there catches |
| Path | kids only | the kid there receives the snack; an empty path square lets it through |
| Lunchbox | fixed by the puzzle; holds one snack type (L) | stops the snack, which is lost |
| Obstacle (tree, bench, sandpit) | nothing | stops the snack, which is lost |
| Parents' table | the parents; fixed by the puzzle | stops the snack, which is lost |

Each puzzle fixes the layout: path, lunchboxes, obstacles, tables (L). Friends
go only on open squares. The path runs from the school gate at the top to home
at the bottom.

## 4. Snacks

The main-mode snack pool has 6 snacks; each daily puzzle uses 3 of them (D14,
`snacksPerDay`), one lunchbox each. Kindy uses 2 (`kindySnacks`). Every snack
has four visible traits clues can point at (L):

| Snack | Colour | Feel | Taste | Shape |
|---|---|---|---|---|
| Apple | red | crunchy | sweet | round |
| Cookie | brown | crunchy | sweet | round |
| Banana | yellow | soft | sweet | long |
| Cheese stick | orange | soft | salty | long |
| Pretzel | brown | crunchy | salty | twisty |
| Grapes | green | soft | sweet | round |

A day's snacks are chosen so that each can be pinned by a clue of one or two
facts.

## 5. Friends and throws (L)

Every friend has a **type** and a **facing**. The player sets the facing after
placing the friend (by tapping one of the squares its pattern can throw to,
section 8a) and can change it between waves. A facing is one direction, so
each friend sends every snack it holds the same way.

| Friend | Pattern | Facings | Where the snack goes |
|---|---|---|---|
| Straight | rook line | 4 (up, right, down, left) | along the line to the first thing in the way |
| Diagonal | bishop line | 4 diagonals | along the diagonal to the first thing in the way |
| Short | king step | 8 | the one square next to it in that direction |
| Bouncer | knight L | 8 L-hops | the target square, jumping over anything between |
| Nurse | does not throw | none | see section 7 |

**What a snack does when it arrives at a square**, in this order:

1. **Off the board:** the snack is lost (`edge`).
2. **A friend who throws:** the friend catches it and throws it on, using its
   own pattern and facing. That counts as one **pass**.
3. **A Nurse:** the snack stops and is lost (D7).
4. **A kid:** the kid receives it (section 7).
5. **A lunchbox, obstacle or table:** the snack is lost (`blocked`).
6. **An empty square:**
   - For Straight and Diagonal it is not an arrival: the snack keeps flying.
     Lines have no range limit (D6).
   - For Short and Bouncer it is where the snack lands, and it is lost
     (`dropped`, D7).

**Blocking and line of sight are deliberate (L).** A Straight or Diagonal
throw stops at the first friend, kid or obstacle on its line. A kid standing in
the way takes the snack, even one meant for someone further on. A Bouncer
ignores everything between it and its target.

**Loops (L):** the snack is dropped and lost at its **12th** catch (`passCap`).
With one facing per friend, any loop repeats forever, so the cap always ends
it. The setup screen warns about a loop before Go (D12).

**Picking up (L):** at the start of a wave, every throwing friend that shares a
side with a lunchbox (D4: up, right, down or left, not diagonally) takes
**one** snack of that box's type and throws it. That friend is a **picker**.

- A throwing friend may not stand next to two lunchboxes. The placement is
  refused, with the reason shown.
- One snack per picker per wave (D5).
- A Nurse next to a lunchbox picks up nothing.

## 6. Kids and clues

Each kid wants exactly one snack (L). A kid has a look: a shirt colour, and
sometimes a hat, glasses or a backpack. Sisters wear the same shirt colour.

**Main mode (L):** each kid shows a clue card for a grade-4 reader, needing at
most one logic step. Clue kinds:

| Kind | Example | What it needs |
|---|---|---|
| Trait | "Something crunchy" | exactly one of today's snacks is crunchy |
| Two traits | "Something sweet and long" | exactly one matches both |
| Not | "Not red, not soft" | exactly one is left |
| Trait and not | "Something sweet, not red" | exactly one is left |
| Same as | "Same as the kid in the hat" | the kid in the hat is pinned by their own card |
| Not their sister's | "Something soft, not their sister's" | together with the trait, leaves one |

**Read from the art (K10, docs/ART.md):** every trait a clue can point at
can be seen in the pictures, and colour is never the only cue. Each snack
colour carries its own mark (red a triangle, brown a square, yellow a star,
orange a diamond, green a leaf) on the lunchbox's tag, in the card's snack
key and in the clue's own pictures; crunchy, soft, sweet, salty, round, long
and twisty each have a picture; each of the six shirt colours has its own
pattern, so sisters match by pattern too; the hat, the glasses and the
backpack are drawn big enough to see on a phone. No two snacks, shirts or
friends differ only in colour (a test, `art.test.ts`).

**One-step rule:** a card may point at another kid only if that kid's own card
pins their snack directly. The **clue checker** (`clues.ts`) proves that every
kid has exactly one possible snack, using only today's snacks and the cards
on the board, and that it is the snack they want.

**Kindy mode (L):** no clue card. The snack picture floats over the kid's
head, and appears **only** in Kindy mode (L).

## 7. A wave: what happens after Go (L: watch-only)

Once Go is pressed the player can't change anything. The wave is resolved in
full the moment Go is pressed (`resolve.ts`), and the screen then replays the
result. Nothing random happens anywhere in resolution (L).

**The replay (K10)** shows exactly that result, a beat (220 ms) per square:
each snack leaves its lunchbox (the lid pops), reaches its picker after one
beat and flies its real route, arcing as its thrower throws (low for a
line, a hop for a Short, high for a Bouncer's jump); a friend bobs as it
catches and passes; a kid reacts when the first snack reaches them (a happy
dance, a tummy-ache wobble, or in Kindy a head shake as a wrong snack
bounces off); then fed kids go home happy down the path, the Nurse sends
sparkles to a kid it heals, and a hungry kid walks home sad (to the parents'
table after a tummy ache). With reduced motion the snacks glide without
arcs or spins and the kids only change face.

1. **Pickups:** every picker takes one snack.
2. **Flight:** each snack is followed square by square under section 5 until
   it is lost or a kid receives it. The board never changes during a wave, so
   every snack is followed on its own.
3. **Who got there first:** a kid accepts only the **first** snack to reach
   them. "First" means fewest **beats** from the lunchbox (a beat is one
   square crossed; a Bouncer hop is `bouncerBeats`, 2; a catch takes none). A
   tie goes to the snack whose picker is higher on the board, then to the one
   further left (D8).
4. **Receiving:**
   - **Main mode:**
     - The right snack: the kid is **fed**, eats and earns points.
     - The wrong snack: the kid gets a **tummy ache** (L).
     - Any later snack, right or wrong, is **wasted**: no penalty (L).
   - **Kindy mode:** a wrong snack bounces off and the kid shakes their head.
     It doesn't count, so a later right snack still feeds them (L).
5. **End of wave, main mode:**
   - Fed kids walk home happy.
   - A kid with a tummy ache goes to the parents' table. If a **Nurse** stands
     within `nurseRange` of the kid (1: the 8 squares around the Nurse, L,
     D3), the Nurse heals them and they **stay** one more wave, still wanting
     the same snack. Otherwise they **go home hungry** (L).
   - A kid who got no snack at all goes home hungry (D2).
6. **End of wave, Kindy mode:** fed kids go home happy, and anyone not fed
   waits for the next wave (D15). Kindy can't be lost (L).

### 7a. Rules the brief left open (decision record K4)

- **A Nurse heals a kid once.** A second tummy ache sends a healed kid home
  hungry.
- **The day's end:** a healed kid still waiting when the last wave ends goes
  home hungry.
- **Arrival squares are free:**
  - In main mode a wave's kids never arrive on a square the previous wave's
    kids stood on, because a healed kid may still be there.
  - In Kindy no kid arrives where an earlier kid stood, because an unfed kid
    waits.
- **A Kindy day** ends when every kid has arrived and been fed. Waves go on
  past the fifth until then.
- **A Kindy day never gets stuck** (K8). Any kid may miss a wave, so any set
  of kids may end up waiting together, and one standing in the way of
  another takes their snack. The generator keeps a Kindy board only if, for
  every set of kids who could be waiting together, the friends given can
  feed at least one of them with the others standing there; so the child
  can always finish the day.
- **Clue cards run 2 to 7 words.** The brief asked for 3 to 6, but its own
  examples run from "Something crunchy" (2 words) to "Same as the kid in the
  hat" (7).
- **Only hats and glasses** are pointed at by "same as" cards. Backpacks are
  only for looks, and "Same as the kid with a backpack" would run to 8 words.

## 8. A day (L)

- **Main mode:** 10 waves (`mainWaves`). The board, friends and their facings
  carry over from wave to wave.
  - 1 kid arrives in each of waves 1-3, 1 or 2 in waves 4-6, and 2 in waves
    7-10, so the day gets harder.
  - The run fails when more than `hungryAllowed` (3) kids have gone home
    hungry (L).
- **Bonus round:** clearing all 10 waves unlocks a harder 10-wave bonus round
  for that day (L). It is a fresh board from the same day's seed with a
  "bonus" salt (D11), with 2 kids a wave and more obstacles.
  - It gets harder wave by wave (K11): the two kids' shortest routes need
    `bonusFriendsFirst` (3) friends together at wave 1, rising evenly to
    `bonusFriendsLast` (5) at wave 10, and the chance that a card points at
    another kid rises from `bonusCluesFirst` (30%) to `bonusCluesLast` (90%).
    Its last waves are harder than the daily's last.
- **Between waves**, the player can place friends from the tray, move them,
  turn them, put them back in the tray, and visit the shop (L: only between
  waves).
- **The tray** is the row of unplaced friends at the bottom of the screen.
  Each puzzle sets the starting tray. In main mode it also holds decoys,
  friends the stored solution never needs, so the tray alone doesn't give
  the answer away (section 10, K11).

### 8a. Setting up on the screen (decision record K6)

How the player gives the commands above on a phone. None of this changes a
rule: every action is a place, turn or toTray command, checked by the sim.

- **Placing:** tap a friend in the tray, then a grass square; or drag it from
  the tray onto the square. Each tray button shows the friend's picture
  (its hat and badge hint at its pattern, K10), its name, a small diagram of
  its throw pattern and how many are left.
- **Moving:** drag a placed friend to another square, or select it, tap Move
  and tap a square. Dragging it off the board (or tapping To tray) puts it
  back in the tray. Drag is never the only way to do anything.
- **Aiming (tap-to-aim):** a selected friend lights every square its pattern
  can throw to: Straight and Diagonal along each of their 4 lines up to the
  first thing in the way, Short the 8 squares around it, Bouncer its 8
  L-hops. Tapping a lit square sets the facing that throws there. A small
  turn button stays for a facing no square stands for (towards the edge).
  A selected Nurse lights its heal range (`nurseRange`) instead.
- **The preview (D12):** during setup every friend shows where its next throw
  lands, with a dashed line to that square. The screen never draws a snack's
  whole route.
- **Undo** takes back the last placement, move, aim change or Clear board of
  this setup. **Clear board** (after a confirm step) puts every friend placed
  during this setup back in the tray; friends already on the board when the
  setup began stay. Neither can reach past Go: what a played wave did and
  earlier waves stay as they are. Neither takes back a purchase; the shop's
  Give back does that, until Go (below, K9).
- **Clues:** each kid on the board wears a letter badge, and its card is shown
  above the board, in words and pictures (in a shorter form when 3 or 4 kids
  are on the board).
  Tapping the kid or its card opens the full card with today's snacks; it
  stays open until closed.
- **After a wave**, a card over the board lists who was fed, who got a tummy
  ache, who the Nurse healed, hungry kids against the allowance (say, 1 of 3)
  and the points earned, with one button back to setup.

### 8b. Hints in main mode (decision record K11)

A **Hint** button (a light bulb) sits beside Undo during setup. It works only during setup:
not while a wave plays, and not once the day is won or lost. Each press is
the next step for one kid, from the puzzle's stored solution:

1. **Which card to solve next**, and what it is about: the kid's card and
   kid light up, with a line such as "Kid B next: their card is about how it
   feels". Cards that pin their snack themselves come before cards that point
   at another kid.
2. **Which lunchbox feeds them**: that lunchbox lights up. This gives away
   which snack the kid wants, because the player asked for it.
3. **One friend put in place** for that kid, with the right facing. A friend
   of another type on its square goes back to the tray; a friend already on
   the board that the plan doesn't use moves there before one comes from the
   tray; one is bought only when none is owned and the points are there.
   Pressed again: the next friend of that kid's route. With the route
   complete, a friend still in the way goes back to the tray.

When the setup on the board feeds the kid, the next press moves on to the
next kid, at step 1. When it feeds every kid, the hint says so: press Go.
The setup a hint leads to is the stored solution while the wave goes to plan;
otherwise (a healed kid staying, different friends bought) what the solver
finds with the friends and points the player has. Undo takes back what step 3
moved, like any other change; the press itself stays counted.

- **Counting:** hints used are counted for each wave and for the day, and
  kept in the save. A retry keeps them. The result card after a wave shows
  the wave's hints and the day's; done for today shows the day's.
- **Hints never change the streak**, nor anything else about the day.
- Kindy has its own hints (section 11a), which show by themselves.

### The shop (L: this day only)

- Points come from fed kids: `pointsPerKid` (1) each (D20).
- Points buy friends from that day's catalogue, at these prices:

  | Friend | Price |
  |---|---|
  | Short | 1 (`priceShort`) |
  | Straight | 2 (`priceStraight`) |
  | Diagonal | 2 (`priceDiagonal`) |
  | Bouncer | 3 (`priceBouncer`) |
  | Nurse | 3 (`priceNurse`) |

- The catalogue is part of the puzzle, so everyone has the same tools on the
  same day (L). It is fixed by the puzzle's seed; today every main-mode
  puzzle (daily, bonus, practice) sells all five friends.
- Everything bought, and all points, reset when the day ends (L).
- Main mode only: Kindy has no shop (D15).

**On the screen (decision record K9).** None of this changes a price or a
rule: every action is a buy or refund command, checked by the sim.
- **Opening it:** the Shop button in the tray shows the points to spend. It
  works during setup, before any wave and between waves, and is off from
  the moment Go is pressed until the wave has played (L: only between
  waves).
- **The sheet** rises from the bottom and fits a 360 x 740 phone with
  nothing to scroll. It closes with its close button, a tap above it, or a
  swipe down on its top.
- **A card per friend:** a picture, the name, its throw pattern (the same
  diagram as the tray), one line on what it does, "You have N" (in the tray
  and on the board today) and the price. With too few points the card is
  greyed out and its button says how many more are needed ("Need 2 more").
- **Buying:** tap the price. The friend goes straight into the tray.
- **Giving back (K9):** a friend bought since the last Go can be given back
  for every point it cost, until Go is pressed, from the tray or from the
  board. The card shows Give back while there is one; it gives back the
  last one bought, one still in the tray first. Friends from the starting
  tray, and anything bought before the last Go, can't be given back. A
  retry starts the setup again with the points it began with.
- **Nothing to change before buying.** A friend has only a type and a
  facing, and the facing is set on the board (tap-to-aim, 8a). The owner's
  brief mentioned modifying a friend before buying; the spec defines no
  such option, so there is none (an open question in K9).

## 9. Daily, practice, streaks, cosmetics

- **Daily (L):** one puzzle per profile per day.
  - Everyone on that date gets the same seed. The host passes in the day as a
    whole number of days since 1970-01-01 on the device's calendar, so the
    puzzle changes at local midnight (D18). The sim never reads a clock.
  - A finished daily can't be played again. It shows a **done for today**
    screen: kids fed, hungry against the allowance, how many retries it took,
    hints used (K11), the streak, the last seven days, and a countdown to the
    next puzzle at local midnight. The bonus round and practice are still
    there (K7).
  - Failing isn't final: the player retries from the start of the failed wave
    as often as they like (D10).
- **The streak** (D10, K7): consecutive local calendar days on which the
  profile finished the 10-wave daily.
  - "Finished" means all 10 waves cleared, so the bonus round opens. A day
    finished after failing and retrying counts the same.
  - Today counts once it is finished. Until then the streak still shows the
    run up to yesterday; a missed day resets it to 0.
  - The **best streak** is the longest run the profile ever had.
  - The bonus round (D11), practice and hints (section 8b) never change it.
  - Each profile keeps its finished days (`historyKept`, more than a year,
    and all of a streak still going).
- **When the date misbehaves** (K7). The game never tries to stop clock
  cheating; it only never crashes or damages a save.
  - **Midnight during a run:** a run finishes on the day it started. A daily
    begun at 23:50 and won at 00:10 counts for the day it began. A run still
    unfinished when the app is next opened on a later day stays saved, but
    that day's puzzle opens instead.
  - **A timezone change** just changes which day is today. Flying west can
    show yesterday's puzzle again (a new one if it wasn't played, the done
    screen if it was); a finished day is never counted twice. Flying east
    can skip a day, which counts as missed.
  - **A clock set backwards** opens that day's puzzle. Finished days are
    kept, and days after "today" are simply not counted until the clock
    catches up.
- **Practice (L):** unlimited random boards. It earns no streak and no
  stickers. Each profile has its own practice board, which reopens where it
  was left.
- **Cosmetics (L):** the only things that last from day to day: hats, outfits
  and sticker-book entries, earned by finishing dailies. They never change
  play.

## 10. The solver and the generator (L: no unsolvable board, ever)

Every board is checked before any player sees it: daily, practice, bonus and
Kindy.

- **Clue checker** (main mode): section 6.
- **Placement solver** (`solver.ts`): proves the day can be won.
  - "Won" means there is a setup for every wave that feeds **every** kid with
    no tummy ache (D13). It may use only:
    - the starting tray;
    - friends bought with points earned in earlier waves;
    - legal facings.
  - It searches backwards from each kid to a lunchbox with the right snack,
    through chains of up to `routeMax` (3) friends, combines one chain per
    kid, and keeps a setup only when the real wave engine feeds every kid.
  - It is **sound, not complete**. A setup it returns always works, because
    the engine checked it. It may miss a cleverer one, and then the board is
    thrown away.
  - Its solution is stored with the puzzle as the **witness**. The View never
    shows it; it powers the hints (sections 8b, 11a).
- **Generator** (`generate.ts`): "plant a solution, then check it".
  - From a seed it lays out a board.
  - Then, wave by wave, it puts kids on the path where the **shortest** route
    to their snack is as long as that wave calls for:
    - main: 1 friend in waves 1-2, 1-2 in waves 3-5, 2 in waves 6-8, 2-3 in
      waves 9-10;
    - bonus: 1-3 each, the two kids' together adding up to the ramp's
      number for that wave (section 8: 3, 3, 3, 4, 4, 4, 4, 5, 5, 5). A
      bonus board that can't carry the ramp's last waves is thrown away
      before any kid is placed;
    - Kindy: 1-2.
  - It plants one such route per kid and writes clues that pin each kid's
    snack.
  - It sets the starting tray to what the planted day needs beyond what the
    points earned so far can buy.
  - **Decoys** (main mode, K11): it then adds `decoys` (2) friends the planted
    day doesn't need. The first is certainly spare: a type the tray already
    holds as many of as the solution ever places at once, a type the
    solution never uses if there is one. The second is any type that
    throws. The solution proved on the planted tray still works, since
    owning more friends never stops a setup. A day is kept only if its tray
    keeps a friend the solution never places, and no wave's solution places
    every friend owned at that wave (the tray would then say "use
    everything"). Kindy's friends are given as they are (D15): no decoys.
  - It runs both checkers. On any failure it moves to the next seed, at most
    `generatorSeeds` of them, so the board is still the same for everyone.
- **Difficulty** of a wave is the number of friends in the solver's setup plus
  the relational clues.
- **Budget:** a daily board is generated and checked in under 1 second on a
  phone with the CPU slowed 4x. The harness checks that all of 1000 main
  dailies, 300 bonus rounds and 300 Kindy dailies pass (`npm test`),
  including the decoys and the bonus ramp, and
  `npm run harness -- report` prints how hard and how fast they are
  (docs/balance/generator-report.md).
- **The report's targets** (K11): in main dailies and bonus rounds, 0% of
  waves where the tray gives the answer away and 0% of days whose tray is
  only the answer; the bonus round's last three waves at least 1.5 harder than
  its first three, and its wave 10 harder than the daily's wave 10. Its
  sanity tables give, for each kind and wave, the kids, friends needed,
  clue-logic steps, pass-chain lengths, spare friends and decoys.

## 11. Kindy mode (L)

- A 4x4 board, Straight friends only: no Diagonal, Short, Bouncer or Nurse.
- The wanted snack is a picture over each kid's head, with no text anywhere in
  play.
- No timer and no way to fail. A wrong snack bounces off and the kid shakes
  their head. They wait for the next wave, still wanting the same snack, and
  the board stays as the child left it (D15): the child tries again, with the
  next kid arriving beside them.
- Hints are spoken or animated, never text: the phone's built-in voice plus an
  animated hand, or the animation alone when sound is off (D16). See 11a.
- Big tap targets everywhere: at least 64 px.
- Its own profile, and its own daily from the date seed with a "kindy" salt.
- 5 waves of 1 kid each (`kindyWaves`); all friends in the tray from the
  start; no shop (D15) and no bonus round.

### 11a. Kindy on the screen (decision record K8)

None of this changes a rule: every action is a place, turn or toTray
command, or Go, checked by the sim.

- **No text at all** from the child's picture to the end of the day: every
  picture is drawn as SVG with no text in it (K10), so there is not one
  letter or digit on the page.
  Words exist only as the spoken hints and as labels for screen readers.
  Parent words live behind the grown-ups' menu (section 12).
- **The screen:** the child's picture (back to the picker), a row of five
  faces that fill as kids are fed, and a help bubble on top; the board as
  wide as the phone (squares about 80 px); at the bottom the friends in the
  tray, the basket and a big green play button.
- **Setting up:** tap a friend, then the square it goes on (or drag it, as in
  main mode). A friend on the board lights one big square for each way it
  can throw, with an arrow: where that throw ends (the first thing in the
  way, or the last square before the edge). Tapping one aims it. Tap a
  friend on the board, then another square, to move it; or then the basket
  to take it back. A tap that can't do anything wiggles the square.
- **The wave:** the snacks fly; a fed kid dances; a wrong snack bounces off
  and the kid shakes their head. No card to read or close: the board is
  ready again as soon as the wave ends.
- **Hints (D16):** after `kindyHintIdle` (8) seconds without a tap, or a tap
  on the help bubble, a hand points at the next step: the friend, then where
  it goes; or the square to aim at; or the basket; or the play button. It
  stays until that step is done. The steps lead to the puzzle's stored
  solution for the wave; once a kid is left waiting, to a setup that feeds
  everyone if there is one, else the kid who has waited longest (their own
  wave's stored solution first). A setup the child made that already feeds
  everyone is left alone: the hint is the play button.
- **The voice** says each hint in a few words ("Put the thrower here!"). A
  phone may speak only after a tap, so speech starts with the child's first
  tap; where there is no voice, the hand alone is the hint. A grown-up turns
  the voice off in the grown-ups' menu.
- **The end:** a party with confetti and every kid dancing, and one big play
  button to done for today: a sleeping sun, a moon crossing the night to a
  sunrise (the next puzzle at local midnight, a picture countdown), a face
  for each kid fed and a star for each finished day of the week, and a
  practice button. When the new day comes the sun wakes up and a big play
  button opens it. A finished Kindy practice board shows the party with a
  new board and today's buttons.

## 12. Profiles (L)

- Each child has a profile with their own dailies, streak, completion status
  and sticker book. The mode is set when the profile is made: main or Kindy.
- The first screen is a grid of big avatar pictures; tap yours to play. With
  only one profile on the device there is nothing to choose, so the app
  opens straight on that child's game (K7). The picture in the top bar opens
  the picker at any time.
- Adding or deleting a profile is behind a grown-up press-and-hold (D17): a
  small Grown-ups button on the picker, held for a second, opens a menu to
  add a child (a picture, an optional name, Main or Kindy), change a
  picture or name, or delete a profile after a confirm step. A quick tap
  does nothing but say to hold it (K7).
  - Every profile has its own picture: one already taken can't be picked.
  - At most `maxProfiles` (6) profiles; names are optional and at most
    `nameLength` (12) characters.
  - The last profile can't be deleted.
  - Deleting a profile deletes its saves too.
- Each profile has its own saves: today's daily (with its retry state), the
  bonus round, practice, its finished days, streak and best streak. Each
  game is saved as snapshot plus command log (S9). Nothing leaves the
  device: no accounts, no server.
- A Kindy profile opens the Kindy screen (section 11a). The grown-ups' menu
  also turns Kindy's spoken hints off or on (D16), and turns each child's
  sound off or on (section 16, K12).
- A device that was played before profiles keeps its progress: its game and
  finished days become the first profile's (K7).

## 13. Decisions the owner accepted (all yes, 2026-10-20)

| # | Decision |
|---|---|
| D1 | Main board is 6 wide by 8 tall |
| D2 | A kid who gets no snack in a wave goes home hungry at the end of that wave |
| D3 | A Nurse-healed kid stays one more wave, still wanting the same snack; range is the 8 squares around the Nurse |
| D4 | "Next to a lunchbox" means sharing a side; a friend can't touch two lunchboxes |
| D5 | Each picker takes one snack per wave |
| D6 | Straight and Diagonal throws have no range limit |
| D7 | A Nurse in a throw's path stops the snack; a Short or Bouncer throw landing on an empty square loses it |
| D8 | Two snacks reaching a kid together: fewer squares travelled wins, then the higher picker, then the one further left |
| D9 | Kids stand still on path squares during a wave |
| D10 | A failed daily can be retried from the failed wave, as often as wanted; the streak counts finished dailies |
| D11 | The bonus round is a fresh board, doesn't affect the streak, and can be retried |
| D12 | During setup each friend shows where its next throw lands, and a loop gets a warning before Go |
| D13 | Every board must be winnable with zero hungry kids |
| D14 | A pool of 6 snacks with 3 used each day |
| D15 | Kindy day: 5 waves, 1 kid each, friends given, no shop; a kid not fed waits for the next wave |
| D16 | Kindy hints use the phone's built-in voice plus an animated hand |
| D17 | Profiles have no PIN; adding and deleting needs a grown-up press-and-hold |
| D18 | The daily changes at the device's local midnight |
| D19 | The game is called Snack Attack |
| D20 | 1 point per fed kid; shop prices Short 1, Straight 2, Diagonal 2, Bouncer 3, Nurse 3 |

## 14. Tunables

Whole numbers only. The band is the range a reviewer may tune within; going
outside it is a design change.

| Tunable | Value | Min | Max | What it is |
|---|---|---|---|---|
| `passCap` | 12 | 4 | 32 | Catches before a snack is dropped (section 5) |
| `nurseRange` | 1 | 1 | 3 | Nurse reach in squares, diagonals included (section 7) |
| `hungryAllowed` | 3 | 0 | 5 | Kids who may go home hungry; one more loses (section 8) |
| `mainWaves` | 10 | 5 | 15 | Waves in a main day and in its bonus round |
| `kindyWaves` | 5 | 3 | 8 | Waves in a Kindy day, one new kid each |
| `mainWidth` | 6 | 5 | 8 | Main board width (D1) |
| `mainHeight` | 8 | 6 | 10 | Main board height (D1) |
| `kindySize` | 4 | 4 | 5 | Kindy board width and height |
| `pointsPerKid` | 1 | 1 | 3 | Points for each kid fed (D20) |
| `priceShort` | 1 | 1 | 5 | Shop price of a Short (D20) |
| `priceStraight` | 2 | 1 | 5 | Shop price of a Straight (D20) |
| `priceDiagonal` | 2 | 1 | 5 | Shop price of a Diagonal (D20) |
| `priceBouncer` | 3 | 1 | 6 | Shop price of a Bouncer (D20) |
| `priceNurse` | 3 | 1 | 6 | Shop price of a Nurse (D20) |
| `snacksPerDay` | 3 | 2 | 4 | Snacks in a main day (D14) |
| `kindySnacks` | 2 | 1 | 3 | Snacks in a Kindy day |
| `bouncerBeats` | 2 | 1 | 3 | Beats a Bouncer hop takes (section 7) |
| `routeMax` | 3 | 2 | 4 | Most friends in one route the solver and generator look at |
| `solverTries` | 4000 | 500 | 50000 | Setups the solver checks for one wave before giving up |
| `generatorSeeds` | 200 | 20 | 1000 | Seeds the generator tries for one day before failing |
| `obstaclesMin` | 2 | 0 | 6 | Fewest obstacles on a main board |
| `obstaclesMax` | 4 | 0 | 8 | Most obstacles on a main board |
| `bonusObstacles` | 2 | 0 | 4 | Extra obstacles on a bonus board |
| `bonusFriendsFirst` | 3 | 2 | 6 | Friends the 2 kids' shortest routes add up to at bonus wave 1 (section 8, K11) |
| `bonusFriendsLast` | 5 | 4 | 6 | The same at the last bonus wave; the waves between ramp evenly |
| `bonusCluesFirst` | 30 | 0 | 100 | Percent chance bonus wave 1 has a card pointing at another kid |
| `bonusCluesLast` | 90 | 0 | 100 | The same at the last bonus wave |
| `decoys` | 2 | 1 | 4 | Friends added to a main-mode starting tray beyond what the day needs (section 10, K11) |
| `maxProfiles` | 6 | 2 | 8 | Profiles on one device (section 12) |
| `nameLength` | 12 | 6 | 20 | Longest profile name, in characters (section 12) |
| `historyKept` | 400 | 60 | 3650 | Finished days a profile keeps, besides the streak still going (section 9) |
| `kindyHintIdle` | 8 | 4 | 20 | Seconds without a tap before a Kindy hint shows itself (section 11) |
| `recentDays` | 7 | 3 | 14 | Finished days the done-for-today screen can show (section 9) |

## 15. Invariants

Checked on every build (`npm test`):

- The same puzzle and commands give the same game, hash for hash, in Node and
  in Chromium (300 scripted games, S5).
- Every generated day passes the clue checker and the solver, and its witness
  wins with nobody hungry when played through the real game (section 10).
- A kid never arrives on an occupied square (section 7a).
- Every picker sends exactly one snack, each snack ends exactly one way, and a
  kid takes at most one snack (property tests).
- The View never holds what a main-mode kid wants, except the lunchbox a
  hint the player asked for shows (section 8b, step 2).
- The same day with the same purchases, refunds included, plays the same,
  wave for wave and hash for hash; a day's shop catalogue is fixed by its
  seed and sells every friend the solution buys (K9).
- Every main-mode tray keeps a friend the solution never places, and no
  wave's solution places every friend owned; every bonus wave is planted to
  the ramp (K11).
- A main-mode day played by pressing Hint until it says Go, then Go, wins
  with nobody hungry (K11).
- A save reloads to the same hash; a damaged save is refused.
- Profiles are kept apart: one child's game, retries and finished days never
  change another's. A pre-profile save folds into the first profile with the
  same game and finished days. A damaged profile book is kept aside and
  never crashes the app (K7).

## 16. Sound, haptics and real phones (K12)

Nothing here changes how a wave resolves or what a number is: it is what the
phone does around the game.
- **Sounds.** 13 cues, all synthesized, in one scale: tap, buy, throw,
  catch/pass, fed, happy dance, tummy ache, Nurse heal, goes home hungry, wave
  win, day win, try again (a lost wave) and sticker reveal. During a replay
  each plays at the moment it happens: a throw at the lunchbox, a catch at
  every friend that takes a snack and passes it on, the chime and the dance
  when a kid is fed, the wobble for a tummy ache (and for a Kindy snack that
  bounces off), sparkles when the Nurse heals, a sigh when a kid goes home
  hungry. Many of one kind at once are one sound. When the replay ends: the
  wave win (no kid sent home that wave), the day win, or try again. A wave
  that sent a kid home hungry has already sighed and gets no fanfare.
- **Volume.** Gentle by default (the loudest cue peaks near -14 dBFS); no
  volume control of its own, just the phone's. On iOS the phone's silent
  switch silences the game.
- **Mute.** On for every child; a grown-up turns it off for one child in the
  grown-ups' menu ("Change", then "Sound"). It is kept on the phone with the
  profile's id. The picker plays nothing.
- **Haptics.** Where the phone can vibrate (Android): a short buzz when a
  snack is caught and when a wave ends. iOS has none, and nothing happens.
- **Back.** On Android, Back closes the open sheet, clue card, shop, picker or
  result card before it leaves the game.
- **Updates.** A new version waits quietly and is offered (never forced) on
  the result card between waves, the done screen, the menu and the picker.
- **Turned on its side.** A picture asks for the phone upright; the game waits.
- **Saves** are kept in the browser's persistent storage where it will grant
  it. A website's storage can be cleared by a phone that is very low on
  space, or by Safari after a week unused; an app added to the Home Screen is
  not treated that way.
