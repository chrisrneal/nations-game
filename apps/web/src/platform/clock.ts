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
