# Gaps
Each entry: slice or prompt, what is missing or was shortcut, owning lane.
Nations-era gaps retired with the pivot (decision record P1); they are at commit
`67d1d92` in docs/GAPS.md.

- Pivot 1, Nations docs still in the tree until slice 8: docs/AI_DESIGN.md, docs/100X.md, docs/balance/, docs/gates/, docs/playtests/, data/, REVIEW_*.md. Lane D.
- Pivot 2, the airport sim lives in packages/sim/src/airport with its own `tunables.ts` beside the Nations sim (P8). CLAUDE.md names packages/sim/src/tunables.ts; slice 8 moves the airport files up when the Nations sim is deleted. Lane S.
- Pivot 2, the harness's `--set` overrides (overrides.ts) still sweep only the Nations tunables; slice 6 points them at the airport tunables. Lane H.
- Pivot 3, a tap reaches the sim on the next tick, up to 250 ms later; the card glows at once so it feels immediate. Lane P.
- Pivot 3, no component tests (no jsdom project, T4): the interface is covered by the Chromium phone check, which is not in CI because it needs a build and a browser. Lane U.
- Pivot 3, not yet checked on a real phone (iOS Safari and Android Chrome); the phone check is headless Chromium. Owner.
- Pivot 3, the app icons are still the Nations placeholders (apps/web/public). Lane P.
