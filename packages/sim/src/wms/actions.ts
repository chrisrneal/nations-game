import type { WmsAction, WmsOrderStatus } from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { isClosed } from './catalog.ts';
import { addDoor, doorCost, hire, hireCost, policyProblem, setPolicy } from './policy.ts';
import { freeWorker, lineTask, newTask, releaseTask, startTask } from './tasks.ts';
import { findOrder, log, releaseWave, type MLine, type MOrder, type MWms } from './tick.ts';

export type WmsActionResult = { readonly ok: true; readonly order: number; readonly cents: number } | { readonly ok: false; readonly reason: string };

/** Statuses an order waits in for a timer, and how long (RULES 4). */
function delayFor(status: WmsOrderStatus): number {
  switch (status) {
    case 'PICKED':
    case 'SHORT':
      return T.wmsPackTicks.value;
    case 'PACKED':
      return T.wmsStageTicks.value;
    case 'STAGED':
      return T.wmsLoadTicks.value;
    case 'LOADED':
      return T.wmsShipTicks.value;
    default:
      return 0;
  }
}

/** Takes the line's pick task off whoever holds it: the line waits again, its partial pick undone; `cancel` cancels the task. */
function freeLine(w: MWms, o: MOrder, line: MLine, tick: number, cancel = false): void {
  const t = lineTask(w, o.no, line.no);
  if (t !== undefined) releaseTask(w, t, tick, cancel);
  if (line.status === 'PICKING') {
    line.status = 'ALLOCATED';
    line.picked = 0;
  }
}

/** Lines a picker is on or could take. */
function pickableLine(line: MLine): boolean {
  return line.status === 'ALLOCATED' || line.status === 'PICKING';
}

/** A line not yet picked: it can still be cancelled. */
function cancellable(line: MLine): boolean {
  return line.status === 'OPEN' || line.status === 'ALLOCATED' || line.status === 'PICKING' || (line.status === 'SHORT' && line.picked === 0);
}

const BEFORE_PICKED: ReadonlySet<WmsOrderStatus> = new Set(['NEW', 'RELEASED', 'ALLOCATED', 'PICKING', 'BACKORDER']);
const TIMED: ReadonlySet<WmsOrderStatus> = new Set(['PICKED', 'SHORT', 'PACKED', 'STAGED', 'LOADED']);

function fail(reason: string): WmsActionResult {
  return { ok: false, reason };
}

/**
 * The player's actions (RULES 8): release a wave of chosen NEW orders,
 * change priority, hold and release from hold, put a picker on a line,
 * cancel a line, expedite an order for cash, set the operating plan (W7),
 * hire a worker and open a dock door (W8). Each logs an event. `cash` is what
 * the player has; anything that costs more is refused.
 */
export function wmsAction(w: MWms, a: WmsAction, tick: number, cash: number): WmsActionResult {
  switch (a.action) {
    case 'policy': {
      const problem = policyProblem(a.policy, w.workers.length);
      if (problem !== null) return fail(problem);
      if (!setPolicy(w, a.policy, tick)) return fail('No change to the plan');
      return { ok: true, order: 0, cents: 0 };
    }
    case 'release': {
      const chosen = a.orders.map((no) => findOrder(w, no)).filter((o): o is MOrder => o !== undefined && o.status === 'NEW');
      if (chosen.length === 0) return fail('No NEW orders chosen');
      releaseWave(w, tick, chosen);
      return { ok: true, order: chosen[0]?.no ?? 0, cents: 0 };
    }
    case 'hire': {
      const cost = hireCost(w.workers.length);
      if (cost === null) return fail('The crew is full');
      if (a.role !== 'pick' && a.role !== 'receive') return fail('Unknown role');
      if (cash < cost) return fail('Not enough cash');
      hire(w, a.role, tick);
      return { ok: true, order: 0, cents: cost };
    }
    case 'door': {
      const cost = doorCost(w.doors);
      if (cost === null) return fail('No room for another door');
      if (cash < cost) return fail('Not enough cash');
      addDoor(w, tick);
      return { ok: true, order: 0, cents: cost };
    }
    default:
      break;
  }
  const o = findOrder(w, a.order);
  if (o === undefined) return fail('No such order');
  if (isClosed(o.status)) return fail(`The order is ${o.status.toLowerCase()}`);
  switch (a.action) {
    case 'priority': {
      if (o.priority === a.priority) return fail(`Already P${a.priority}`);
      o.priority = a.priority;
      log(w, { tick, code: 'PRIO', order: o.no, qty: a.priority });
      return { ok: true, order: o.no, cents: 0 };
    }
    case 'hold': {
      if (o.status === 'ON HOLD') return fail('Already on hold');
      for (const line of o.lines) freeLine(w, o, line, tick);
      o.held = o.status;
      o.status = 'ON HOLD';
      log(w, { tick, code: 'HOLD', order: o.no });
      return { ok: true, order: o.no, cents: 0 };
    }
    case 'unhold': {
      if (o.status !== 'ON HOLD' || o.held === null) return fail('Not on hold');
      const back = o.held === 'PICKING' ? 'ALLOCATED' : o.held;
      o.status = back;
      o.held = null;
      if (TIMED.has(back)) o.next = tick + delayFor(back);
      log(w, { tick, code: 'UNHOLD', order: o.no });
      return { ok: true, order: o.no, cents: 0 };
    }
    case 'assign': {
      const worker = w.workers.find((p) => p.id === a.picker);
      const line = o.lines.find((l) => l.no === a.line);
      if (worker === undefined) return fail('No such worker');
      if (worker.role !== 'pick') return fail('That worker is receiving');
      if (line === undefined) return fail('No such line');
      if (o.status !== 'ALLOCATED' && o.status !== 'PICKING') return fail(`The order is ${o.status.toLowerCase()}`);
      if (!pickableLine(line)) return fail(`The line is ${line.status.toLowerCase()}`);
      const t = lineTask(w, o.no, line.no) ?? newTask(w, 'PICK', o.no, line.no, line.sku, line.bin, line.allocated, tick);
      if (worker.task === t.no) return fail('Already on that line');
      // The worker drops what it is on (it waits for someone else), and whoever held this line lets it go.
      freeWorker(w, worker, tick);
      releaseTask(w, t, tick);
      log(w, { tick, code: 'ASSIGN', order: o.no, line: line.no, sku: line.sku, picker: worker.id });
      startTask(w, worker, t, tick);
      return { ok: true, order: o.no, cents: 0 };
    }
    case 'cancelLine': {
      const line = o.lines.find((l) => l.no === a.line);
      if (line === undefined) return fail('No such line');
      if (!BEFORE_PICKED.has(o.status === 'ON HOLD' ? (o.held ?? o.status) : o.status)) return fail('The order is already picked');
      if (!cancellable(line)) return fail(`The line is ${line.status.toLowerCase()}`);
      freeLine(w, o, line, tick, true);
      const stock = w.inventory[line.sku];
      if (stock !== undefined) stock.allocated = Math.max(0, stock.allocated - line.allocated);
      line.status = 'CANCELLED';
      line.allocated = 0;
      line.picked = 0;
      line.short = 0;
      log(w, { tick, code: 'CANCEL', order: o.no, line: line.no, sku: line.sku, qty: line.ordered });
      if (o.lines.every((l) => l.status === 'CANCELLED')) {
        o.status = 'CANCELLED';
        o.held = null;
        o.closed = tick;
        o.next = 0;
        log(w, { tick, code: 'CANCEL', order: o.no });
      }
      return { ok: true, order: o.no, cents: 0 };
    }
    case 'expedite': {
      if (o.expedited) return fail('Already expedited');
      if (o.late) return fail('Too late: the cutoff has passed');
      const cost = T.wmsExpediteCostCents.value;
      if (cash < cost) return fail('Not enough cash');
      o.expedited = true;
      o.priority = 1;
      o.shipBy += T.wmsExpediteLeadTicks.value;
      log(w, { tick, code: 'EXPEDITE', order: o.no, qty: cost });
      return { ok: true, order: o.no, cents: cost };
    }
  }
}
