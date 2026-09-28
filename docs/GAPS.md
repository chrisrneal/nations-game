# Gaps
Each entry: prompt number, phase, what is missing, owning lane.

- 01, Phase 0, ~~`data/world-2030.json` is a 6-nation placeholder and `data/SOURCES.md` does not exist.~~ Closed by prompt 02. Lane D.
- 01, Phase 0, ~~No sim `step()`, seeded RNG or state-hash determinism test yet.~~ Closed by prompt 03. Lane S.
- 01, Phase 0, ~~No Host implementation: no Web Worker, no Comlink bridge, no IndexedDB saves.~~ Closed by prompt 04. Lane P.
- 01, Phase 0, No jsdom Vitest project, so UI components cannot be tested yet. Prompt 04 added `apps/web/src/**/*.test.ts` to the root Vitest include (node environment) for platform and boundary tests; components are checked by the Chromium phone check instead. Lane U.
- 01, Phase 0, PWA icons are generated flat placeholders (`apps/web/public/pwa-*.png`); the app has no visual identity. Lane P.
- 01, Phase 0, ~~The balance harness is a placeholder CLI.~~ Seeded runs and metrics rows added in prompt 03; archetypes still missing. Lane H.
- 01, Phase 0, `State` and `View` carry only tick, RNG, controllers and identity; every later system adds its own fields. Lanes C and S.
- 01, Phase 0, Catch-up performance (1,000 ticks under 2 s on a mid-range phone) is unmeasured; there is nothing to measure yet. Lane H.


- 02, Phase 0, **`packages/harness/src/roster.ts` no longer reads the world file correctly.** It calls `Object.keys(data)` on what used to be a flat name-keyed placeholder, so with the new schema it loads the eight top-level keys (`schemaVersion`, `worldYear`, `generated`, `notes`, `units`, `world`, `nations`, `aggregates`) as nation ids. Tests still pass because they only assert at least two nations in sorted order, but every harness game is now played by eight fictional nations. Fix: read `data.nations` and use each entry's `id` and `name`, and consider asserting a `schemaVersion`. Lane H.
- 02, Phase 0, The 53 tunables in docs/RULES.md section 11 are documented but not in `packages/sim/src/tunables.ts`; the file still holds only the three Phase 0 engine entries. Transcribe them with the Phase 1 economy, and drop `placeholderRollSides` and `placeholderReserveMax` when the real rules land. Lane S.
- 02, Phase 0, Nothing loads `data/world-2030.json` into the sim. `createWorld` takes a bare `{id, name}` roster, so population, GDP, balances, exposure and preparedness are not in `WorldState` yet, and neither are the four resources. Lane S, with lane C for the new `State` and `View` fields.
- 02, Phase 0, The world file was built by a throwaway Python script that was not committed (this is a TypeScript project). A permanent regenerator belongs in packages/harness so a new IMF WEO or UN WPP can be pulled in without hand work; data/SOURCES.md has the step-by-step until then. Lane H.
- 02, Phase 0, The minerals fields (`endowmentIndex`, `refiningLeverageIndex`, `keyCommodities`) were curated from general knowledge of the USGS Mineral Commodity Summaries series rather than read from its tables, and `blocs`, `alliances` and `topTradePartners` were not retrieved from any official source. All are flagged in data/SOURCES.md. Starting trust is derived entirely from blocs, alliances and trade partners, so these should be verified before section 6 of RULES.md is coded. Lane D.
- 02, Phase 0, Gate 0's "1,000 catch-up ticks under 2 s" no longer corresponds to a game length: one game is 60 ticks, so 1,000 ticks is about 17 games. It is still a useful raw stress budget, but the absence case it was written for is now 4 ticks (a 24-hour gap at the multiplayer cadence). Needs an architect ruling on whether the criterion stands as written. Architect.
- 02, Phase 0, Six open design questions at the end of docs/RULES.md are unanswered: whether background aggregates initiate offers, whether other nations' Resilience is visible, whether a 30-hour single-player game at 1x is too long, whether `exploiter` should be renamed in the interface, whether the minerals data is rebuilt before Phase 1, and whether blocs and alliances are verified before starting trust is coded. Each has a recommendation. Lane D once answered.

- 03, Phase 0, `WorldState`, `NationView` and `SimSaveFile` (adds `savedAtTick`, `stateHash`) extend the contracts types from inside packages/sim because this prompt could not edit contracts. `View` consumers in the UI will want `NationView`; fold these fields into packages/contracts. Lane C.
- 03, Phase 0, packages/ai imports `type NationView` from @nations/sim because of the gap above; once contracts carries it, ai can depend on contracts alone. Lanes C and A.
- 03, Phase 0, ESLint has no allow-list rule for packages/ai; the rule "AI imports only contracts, own files and sim types" is enforced by packages/harness/src/purity.test.ts instead. eslint.config.js is outside lanes S/A/H. Architect.
- 03, Phase 0, Catch-up benchmark measured only on the build machine (~14 ms for 1,000 ticks in Node and headless Chromium), not on a mid-range phone. Needs `npm run harness -- bench` equivalent inside the PWA once LocalHost exists. Lanes P and H.
- 03, Phase 0, Dummy AI's idle chance (1 in 4) is an inline placeholder in packages/ai/src/dummy.ts, not in tunables.ts; it goes when real AI arrives. Lane A.
- 03, Phase 0, Harness has no bot archetypes and no balance metrics yet (only command counts and hashes); arrive with the Phase 1 economy. Lane H.

- 04, Phase 0, Pace is a Phase 0 build pace: 1x = one tick a second, 4x = four (apps/web/src/platform/pace.ts). docs/RULES.md section 9 says 1x = one tick per 30 minutes and 4x = one per 7.5 minutes; switch when the economy makes ticks meaningful. `live` pace (advance while closed) is refused for now. Lane P.
- 04, Phase 0, Decision cards are fake (apps/web/src/ui/cards.ts): generated from the world file every 24 ticks, answered cards remembered only until the app closes, and every option sends the placeholder `ping` command. Real cards must be State objects with expiry ticks (seam 8), exposed in the View. Lanes S, C, then U.
- 04, Phase 0, The resource strip shows starting indices from data/world-2030.json (food and energy self-sufficiency, PPP GDP, pandemic preparedness), not live stocks; the map draws structural ties, not trust, because trust is not in State and its formula's numbers are not yet in tunables.ts. Both read static data in the interface until the View carries them. Lanes S and C.
- 04, Phase 0, `PlayerView` is the sim's `NationView`, re-exported by the platform because contracts has no such type (same gap as prompt 03). Lane C.
- 04, Phase 0, The phone check (`npm run e2e --workspace web`) needs a Chromium binary and is not in CI. Adding it needs a CI browser install, which is an edit to .github/workflows (architect). Architect.
- 04, Phase 0, ESLint's `@nations/sim` ban in apps/web/src could be widened to `@nations/ai`, `comlink` and platform internals; the boundary test covers these instead because eslint.config.js is architect-owned. Architect.
- 04, Phase 0, Saves are compact (the current state becomes the snapshot), so an in-app save cannot replay the game from tick 0. Fine for resume; bug-report replay would need the full log kept. Lane P.
- 04, Phase 0, Real-device checks still open: install on an iPhone and an Android phone from the Vercel production address, airplane-mode reopen, and the in-app speed check reading on a mid-range phone. Owner.

- 05, Phase 0, **Gate 0 FAIL: seam 8 is not built.** No interaction type in contracts, nothing in `WorldState`, no expiry or default answer in `step`, nothing in `NationView`; inbox cards live in React state and are lost on reload. See docs/gates/GATE-0.md. Lanes C, S, A, U, P.
- 05, Phase 0, Harness roster still fictional (prompt 02 gap above): every harness game, the benchmark and the built-in determinism check run eight "nations" named after JSON keys. Reviewer verified determinism separately with the real 17. Lane H.
- 05, Phase 0, App saves are always compact, so phone saves have an empty command log and cannot replay a game (seam 9's bug-repro job). Lane P.
- 05, Phase 0, `controllerChanged` events are public, which would tell rivals when a human is away in multiplayer. Decide before Phase 5. Architect.
