# Roadmap

## The game
Mobile-first installable PWA idle game. You run a warehouse: customer orders
come in and queue in a backlog, pickers take each one's unit off the shelves,
packed orders are loaded onto trucks at your docks, and each truck pays when
it leaves full or on its timer. Purchase orders arrive at the receiving dock
and keep the shelves stocked. The backlog is the centre of the screen, and a
dashboard row shows shipped, orders a minute, backlog and stock. Cash buys
upgrades, each a trade-off that moves the bottleneck. The warehouse keeps
running while the app is closed, up to a cap. Sell the warehouse for stars
that permanently boost the next one, at a new site with a twist. Single
player, offline-first, no backend. Rules: docs/RULES.md. Why it replaced the
airport game: decision record W1 (and P1 for Nations before that).

## Design pillars
1. **Idle is complete, active is faster.** Tapping a dock, picking or
   receiving rushes it; active play earns about 2-3x idling and is never
   required.
2. **Every upgrade is a trade-off.** Each fixes one bottleneck and moves the
   pressure; the screen names the bottleneck so the choice is legible.
3. **Every session is worth it.** A 30-second check-in collects and buys
   something; a 5-minute session plans the next unlock.
4. **Steady novelty.** Something new to aim for at least every 5 minutes; the
   first sale at 30-60 minutes; each site changes the best strategy.
5. **Exact and offline.** Same seed and commands give the same warehouse;
   catching up offline equals stepping through it.

## Architecture (kept from Nations and the airport, decision records P1 and W1)
1. Pure sim core: `step(state, commands) -> state + events` (S1, D6).
2. Commands are the only mutation: `tap`, `tapPick`, `tapReceive`, `buy`,
   `boost`, `sell` (S2, P5).
3. Host interface: the UI submits and subscribes; LocalHost runs the sim in a Web
   Worker (S3).
4. The host owns the clock; catch-up and offline earnings are "run N ticks fast"
   (S4, P4).
5. Determinism: seeded RNG in State, integer maths (cents, milli-units),
   state-hash test in Node and Chromium on every build (S5, P3).
6. The UI reads a View (S6, P5).
7. Saves are snapshot plus command log, versioned with migrations, in IndexedDB,
   with export and import files (S9).
Stack: TypeScript, Vite + React, Web Worker via Comlink, IndexedDB,
vite-plugin-pwa, Vitest + fast-check, playwright-core for the phone check.

## Phone UX budget (checked by apps/web/e2e/phone-check.ts)
Portrait and one-handed; primary actions in the bottom third; touch targets at
least 44 px; no horizontal scroll at 360 px; safe areas respected. The main
screen is the warehouse: cash, income per second and the dashboard at the top,
the floor (receiving, the picking backlog, packing) and the docks with trucks
filling in the middle, boosts and upgrades in the thumb zone. 60 fps with the
CPU slowed 4x: animation by canvas, CSS and direct DOM writes, not React
re-renders (P7). Number formatting for big values. Satisfying feedback: loads
filling, departures, cash pops.

## Balance harness
`npm run harness -- pacing` runs a greedy bot (taps, buys the best value) and an
idle bot (never taps, checks in every 15 minutes) and reports the time to each
milestone against the targets in RULES 11. Invariants every build: cash,
orders and stock never negative, determinism across engines, catch-up equals
stepping, save-reload-continue.

## History
- **Nations** (to 2026-09-30): commit `67d1d92`.
- **Airport Idle** (2026-10-01 to 2026-10-05): eight pivot slices (PRs
  #41-#48), then boosts (P11), the security line (P12) and the gates as stands.
  Commit `5f78bce`.
- **Warehouse Idle** (2026-10-06): the airport's engine and rules renamed, plus
  stock and purchase orders and the dashboard (W1), in one pull request (W2).

## Next (not planned until the owner picks)
- Play it on a real phone and say what feels slow or confusing (docs/GAPS.md
  lists what only a person can check).
- Ideas that fit the warehouse: worker characters you hire by name, order
  types that need different stock, a weekly sales event. Each needs a decision
  record.

## Later (not planned)
Achievements, more sites, cloud save. Any of these needs a decision record.
