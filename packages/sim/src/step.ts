import type { WarehouseCommand, WarehouseEvent, WarehouseState } from '@warehouse/contracts';
import { warehouseCommandProblem } from './commands.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';
import { wmsAction } from './wms/actions.ts';
import { cloneWms, wmsStep, type MWms } from './wms/tick.ts';

/** The step works on a private copy it may change in place (P4). */
interface MState {
  schemaVersion: number;
  tick: number;
  cash: number;
  wms: MWms;
}

function clone(s: WarehouseState): MState {
  return { schemaVersion: s.schemaVersion, tick: s.tick, cash: s.cash, wms: cloneWms(s.wms) };
}

type Sink = WarehouseEvent[] | null;

function cashCap(): number {
  return T.cashCapCents.value;
}

/** Applies one command: a WMS action, paid for from cash when it costs anything (RULES 8). */
function apply(m: MState, command: WarehouseCommand, events: Sink): void {
  const problem = warehouseCommandProblem(command);
  if (problem !== null) {
    events?.push({ tick: m.tick, type: 'rejected', payload: { command: 'wms', reason: problem } });
    return;
  }
  const result = wmsAction(m.wms, command.payload, m.tick, m.cash);
  if (!result.ok) {
    events?.push({ tick: m.tick, type: 'rejected', payload: { command: 'wms', reason: result.reason } });
    return;
  }
  m.cash -= result.cents;
  m.wms.stats.spent += result.cents;
  events?.push({ tick: m.tick, type: 'wms', payload: { action: command.payload.action, order: result.order, cents: result.cents } });
}

/** One tick, in place (RULES 4): the commands, then, every `wmsStepTicks`, a WMS step, whose shipments pay into cash. */
function tickInPlace(m: MState, commands: readonly WarehouseCommand[], events: Sink): void {
  for (const command of commands.slice(0, T.maxCommandsPerTick.value)) apply(m, command, events);
  if (m.tick % T.wmsStepTicks.value === 0) {
    const earned = wmsStep(m.wms, m.tick, events);
    if (earned > 0) m.cash = Math.min(cashCap(), m.cash + earned);
  }
  m.tick += 1;
}

export interface WarehouseStepResult {
  readonly state: WarehouseState;
  readonly events: readonly WarehouseEvent[];
}

/** The whole simulation surface (S1): one tick with the commands stamped for it. */
export function step(state: WarehouseState, commands: readonly WarehouseCommand[]): WarehouseStepResult {
  const m = clone(state);
  const events: WarehouseEvent[] = [];
  tickInPlace(m, commands, events);
  return { state: m, events };
}

/**
 * `ticks` ticks with no commands, copying the state once (P4). Equal to calling
 * `step(state, [])` that many times - tested - but fast enough for a night of
 * offline running. No events: the recap reads the stats instead.
 */
export function advanceMany(state: WarehouseState, ticks: number): WarehouseState {
  const m = clone(state);
  for (let i = 0; i < ticks; i++) tickInPlace(m, [], null);
  return m;
}
