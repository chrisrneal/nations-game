/**
 * Wall-clock bookkeeping for the live airport (S4: the host owns the clock).
 * The sim counts ticks; the host remembers the wall time its current tick
 * stands for (the anchor) and steps whatever the clock owes.
 */

/** Ticks owed `now` for a state anchored at `anchor`, and the anchor after stepping them. */
export function ticksDue(anchor: number, now: number, tickMs: number): { ticks: number; anchor: number } {
  const elapsed = Math.max(0, now - anchor);
  const ticks = Math.floor(elapsed / tickMs);
  return { ticks, anchor: anchor + ticks * tickMs };
}

/** Steps owed beyond this many are caught up quietly (no events, no animation), keeping the last few live. */
export const LIVE_EVENT_TICKS = 8;

/** An absence at least this long (RULES 9: 60 s) earns an away recap. Host setting, not balance. */
export const RECAP_MIN_AWAY_MS = 60_000;

/**
 * Ticks to step for a gap of `ticks`, given the offline cap (RULES 9): the
 * airport runs at most `capTicks` while you are away; the rest is lost.
 */
export function capped(ticks: number, capTicks: number): { run: number; lost: number } {
  const run = Math.min(ticks, capTicks);
  return { run, lost: ticks - run };
}
