import type { Pace } from '@nations/contracts';

/**
 * Wall-clock milliseconds per tick at each pace (seam 4: the host owns the clock).
 *
 * 1x and 4x are the play-test pace, so a 60-month game fits one sitting: 1x is
 * one month every 10 s, 4x one every 2.5 s, plus a "next month" step. `live` is
 * the real game pace of docs/RULES.md section 9 (one month per 30 minutes of
 * wall clock, a 60-month game in about 30 hours): the world keeps moving while
 * the app is closed and catches up when it reopens (prompt 11). Host timing,
 * not balance, so it lives here rather than in the sim's tunables.
 */
export const PACE_INTERVAL_MS: Readonly<Record<Exclude<Pace, 'paused'>, number>> = {
  x1: 10_000,
  x4: 2_500,
  live: 30 * 60 * 1000,
};

/** How often a live game checks the wall clock while the app is open. Ticks are due by wall time, not by this timer. */
export const LIVE_POLL_MS = 15_000;

/** Paces this host accepts. */
export const SUPPORTED_PACES: readonly Pace[] = ['paused', 'x1', 'x4', 'live'];

/** How many live ticks are due `elapsed` ms after the anchor, and the anchor after stepping them. */
export function liveTicksDue(anchor: number, now: number): { ticks: number; anchor: number } {
  const elapsed = Math.max(0, now - anchor);
  const ticks = Math.floor(elapsed / PACE_INTERVAL_MS.live);
  return { ticks, anchor: anchor + ticks * PACE_INTERVAL_MS.live };
}
