import type { ForeignNation, NationView, Prices, ResourceAmount } from '@nations/contracts';

/** Small shared helpers for the AI layers. Integers only, no clock, no Math.random (D5). */

export const GOODS = ['food', 'energy'] as const;
export type Good = (typeof GOODS)[number];

export function mix(input: number): number {
  let z = input | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  z ^= z >>> 16;
  return z >>> 0;
}

export function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Deterministic noise in [0, maxBp] for one (seed, tick, nation, key) — never Math.random. */
export function noiseBp(seed: number, tick: number, self: string, key: string, maxBp: number): number {
  if (maxBp <= 0) return 0;
  return mix(seed ^ hashText(self) ^ Math.imul(tick + 1, 0x9e3779b9) ^ hashText(key)) % (maxBp + 1);
}

/** A tunable from the View's public rules. The AI never keeps its own copy of a balance number. */
export function rule(view: Pick<NationView, 'rules'>, id: string): number {
  const value = view.rules[id];
  if (value === undefined) throw new Error(`View has no rule "${id}"`);
  return value;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Reference value in thousandths of a Credit. */
export function valueOf(prices: Prices, a: ResourceAmount): number {
  return prices[a.resource] * a.amount;
}

/** Whether a swap sits inside the fair price band (RULES 3.2), from the maker's side. */
export function isFair(view: Pick<NationView, 'rules' | 'prices'>, give: ResourceAmount, get: ResourceAmount): boolean {
  const band = rule(view, 'priceBandPct');
  const vGive = valueOf(view.prices, give);
  const vGet = valueOf(view.prices, get);
  return vGet * 100 <= vGive * (100 + band) && vGet * 100 >= vGive * (100 - band);
}

/** Structural surplus (+) or deficit (-) per tick, from public data. */
export function balanceOf(n: Pick<ForeignNation, 'public'>, good: Good): number {
  return n.public[good].production - n.public[good].demand;
}

/** Credit worth `amount` of a good at reference price plus a markup; at least 1. */
export function creditFor(prices: Prices, good: Good, amount: number, markupPct: number): number {
  return Math.max(1, Math.floor((amount * prices[good] * (100 + markupPct)) / 100_000));
}

/** Units of `good` worth `other` at reference prices, less a markup; may be 0. */
export function goodsFor(prices: Prices, good: Good, other: ResourceAmount, markupPct: number): number {
  return Math.floor((valueOf(prices, other) * 100) / ((100 + markupPct) * prices[good]));
}

/** "30 food" */
export function show(a: ResourceAmount): string {
  return `${a.amount} ${a.resource}`;
}

/** Game month shown to players: tick 0 is month 1. */
export function month(tick: number): number {
  return tick + 1;
}
