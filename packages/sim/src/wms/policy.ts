import type { WmsAction, WmsLaborMode, WmsNeeds, WmsPickRule, WmsPolicy, WmsReleaseMode, WmsRole, WmsWorker } from '@warehouse/contracts';
import { grow } from '../math.ts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { log, type MWms } from './mutable.ts';
import { freeWorker, waitingByRole } from './tasks.ts';

/** The choices on the Plan page (W7), in the order shown; an event's `qty` is the index into these. */
export const WMS_PICK_RULES: readonly WmsPickRule[] = ['priority', 'cutoff', 'nearest'];
export const WMS_RELEASE_MODES: readonly WmsReleaseMode[] = ['waves', 'continuous', 'manual'];
export const WMS_LABOR_MODES: readonly WmsLaborMode[] = ['fixed', 'balance'];

/** The wave intervals the Plan offers (W9), in ticks: shortest, the default, longest. */
export function waveChoices(): readonly number[] {
  return [T.wmsWaveMinTicks.value, T.wmsWaveTicks.value, T.wmsWaveMaxTicks.value];
}

/** A new worker (W8): no task, at the pick-and-drop point by the dock, a blank record. */
export function newWorker(id: number, role: WmsRole): WmsWorker {
  return { id, role, task: 0, queue: [], progress: 0, at: -1, walk: 0, stats: { tasks: 0, units: 0, busy: 0, walking: 0, idle: 0 } };
}

/** A new warehouse's plan: the WMS's own rules, `wmsStartPickers` picking and the rest receiving. */
export function defaultPolicy(): WmsPolicy {
  return { pick: 'priority', release: 'waves', pickers: T.wmsStartPickers.value, waveTicks: T.wmsWaveTicks.value, labor: 'fixed' };
}

/** A plan change with the settings it leaves out kept as they are (W9: older commands name only three). */
export function fullPolicy(p: Extract<WmsAction, { action: 'policy' }>['policy'], was: WmsPolicy): WmsPolicy {
  return { pick: p.pick, release: p.release, pickers: p.pickers, waveTicks: p.waveTicks ?? was.waveTicks, labor: p.labor ?? was.labor };
}

/** Why a plan cannot be used with a crew of `crew`, or null (W7). */
export function policyProblem(p: WmsPolicy, crew: number): string | null {
  if (!WMS_PICK_RULES.includes(p.pick)) return 'Unknown pick order';
  if (!WMS_RELEASE_MODES.includes(p.release)) return 'Unknown release mode';
  if (!Number.isInteger(p.pickers) || p.pickers < 1 || p.pickers > crew - 1) return `Pickers must be 1 to ${crew - 1}`;
  if (!waveChoices().includes(p.waveTicks)) return 'Unknown wave interval';
  if (!WMS_LABOR_MODES.includes(p.labor)) return 'Unknown labour plan';
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
    if (p.release === 'waves') w.nextWaveAt = tick + p.waveTicks;
    changed = true;
  }
  if (p.pickers !== was.pickers) {
    setPickers(w, p.pickers, tick);
    log(w, { tick, code: 'PLAN', line: 3, qty: p.pickers, of: w.workers.length });
    changed = true;
  }
  if (p.waveTicks !== was.waveTicks) {
    log(w, { tick, code: 'PLAN', line: 4, qty: p.waveTicks });
    // A shorter interval brings the next wave forward; a longer one leaves it where it is.
    w.nextWaveAt = Math.min(w.nextWaveAt, tick + p.waveTicks);
    changed = true;
  }
  if (p.labor !== was.labor) {
    log(w, { tick, code: 'PLAN', line: 5, qty: WMS_LABOR_MODES.indexOf(p.labor) });
    changed = true;
  }
  w.policy = { pick: p.pick, release: p.release, pickers: w.workers.filter((x) => x.role === 'pick').length, waveTicks: p.waveTicks, labor: p.labor };
  return changed;
}

/** Each side of the crew and the work waiting for it (W9). */
export function crewNeeds(w: MWms, tick: number): WmsNeeds {
  const waiting = waitingByRole(w);
  const side = (role: WmsRole): WmsNeeds['pick'] => {
    const crew = w.workers.filter((p) => p.role === role);
    return { people: crew.length, idle: crew.filter((p) => p.task === 0).length, waiting: waiting[role] };
  };
  const pick = side('pick');
  const receive = side('receive');
  return { pick, receive, short: shortSide(pick, receive), nextBalanceIn: balanceIn(tick) };
}

/** Ticks until the balance plan next looks at the work (W9). */
export function balanceIn(tick: number): number {
  return T.wmsBalanceTicks.value - (tick % T.wmsBalanceTicks.value);
}

/**
 * The side that needs one more person (W9), or null: the one with at least
 * `wmsBalanceGap` more tasks waiting a head than the other, when the other
 * can spare someone (each side keeps one). Integer maths: a/x - b/y >= g is
 * a*y - b*x >= g*x*y.
 */
export function shortSide(pick: WmsNeeds['pick'], receive: WmsNeeds['receive']): WmsRole | null {
  const gap = T.wmsBalanceGap.value;
  const behind = (a: WmsNeeds['pick'], b: WmsNeeds['pick']): boolean => a.people > 0 && b.people > 1 && a.waiting > 0 && a.waiting * b.people - b.waiting * a.people >= gap * a.people * b.people;
  if (behind(pick, receive)) return 'pick';
  if (behind(receive, pick)) return 'receive';
  return null;
}

/** Who moves off a side (W9): someone with no task first, then whoever has least lined up, the highest number on a tie. */
function whoMoves(w: MWms, from: WmsRole): MWms['workers'][number] | undefined {
  let best: MWms['workers'][number] | undefined;
  let least = Number.POSITIVE_INFINITY;
  for (const p of w.workers) {
    if (p.role !== from) continue;
    const held = (p.task === 0 ? 0 : 1) + p.queue.length;
    if (held <= least) {
      least = held;
      best = p;
    }
  }
  return best;
}

/**
 * Moves a worker to a role (W9): it drops its tasks (they wait for someone
 * else; a line half done starts again), the plan's split follows, and MOVE
 * is logged with the work waiting where it went. Worker 0 lets the WMS choose
 * who. Returns why not, or null.
 */
export function moveWorker(w: MWms, id: number, role: WmsRole, tick: number, auto = false): string | null {
  const from: WmsRole = role === 'pick' ? 'receive' : 'pick';
  const worker = id === 0 ? whoMoves(w, from) : w.workers.find((p) => p.id === id);
  if (worker === undefined) return id === 0 ? `Nobody is ${from === 'pick' ? 'picking' : 'receiving'}` : 'No such worker';
  if (worker.role === role) return `Already ${role === 'pick' ? 'picking' : 'receiving'}`;
  if (w.workers.filter((p) => p.role === from).length <= 1) return `Someone has to keep ${from === 'pick' ? 'picking' : 'receiving'}`;
  const waiting = waitingByRole(w)[role];
  freeWorker(w, worker, tick);
  worker.role = role;
  w.policy = { ...w.policy, pickers: w.workers.filter((p) => p.role === 'pick').length };
  log(w, { tick, code: 'MOVE', picker: worker.id, line: role === 'pick' ? 1 : 2, qty: waiting, of: auto ? 1 : 0 });
  return null;
}

/** The balance plan (W9): every `wmsBalanceTicks` it moves one person to the side that is behind, if one is. */
export function balanceCrew(w: MWms, tick: number): void {
  if (w.policy.labor !== 'balance' || tick % T.wmsBalanceTicks.value >= T.wmsStepTicks.value) return;
  const short = crewNeeds(w, tick).short;
  if (short !== null) moveWorker(w, 0, short, tick, true);
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
