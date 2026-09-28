# Gaps
Each entry: prompt number, phase, what is missing, owning lane.

- 01, Phase 0, `data/world-2030.json` is a 6-nation placeholder with capitals and populations, not the 2030 projections D9 requires, and `data/SOURCES.md` does not exist. Lane D.
- 01, Phase 0, ~~No sim `step()`, seeded RNG or state-hash determinism test yet.~~ Closed by prompt 03. Lane S.
- 01, Phase 0, No Host implementation: no Web Worker, no Comlink bridge, no IndexedDB saves. `apps/web/src/platform` is empty. Lane P.
- 01, Phase 0, No jsdom Vitest project, so UI components cannot be tested yet. Add one with the first component worth testing. Lane U.
- 01, Phase 0, PWA icons are generated flat placeholders (`apps/web/public/pwa-*.png`); the app has no visual identity. Lane P.
- 01, Phase 0, ~~The balance harness is a placeholder CLI.~~ Seeded runs and metrics rows added in prompt 03; archetypes still missing. Lane H.
- 01, Phase 0, `State` and `View` carry only tick, RNG, controllers and identity; every later system adds its own fields. Lanes C and S.
- 01, Phase 0, Catch-up performance (1,000 ticks under 2 s on a mid-range phone) is unmeasured; there is nothing to measure yet. Lane H.

- 03, Phase 0, `WorldState`, `NationView` and `SimSaveFile` (adds `savedAtTick`, `stateHash`) extend the contracts types from inside packages/sim because this prompt could not edit contracts. `View` consumers in the UI will want `NationView`; fold these fields into packages/contracts. Lane C.
- 03, Phase 0, packages/ai imports `type NationView` from @nations/sim because of the gap above; once contracts carries it, ai can depend on contracts alone. Lanes C and A.
- 03, Phase 0, ESLint has no allow-list rule for packages/ai; the rule "AI imports only contracts, own files and sim types" is enforced by packages/harness/src/purity.test.ts instead. eslint.config.js is outside lanes S/A/H. Architect.
- 03, Phase 0, Catch-up benchmark measured only on the build machine (~14 ms for 1,000 ticks in Node and headless Chromium), not on a mid-range phone. Needs `npm run harness -- bench` equivalent inside the PWA once LocalHost exists. Lanes P and H.
- 03, Phase 0, Dummy AI's idle chance (1 in 4) is an inline placeholder in packages/ai/src/dummy.ts, not in tunables.ts; it goes when real AI arrives. Lane A.
- 03, Phase 0, Harness has no bot archetypes and no balance metrics yet (only command counts and hashes); arrive with the Phase 1 economy. Lane H.
