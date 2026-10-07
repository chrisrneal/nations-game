import type { WarehouseView } from '@warehouse/contracts';
import type { WarehouseUpdate, AwayRecap } from '../platform/index.ts';

/** What React renders from: the view and the recap, replaced only on a structural change. */
export interface Structure {
  readonly view: WarehouseView;
  readonly recap: AwayRecap | null;
}

/**
 * Two update paths (P7). React re-renders the app shell only when its
 * structure changes (a new day, the recap): `getStructure` returns a new
 * object only then. Everything that moves every tick (the clock, cash) is
 * written straight to the DOM by frame listeners, and the WMS screens
 * re-render once a WMS step (useWms).
 */
export class WarehouseStore {
  private latest: WarehouseUpdate | null = null;
  private structure: Structure | null = null;
  private key = '';
  private readonly structureListeners = new Set<() => void>();
  private readonly frameListeners = new Set<(update: WarehouseUpdate) => void>();

  push(update: WarehouseUpdate): void {
    this.latest = update;
    const r = update.recap;
    const key = `${structuralKey(update.view)}|${r === null ? '' : `${r.awayMs}:${r.earned}`}`;
    if (key !== this.key) {
      this.key = key;
      this.structure = { view: update.view, recap: update.recap };
      for (const listener of this.structureListeners) listener();
    }
    for (const listener of this.frameListeners) listener(update);
  }

  /** For useSyncExternalStore. */
  subscribeStructure = (listener: () => void): (() => void) => {
    this.structureListeners.add(listener);
    return () => this.structureListeners.delete(listener);
  };

  getStructure = (): Structure | null => this.structure;

  /** Called on every update, and at once with the latest one. Returns an unsubscribe function. */
  onFrame(listener: (update: WarehouseUpdate) => void): () => void {
    this.frameListeners.add(listener);
    if (this.latest !== null) listener({ ...this.latest, events: [] });
    return () => this.frameListeners.delete(listener);
  }

  get current(): WarehouseUpdate | null {
    return this.latest;
  }
}

/** What React renders from. Anything that changes every tick must stay out of it; the WMS screens follow the WMS's own `rev` (useWms). */
export function structuralKey(view: WarehouseView): string {
  return [view.offlineCapMinutes, view.clock.day].join('|');
}
