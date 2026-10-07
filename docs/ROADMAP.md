# Roadmap

## The game
Mobile-first installable PWA warehouse simulator (W8): the player runs a
warehouse through its warehouse management system. Customer orders arrive
from countries abroad; the WMS releases them, allocates stock and creates a
pick task for every line. Purchase orders, which the WMS raises itself when
stock runs low, are booked into dock appointments in the warehouse day; a
docked truck becomes receive tasks, and every line counted in a put-away
task. Picked orders are packed and staged at one of several outbound doors,
loaded onto its trailer, and ship when the trailer leaves on its schedule
(W10). The crew (pickers, and the dock crew who receive, put away and load)
do the tasks the WMS lines up for them, and a tap on any worker shows their
tasks and record. Every shipment pays, more for countries whose goodwill is
high. The player sets the WMS's plan (pick order, release and wave interval,
crew split, labour by need), moves people between picking and the dock,
steps in on orders, and spends what shipments earn on more people, inbound
dock doors and outbound doors. The warehouse keeps running
while the app is closed, up to a cap. Single player, offline-first, no
backend. Rules: docs/RULES.md. Why the idle game was removed: decision record
W8 (and W1, P1 before it).

## Design pillars
1. **The floor is the truth.** Everything on screen is what the sim does: the
   workers on the floor are the WMS's workers doing their tasks, timed as the
   sim times them, and every number traces back to an order, a PO or a task.
2. **Every decision is a trade-off.** Each plan choice, hire or door helps one
   thing and costs another; the screen says what each does and its catch.
3. **Every session is worth it.** A 30-second check-in reads the day's numbers
   and the recap; a 5-minute session changes the plan and watches it play out.
4. **Read like a real WMS.** Dense grids, codes, a console of events, KPIs per
   page, a dock schedule: an operator would recognise it.
5. **Exact and offline.** Same seed and commands give the same warehouse;
   catching up offline equals stepping through it.

## Architecture (kept from Nations, the airport and the idle warehouse, decision records P1, W1 and W8)
1. Pure sim core: `step(state, commands) -> state + events` (S1, D6).
2. Commands are the only mutation: `wms` actions (release, priority, hold,
   unhold, assign, cancelLine, expedite, policy, role, hire, door in or out)
   (S2, P5, W8, W9, W10).
3. Host interface: the UI submits and subscribes; LocalHost runs the sim in a Web
   Worker (S3).
4. The host owns the clock; catch-up is "run N ticks fast", up to the offline
   cap (S4, P4). The host's speed (pause, 1x, 5x by default, 10x warehouse
   minutes a second) sets how much wall time a tick takes (W9).
5. Determinism: seeded RNG in State, integer maths (cents, whole units, ticks),
   state-hash test in Node and Chromium on every build (S5, P3).
6. The UI reads a View (S6, P5).
7. Saves are snapshot plus command log, versioned with migrations, in IndexedDB,
   with export and import files (S9).
Stack: TypeScript, Vite + React, Web Worker via Comlink, IndexedDB,
vite-plugin-pwa, Vitest + fast-check, playwright-core for the phone check.

## Phone UX budget (checked by apps/web/e2e/phone-check.ts)
Portrait and one-handed; primary actions in the bottom third; touch targets at
least 44 px; no horizontal scroll at 360 px; safe areas respected. The screen
is the WMS (W8): the warehouse clock, cash and today's earnings at the top, a
KPI strip, the page in the middle (Floor, In, Out, Stock, Crew, Plan) with
the activity console under it, and the page tabs in the thumb zone. 60 fps
with the CPU slowed 4x: the floor by canvas, everything else by direct DOM
writes or one React render a WMS step (P7). Number formatting for big values.

## The harness
`npm run harness -- report` runs an untouched warehouse with the default plan
on several seeds and reports OTIF, fill, money an hour and how busy the
pickers and the dock crew are, against the targets in RULES 11. Invariants every
build: cash and stock never negative, every task held by at most one worker
of its role, determinism across engines, catch-up equals stepping,
save-reload-continue.

## History
- **Nations** (to 2026-09-30): commit `67d1d92`.
- **Airport Idle** (2026-10-01 to 2026-10-05): eight pivot slices (PRs
  #41-#48), then boosts (P11), the security line (P12) and the gates as stands.
  Commit `5f78bce`.
- **Warehouse Idle** (2026-10-06): the airport's engine and rules renamed, plus
  stock and purchase orders and the dashboard (W1), in one pull request (W2).
- **The WMS** (2026-10-07): a warehouse management system beside the idle flow
  (W5), with inbound and inventory (W6); then the WMS became home, its floor
  animated from the WMS, with a plan the player sets (W7). Commit `b34368a`
  is the last with the idle game.
- **The WMS simulator** (2026-10-07): the idle game removed; tasks for every
  worker, a Crew page, dock appointments in a warehouse day, hiring and doors
  (W8); then 5 warehouse minutes a second with pause and 1x/10x, the wave
  interval, and moving people by need, by hand or by the balance plan (W9);
  then outbound doors with scheduled trailers, three times the orders, a
  dock crew that loads, and a crew of 20 growing to 40 (W10).

## Next (not planned until the owner picks)
- Play it on a real phone and say what feels slow or confusing (docs/GAPS.md
  lists what only a person can check).
- Ideas that fit the simulator: demand that grows with goodwill (more
  customers as service improves; since W10 the one thing that would make a
  fourth outbound door or a 30th worker pay for itself), automation to buy (conveyors, a sorter,
  pick-to-light that changes the task times), shifts and breaks for the crew,
  dock hours that close receiving at night, workers' skills. Each needs a
  decision record.

## Later (not planned)
Achievements, more warehouses, cloud save. Any of these needs a decision record.
