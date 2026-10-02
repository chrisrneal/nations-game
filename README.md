# Airport Idle

A game you play on your phone. You run an airport: passengers arrive in the
terminal, board the planes at your gates, and every plane pays its fares when it
leaves. Tap a gate to rush it. Spend the cash on more gates, bigger planes,
faster boarding, a bigger terminal, better routes and a quicker ground crew;
each upgrade fixes one bottleneck and the screen tells you which one you have.
Close the app and the airport keeps earning (up to a cap the night shift
raises); open it again for a three-line recap. When the airport is worth it,
sell it for **slots** that raise every fare forever and start again in a new
city with a twist: a short runway, a hub, holiday waves.

It works offline, installs like an app, and needs no account or server.

Until October 2026 this repository held a different game, "Nations". It is
still there at commit `67d1d92` (`git checkout 67d1d92`); decision record P1 in
`docs/DECISIONS.md` explains the switch.

## What is in here

| Folder | What it is |
| --- | --- |
| `apps/web` | The app you actually see, and the code that makes it installable on a phone. |
| `packages/sim` | The game rules as code: gates, planes, passengers, upgrades, cities. Deliberately knows nothing about screens, clocks or the internet, so it gives the same result everywhere. |
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
   should start as normal, and your airport continues from its autosave, with a
   recap of what it earned while you were away.

Saves live on the phone. To move an airport to another device, open the gear
(top right), *Save to a file*, and *Load from a file* on the other one.

Preview addresses that Vercel posts on each pull request work for a quick look,
but install from the production address so the app updates itself after each merge.

For a quick look on a phone on the same Wi-Fi without deploying, run
`npm run dev -- --host` and open the network address it prints (it will not work
offline or install from there).

## How to play

- **Tap a gate** to rush it for a moment: faster boarding, walk-up passengers
  even when the terminal is empty, a faster turnaround. Playing actively earns
  about two and a half times what idling does. You never have to.
- **The passenger flow** (above the gates): each dot is a passenger. Departing
  ones come in at the left, queue through check-in and security (plus passport
  control and preclearance on international routes), sit in the lounge and walk
  down between the gates to board. Arriving ones step off each landed plane and
  walk out through baggage claim (and passport control and customs) to the exit.
  A crowded lounge means the gates are the bottleneck; an empty one means you
  need more passengers. Orange dots turning back at the door: the lounge is full.
- **Boosts** (the three buttons above Upgrades): free, a minute long, then they
  recharge. Rush hour brings 3x passengers (ready from the start), All hands
  rushes every gate for you (opens at 3 gates), Fare surge doubles fares (opens
  with the Regional route). The one that fixes your bottleneck glows. They keep
  running while the app is closed, so use one on your way out.
- **Upgrades** (the big button at the bottom): the line above it names the
  bottleneck, and the sheet marks the upgrades that fix it.
- **A full plane** earns a 25% bonus. A plane too big for your passengers leaves
  on its timer without it.
- **Sell** appears once the airport is worth a slot (about half an hour of
  active play for the first sale worth making).
- **Settings** (the gear): sound (off at first), vibration, save files, start over.

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
