import type { Event, NationId, NationView, TradeOffer } from '@nations/contracts';

/**
 * Layer 1, perception (docs/AI_DESIGN.md).
 *
 * A mind perceives exactly what a human player of the same nation would: its
 * own NationView and the events whose audience includes it (or is public).
 * Nothing here can see State, and `visibleTo` is the only door events come
 * through, so "the AI never cheats" is checkable (seam 6).
 */

/** True when a player of `self` would receive this event. */
export function visibleTo(event: Event, self: NationId): boolean {
  return event.audience.length === 0 || event.audience.includes(self);
}

/**
 * Crises as the AI expects to read them from the View once lanes C and S build
 * RULES section 4 (docs/GAPS.md, prompt 10). Until then `view.crises` is absent
 * and the AI simply never pledges. The shape is the smallest the pledge
 * decision needs; docs/AI_DESIGN.md "Crisis contract" lists it for lane C.
 */
export interface CrisisPledgeSeen {
  readonly nationId: NationId;
  readonly amount: number;
}
export interface CrisisSeen {
  readonly id: number;
  readonly kind: 'climate' | 'pandemic';
  /** Short name players see, e.g. "flood relief". Falls back to the kind. */
  readonly label: string;
  readonly openedTick: number;
  /** Last tick pledges count. */
  readonly closesTick: number;
  /** Credit in the pool now, and what a full pool needs (RULES 4.3). */
  readonly pooled: number;
  readonly target: number;
  /** Public: every crisis card lists who paid (RULES 4.3 rule 3). */
  readonly pledges: readonly CrisisPledgeSeen[];
}

/** The pledge command the AI sends (proposed contract, see CrisisSeen). */
export const PLEDGE_COMMAND = 'pledge';
/** The public event that closes a crisis and lists who paid (proposed contract). */
export const CRISIS_CLOSED_EVENT = 'crisisClosed';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCrisis(raw: unknown): CrisisSeen | null {
  if (!isRecord(raw)) return null;
  const { id, kind, openedTick, closesTick, pooled, target, pledges } = raw;
  if (typeof id !== 'number' || (kind !== 'climate' && kind !== 'pandemic')) return null;
  if (typeof openedTick !== 'number' || typeof closesTick !== 'number') return null;
  if (typeof pooled !== 'number' || typeof target !== 'number' || !Array.isArray(pledges)) return null;
  const list: CrisisPledgeSeen[] = [];
  for (const p of pledges) {
    if (isRecord(p) && typeof p.nationId === 'string' && typeof p.amount === 'number') {
      list.push({ nationId: p.nationId as NationId, amount: p.amount });
    }
  }
  const label = typeof raw.label === 'string' && raw.label !== '' ? raw.label : `${kind} relief`;
  return { id, kind, label, openedTick, closesTick, pooled, target, pledges: list };
}

/** Open crises in the View, or none when the sim does not model crises yet. */
export function crisesIn(view: NationView): readonly CrisisSeen[] {
  const raw = (view as NationView & { readonly crises?: unknown }).crises;
  if (!Array.isArray(raw)) return [];
  const out: CrisisSeen[] = [];
  for (const item of raw) {
    const c = readCrisis(item);
    if (c !== null) out.push(c);
  }
  return out;
}

/** What one event meant for this nation's relationships. */
export type Observation =
  | { readonly kind: 'kept'; readonly partner: NationId; readonly tick: number; readonly offer: TradeOffer }
  | { readonly kind: 'broken'; readonly partner: NationId; readonly tick: number; readonly offer: TradeOffer }
  | { readonly kind: 'ignored'; readonly partner: NationId; readonly tick: number; readonly offer: TradeOffer }
  | { readonly kind: 'rejected'; readonly partner: NationId; readonly tick: number; readonly offer: TradeOffer }
  | { readonly kind: 'pledged'; readonly partner: NationId; readonly tick: number; readonly crisis: CrisisSeen; readonly amount: number }
  | { readonly kind: 'skipped'; readonly partner: NationId; readonly tick: number; readonly crisis: CrisisSeen; readonly iPaid: boolean };

function offerOf(payload: unknown): TradeOffer | null {
  if (!isRecord(payload) || !isRecord(payload.offer)) return null;
  return payload.offer as unknown as TradeOffer;
}

/**
 * Turns the events a nation may see into observations about partners. Events
 * it may not see are dropped here even if a caller passes them in.
 */
export function observe(self: NationId, events: readonly Event[], knownNations: readonly NationId[]): Observation[] {
  const out: Observation[] = [];
  for (const event of events) {
    if (!visibleTo(event, self)) continue;
    switch (event.type) {
      case 'offerSettled': {
        const offer = offerOf(event.payload);
        if (offer === null) break;
        const partner = offer.from === self ? offer.to : offer.from;
        out.push({ kind: 'kept', partner, tick: event.tick, offer });
        break;
      }
      case 'offerFailed': {
        const offer = offerOf(event.payload);
        const reneger = isRecord(event.payload) ? event.payload.reneger : undefined;
        if (offer === null || typeof reneger !== 'string' || reneger === self) break;
        out.push({ kind: 'broken', partner: reneger as NationId, tick: event.tick, offer });
        break;
      }
      case 'offerExpired': {
        const offer = offerOf(event.payload);
        if (offer !== null && offer.from === self) out.push({ kind: 'ignored', partner: offer.to, tick: event.tick, offer });
        break;
      }
      case 'offerRejected': {
        const offer = offerOf(event.payload);
        if (offer !== null && offer.from === self) out.push({ kind: 'rejected', partner: offer.to, tick: event.tick, offer });
        break;
      }
      case CRISIS_CLOSED_EVENT: {
        const crisis = isRecord(event.payload) ? readCrisis(event.payload.crisis) : null;
        if (crisis === null) break;
        const paid = new Map<NationId, number>();
        for (const p of crisis.pledges) paid.set(p.nationId, (paid.get(p.nationId) ?? 0) + p.amount);
        const iPaid = (paid.get(self) ?? 0) > 0;
        for (const partner of knownNations) {
          const amount = paid.get(partner) ?? 0;
          if (amount > 0) out.push({ kind: 'pledged', partner, tick: event.tick, crisis, amount });
          else out.push({ kind: 'skipped', partner, tick: event.tick, crisis, iPaid });
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}
