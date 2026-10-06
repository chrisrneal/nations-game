# Warehouse Idle

A game you play on your phone. You run a warehouse: customer orders come in,
your pickers take each item off the shelves, packed orders are loaded onto
trucks at your docks, and every truck pays when it leaves. Purchase orders
(POs) arrive at the receiving dock and keep the shelves stocked; if the
shelves run empty, picking stops. A dashboard at the top shows orders shipped,
orders a minute, the backlog and how full the shelves are. Spend the cash on
more docks, bigger trucks, faster loading, more sales, more pickers, a bigger
receiving bay, better contracts and a quicker yard crew; each upgrade fixes one
bottleneck and the screen tells you which one you have. Close the app and the
warehouse keeps earning (up to a cap the night shift raises); open it again
for a three-line recap. When the warehouse is worth it, sell it for **stars**
that raise every order's pay forever and start again at a new site with a
twist: a narrow yard, a crossdock, sale seasons.

It works offline, installs like an app, and needs no account or server.

This repository held two other games before: an airport idle game until
6 October 2026 (`git checkout 5f78bce`, decision record W1 in
`docs/DECISIONS.md`) and "Nations" until October 2026 (`git checkout 67d1d92`,
decision record P1).

## What is in here

| Folder | What it is |
| --- | --- |
| `apps/web` | The app you actually see, and the code that makes it installable on a phone. |
| `packages/sim` | The game rules as code: orders, stock, docks, trucks, upgrades, sites. Deliberately knows nothing about screens, clocks or the internet, so it gives the same result everywhere. |
| `packages/contracts` | The shared vocabulary (what a "command", a "view", a "save file" is). |
| `packages/harness` | Robots that play the game with no screen, to check the pacing and that it runs the same in every browser. |
| `docs/` | The plan (`ROADMAP.md`), the reasoning (`DECISIONS.md`), the game rules with every number (`RULES.md`), the running log (`PROGRESS.md`), known shortcuts (`GAPS.md`), and the latest pacing report (`balance/`). |
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
npm run harness               # the pacing report: when each milestone arrives
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
   should start as normal, and your warehouse continues from its autosave, with a
   recap of what it earned while you were away.

Saves live on the phone. To move a warehouse to another device, open the gear
(top right), *Save to a file*, and *Load from a file* on the other one.

Preview addresses that Vercel posts on each pull request work for a quick look,
but install from the production address so the app updates itself after each merge.

For a quick look on a phone on the same Wi-Fi without deploying, run
`npm run dev -- --host` and open the network address it prints (it will not work
offline or install from there).

## How to play

- **The dashboard** (under your cash): orders shipped from this warehouse,
  orders a minute, the backlog, and how full the shelves are. The tile that is
  holding you back turns orange.
- **Receiving** (the top lane): the PO at the dock ("PO #12 · 30/48" units put
  away), purple dots carrying stock through quality check onto the shelves,
  and the shelves bar. **Tap it** to send extra hands for a moment. Buy a
  bigger **Receiving bay** when the shelves keep running empty.
- **Picking** (the maze in the middle): each blue dot is an order. New ones
  come in at the order desk and wait in the maze: that line is the real
  backlog. The pickers at its end take orders through as fast as they can pick
  (each takes one unit off the shelves). A growing maze means picking is
  falling behind: buy **More pickers**, or **tap the maze** for extra pickers
  for a moment. Orange dots fading at the door are customers who cancelled
  because the backlog was too long.
- **Packing**: picked orders, as boxes, waiting for a truck. A full bench
  means the docks are the bottleneck; an empty one means you need more orders.
- **Docks**: each bay has a truck seen from above, filling box by box. **Tap a
  dock** to rush it: faster loading, counter orders even when packing is
  empty, a quicker truck swap. Playing actively earns about two and a half
  times what idling does. You never have to.
- **A full truck** earns a 25% bonus. A truck too big for your orders leaves
  on its timer without it. Gold trucks are express: double pay.
- **Boosts** (the three buttons above Upgrades): free, a minute long, then they
  recharge. Flash sale brings 3x orders (ready from the start), All hands
  rushes every dock, picking and receiving for you (opens at 3 docks), Peak
  rates doubles pay (opens with the Web shop contract). The one that fixes your
  bottleneck glows. They keep running while the app is closed, so use one on
  your way out.
- **Upgrades** (the big button at the bottom): the line above it names the
  bottleneck, and the sheet marks the upgrades that fix it.
- **Sell** appears once the warehouse is worth a star (about half an hour of
  active play for the first sale worth making).
- **Settings** (the gear): lifetime numbers, sound (off at first), vibration,
  save files, start over, and a testing time skip (+5 min, +1 hour, +8 hours)
  that runs the warehouse ahead at once.

## A few words you will see

- **PR (pull request):** a proposed set of changes, reviewed and tested before it
  becomes part of the project.
- **CI:** the robot that runs `npm test` and `npm run check` on every PR. Red means
  do not merge.
- **lane:** the folder a given work session is allowed to edit, so sessions running
  at the same time do not collide. Lanes are listed in `CLAUDE.md`.
- **tick:** one step of game time: a quarter of a second.
- **tunable:** a number in the rules (a cost, a speed, a bonus) kept in one file
  with the range it may be tuned within.

## Where the rules live

`CLAUDE.md` is read by every AI session before it writes anything, and
`docs/DECISIONS.md` records why each choice was made. If you want to change the
direction of the project, those two files are the place - not the code.
