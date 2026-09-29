import type { Crisis, CrisisKind, CrisisResult, Event, NationId, NationView, Pledge, TradeOffer } from '@nations/contracts';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The name players see for a crisis appeal, e.g. "climate relief". */
export function crisisLabel(kind: CrisisKind): string {
  return `${kind} relief`;
}

/** Open crisis appeals this nation has not answered yet and may still answer this tick. */
export function openAppeals(view: NationView): readonly Crisis[] {
  return view.crises.open.filter((c) => c.answers[view.selfId] === undefined && view.tick > c.openedTick && view.tick <= c.deadlineTick);
}

/**
 * Share of the nations with a share that paid into the most recent locked
 * crisis of this kind (any kind if none), 0-100, or null before the first.
 * Public: every crisis card lists contributors and free-riders (RULES 4.3).
 */
export function lastPaidPct(view: NationView, kind: CrisisKind): number | null {
  const recent = view.crises.recent;
  const last = [...recent].reverse().find((r) => r.kind === kind) ?? recent[recent.length - 1];
  if (last === undefined) return null;
  const total = last.contributors.length + last.freeRiders.length;
  return total === 0 ? null : Math.floor((last.contributors.length * 100) / total);
}

/** What one event meant for this nation's relationships. */
export type Observation =
  | { readonly kind: 'kept'; readonly partner: NationId; readonly tick: number; readonly offer: TradeOffer }
  | { readonly kind: 'broken'; readonly partner: NationId; readonly tick: number; readonly offer: TradeOffer }
  | { readonly kind: 'ignored'; readonly partner: NationId; readonly tick: number; readonly offer: TradeOffer }
  | { readonly kind: 'rejected'; readonly partner: NationId; readonly tick: number; readonly offer: TradeOffer }
  | { readonly kind: 'pledged'; readonly partner: NationId; readonly tick: number; readonly crisis: CrisisResult }
  | { readonly kind: 'skipped'; readonly partner: NationId; readonly tick: number; readonly crisis: CrisisResult; readonly iPaid: boolean }
  | { readonly kind: 'brokePledge'; readonly partner: NationId; readonly tick: number; readonly pledge: Pledge };

function offerOf(payload: unknown): TradeOffer | null {
  if (!isRecord(payload) || !isRecord(payload.offer)) return null;
  return payload.offer as unknown as TradeOffer;
}

/**
 * Turns the events a nation may see into observations about partners. Events
 * it may not see are dropped here even if a caller passes them in.
 */
export function observe(self: NationId, events: readonly Event[]): Observation[] {
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
      case 'crisisLocked': {
        // Public: who paid at least their minimum share, and who had a share and did not.
        const result = isRecord(event.payload) ? (event.payload.result as CrisisResult | undefined) : undefined;
        if (result === undefined || !Array.isArray(result.contributors)) break;
        const iPaid = result.contributors.includes(self);
        for (const partner of result.contributors) if (partner !== self) out.push({ kind: 'pledged', partner, tick: event.tick, crisis: result });
        for (const partner of result.freeRiders) if (partner !== self) out.push({ kind: 'skipped', partner, tick: event.tick, crisis: result, iPaid });
        break;
      }
      case 'pledgeBroken': {
        // A promise to the world, withdrawn or unpaid (RULES 4.4). Public.
        const pledge = isRecord(event.payload) ? (event.payload.pledge as Pledge | undefined) : undefined;
        if (pledge !== undefined && pledge.nationId !== self) out.push({ kind: 'brokePledge', partner: pledge.nationId, tick: event.tick, pledge });
        break;
      }
      default:
        break;
    }
  }
  return out;
}
