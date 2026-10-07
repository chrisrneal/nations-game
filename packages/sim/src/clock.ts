import { WAREHOUSE_TUNABLES as T } from './tunables.ts';

/** Minutes in a warehouse day. */
export const DAY_MINUTES = 1440;

/** Warehouse minutes since tick 0 began, counting from the minute of the opening day the warehouse opened at (W8). */
function minutesAt(tick: number): number {
  return T.wmsDayStartMinute.value + Math.floor(tick / T.wmsMinuteTicks.value);
}

/** The warehouse day a tick falls on (W8): 1 on the opening day. */
export function dayAt(tick: number): number {
  return Math.floor(minutesAt(tick) / DAY_MINUTES) + 1;
}

/** The minute of the day a tick falls on, 0-1439 (W8). */
export function minuteOfDay(tick: number): number {
  return minutesAt(tick) % DAY_MINUTES;
}

/** The first tick of a warehouse day (W8); day 1 starts before tick 0, so its first tick is negative. */
export function dayStartTick(day: number): number {
  return ((day - 1) * DAY_MINUTES - T.wmsDayStartMinute.value) * T.wmsMinuteTicks.value;
}
