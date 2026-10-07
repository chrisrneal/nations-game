import { useEffect, useState } from 'react';
import type { WmsView } from '@warehouse/contracts';
import type { ClockShape } from '../format.ts';
import type { WarehouseStore } from '../store.ts';

export interface WmsLive {
  readonly wms: WmsView;
  readonly tick: number;
  readonly tickMs: number;
  readonly cash: number;
  /** The warehouse clock's shape, for showing any tick as a time of day (W8), and today's number. */
  readonly time: ClockShape;
  readonly day: number;
}

/**
 * The WMS view for React, replaced only when the WMS steps (once a second),
 * so the WMS screens re-render at most once a second instead of every tick
 * (P7); unchanged rows skip even that (`rowSignature`).
 */
export function useWms(store: WarehouseStore): WmsLive | null {
  const [live, setLive] = useState<WmsLive | null>(null);
  useEffect(() => {
    let rev = Number.NaN;
    return store.onFrame((update) => {
      const view = update.view;
      if (view.wms.rev === rev) return;
      rev = view.wms.rev;
      setLive({ wms: view.wms, tick: view.tick, tickMs: view.tickMs, cash: view.cash, time: view.clock, day: view.clock.day });
    });
  }, [store]);
  return live;
}
