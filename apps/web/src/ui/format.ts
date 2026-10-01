import type { EffectUnit } from '@airport/contracts';

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

/** Milli-passengers a second as "2.0/s", "1.2K/s". */
export function formatRate(milliPerSec: number): string {
  const perSec = milliPerSec / 1000;
  return perSec < 100 ? `${(Math.floor(perSec * 10) / 10).toFixed(1)}/s` : `${short(perSec)}/s`;
}

/** An upgrade effect, given in milli-units of its unit. */
export function formatEffect(unit: EffectUnit, milli: number): string {
  const value = milli / 1000;
  switch (unit) {
    case 'count':
      return `${value} ${value === 1 ? 'gate' : 'gates'}`;
    case 'seats':
      return `${short(value)} seats`;
    case 'paxPerSec':
      return formatRate(milli);
    case 'cents':
      return formatCash(value);
    case 'seconds':
      return `${value.toFixed(value < 10 ? 2 : 1)}s`;
    case 'minutes':
      return value >= 60 ? `${value / 60}h` : `${value}m`;
  }
}
