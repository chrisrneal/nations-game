import type { WmsEvent, WmsLine, WmsOrder, WmsPo, WmsPoLine, WmsState, WmsTask, WmsWorker } from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';

type DeepMutable<V> = { -readonly [K in keyof V]: V[K] extends readonly (infer U)[] ? DeepMutable<U>[] : V[K] extends object | null ? DeepMutable<V[K]> : V[K] };
export type MWms = DeepMutable<WmsState>;
export type MOrder = DeepMutable<WmsOrder>;
export type MLine = DeepMutable<WmsLine>;
export type MPo = DeepMutable<WmsPo>;
export type MPoLine = DeepMutable<WmsPoLine>;
export type MWorker = DeepMutable<WmsWorker>;
export type MTask = DeepMutable<WmsTask>;

/** A copy the step may change in place (P4). Events and finished tasks are never changed, so they are shared. */
export function cloneWms(w: WmsState): MWms {
  return {
    ...w,
    rng: { ...w.rng },
    orders: w.orders.map((o) => ({ ...o, lines: o.lines.map((l) => ({ ...l })) })),
    inventory: w.inventory.map((s) => ({ ...s })),
    workers: w.workers.map((p) => ({ ...p, queue: [...p.queue], stats: { ...p.stats } })),
    tasks: w.tasks.map((t) => ({ ...t })),
    // Finished tasks are never changed again, so they are shared, like events.
    history: [...w.history],
    events: [...w.events],
    stats: { ...w.stats },
    today: { ...w.today },
    yesterday: w.yesterday === null ? null : { ...w.yesterday },
    dests: w.dests.map((d) => ({ ...d })),
    recent: [...w.recent],
    pos: w.pos.map((po) => ({ ...po, lines: po.lines.map((l) => ({ ...l })) })),
    shipDoors: w.shipDoors.map((d) => ({ ...d })),
    inbound: { ...w.inbound },
    recentIn: [...w.recentIn],
    recentPay: [...w.recentPay],
    policy: { ...w.policy },
  };
}

/** Appends to the activity log; the step and each command then keep only the latest `wmsEventsKept` (`trimLog`). */
export function log(w: MWms, e: Pick<WmsEvent, 'tick' | 'code'> & Partial<WmsEvent>): void {
  w.events.push({ order: 0, line: 0, sku: -1, qty: 0, of: 0, picker: 0, ...e });
}

/**
 * How far past its limit the log (and the task history) may grow before it is
 * cut back (W10): cutting a few hundred entries every warehouse minute was a
 * tenth of the catch-up time. Not a balance number: the View shows the latest
 * `wmsEventsKept` whatever State holds.
 */
export const WMS_TRIM_SLACK = 100;

/** Keeps the latest `wmsEventsKept` events, cut back once `WMS_TRIM_SLACK` more have come in. */
export function trimLog(w: MWms): void {
  if (w.events.length > T.wmsEventsKept.value + WMS_TRIM_SLACK) w.events.splice(0, w.events.length - T.wmsEventsKept.value);
}
