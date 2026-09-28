import type { Pace } from '@nations/contracts';

/**
 * Wall-clock milliseconds per tick at each pace (seam 4: the host owns the clock).
 *
 * Phase 0 build pace, not the game's pace. docs/RULES.md section 9 sets 1x at one
 * tick per 30 minutes; with no economy yet that would look frozen, so this build
 * runs one tick a second at 1x so the counter, the AI and saves can be seen
 * working. Switch to the RULES values when the Phase 1 economy lands (docs/GAPS.md,
 * prompt 04). Host timing, not balance, so it lives here rather than in the sim's
 * tunables.
 */
export const PACE_INTERVAL_MS: Readonly<Record<Exclude<Pace, 'paused' | 'live'>, number>> = {
  x1: 1000,
  x4: 250,
};

/** Paces this host accepts. `live` (advance while closed) is not built yet. */
export const SUPPORTED_PACES: readonly Pace[] = ['paused', 'x1', 'x4'];
