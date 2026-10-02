# Roadmap

## The game
Mobile-first installable PWA idle game. You run an airport: passengers arrive in
the terminal, board planes at your gates, and each plane pays its fares when it
leaves full or on its timer. Passengers queue at security on the way in, and
that line is the centre of the screen. Cash buys upgrades, each a trade-off that moves the
bottleneck. The airport keeps running while the app is closed, up to a cap. Sell
the airport for slots that permanently boost the next one, in a new city with a
twist. Single player, offline-first, no backend. Rules: docs/RULES.md. Why it
replaced Nations: decision record P1.

## Design pillars
1. **Idle is complete, active is faster.** Tapping a gate rushes it; active play
   earns about 2-3x idling and is never required.
2. **Every upgrade is a trade-off.** Each fixes one bottleneck and moves the
   pressure; the screen names the bottleneck so the choice is legible.
3. **Every session is worth it.** A 30-second check-in collects and buys
   something; a 5-minute session plans the next unlock.
4. **Steady novelty.** Something new to aim for at least every 5 minutes; the
   first sale at 30-60 minutes; each city changes the best strategy.
5. **Exact and offline.** Same seed and commands give the same airport; catching
   up offline equals stepping through it.

## Architecture (kept from Nations, decision record P1)
1. Pure sim core: `step(state, commands) -> state + events` (S1, D6).
2. Commands are the only mutation: `tap`, `buy`, `sell` (S2, P5).
3. Host interface: the UI submits and subscribes; LocalHost runs the sim in a Web
   Worker (S3).
4. The host owns the clock; catch-up and offline earnings are "run N ticks fast"
   (S4, P4).
5. Determinism: seeded RNG in State, integer maths (cents, milli-passengers),
   state-hash test in Node and Chromium on every build (S5, P3).
6. The UI reads a View (S6, P5).
7. Saves are snapshot plus command log, versioned with migrations, in IndexedDB,
   with export and import files (S9).
Stack: TypeScript, Vite + React, Web Worker via Comlink, IndexedDB,
vite-plugin-pwa, Vitest + fast-check, playwright-core for the phone check.

## Phone UX budget (checked by apps/web/e2e/phone-check.ts)
Portrait and one-handed; primary actions in the bottom third; touch targets at
least 44 px; no horizontal scroll at 360 px; safe areas respected. The main
screen is the airport: gates with planes and live fill bars, cash and income per
second at the top, upgrades in a bottom sheet. 60 fps with the CPU slowed 4x:
animation by CSS and direct DOM writes, not React re-renders (P7). Number
formatting for big values. Satisfying feedback: fill bars, departures, cash pops.

## Balance harness
`npm run harness -- pacing` runs a greedy bot (taps, buys the best value) and an
idle bot (never taps, checks in every 15 minutes) and reports the time to each
milestone against the targets in RULES 11. Invariants every build: cash and
passengers never negative, determinism across engines, catch-up equals
stepping, save-reload-continue.

## Slices (one pull request each, game playable after every merge)
Status: all eight merged on 2026-10-01 (PRs #41-#48); see docs/PROGRESS.md.
1. **Pivot docs.** Decision records, RULES.md with formulas and tunables, this
   roadmap, CLAUDE.md.
2. **Airport sim.** Gates, planes, passengers, boarding, departures, cash,
   upgrades, tests first with property tests (cash never negative, determinism,
   catch-up equals stepping). Built beside the Nations sim (P8).
3. **Airport screen.** The airport and the upgrade sheet on the phone; the Nations
   interface deleted.
4. **Offline earnings** with the cap and the three-line away recap.
5. **Prestige.** Selling for slots, and the cities with their twists.
6. **Pacing pass.** Greedy and idle harness bots; tune to RULES 11.
7. **Juice.** Animations, haptics where supported, sound off by default.
8. **Cleanup.** Remove the remaining Nations code and data, rename the packages,
   update the README.

## Done when
All eight slices are merged with CI green; the phone check passes at 360 px; the
pacing report meets RULES 11; the app installs and plays offline.

## After the pivot
- **Boosts** (P11, owner request, 2026-10-02): three free, timed boosts on
  recharge clocks (RULES 15).
- **The security line** (P12, owner request, 2026-10-02): a real queue with
  its own upgrade and tap, shown as the centre of the screen (RULES 3, 14);
  a testing time skip in Settings.

## Later (not planned)
Achievements, more cities, cloud save. Any of these needs a decision record.
