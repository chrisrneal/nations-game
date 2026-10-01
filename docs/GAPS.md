# Gaps
Each entry: slice or prompt, what is missing or was shortcut, owning lane.
Nations-era gaps retired with the pivot (decision record P1); they are at commit
`67d1d92` in docs/GAPS.md.

- Pivot 1, Nations docs still in the tree until slice 8: docs/AI_DESIGN.md, docs/100X.md, docs/balance/, docs/gates/, docs/playtests/, data/, REVIEW_*.md. Lane D.
- Pivot 2, the airport sim lives in packages/sim/src/airport with its own `tunables.ts` beside the Nations sim (P8). CLAUDE.md names packages/sim/src/tunables.ts; slice 8 moves the airport files up when the Nations sim is deleted. Lane S.
- Pivot 2, the harness's `--set` overrides (overrides.ts) still sweep only the Nations tunables; slice 6 points them at the airport tunables. Lane H.
