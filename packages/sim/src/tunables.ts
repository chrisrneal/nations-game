import type { Tunable } from '@nations/contracts';

/**
 * Every balance number in the game, with the band it may move inside.
 *
 * Rules (see CLAUDE.md and docs/ROADMAP.md):
 * - No balance number lives anywhere else. Not inline, not in the UI, not in the AI.
 * - Each entry needs a `note` saying why the band is what it is.
 * - The balance harness may sweep inside [min, max]. Leaving the band is a
 *   design change and needs a decision record in docs/DECISIONS.md.
 * - Values are integers wherever they feed economy maths, so results are
 *   identical on every machine.
 *
 * Phase 0: engine limits and the placeholder command only. Economy numbers land
 * in Phase 1.
 */
export const TUNABLES = {
  maxCommandsPerNationPerTick: {
    value: 8,
    min: 1,
    max: 32,
    note: 'Caps one nation\'s intent per tick so a buggy or hostile client cannot flood a step; a real player needs a handful at most.',
  },
  placeholderRollSides: {
    value: 100,
    min: 2,
    max: 1000,
    note: 'Size of the random roll the Phase 0 placeholder `ping` command draws, only to exercise the seeded RNG. Removed when real rules arrive.',
  },
  placeholderReserveMax: {
    value: 999,
    min: 1,
    max: 1_000_000,
    note: 'Upper bound of the seeded private `reserve` each nation starts with, only so private fields differ per nation for the View privacy tests. Removed when the economy arrives.',
  },
} as const satisfies Readonly<Record<string, Tunable>>;
