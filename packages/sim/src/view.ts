import type { WarehouseState, WarehouseView } from '@warehouse/contracts';
import { dayAt, minuteOfDay } from './clock.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';
import { wmsView } from './wms/view.ts';

/** What the interface reads (S6, P5): the warehouse, its clock and the WMS's screens. */
export function warehouseView(state: WarehouseState): WarehouseView {
  return {
    tick: state.tick,
    tickMs: T.tickMs.value,
    cash: state.cash,
    clock: { day: dayAt(state.tick), minute: minuteOfDay(state.tick), ticksPerMinute: T.wmsMinuteTicks.value, startMinute: T.wmsDayStartMinute.value },
    offlineCapMinutes: T.offlineCapMinutes.value,
    wms: wmsView(state.wms, state.tick),
  };
}
