import type { Pace } from '@nations/contracts';

/**
 * Wall-clock milliseconds per tick at each pace (seam 4: the host owns the clock).
 *
 * Phase 1 play-test pace, not the final game pace. docs/RULES.md section 9 sets
 * 1x at one tick per 30 minutes, which only makes sense with `live` pace (the
 * world moving while the app is closed), not built yet. Until then a full
 * 60-month game has to fit in one sitting: 1x is one month every 10 s (a
 * 10-minute game, and an offer's 3-month life is 30 s to answer), 4x one every
 * 2.5 s, and the pace bar has a "next month" step. Host timing, not balance, so
 * it lives here rather than in the sim's tunables (docs/GAPS.md, prompt 07).
 */
export const PACE_INTERVAL_MS: Readonly<Record<Exclude<Pace, 'paused' | 'live'>, number>> = {
  x1: 10_000,
  x4: 2_500,
};

/** Paces this host accepts. `live` (advance while closed) is not built yet. */
export const SUPPORTED_PACES: readonly Pace[] = ['paused', 'x1', 'x4'];
