import type { WmsRole, WmsTaskKind } from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { travelBays } from './catalog.ts';
import { log, type MLine, type MOrder, type MPo, type MPoLine, type MTask, type MWms, type MWorker } from './mutable.ts';

/**
 * Tasks and the crew (RULES 6, decision record W8). The WMS turns work into
 * tasks: a PICK task for every order line it allocates, a RECEIVE task for
 * every line of a PO that docks, and a PUTAWAY task for every line counted
 * in. Each second it lines up the next tasks for every worker of the right
 * role (pickers pick; receivers receive and put away), by the plan's pick
 * order, and each worker walks to its task and works it. Every worker keeps
 * a record of its tasks, units and time.
 */

/** Live tasks: not yet finished. */
export function isLive(t: MTask): boolean {
  return t.status === 'OPEN' || t.status === 'QUEUED' || t.status === 'ACTIVE';
}

/** The role whose workers do a kind of task. */
export function roleFor(kind: WmsTaskKind): WmsRole {
  return kind === 'PICK' ? 'pick' : 'receive';
}

/** Creates an OPEN task (RULES 6). */
export function newTask(w: MWms, kind: WmsTaskKind, ref: number, line: number, sku: number, bin: number, qty: number, tick: number): MTask {
  const task: MTask = { no: w.nextTaskNo, kind, ref, line, sku, bin, qty, done: 0, status: 'OPEN', worker: 0, created: tick, started: 0, finished: 0 };
  w.nextTaskNo += 1;
  w.tasks.push(task);
  return task;
}

export function findTask(w: MWms, no: number): MTask | undefined {
  if (no === 0) return undefined;
  return w.tasks.find((t) => t.no === no);
}

/** A pick task's order and line. */
export function pickTarget(w: MWms, t: Pick<MTask, 'ref' | 'line'>): { o: MOrder; line: MLine } | undefined {
  const o = w.orders.find((x) => x.no === t.ref);
  const line = o?.lines.find((l) => l.no === t.line);
  return o === undefined || line === undefined ? undefined : { o, line };
}

/** A receive or put-away task's PO and line. */
export function poTarget(w: MWms, t: Pick<MTask, 'ref' | 'line'>): { po: MPo; line: MPoLine } | undefined {
  const po = w.pos.find((x) => x.no === t.ref);
  const line = po?.lines.find((l) => l.no === t.line);
  return po === undefined || line === undefined ? undefined : { po, line };
}

/** The live pick task of an order line, if it has one. */
export function lineTask(w: MWms, order: number, line: number): MTask | undefined {
  return w.tasks.find((t) => t.kind === 'PICK' && t.ref === order && t.line === line && isLive(t));
}

/** Orders and POs by number, so a plan looks each task's line up once (W8). */
interface Index {
  readonly orders: ReadonlyMap<number, MOrder>;
  readonly pos: ReadonlyMap<number, MPo>;
}

function indexOf(w: MWms): Index {
  const orders = new Map<number, MOrder>();
  for (const o of w.orders) orders.set(o.no, o);
  const pos = new Map<number, MPo>();
  for (const po of w.pos) pos.set(po.no, po);
  return { orders, pos };
}

function pickLine(ix: Index, t: Pick<MTask, 'ref' | 'line'>): { o: MOrder; line: MLine } | undefined {
  const o = ix.orders.get(t.ref);
  const line = o?.lines.find((l) => l.no === t.line);
  return o === undefined || line === undefined ? undefined : { o, line };
}

function poLine(ix: Index, t: Pick<MTask, 'ref' | 'line'>): { po: MPo; line: MPoLine } | undefined {
  const po = ix.pos.get(t.ref);
  const line = po?.lines.find((l) => l.no === t.line);
  return po === undefined || line === undefined ? undefined : { po, line };
}

/** Whether a task not yet started can be started now: its line is still waiting for exactly this work. */
function ready(ix: Index, t: MTask): boolean {
  if (t.kind === 'PICK') {
    const target = pickLine(ix, t);
    return target !== undefined && (target.o.status === 'ALLOCATED' || target.o.status === 'PICKING') && target.line.status === 'ALLOCATED';
  }
  const target = poLine(ix, t);
  if (target === undefined) return false;
  return t.kind === 'RECEIVE' ? target.po.status === 'RECEIVING' && target.line.status === 'OPEN' : target.line.status === 'RECEIVED';
}

/** A task that can never be started: its line was cancelled, picked or is gone. */
function dead(ix: Index, t: MTask): boolean {
  if (t.kind === 'PICK') {
    const target = pickLine(ix, t);
    return target === undefined || target.line.status === 'CANCELLED' || target.line.status === 'PICKED' || target.line.status === 'SHORT' || target.line.status === 'OPEN';
  }
  const target = poLine(ix, t);
  if (target === undefined) return true;
  return t.kind === 'RECEIVE' ? target.line.status === 'RECEIVED' || target.line.status === 'STORED' : target.line.status === 'STORED';
}

/** Undoes the live work on a task's line: a line half picked or half counted waits again, its count undone. */
function undoLine(w: MWms, t: MTask): void {
  if (t.kind === 'PICK') {
    const target = pickTarget(w, t);
    if (target !== undefined && target.line.status === 'PICKING') {
      target.line.status = 'ALLOCATED';
      target.line.picked = 0;
    }
  } else if (t.kind === 'RECEIVE') {
    const target = poTarget(w, t);
    if (target !== undefined && target.line.status === 'RECEIVING') {
      target.line.status = 'OPEN';
      target.line.received = 0;
    }
  }
}

/**
 * Takes a task off whoever holds it. Its line's live work is undone, and the
 * task waits again (OPEN), or is CANCELLED when `cancel` is set.
 */
export function releaseTask(w: MWms, t: MTask, tick: number, cancel = false): void {
  for (const worker of w.workers) {
    if (worker.task === t.no) {
      worker.task = 0;
      worker.progress = 0;
      worker.walk = 0;
    }
    const i = worker.queue.indexOf(t.no);
    if (i >= 0) worker.queue.splice(i, 1);
  }
  if (t.status === 'ACTIVE') undoLine(w, t);
  t.worker = 0;
  t.done = 0;
  t.started = 0;
  if (cancel) {
    t.status = 'CANCELLED';
    t.finished = tick;
  } else t.status = 'OPEN';
}

/** A worker drops its active task and its queue (a reassignment, a role change): they wait for someone else. */
export function freeWorker(w: MWms, worker: MWorker, tick: number): void {
  for (const no of [worker.task, ...worker.queue]) {
    const t = findTask(w, no);
    if (t !== undefined && isLive(t)) releaseTask(w, t, tick);
  }
  worker.task = 0;
  worker.queue = [];
  worker.progress = 0;
  worker.walk = 0;
}

/** Ticks a worker standing at bin `from` takes to walk to bin `to` (RULES 6, W7); -1 is the dock and pick-and-drop point. */
export function walkTicks(from: number, to: number): number {
  return travelBays(from, to) * T.wmsWalkTicksPerBay.value;
}

/** Starts a task (RULES 6): the worker walks to its bin, or to the dock to receive; a pick line and its order go to PICKING. */
export function startTask(w: MWms, worker: MWorker, t: MTask, tick: number): void {
  const i = worker.queue.indexOf(t.no);
  if (i >= 0) worker.queue.splice(i, 1);
  worker.task = t.no;
  worker.progress = 0;
  worker.walk = walkTicks(worker.at, t.bin);
  worker.at = t.bin;
  t.status = 'ACTIVE';
  t.worker = worker.id;
  t.started = tick;
  t.done = 0;
  if (t.kind === 'PICK') {
    const target = pickTarget(w, t);
    if (target === undefined) return;
    target.line.status = 'PICKING';
    target.o.status = 'PICKING';
    log(w, { tick, code: 'PICK START', order: target.o.no, line: target.line.no, sku: target.line.sku, qty: target.line.allocated, of: target.line.ordered, picker: worker.id });
  } else if (t.kind === 'RECEIVE') {
    const target = poTarget(w, t);
    if (target !== undefined) target.line.status = 'RECEIVING';
  }
}

/** The worker takes the first task of its queue that can still be worked; the ones that cannot are dropped from it. */
export function startNext(w: MWms, worker: MWorker, tick: number, index?: Index): void {
  if (worker.task !== 0 || worker.queue.length === 0) return;
  const ix = index ?? indexOf(w);
  while (worker.task === 0 && worker.queue.length > 0) {
    const t = findTask(w, worker.queue[0] as number);
    worker.queue.shift();
    if (t === undefined || t.status !== 'QUEUED') continue;
    if (ready(ix, t)) startTask(w, worker, t, tick);
    else {
      t.status = 'OPEN';
      t.worker = 0;
    }
  }
}

/** The worker finished its active task: the record counts it, and it starts the next in its queue. */
export function finishTask(w: MWms, worker: MWorker, t: MTask, tick: number): void {
  t.status = 'DONE';
  t.finished = tick;
  worker.stats.tasks += 1;
  worker.stats.units += t.done;
  worker.task = 0;
  worker.progress = 0;
  startNext(w, worker, tick);
}

/** Most urgent first under the plan's pick order (W7): priority then ship-by, or ship-by then priority; then order number. */
export function urgency(rule: MWms['policy']['pick'], a: Pick<MOrder, 'priority' | 'shipBy' | 'no'>, b: Pick<MOrder, 'priority' | 'shipBy' | 'no'>): number {
  const first = rule === 'cutoff' ? a.shipBy - b.shipBy || a.priority - b.priority : a.priority - b.priority || a.shipBy - b.shipBy;
  return first || a.no - b.no;
}

/** Where a worker will stand once it has worked everything it holds: the bin of its last task. */
function standsAt(w: MWms, worker: MWorker, byNo: ReadonlyMap<number, MTask>): number {
  const last = worker.queue[worker.queue.length - 1] ?? worker.task;
  return last === 0 ? worker.at : (byNo.get(last)?.bin ?? worker.at);
}

/**
 * The WMS's task plan (RULES 6, W8), every step. Tasks whose line is gone,
 * cancelled or done are cancelled. Then, for each role, the plan is redone
 * when tasks wait for a worker and a worker of the role has room in its
 * queue, or (under priority or cutoff first) a waiting pick task is more
 * urgent than one already queued, or when a worker has nothing to do while
 * another has tasks lined up: queued tasks go back to the pool and,
 * round by round, each worker of the role (lowest id first) is given one more
 * task until it holds `wmsTaskQueue` (its active task included). Pick tasks
 * go most urgent first under the plan's pick order, or, under nearest bin,
 * the one with the shortest walk from where the worker will stand (the most
 * urgent breaking a tie). Receive and put-away tasks go oldest first. Last,
 * every worker with no task starts the first of its queue.
 */
export function planTasks(w: MWms, tick: number): void {
  let ix: Index | null = null;
  const pools: Record<WmsRole, MTask[]> = { pick: [], receive: [] };
  for (const t of w.tasks) {
    if (t.status !== 'OPEN') continue;
    ix ??= indexOf(w);
    if (dead(ix, t)) {
      t.status = 'CANCELLED';
      t.finished = tick;
    } else if (ready(ix, t)) pools[roleFor(t.kind)].push(t);
  }
  const rule = w.policy.pick;
  const depth = T.wmsTaskQueue.value;
  for (const role of ['pick', 'receive'] as const) {
    const pool = pools[role];
    const crew = w.workers.filter((p) => p.role === role);
    // A worker with nothing to do while another has tasks lined up: the plan is redone to share them out.
    const unbalanced = crew.some((p) => p.task === 0 && p.queue.length === 0) && crew.some((p) => p.queue.length > 0);
    if (pool.length === 0 && !unbalanced) continue;
    ix ??= indexOf(w);
    const index: Index = ix;
    const byNo = new Map<number, MTask>();
    for (const t of w.tasks) if (t.status === 'QUEUED' || t.status === 'ACTIVE') byNo.set(t.no, t);
    const order = (a: MTask, b: MTask): number => {
      if (a.kind !== 'PICK' || b.kind !== 'PICK') return a.created - b.created || a.no - b.no;
      const oa = index.orders.get(a.ref);
      const ob = index.orders.get(b.ref);
      return (oa !== undefined && ob !== undefined ? urgency(rule, oa, ob) : 0) || a.no - b.no;
    };
    const room = pool.length > 0 && crew.some((p) => (p.task === 0 ? 0 : 1) + p.queue.length < depth);
    let preempt = false;
    if (pool.length > 0 && !room && role === 'pick' && rule !== 'nearest') {
      const best = pool.reduce((x, y) => (order(y, x) < 0 ? y : x));
      preempt = crew.some((p) => p.queue.some((no) => {
        const q = byNo.get(no);
        return q !== undefined && order(best, q) < 0;
      }));
    }
    if (!room && !preempt && !unbalanced) continue;
    for (const worker of crew) {
      for (const no of worker.queue) {
        const t = byNo.get(no);
        if (t === undefined || t.status !== 'QUEUED') continue;
        t.status = 'OPEN';
        t.worker = 0;
        if (ready(index, t)) pool.push(t);
      }
      worker.queue = [];
    }
    pool.sort(order);
    for (let k = 0; k < depth && pool.length > 0; k++) {
      for (const worker of crew) {
        if (pool.length === 0) break;
        if ((worker.task === 0 ? 0 : 1) + worker.queue.length > k) continue;
        let best = 0;
        if (role === 'pick' && rule === 'nearest') {
          const from = standsAt(w, worker, byNo);
          let shortest = Number.POSITIVE_INFINITY;
          pool.forEach((t, i) => {
            const bays = travelBays(from, t.bin);
            if (bays < shortest) {
              shortest = bays;
              best = i;
            }
          });
        }
        const [t] = pool.splice(best, 1) as [MTask];
        t.status = 'QUEUED';
        t.worker = worker.id;
        worker.queue.push(t.no);
        byNo.set(t.no, t);
      }
    }
  }
  for (const worker of w.workers) if (worker.task === 0 && worker.queue.length > 0) startNext(w, worker, tick, ix ?? undefined);
}

/** Drops the oldest finished tasks beyond `wmsTasksKept`. */
export function purgeTasks(w: MWms): void {
  let finished = 0;
  for (const t of w.tasks) if (!isLive(t)) finished += 1;
  let drop = finished - T.wmsTasksKept.value;
  if (drop <= 0) return;
  w.tasks = w.tasks.filter((t) => {
    if (drop > 0 && !isLive(t)) {
      drop -= 1;
      return false;
    }
    return true;
  });
}

/** Tasks waiting for each side of the crew (W9): lined up but not started, or open and ready to start. */
export function waitingByRole(w: MWms): Record<WmsRole, number> {
  const waiting: Record<WmsRole, number> = { pick: 0, receive: 0 };
  let ix: Index | null = null;
  for (const t of w.tasks) {
    if (t.status === 'QUEUED') waiting[roleFor(t.kind)] += 1;
    else if (t.status === 'OPEN') {
      ix ??= indexOf(w);
      if (ready(ix, t)) waiting[roleFor(t.kind)] += 1;
    }
  }
  return waiting;
}
