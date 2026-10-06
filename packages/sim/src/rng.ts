import type { RngState } from '@warehouse/contracts';

/**
 * Counter-based seeded RNG. The whole generator is the `{ seed, counter }` pair
 * stored in State, so saving, loading and hashing it needs nothing special.
 *
 * Each draw mixes (seed, counter) with 32-bit integer operations only
 * (`Math.imul`, shifts, xor), which every JavaScript engine computes
 * identically. No floats are involved at any point (seam 5).
 */

/** 32-bit golden-ratio increment, as in splitmix. */
const GOLDEN = 0x9e3779b9;

/** Finaliser from MurmurHash3: spreads every input bit across the output. */
export function mix32(input: number): number {
  let z = input | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  z ^= z >>> 16;
  return z >>> 0;
}

/** A fresh generator. Any integer seed is accepted and reduced to 32 bits. */
export function seedRng(seed: number): RngState {
  if (!Number.isInteger(seed)) throw new Error(`RNG seed must be an integer, got ${seed}`);
  return { seed: seed >>> 0, counter: 0 };
}

/** One unsigned 32-bit draw and the advanced generator. Never mutates `rng`. */
export function nextUint32(rng: RngState): { value: number; rng: RngState } {
  const seedMix = mix32(rng.seed ^ 0x5bd1e995);
  const value = mix32((seedMix + Math.imul(rng.counter + 1, GOLDEN)) | 0);
  return { value, rng: { seed: rng.seed, counter: rng.counter + 1 } };
}

/**
 * Integer in [min, max] inclusive. Uses rejection sampling so every value is
 * exactly equally likely; the loop almost never runs twice.
 */
export function randomInt(rng: RngState, min: number, max: number): { value: number; rng: RngState } {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new Error(`randomInt needs integers with min <= max, got [${min}, ${max}]`);
  }
  const span = max - min + 1;
  if (span > 0x100000000) throw new Error('randomInt span exceeds 32 bits');
  const limit = 0x100000000 - (0x100000000 % span);
  let current = rng;
  for (;;) {
    const draw = nextUint32(current);
    current = draw.rng;
    if (draw.value < limit) return { value: min + (draw.value % span), rng: current };
  }
}
