# Nations

A game you play on your phone. You run one real nation in a world set in 2030,
alongside about a dozen nations run by the computer. Trade, shared crises and
keeping your word get you further than conquest. You check in for a couple of
minutes, make a few decisions, and the world carries on while you are away.

Right now the repo holds the **skeleton only**: no game yet. This document tells
you how to run what exists and how to get it onto a phone.

## What is in here

| Folder | What it is |
| --- | --- |
| `apps/web` | The app you actually see, and the code that makes it installable on a phone. |
| `packages/sim` | The simulation: the rules of the world. Deliberately knows nothing about screens or the internet. |
| `packages/ai` | The computer-run nations' decision making. |
| `packages/contracts` | The shared vocabulary (what a "command", a "nation", a "save file" is). |
| `packages/harness` | A robot that plays hundreds of games with no screen, to check the game is balanced. |
| `docs/` | The plan (`ROADMAP.md`), the reasoning (`DECISIONS.md`), the running log (`PROGRESS.md`), known shortcuts (`GAPS.md`). |
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

## Opening it on your phone

The app is a **PWA**: a web page that can be installed like an app, with an icon
on your home screen, and that keeps working without a signal.

1. Your phone and your computer must be on the same Wi-Fi.
2. On the computer, run:

   ```bash
   npm run dev -- --host
   ```

3. It prints two addresses. Take the one that is **not** `localhost` - it looks
   like `http://192.168.1.42:5173/`. Type that into your phone's browser.
4. Install it:
   - **iPhone (Safari):** the Share button, then *Add to Home Screen*.
   - **Android (Chrome):** the ⋮ menu, then *Install app* or *Add to Home screen*.
5. Open it from the home-screen icon. Turning Wi-Fi off and reopening it should
   still show the app - that is the offline part working.

The computer has to be running `npm run dev -- --host` for this. A version you can
open from anywhere, without your computer, comes later (it needs hosting, which is
a Phase 5 decision in `docs/ROADMAP.md`).

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
