import type { WmsPickRule, WmsPolicy, WmsReleaseMode, WmsRole, WmsWorker } from '@warehouse/contracts';
import { grow } from '../math.ts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { log, type MWms } from './mutable.ts';
import { freeWorker } from './tasks.ts';

/** The choices on the Plan page (W7), in the order shown; an event's `qty` is the index into these. */
export const WMS_PICK_RULES: readonly WmsPickRule[] = ['priority', 'cutoff', 'nearest'];
export const WMS_RELEASE_MODES: readonly WmsReleaseMode[] = ['waves', 'continuous', 'manual'];

/** A new worker (W8): no task, at the pick-and-drop point by the dock, a blank record. */
export function newWorker(id: number, role: WmsRole): WmsWorker {
  return { id, role, task: 0, queue: [], progress: 0, at: -1, walk: 0, stats: { tasks: 0, units: 0, busy: 0, walking: 0, idle: 0 } };
}

/** A new warehouse's plan: the WMS's own rules, `wmsStartPickers` picking and the rest receiving. */
export function defaultPolicy(): WmsPolicy {
  return { pick: 'priority', release: 'waves', pickers: T.wmsStartPickers.value };
}

/** Why a plan cannot be used with a crew of `crew`, or null (W7). */
export function policyProblem(p: WmsPolicy, crew: number): string | null {
  if (!WMS_PICK_RULES.includes(p.pick)) return 'Unknown pick order';
  if (!WMS_RELEASE_MODES.includes(p.release)) return 'Unknown release mode';
  if (!Number.isInteger(p.pickers) || p.pickers < 1 || p.pickers > crew - 1) return `Pickers must be 1 to ${crew - 1}`;
  return null;
}

/**
 * Moves workers between picking and receiving until `pickers` pick (W8): the
 * highest-numbered receivers move to picking, or the highest-numbered pickers
 * to receiving. A worker who moves drops its tasks, which wait for someone
 * else (a line half picked or counted starts again).
 */
function setPickers(w: MWms, pickers: number, tick: number): void {
  const count = (): number => w.workers.filter((p) => p.role === 'pick').length;
  while (count() !== pickers) {
    const from: WmsRole = count() < pickers ? 'receive' : 'pick';
    const worker = [...w.workers].reverse().find((p) => p.role === from);
    if (worker === undefined) return;
    freeWorker(w, worker, tick);
    worker.role = from === 'pick' ? 'receive' : 'pick';
  }
}

/**
 * Sets the operating plan (RULES 8, W7): one PLAN event per setting that
 * changed. The crew split takes effect at once. Returns false if nothing
 * changed; the plan must already be valid (`policyProblem`).
 */
export function setPolicy(w: MWms, p: WmsPolicy, tick: number): boolean {
  const was = w.policy;
  let changed = false;
  if (p.pick !== was.pick) {
    log(w, { tick, code: 'PLAN', line: 1, qty: WMS_PICK_RULES.indexOf(p.pick) });
    changed = true;
  }
  if (p.release !== was.release) {
    log(w, { tick, code: 'PLAN', line: 2, qty: WMS_RELEASE_MODES.indexOf(p.release) });
    // Back to timed waves: the next one goes out a full interval from now.
    if (p.release === 'waves') w.nextWaveAt = tick + T.wmsWaveTicks.value;
    changed = true;
  }
  if (p.pickers !== was.pickers) {
    setPickers(w, p.pickers, tick);
    log(w, { tick, code: 'PLAN', line: 3, qty: p.pickers, of: w.workers.length });
    changed = true;
  }
  w.policy = { pick: p.pick, release: p.release, pickers: p.pickers };
  return changed;
}

/** Cents the next worker costs (RULES 9, W8), or null at the most workers. */
export function hireCost(crew: number): number | null {
  if (crew >= T.wmsMaxCrew.value) return null;
  const hired = Math.max(0, crew - T.wmsStartPickers.value - T.wmsStartReceivers.value);
  return grow(T.wmsHireCostCents.value, T.wmsHireCostGrowthBp.value, hired);
}

/** Cents the next dock door costs (RULES 9, W8), or null at the most doors. */
export function doorCost(doors: number): number | null {
  if (doors >= T.wmsMaxDoors.value) return null;
  return grow(T.wmsDoorCostCents.value, T.wmsDoorCostGrowthBp.value, Math.max(0, doors - T.wmsDoors.value));
}

/** Hires a worker into a role (RULES 9, W8): the next id, at the pick-and-drop point, idle until the WMS gives it tasks. */
export function hire(w: MWms, role: WmsRole, tick: number): void {
  const id = w.workers.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  const worker = newWorker(id, role);
  w.workers.push({ ...worker, queue: [], stats: { ...worker.stats } });
  w.policy = { ...w.policy, pickers: w.workers.filter((p) => p.role === 'pick').length };
  log(w, { tick, code: 'HIRE', picker: id, line: role === 'pick' ? 1 : 2, qty: w.workers.length });
}

/** Opens one more dock door (RULES 9, W8): one more truck a slot, and one more truck received at once. */
export function addDoor(w: MWms, tick: number): void {
  w.doors += 1;
  log(w, { tick, code: 'DOOR', qty: w.doors });
}
