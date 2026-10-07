import type { WarehouseState, WarehouseView, WmsView } from '@warehouse/contracts';
import { dayAt, minuteOfDay } from './clock.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';
import { balanceIn } from './wms/policy.ts';
import { wmsView } from './wms/view.ts';

/**
 * The WMS's screens for each WMS object, built once: between WMS steps the
 * state shares its WMS (step.ts), so the View is reused, with only what moves
 * with the tick (the wave and balance countdowns, the dock schedule's current slot)
 * worked out again. A cache of a pure function, so the result is the same
 * either way.
 */
const built = new WeakMap<WarehouseState['wms'], { tick: number; view: WmsView }>();

function wmsViewFor(state: WarehouseState): WmsView {
  const hit = built.get(state.wms);
  if (hit !== undefined && hit.tick === state.tick) return hit.view;
  if (hit !== undefined && state.tick - hit.tick < T.wmsStepTicks.value && Math.floor(hit.tick / T.wmsApptSlotTicks.value) === Math.floor(state.tick / T.wmsApptSlotTicks.value)) {
    return { ...hit.view, nextWaveIn: Math.max(0, state.wms.nextWaveAt - state.tick), needs: { ...hit.view.needs, nextBalanceIn: balanceIn(state.tick) } };
  }
  const view = wmsView(state.wms, state.tick);
  built.set(state.wms, { tick: state.tick, view });
  return view;
}

/** What the interface reads (S6, P5): the warehouse, its clock and the WMS's screens. */
export function warehouseView(state: WarehouseState): WarehouseView {
  return {
    tick: state.tick,
    tickMs: T.tickMs.value,
    cash: state.cash,
    clock: { day: dayAt(state.tick), minute: minuteOfDay(state.tick), ticksPerMinute: T.wmsMinuteTicks.value, startMinute: T.wmsDayStartMinute.value },
    offlineCapMinutes: T.offlineCapMinutes.value,
    wms: wmsViewFor(state),
  };
}
