import type { WmsEvent, WmsLine, WmsOrder, WmsPo, WmsPoLine, WmsState } from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';

type DeepMutable<V> = { -readonly [K in keyof V]: V[K] extends readonly (infer U)[] ? DeepMutable<U>[] : V[K] extends object ? DeepMutable<V[K]> : V[K] };
export type MWms = DeepMutable<WmsState>;
export type MOrder = DeepMutable<WmsOrder>;
export type MLine = DeepMutable<WmsLine>;
export type MPo = DeepMutable<WmsPo>;
export type MPoLine = DeepMutable<WmsPoLine>;
export type MPicker = DeepMutable<WmsState['pickers'][number]>;

/** A copy the step may change in place (P4). Events are never changed, so they are shared. */
export function cloneWms(w: WmsState): MWms {
  return {
    ...w,
    rng: { ...w.rng },
    orders: w.orders.map((o) => ({ ...o, lines: o.lines.map((l) => ({ ...l })) })),
    inventory: w.inventory.map((s) => ({ ...s })),
    pickers: w.pickers.map((p) => ({ ...p })),
    events: [...w.events],
    stats: { ...w.stats },
    dests: w.dests.map((d) => ({ ...d })),
    recent: [...w.recent],
    pos: w.pos.map((po) => ({ ...po, lines: po.lines.map((l) => ({ ...l })) })),
    receivers: w.receivers.map((r) => ({ ...r })),
    inbound: { ...w.inbound },
    recentIn: [...w.recentIn],
    policy: { ...w.policy },
  };
}

/** Appends to the activity log, keeping the latest `wmsEventsKept`. */
export function log(w: MWms, e: Pick<WmsEvent, 'tick' | 'code'> & Partial<WmsEvent>): void {
  w.events.push({ order: 0, line: 0, sku: -1, qty: 0, of: 0, picker: 0, ...e });
  if (w.events.length > T.wmsEventsKept.value) w.events.splice(0, w.events.length - T.wmsEventsKept.value);
}
