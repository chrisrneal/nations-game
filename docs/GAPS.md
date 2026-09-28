# Gaps
Each entry: prompt number, phase, what is missing, owning lane.

- 01, Phase 0, `data/world-2030.json` is a 6-nation placeholder with capitals and populations, not the 2030 projections D9 requires, and `data/SOURCES.md` does not exist. Lane D.
- 01, Phase 0, No sim `step()`, seeded RNG or state-hash determinism test yet, so Gate 0 criteria 2-4 cannot be checked. Lane S.
- 01, Phase 0, No Host implementation: no Web Worker, no Comlink bridge, no IndexedDB saves. `apps/web/src/platform` is empty. Lane P.
- 01, Phase 0, No jsdom Vitest project, so UI components cannot be tested yet. Add one with the first component worth testing. Lane U.
- 01, Phase 0, PWA icons are generated flat placeholders (`apps/web/public/pwa-*.png`); the app has no visual identity. Lane P.
- 01, Phase 0, The balance harness is a placeholder CLI: no seeded runs, no archetypes, no metrics rows. Lane H.
- 01, Phase 0, `State` and `View` carry only tick, RNG, controllers and identity; every later system adds its own fields. Lanes C and S.
- 01, Phase 0, Catch-up performance (1,000 ticks under 2 s on a mid-range phone) is unmeasured; there is nothing to measure yet. Lane H.

