# Roadmap

## The game
Snack Attack (decision record K1): a cute daily puzzle with chess-like moves,
for two kids sharing one phone.
- **The board.** Hungry kids stand on the school path. Snacks start in
  lunchboxes. The player places friends on the playground, and each friend
  throws or passes a snack in a fixed chess pattern: Straight (rook), Diagonal
  (bishop), Short (king) or Bouncer (knight). A Nurse heals tummy aches.
- **Main mode** (a 9-year-old): each kid wants one snack, worked out from a
  clue card.
- **Kindy mode** (a 4-year-old who doesn't read yet): the snack is pictured.
- **A wave.** Set up, press Go, watch it play out.
- **A day.** 10 waves that get harder, a bonus round, points to spend in a
  shop for that day only, and up to 3 kids allowed to go home hungry.
- **Daily and practice.** One daily puzzle per day, the same for everyone,
  plus unlimited practice boards. Every board is proved solvable by a solver
  before anyone sees it.
- Single player, offline-first, no backend. Rules: docs/RULES.md.

## Design pillars
1. **Two things kept apart.** What a snack is comes from its lunchbox; how it
   moves comes from the friend carrying it (RULES 2).
2. **Deduction plus routing.** Work out which snack each kid wants, then find
   a way to get it there.
3. **Watch it happen.** Waves are watch-only; the fun during a wave is the
   snacks flying, not tapping.
4. **Never unfair.** No randomness in a wave, and no unsolvable board, ever.
5. **For small hands too.** Kindy mode has pictures, no text, no failing and
   big squares.

## Architecture (kept from the earlier games, decision record K1)
1. Pure sim core: `step(state, command) -> state, error, wave` (S1, K3).
2. Commands are the only mutation: place, turn, toTray, buy, go, retry (S2).
3. Host interface: the UI submits and subscribes; LocalHost runs the sim in a
   Web Worker (S3).
4. No clock: a wave is resolved whole at Go and replayed as animation; the
   host passes in the day number (K3).
5. Determinism: seeded RNG, whole numbers, the state-hash test in Node and
   Chromium on every build (S5).
6. The UI reads a View, which never says what a main-mode kid wants (S6).
7. Saves are snapshot plus command log, versioned with migrations, in
   IndexedDB: one slot for each day's daily, each bonus round, and practice,
   for each profile; beside them a versioned profile book with every
   profile's finished days, from which the streak is worked out (S9, K7).
8. The solver and the generator are part of the pure sim (K5).

Stack: TypeScript, Vite + React, a Web Worker via Comlink, IndexedDB,
vite-plugin-pwa, Vitest + fast-check, and playwright-core for the phone check.

## Phone UX budget (checked by apps/web/e2e/phone-check.ts)
- Portrait and one-handed. Nothing scrolls during setup (K6): the bar and the
  kids' cards on top, the board sized to fit in the middle, and the selected
  friend's controls, the tray, Undo, Clear board and Go in the bottom third,
  all inside 360 x 740.
- Touch targets of at least 44 px (64 px in Kindy). No horizontal scroll at
  360 px. Safe areas respected.
- Kindy (K8): the board as wide as the phone, no text on the page anywhere
  in the child's flow, and a whole Kindy day played by taps on what the hint
  points at.
- The wave replay at 60 fps with the CPU slowed 4x. A day's puzzle generated
  in under a second with the CPU slowed 4x.

## The harness
- `npm test` generates and checks 1000 main dailies, 300 bonus rounds and 300
  Kindy dailies. Each must pass the clue checker and the solver, and its
  solution must win with nobody hungry. A Kindy day must also never get
  stuck, whichever kids are left waiting (K8).
- `npm test` also hashes 300 scripted games in Node and Chromium.
- `npm run harness -- report` prints difficulty by wave, seeds skipped and
  time per day (docs/balance/generator-report.md).

## Build order (K1)
The engine and the solver come first. No art, shop screen or Kindy mode
until both work on hand-made test boards.
0. [x] Reset: K1-K5, this roadmap, the rules, the warehouse removed, packages renamed `@snacks/*`.
1. [x] Contracts: board, friends, facings, snacks, kids, clues, commands, the wave result.
2. [x] Resolution engine, tests first: hand-made boards for every rule, and property tests.
3. [x] Placement solver: one wave, then a whole day with points and the shop.
4. [x] Clue checker and clue writer.
5. [x] Generator: plant, check, a difficulty ramp, the bonus salt, and the 1000-day harness check.
6. [x] A plain playable screen (grey squares, chess symbols, emoji snacks).
   **Gate:** the owner and the 9-year-old play it and say whether it's fun, or what to change.
   - [x] Controls pass for phones (K6): tap-to-aim, drag to place and move, a
     named tray, clues on the board, the result over the board, Undo and
     Clear board, one screen with no scrolling.
7. [x] Daily, practice, profiles (avatar picker), saves per profile, the streak (K7):
   the picker, the grown-ups' menu (press and hold), done for today with a
   countdown, the streak in the top bar, and the old single save folded
   into a first profile.
8. [ ] Art and wave animation.
9. [ ] Shop screen.
10. [x] Kindy mode on screen (K8): the 4x4 board, pictures only, tap a friend
    then a square, four big aim squares, a green play button, hints from the
    stored solution (a pointing hand and the phone's voice), the party, a
    picture-only done for today; Kindy days that can never get stuck.
11. [ ] Sticker book, cosmetics and streak rewards.
12. [ ] Phone check and polish on real phones.

## History
- **Nations** (to 2026-09-30): commit `67d1d92`.
- **Airport Idle** (2026-10-01 to 2026-10-05): commit `5f78bce`.
- **Warehouse Idle** (2026-10-06), then **the WMS** (2026-10-07), then **the WMS
  simulator** (2026-10-07 to 2026-10-08, W8-W11): commit `734c848`.
- **Snack Attack** (from 2026-10-20): K1.
