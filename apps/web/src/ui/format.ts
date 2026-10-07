const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/**
 * Big numbers in a few characters: 999, 1.2K, 12.3K, 123K, 3.4M, 5.6B.
 * Rounds down, so the screen never shows more than you have.
 */
export function short(n: number): string {
  if (n < 1000) return String(Math.floor(n));
  let unit = 0;
  let value = n;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const shown = value < 100 ? Math.floor(value * 10) / 10 : Math.floor(value);
  return `${value < 100 ? shown.toFixed(1) : String(shown)}${UNITS[unit]}`;
}

/** Cents as dollars: $0.40, $9.50, $12, $1.2K, $3.4M. */
export function formatCash(cents: number): string {
  const dollars = cents / 100;
  if (dollars < 10) return `$${(Math.floor(cents) / 100).toFixed(2)}`;
  return `$${short(dollars)}`;
}

/** Seconds as 45s, 2m 10s, 1h 5m. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${Math.floor((s % 3600) / 60)}m`;
}

/** A minute of the day as a 24-hour clock: 0 is 00:00, 870 is 14:30. */
export function timeOfDay(minute: number): string {
  const m = ((Math.floor(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** The warehouse clock (W8): what any tick reads as, given the clock's shape from the View. */
export interface ClockShape {
  readonly ticksPerMinute: number;
  readonly startMinute: number;
}

/** The warehouse day and minute of the day a tick falls on (W8). */
export function clockAt(tick: number, c: ClockShape): { day: number; minute: number } {
  const minutes = c.startMinute + Math.floor(tick / c.ticksPerMinute);
  return { day: Math.floor(minutes / 1440) + 1, minute: minutes % 1440 };
}

/** A tick as a time of day, with the day when it is not `today` ("14:30", "D3 06:00"). */
export function tickTime(tick: number, c: ClockShape, today?: number): string {
  const at = clockAt(tick, c);
  const time = timeOfDay(at.minute);
  return today === undefined || at.day === today ? time : `D${at.day} ${time}`;
}
