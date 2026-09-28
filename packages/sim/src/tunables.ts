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
 * Phase 0: empty on purpose. The first entries land with the economy in Phase 1.
 */
export const TUNABLES: Readonly<Record<string, Tunable>> = {};
