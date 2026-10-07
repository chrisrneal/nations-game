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
 * The WMS view for React, replaced only when the WMS has stepped since the
 * last update (once a second at 1x, at most once an update, four times a
 * second, at higher speeds, W9), so the WMS screens never re-render every
 * tick (P7); unchanged rows skip even that (`rowSignature`).
 */
export function useWms(store: WarehouseStore): WmsLive | null {
  const [live, setLive] = useState<WmsLive | null>(null);
  useEffect(() => {
    let rev = Number.NaN;
    // The clock's shape never changes in a game: one object, so memoised rows that take it do not re-render for it.
    let time: ClockShape | null = null;
    return store.onFrame((update) => {
      const view = update.view;
      if (view.wms.rev === rev) return;
      rev = view.wms.rev;
      const c = view.clock;
      if (time === null || time.ticksPerMinute !== c.ticksPerMinute || time.startMinute !== c.startMinute) time = { ticksPerMinute: c.ticksPerMinute, startMinute: c.startMinute };
      setLive({ wms: view.wms, tick: view.tick, tickMs: view.tickMs, cash: view.cash, time, day: c.day });
    });
  }, [store]);
  return live;
}
