# Nations

A game you play on your phone. You run one real nation in a world set in 2030,
alongside sixteen other nations run by the computer. Trade, shared crises and
keeping your word get you further than conquest. You check in for a couple of
minutes, make a few decisions, and the world carries on while you are away.

Right now it has trade, shared crises, and **joint projects**: nations with a
surplus host solar belts, hydrogen corridors, grain corridors and early-warning
networks, partners pay in and share what they make, and walking out costs trust.
Routine imports run on a standing policy, so the inbox holds real decisions. The
home screen shows your rank and the **World Accord**, the shared threshold the
world must reach by 2035: you win when the world makes it and you rank high.
Computer-run nations found and join projects and explain every decision; a live
clock keeps running while the app is closed. `docs/100X.md` is the current plan;
`docs/PROGRESS.md` says what is left.
This document tells you how to run it and get it onto a phone.

## What is in here

| Folder | What it is |
| --- | --- |
| `apps/web` | The app you actually see, and the code that makes it installable on a phone. |
| `packages/sim` | The simulation: the rules of the world. Deliberately knows nothing about screens or the internet. |
| `packages/ai` | The computer-run nations' decision making. |
| `packages/contracts` | The shared vocabulary (what a "command", a "nation", a "save file" is). |
| `packages/harness` | A robot that plays hundreds of games with no screen, to check the game is balanced. |
| `docs/` | The plan (`ROADMAP.md`), the reasoning (`DECISIONS.md`), the game rules (`RULES.md`), how the computer nations think (`AI_DESIGN.md`), the running log (`PROGRESS.md`), known shortcuts (`GAPS.md`). |
| `data/` | The real-world 2030 numbers the game starts from. |
| `CLAUDE.md` | The rules every AI session must follow when building this. |

## Running it on your computer

You need [Node.js](https://nodejs.org) version 22 or newer, installed once.
Then, in a terminal, in this folder:

```bash
npm install     # once, and again whenever you are told dependencies changed
npm run dev     # starts the app, prints a http://localhost:5173 address
```

Open that address in a browser. Press `Ctrl+C` in the terminal to stop it.

Two other commands, useful if something looks broken:

```bash
npm test        # runs the automatic checks; should end in "passed"
npm run check   # checks the code follows the project's rules
```

## Installing it on your phone

The app is a **PWA**: a web page that installs like an app, with an icon on your
home screen, and keeps working with no signal. Every merge to `main` is deployed
by Vercel, and that address is the one to install from (offline mode needs the
secure `https://` address Vercel gives you).

1. Find the address: in Vercel, open the **nations-game** project; the
   **Domains** box on its overview page shows the production address, something
   like `https://nations-game.vercel.app`.
2. Open it on the phone, with a signal:
   - **iPhone:** in **Safari** (not Chrome), tap Share, then *Add to Home Screen*.
   - **Android:** in **Chrome**, tap ⋮, then *Install app* (or *Add to Home screen*).
3. Open it once from the new home-screen icon while online, so it can store itself.
4. Turn on airplane mode, close it from the app switcher, and open it again. It
   should start as normal, and your game continues from its autosave.

Preview addresses that Vercel posts on each pull request work for a quick look,
but install from the production address so the app updates itself after each merge.

To try it on a computer instead: `npm run dev`, then open `http://localhost:5173`.
For a quick look on a phone on the same Wi-Fi without deploying, run
`npm run dev -- --host` and open the network address it prints (it will not work
offline or install from there).

## A few words you will see

- **PR (pull request):** a proposed set of changes, reviewed and tested before it
  becomes part of the project.
- **CI:** the robot that runs `npm test` and `npm run check` on every PR. Red means
  do not merge.
- **lane:** the folder a given work session is allowed to edit, so sessions running
  at the same time do not collide. Lanes are listed in `CLAUDE.md`.
- **tick:** one step of game time.
- **gate:** a checklist a phase must pass before the next phase starts. The
  checklists are in `docs/ROADMAP.md`; results go in `docs/gates/`.

## Where the rules live

`CLAUDE.md` is read by every AI session before it writes anything, and
`docs/DECISIONS.md` records why each choice was made. If you want to change the
direction of the project, those two files are the place - not the code.
