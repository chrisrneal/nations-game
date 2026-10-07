import { describe, expect, it } from 'vitest';
import type { WmsLine, WmsOrder, WmsState, WmsStock } from '@warehouse/contracts';
import { WAREHOUSE_TUNABLES as T } from '../tunables.ts';
import { wmsAction } from './actions.ts';
import { createWms } from './generate.ts';
import { cloneWms, wmsStep, type MWms } from './tick.ts';

const STEP = T.wmsStepTicks.value;
const DEPTH = T.wmsTaskQueue.value;

function line(no: number, sku: number, ordered: number): WmsLine {
  return { no, sku, bin: sku * 37, ordered, allocated: 0, picked: 0, short: 0, status: 'OPEN' };
}

function order(no: number, lines: WmsLine[], extra: Partial<WmsOrder> = {}): WmsOrder {
  return { no, dest: 0, customer: 0, priority: 3, wave: 0, status: 'NEW', lines, shipBy: 100_000, created: 0, next: 0, late: false, held: null, closed: 0, expedited: false, ...extra };
}

/** A quiet WMS with plenty of every SKU: these orders, released at the first step, no arrivals, POs or counts. */
function wms(orders: WmsOrder[], extra: Partial<WmsState> = {}): MWms {
  const base = createWms({ seed: 1, tick: 0 });
  const inventory: WmsStock[] = base.inventory.map((s) => ({ ...s, bin: s.sku * 37, onHand: 999, allocated: 0 }));
  return cloneWms({ ...base, orders, inventory, events: [], nextOrderAt: 1e9, nextWaveAt: 0, nextReplenAt: 1e9, nextCountAt: 1e9, ...extra });
}

function run(w: MWms, from: number, steps: number): number {
  let tick = from;
  for (let i = 0; i < steps; i++) {
    wmsStep(w, tick);
    tick += STEP;
  }
  return tick;
}

/** One-line orders, one per SKU from 0, all P3. */
function many(count: number, extra: Partial<WmsOrder> = {}): WmsOrder[] {
  return Array.from({ length: count }, (_, i) => order(i + 1, [line(1, i % 16, 20)], extra));
}

const pickers = (w: MWms): MWms['workers'] => w.workers.filter((p) => p.role === 'pick');
const refOf = (w: MWms, no: number): number | undefined => w.tasks.find((t) => t.no === no)?.ref;

describe('the WMS creates tasks (RULES 6, W8)', () => {
  it('a PICK task for every line it allocates, with the line’s bin and units', () => {
    const w = wms([order(1, [line(1, 3, 12), line(2, 5, 4)])]);
    wmsStep(w, 0);
    expect(w.tasks.map((t) => [t.kind, t.ref, t.line, t.sku, t.bin, t.qty])).toEqual([
      ['PICK', 1, 1, 3, 3 * 37, 12],
      ['PICK', 1, 2, 5, 5 * 37, 4],
    ]);
    expect(w.nextTaskNo).toBe(3);
  });

  it('a line given no stock gets no task until stock comes', () => {
    const w = wms([order(1, [line(1, 3, 12)])]);
    w.inventory[3]!.onHand = 0;
    run(w, 0, 3);
    expect(w.tasks).toEqual([]);
    w.inventory[3]!.onHand = 50;
    run(w, 3 * STEP, 1);
    expect(w.tasks.map((t) => [t.kind, t.ref])).toEqual([['PICK', 1]]);
  });
});

describe('the WMS assigns tasks (RULES 6, W8)', () => {
  it('lines up to wmsTaskQueue tasks a picker, round by round; the rest wait OPEN', () => {
    const count = pickers(wms([])).length * DEPTH + 4;
    const w = wms(many(count));
    wmsStep(w, 0);
    for (const p of pickers(w)) {
      expect(p.task).toBeGreaterThan(0);
      expect(p.queue).toHaveLength(DEPTH - 1);
    }
    expect(w.tasks.filter((t) => t.status === 'OPEN')).toHaveLength(4);
    // Round by round: the first round's tasks go to pickers 1-6 in turn.
    expect(pickers(w).map((p) => refOf(w, p.task))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(pickers(w).map((p) => refOf(w, p.queue[0] ?? 0))).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it('receivers never get pick tasks, and pickers never receive', () => {
    const w = wms(many(40));
    run(w, 0, 5);
    for (const p of w.workers) {
      for (const no of [p.task, ...p.queue]) {
        const t = w.tasks.find((x) => x.no === no);
        if (t !== undefined) expect(t.kind === 'PICK').toBe(p.role === 'pick');
      }
    }
    expect(w.workers.filter((p) => p.role === 'receive').every((p) => p.task === 0)).toBe(true);
  });

  it('a new P1 goes ahead of a queued P3: the plan is redone and the P1 is lined up at once', () => {
    const count = pickers(wms([])).length * DEPTH;
    const w = wms(many(count));
    wmsStep(w, 0);
    expect(w.tasks.filter((t) => t.status === 'OPEN')).toHaveLength(0);
    w.orders.push(order(99, [line(1, 7, 5)], { priority: 1 }) as MWms['orders'][number]);
    w.nextWaveAt = STEP;
    wmsStep(w, STEP);
    const p1 = w.tasks.find((t) => t.ref === 99);
    expect(p1?.status === 'QUEUED' || p1?.status === 'ACTIVE').toBe(true);
    // Every picker still holds at most its queue; one P3 waits instead.
    for (const p of pickers(w)) expect((p.task === 0 ? 0 : 1) + p.queue.length).toBeLessThanOrEqual(DEPTH);
    expect(w.tasks.filter((t) => t.status === 'OPEN' && t.kind === 'PICK')).toHaveLength(1);
  });

  it('a picker left with nothing takes a share of another’s queue', () => {
    const w = wms(many(3));
    w.workers = w.workers.slice(0, 2);
    wmsStep(w, 0);
    // Picker 1 has tasks 1 and 3, picker 2 task 2.
    expect(w.workers.map((p) => [refOf(w, p.task), p.queue.map((no) => refOf(w, no))])).toEqual([
      [1, [3]],
      [2, []],
    ]);
    // Picker 2 finishes first (it is made to): the next step it gets order 3 from picker 1's queue.
    const t2 = w.tasks.find((t) => t.ref === 2)!;
    w.orders[1]!.lines[0]!.status = 'PICKED';
    w.orders[1]!.lines[0]!.picked = 20;
    t2.status = 'DONE';
    w.workers[1]!.task = 0;
    wmsStep(w, STEP);
    expect(refOf(w, w.workers[1]!.task)).toBe(3);
    expect(w.workers[0]!.queue).toEqual([]);
  });

  it('a held order’s tasks leave the queues and wait; released, they are lined up again', () => {
    const w = wms(many(4));
    w.workers = w.workers.slice(0, 1);
    wmsStep(w, 0);
    const queued = w.workers[0]!.queue.map((no) => refOf(w, no));
    const held = queued[0]!;
    expect(wmsAction(w, { action: 'hold', order: held }, STEP, 0).ok).toBe(true);
    expect(w.tasks.filter((t) => t.ref === held).map((t) => [t.status, t.worker])).toEqual([['OPEN', 0]]);
    run(w, STEP, 2);
    expect(w.workers[0]!.queue.map((no) => refOf(w, no))).not.toContain(held);
    expect(wmsAction(w, { action: 'unhold', order: held }, 3 * STEP, 0).ok).toBe(true);
    run(w, 3 * STEP, 1);
    expect(w.tasks.find((t) => t.ref === held)?.status).toMatch(/QUEUED|ACTIVE/);
  });

  it('a cancelled line’s task is cancelled and leaves the worker', () => {
    const w = wms(many(2));
    w.workers = w.workers.slice(0, 1);
    wmsStep(w, 0);
    expect(wmsAction(w, { action: 'cancelLine', order: 1, line: 1 }, STEP, 0).ok).toBe(true);
    expect(w.tasks.find((t) => t.ref === 1)).toMatchObject({ status: 'CANCELLED', worker: 0, finished: STEP });
    expect(w.workers[0]!.task).toBe(0);
    run(w, STEP, 1);
    expect(refOf(w, w.workers[0]!.task)).toBe(2);
  });
});

describe('the WMS tracks every worker (RULES 6, W8)', () => {
  it('every second of a worker is idle, walking or working; tasks and units add up to what it finished', () => {
    const w = wms(many(30));
    const steps = 400;
    run(w, 0, steps);
    for (const p of w.workers) {
      expect(p.stats.busy + p.stats.walking + p.stats.idle).toBe(steps * STEP);
      const done = w.tasks.filter((t) => t.worker === p.id && t.status === 'DONE');
      // Every finished task it still keeps counts; older ones may have dropped off.
      expect(p.stats.tasks).toBeGreaterThanOrEqual(done.length);
      expect(p.stats.units).toBeGreaterThanOrEqual(done.reduce((n, t) => n + t.done, 0));
    }
    const picked = pickers(w).reduce((n, p) => n + p.stats.tasks, 0);
    expect(picked).toBe(w.stats.linesPicked);
    expect(pickers(w).every((p) => p.stats.busy > 0 && p.stats.walking > 0)).toBe(true);
  });

  it('keeps the latest wmsTasksKept finished tasks', () => {
    const w = wms(many(40));
    run(w, 0, 2000);
    const finished = w.tasks.filter((t) => t.status === 'DONE' || t.status === 'CANCELLED');
    expect(finished.length).toBeLessThanOrEqual(T.wmsTasksKept.value);
  });
});
