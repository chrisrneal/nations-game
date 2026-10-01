import type { AirportView } from '@nations/contracts';
import type { AirportUpdate } from '../platform/index.ts';

/**
 * Two update paths (P7). React re-renders only when the airport's structure
 * changes (a plane arrives or leaves, a level changes, an upgrade becomes
 * affordable): `getStructure` returns a new object only then. Everything that
 * moves every tick (fill bars, timers, cash) is written straight to the DOM by
 * frame listeners, with CSS transitions one tick long to interpolate.
 */
export class AirportStore {
  private latest: AirportUpdate | null = null;
  private structure: AirportView | null = null;
  private key = '';
  private readonly structureListeners = new Set<() => void>();
  private readonly frameListeners = new Set<(update: AirportUpdate) => void>();

  push(update: AirportUpdate): void {
    this.latest = update;
    const key = structuralKey(update.view);
    if (key !== this.key) {
      this.key = key;
      this.structure = update.view;
      for (const listener of this.structureListeners) listener();
    }
    for (const listener of this.frameListeners) listener(update);
  }

  /** For useSyncExternalStore. */
  subscribeStructure = (listener: () => void): (() => void) => {
    this.structureListeners.add(listener);
    return () => this.structureListeners.delete(listener);
  };

  getStructure = (): AirportView | null => this.structure;

  /** Called on every update, and at once with the latest one. Returns an unsubscribe function. */
  onFrame(listener: (update: AirportUpdate) => void): () => void {
    this.frameListeners.add(listener);
    if (this.latest !== null) listener({ ...this.latest, events: [] });
    return () => this.frameListeners.delete(listener);
  }

  get current(): AirportUpdate | null {
    return this.latest;
  }
}

/** What React renders from. Anything that changes every tick must stay out of it. */
export function structuralKey(view: AirportView): string {
  return [
    view.city.index,
    view.slots.owned,
    view.slots.claimable,
    view.route,
    view.fare,
    view.incomePerSec,
    view.offlineCapMinutes,
    view.bottleneck.kind,
    view.gates.map((g) => `${g.plane}${g.turn > 0 ? 't' : 'b'}${g.charter ? 'c' : ''}`).join(','),
    view.upgrades.map((u) => `${u.level}${u.affordable ? 'a' : ''}${u.locked === null ? '' : 'l'}`).join(','),
  ].join('|');
}
