# Progress
Current state: **pivot in progress** to the idle airport game (decision record
P1). Slice 1 of 8 (docs) is done; the deployed app is still Nations until slice 3.
The Nations progress log, gate checklists and verdicts are at commit `67d1d92`
(docs/PROGRESS.md there).

## Slices (docs/ROADMAP.md)
- [x] 1. Pivot docs
- [ ] 2. Airport sim
- [ ] 3. Airport screen and upgrade sheet; Nations interface deleted
- [ ] 4. Offline earnings and the away recap
- [ ] 5. Prestige and the second city
- [ ] 6. Pacing pass
- [ ] 7. Juice and polish
- [ ] 8. Remove the remaining Nations code; README

## Session log

### 2026-10-01 - Pivot slice 1, the airport on paper (architect, P2)
**What changed.** The project is now an idle airport game. docs/RULES.md is
rewritten from scratch: the core loop (terminal, gates, boarding, departures),
the tap rush, seven upgrades with their catches and geometric costs, the income
estimate and named bottleneck, offline earnings with a cap, selling for slots,
four cities with twists, pacing targets, 60 tunables with bands and the
invariants. Decision records P1-P8 explain the pivot (the Nations game lives at
commit 67d1d92) and the airport's architecture calls. CLAUDE.md and ROADMAP.md
are rewritten for the airport. The Nations rules and their tunables test were
deleted in their own commit; the Nations progress and gaps logs were cleared
here (they remain in history).
**How to see it.** Read docs/RULES.md sections 1-7: that is the game. A float
prototype of these rules (not committed) put the first upgrade at 5 s, a new
gate, plane or route every 1-6 minutes, and tapping at 1.6-2.9x idle income.
**What is left.** Slices 2-8. Every number in RULES.md is a first guess that
slice 6 tunes with the harness.
