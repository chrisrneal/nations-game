/**
 * Integer helpers for the warehouse (P3). Every result is a safe integer, and
 * the same on every JavaScript engine: no floats, no transcendental functions.
 */

/** floor(a * b / c) for non-negative safe integers, exact even when a * b is not safe. */
export function mulDiv(a: number, b: number, c: number): number {
  const product = a * b;
  if (Number.isSafeInteger(product)) return Math.floor(product / c);
  return Number((BigInt(a) * BigInt(b)) / BigInt(c));
}

/** `base` grown by `bp` basis points `n` times, flooring each step, saturating at `cap`. */
export function grow(base: number, bp: number, n: number, cap = Number.MAX_SAFE_INTEGER): number {
  let value = base;
  for (let i = 0; i < n; i++) {
    value = mulDiv(value, bp, 10_000);
    if (value >= cap) return cap;
  }
  return value;
}

/** floor(sqrt(n)) for a non-negative safe integer, by integer Newton steps. */
export function isqrt(n: number): number {
  if (n < 0 || !Number.isSafeInteger(n)) throw new Error(`isqrt needs a non-negative safe integer, got ${n}`);
  if (n < 2) return n;
  const big = BigInt(n);
  let x = big;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + big / x) / 2n;
  }
  return Number(x);
}
