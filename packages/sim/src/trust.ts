import type { NationEndowment, NationId, NationRecord } from '@nations/contracts';
import { TUNABLES } from './tunables.ts';

/**
 * Trust, docs/RULES.md sections 3.5 and 6. Built only from positive structural
 * ties and their absence: no list of who dislikes whom.
 */

export function clampTrust(value: number): number {
  return Math.max(TUNABLES.trustMin.value, Math.min(TUNABLES.trustMax.value, value));
}

type Ties = Pick<NationEndowment, 'id' | 'blocs' | 'alliances' | 'topTradePartners'>;

/** Starting trust of `a` in `b` (symmetric by construction). */
export function startingTrust(a: Ties, b: Ties): number {
  const shared = (x: readonly string[], y: readonly string[]): number => x.filter((item) => y.includes(item)).length;
  const blocs = shared(a.blocs, b.blocs);
  const partnerAB = a.topTradePartners.includes(b.id);
  const partnerBA = b.topTradePartners.includes(a.id);
  let trust = TUNABLES.baseTrust.value;
  if (shared(a.alliances, b.alliances) > 0) trust += TUNABLES.trustSharedAlliance.value;
  trust += Math.min(TUNABLES.trustSharedBlocCap.value, blocs * TUNABLES.trustSharedBlocEach.value);
  if (partnerAB) trust += TUNABLES.trustTradePartner.value;
  if (partnerBA) trust += TUNABLES.trustTradePartner.value;
  if (a.blocs.includes('g20') && b.blocs.includes('g20')) trust += TUNABLES.trustBothG20.value;
  if (blocs === 0 && !partnerAB && !partnerBA) trust -= TUNABLES.trustNoTiesPenalty.value;
  return clampTrust(trust);
}

/** `holder`'s trust in `other` moved by `delta`, clamped. Returns a new record. */
export function adjustTrust(holder: NationRecord, other: NationId, delta: number): NationRecord {
  const current = holder.private.trust[other];
  if (current === undefined || delta === 0) return holder;
  return {
    ...holder,
    private: { ...holder.private, trust: { ...holder.private.trust, [other]: clampTrust(current + delta) } },
  };
}

/** One tick of drift towards baseTrust for every relationship this nation holds. */
export function driftTrust(holder: NationRecord, order: readonly NationId[]): NationRecord {
  const step: number = TUNABLES.trustDecayPerTick.value;
  if (step === 0) return holder;
  const base = TUNABLES.baseTrust.value;
  const trust: Record<NationId, number> = {};
  let changed = false;
  for (const id of order) {
    const value = holder.private.trust[id];
    if (value === undefined) continue;
    const next = value > base ? Math.max(base, value - step) : Math.min(base, value + step);
    trust[id] = next;
    if (next !== value) changed = true;
  }
  return changed ? { ...holder, private: { ...holder.private, trust } } : holder;
}
