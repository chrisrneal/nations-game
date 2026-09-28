# Roadmap

## The game
Mobile-first installable PWA. The player runs a real nation in a staged 2030 world, alongside AI-run nations; collaboration beats conquest. The world is modeled on real 2030 projections, like a geopolitical sim. Single-player first, then small async multiplayer (4-8 nations, games of days to weeks).

## Decisions
- D1 Real-time ticks on a wall clock. Single-player can pause, run 1x or 4x, or use a live-clock mode that advances while the app is closed. Multiplayer runs a fixed cadence. Players act through standing policies plus a short queue of decisions.
- D2 Multiplayer: small async games, 4-8 nations, days to weeks.
- D3 Co-opetition: final score = the nation's growth against its own 2030 baseline trajectory x a collective multiplier set by how well the world met shared goals. The baseline is what lets a small nation win. Never a binary "everyone loses" rule, or a trailing nation gains by sabotage.
- D4 Limited war exists: Phase 4, abstracted, never the dominant strategy.
- D5 AI nations use deterministic utility AI. No LLM in decisions.
- D6 The sim core is a pure TypeScript package: Web Worker now, server later.
- D7 MVP = trade + crisis response. Joint projects Phase 3. Treaties, alliances, blocs, limited war Phase 4.
- D8 Depth lives in the simulation, not the interface.
- D9 Real nations in a staged 2030 world: about 15 major nations modeled individually and playable, the rest of the world as regional aggregates in the background. Starting data comes from published 2030 projections in data/world-2030.json, sourced in data/SOURCES.md. AI personalities derive from structural data (trade dependence, energy imports, alliances, exposure), never stereotypes. Starting trust comes from real alliance and trade ties. No real people appear as characters.

## Architecture seams (built in Phase 0)
1. Pure sim core: step(state, commands) -> state + events.
2. Commands are the only mutation; UI and AI send the same validated, tick-stamped commands.
3. Host interface: submit, subscribe, setPace. LocalHost in a Web Worker now; RemoteHost later.
4. The host owns the clock; the sim advances by tick count; catch-up = run N ticks fast.
5. Determinism: seeded RNG in State, integer maths, stable iteration order, state-hash test on every build.
6. Per-nation View for UI and AI; in multiplayer it is the anti-cheat boundary.
7. Controller slot per nation (human, ai, caretaker), switchable mid-game.
8. Proposals, appeals and treaties are State objects with expiry ticks; absent humans answer through standing policies.
9. Saves = snapshot + command log, versioned with migrations; also used for replay, bug repro and the harness.
Deferred to Phase 5: networking, accounts, lobbies, hosting, push.
Stack: TypeScript, Vite + React, Web Worker via Comlink, IndexedDB, vite-plugin-pwa, Vitest + fast-check.

## AI nations (layered utility AI)
Perception (own View only) -> Beliefs (trust ledger, needs, strength, threat; memory decays) -> Personality (cooperativeness; reciprocity strict, forgiving or exploiter; risk; time horizon; priorities) -> Goals (re-scored every N ticks) -> Action scoring (templated commands, tunable noise) -> Negotiation (accept, counter, reject; values shift with trust) -> Explanation (top reasons for every decision, shown to players).
Must be legible but not farmable, stay within a per-tick compute budget (nations staggered), never cheat, and be able to act as caretaker for a human's nation.

## Mobile depth budget (audited at every gate)
Surfaces: decision inbox (home), relationship map, policy dials, away recap, why-sheets (tap a number for a one-sentence breakdown).
Rules: any decision within 3 taps of home; no horizontal scroll; tables max 4 columns; 3-5 resources in one strip; every number actionable or explanatory; one-handed, primary actions in the bottom third; a 2-5 minute check-in is a full session.
Cut: province micro-management, production chains deeper than two steps, manual logistics, ledgers.
Every system is designed as decision cards plus standing policies before code; if it can't be, simplify it.

## Balance harness
Headless Node runner, many seeds, one metrics row per game. Bots: hoarder, isolationist, trade exploiter, free-rider; Phase 4 adds warmonger and betrayer. Invariants every build: conservation except defined sources and sinks, no negative stocks, stable hash.
Metrics: how often each nation tops the score; win rate per archetype; crisis success rate; the same nation trading vs isolating; defection and retaliation; dead states; source and sink balance.
Fair share = 1 / playable nations. Over 200 seeded games: no archetype wins more than 1.5x fair share, with nations assigned to archetypes at random; no single nation tops the score in more than 2x its fair share of games. Every gate reruns earlier suites.

## Gate rules
A phase closes only when every criterion is PASS or waived in writing in docs/gates/GATE-N.md. No new collaboration system before Gate 2 passes. Thresholds are tuned before seeing the results they grade.

## Gates
Gate 0 (Foundations): sim core has no UI, DOM, network or clock imports; 1,000 seeds give identical hashes in browser and Node; dummy AI and UI use the same command API; save-reload-continue matches an uninterrupted run; 1,000 catch-up ticks under 2 s on a mid-range phone; PWA installs and runs offline on iOS and Android; owner completes three sample decisions one-handed; independent review signs off the nine seams.
Gate 1 (Economy and trade): 200 seeded full-roster games with no crashes, no negative stocks, sources and sinks in band; the same nation does 15%+ better against its baseline trading than isolating (paired runs); isolationists worse off but alive; dead states under 2%; no nation tops the score in more than 2x its fair share of games; a trade in 3 taps or fewer; Gate 0 still passes.
Gate 2 (MVP, go/no-go): crisis success 40-75%; no archetype over 1.5x fair share with nations assigned at random; reciprocal cooperators beat free-riders; a trailing nation gains nothing by sabotage; owner predicts AI responses 70%+ after one game; 24 h absence test passes with a recap readable in under a minute; 10 playtests, 3+ by others, most want another game; depth budget and 60 fps hold; Gates 0-1 pass. If it fails on fun, iterate Phase 2.
Gate 3 (Joint projects): no project built in over 50% of games; crisis success stays in band; withdrawal sometimes rational, always costs trust; earlier gates pass.
Gate 4 (Diplomacy, blocs, war): warmonger and betrayer at or under 1.5x fair share; warring pairs usually end behind a peaceful pair; alliances usually form against bloc threats; AI war declarations are explained; earlier gates pass; backend chosen with a cost estimate.
Gate 5 (Async multiplayer): server runs the same sim package unforked; clients never get another nation's hidden state; a week-long 5-player game survives a dropout via caretaker AI; security review passes; cost per game measured.
Gate 6 (Launch): three outside players finish unaided; accessibility pass on core flows; crash-free target met.
