# Snack Attack

A cute daily puzzle for kids, played on a phone. Hungry kids stand on the
school path, and snacks start in lunchboxes. You place **friends** on the
playground, and each friend throws snacks the way a chess piece moves:
Straight (like a rook), Diagonal (a bishop), Short (a king), Bouncer (a
knight), plus a Nurse who heals tummy aches. Each kid wants one snack. In main
mode you work out which from their clue card ("Something crunchy", "Same as
the kid in the hat"). In Kindy mode, for children who don't read yet, it is
pictured. Set up, press Go, and watch the snacks fly. A day is 10 waves that
get harder. There is one new daily puzzle a day, the same for everyone, plus
practice boards, and every board is proved solvable before you see it.

It works offline, installs like an app, and needs no account or server.

This is an early, plain version (grey squares, no art yet), so the game can
be play-tested before it is drawn.

This repository held other games before: a warehouse simulator until
20 October 2026 (`git checkout 734c848`, decision record K1 in
`docs/DECISIONS.md`), an airport idle game until 6 October 2026
(`git checkout 5f78bce`) and "Nations" until October 2026
(`git checkout 67d1d92`).

## What is in here

| Folder | What it is |
| --- | --- |
| `apps/web` | The app you actually see, and the code that makes it installable on a phone. |
| `packages/sim` | The game rules as code: where every snack goes, the solver that proves a board can be won, the clue checker, and the puzzle generator. Deliberately knows nothing about screens, clocks or the internet, so it gives the same result everywhere. |
| `packages/contracts` | The shared vocabulary (what a "command", a "view", a "save file" is). |
| `packages/harness` | Generates and checks thousands of puzzles with no screen, and checks the game runs the same in every browser. |
| `docs/` | The plan (`ROADMAP.md`), the reasoning (`DECISIONS.md`), the game rules with every number (`RULES.md`), the running log (`PROGRESS.md`), known shortcuts (`GAPS.md`), and the latest generator report (`balance/generator-report.md`). |
| `CLAUDE.md` | The rules every AI session must follow when building this. |

## Running it on your computer

You need [Node.js](https://nodejs.org) version 22 or newer, installed once.
Then, in a terminal, in this folder:

```bash
npm install     # once, and again whenever you are told dependencies changed
npm run dev     # starts the app, prints a http://localhost:5173 address
```

Open that address in a browser. Press `Ctrl+C` in the terminal to stop it.

Other commands, useful if something looks broken or you want to see the numbers:

```bash
npm test                      # runs the automatic checks; should end in "passed"
npm run check                 # checks the code follows the project's rules
npm run harness               # the generator report: 1000 days of puzzles, checked
npm run build && npm run e2e --workspace web   # the phone check in a headless browser
```

## Installing it on your phone

The app is a **PWA**: a web page that installs like an app, with an icon on your
home screen, and keeps working with no signal. Every merge to `main` is deployed
by Vercel, and that address is the one to install from (offline mode needs the
secure `https://` address Vercel gives you).

1. Find the address: in Vercel, open the **nations-game** project (the
   repository kept its name); the **Domains** box on its overview page shows the
   production address, something like `https://nations-game.vercel.app`.
2. Open it on the phone, with a signal:
   - **iPhone:** in **Safari** (not Chrome), tap Share, then *Add to Home Screen*.
   - **Android:** in **Chrome**, tap ⋮, then *Install app* (or *Add to Home screen*).
3. Open it once from the new home-screen icon while online, so it can store itself.
4. Turn on airplane mode, close it from the app switcher, and open it again. It
   should start as normal and continue where you left off.

Saves live on the phone.

Preview addresses that Vercel posts on each pull request work for a quick look,
but install from the production address so the app updates itself after each merge.

For a quick look on a phone on the same Wi-Fi without deploying, run
`npm run dev -- --host` and open the network address it prints (it will not work
offline or install from there).

## How to play

- **Read the kids' cards** under the board (or tap a kid). Each card points at
  one of today's snacks: the list under it gives each snack's colour, feel,
  taste and shape. Sisters wear the same colour.
- **Pick a friend** from the tray at the bottom, then **tap a grey square**.
  Tap a placed friend to select it, turn it with ↺ ↻, tap another grey square
  to move it, or send it back to the tray. The square its throw will reach
  lights up green.
- A friend **right next to a lunchbox** (sharing a side) picks up that snack
  and throws it. A friend in the way catches it and throws it on, its own
  way. A kid in the way takes it. Trees, tables and the edge stop it.
- **Press Go** and watch. The first snack to reach a kid counts: the right one
  feeds them, the wrong one gives a tummy ache (a Nurse next to them helps,
  once).
- Fed kids earn ⭐ points to spend in the **Shop** between waves, for today
  only. If more than 3 kids go home hungry, try that wave again.
- **The menu** (☰): today's puzzle, a new practice board, how to play, sound.

## A few words you will see

- **PR (pull request):** a proposed set of changes, reviewed and tested before it
  becomes part of the project.
- **CI:** the robot that runs `npm test` and `npm run check` on every PR. Red means
  do not merge.
- **lane:** the folder a given work session is allowed to edit, so sessions running
  at the same time do not collide. Lanes are listed in `CLAUDE.md`.
- **solver:** the code that proves a puzzle can be won before anyone sees it.
- **tunable:** a number in the rules (a price, a board size, a limit) kept in one
  file with the range it may be tuned within.

## Where the rules live

`CLAUDE.md` is read by every AI session before it writes anything, and
`docs/DECISIONS.md` records why each choice was made. If you want to change the
direction of the project, those two files are the place - not the code.
