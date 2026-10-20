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
