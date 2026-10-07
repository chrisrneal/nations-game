import { describe, expect, it } from 'vitest';
import type { WmsLine, WmsOrder, WmsPo, WmsState, WmsStock } from '@warehouse/contracts';
import { hashState } from '../hash.ts';
import { createWarehouse } from '../state.ts';
import { advanceMany, step } from '../step.ts';
import { WAREHOUSE_TUNABLES } from '../tunables.ts';
import { warehouseCommandProblem } from '../commands.ts';
import { binPlace, travelBays } from './catalog.ts';
import { wmsAction } from './actions.ts';
import { createWms } from './generate.ts';
import { defaultPolicy } from './policy.ts';
import { cloneWms, walkTicks, wmsStep, type MWms } from './tick.ts';
import { eventText, wmsView } from './view.ts';

const T = WAREHOUSE_TUNABLES;
const STEP = T.wmsStepTicks.value;

function withTunables<R>(values: Partial<Record<keyof typeof T, number>>, fn: () => R): R {
  const table = T as unknown as Record<string, { value: number }>;
  const before = Object.keys(values).map((id) => [id, table[id]?.value ?? 0] as const);
  for (const [id, v] of Object.entries(values)) (table[id] as { value: number }).value = v as number;
  try {
    return fn();
  } finally {
    for (const [id, v] of before) (table[id] as { value: number }).value = v;
  }
}

/** A line of `ordered` units of SKU `sku` in bin `bin`. */
function line(no: number, sku: number, ordered: number, bin = sku * 37): WmsLine {
  return { no, sku, bin, ordered, allocated: 0, picked: 0, short: 0, status: 'OPEN' };
}

function order(no: number, lines: WmsLine[], extra: Partial<WmsOrder> = {}): WmsOrder {
  return { no, dest: 0, customer: 0, priority: 3, wave: 0, status: 'NEW', lines, shipBy: 100_000, created: 0, next: 0, late: false, held: null, closed: 0, expedited: false, ...extra };
}

/** A quiet WMS: these orders and stock (each SKU in bin 37 x SKU), no arrivals or replenishment, the first wave due now. */
function wms(orders: WmsOrder[], onHand: Record<number, number>, extra: Partial<WmsState> = {}): MWms {
  const base = createWms({ seed: 1, tick: 0 });
  const inventory: WmsStock[] = base.inventory.map((s) => ({ ...s, bin: s.sku * 37, onHand: onHand[s.sku] ?? 0, allocated: 0 }));
  return cloneWms({ ...base, orders, inventory, events: [], nextOrderAt: 1e9, nextWaveAt: 0, nextReplenAt: 1e9, nextCountAt: 1e9, ...extra });
}

/** The order a worker is working on; 0 for none. */
function orderOf(w: MWms, worker: MWms['workers'][number] | undefined): number {
  return w.tasks.find((t) => t.no === worker?.task)?.ref ?? 0;
}

const CREW = T.wmsStartPickers.value + T.wmsStartReceivers.value;

function run(w: MWms, from: number, steps: number): number {
  let tick = from;
  for (let i = 0; i < steps; i++) {
    wmsStep(w, tick);
    tick += STEP;
  }
  return tick;
}

describe('walking between bins (RULES 8, W7)', () => {
  it('bins sit in four aisles of 20 bays; the pick-and-drop point is at the front of aisle A', () => {
    expect(binPlace(0)).toEqual({ aisle: 0, bay: 1 });
    expect(binPlace(8)).toEqual({ aisle: 0, bay: 2 });
    expect(binPlace(159)).toEqual({ aisle: 0, bay: 20 });
    expect(binPlace(160)).toEqual({ aisle: 1, bay: 1 });
    expect(binPlace(-1)).toEqual({ aisle: 0, bay: 0 });
  });

  it('down one aisle is the bays between; to another aisle is out to the front, across and in', () => {
    expect(travelBays(0, 0)).toBe(0);
    expect(travelBays(8, 80)).toBe(9);
    expect(travelBays(-1, 80)).toBe(11);
    // A-10 to C-05: out 10 bays, across two aisles (3 bays each), in 5.
    expect(travelBays(72, 2 * 160 + 32)).toBe(10 + 6 + 5);
    expect(travelBays(2 * 160 + 32, 72)).toBe(21);
  });

  it('a picker walks to the line’s bin before it picks: the walk is in its state and the view', () => {
    const w = withTunables({ wmsShortPickChanceBp: 0, wmsWalkTicksPerBay: 2 }, () => {
      const m = wms([order(1, [line(1, 0, 4, 80)])], { 0: 10 });
      wmsStep(m, 0);
      const p = m.workers[0];
      expect(p).toMatchObject({ at: 80, walk: walkTicks(-1, 80), progress: 0 });
      expect(orderOf(m, p)).toBe(1);
      expect(walkTicks(-1, 80)).toBe(22);
      const v = wmsView(m, 1);
      expect(v.workers[0]).toMatchObject({ state: 'walking', at: 80, aisle: 0, bay: 11, walk: 22, pct: 0 });
      expect(v.workers[0]?.task).toMatchObject({ kind: 'PICK', order: 1, ref: 'O-1/L1', where: 'A-11-1A', qty: 4, done: 0, priority: 3 });
      // 22 ticks of walking take 6 steps (whole seconds); no unit is picked meanwhile.
      run(m, STEP, 6);
      expect(m.workers[0]?.walk).toBe(0);
      expect(m.workers[0]?.progress).toBe(0);
      expect(m.workers[0]?.stats.walking).toBe(6 * STEP);
      run(m, 7 * STEP, 1);
      expect(m.workers[0]?.progress).toBeGreaterThan(0);
      expect(m.workers[0]?.stats.busy).toBe(STEP);
      return m;
    });
    expect(w.orders[0]?.lines[0]?.status).toBe('PICKING');
  });
});

describe('the pick order (RULES 8, W7)', () => {
  const orders = (): WmsOrder[] => [
    order(1, [line(1, 0, 5, 150)], { priority: 3, shipBy: 50 }),
    order(2, [line(1, 1, 5, 9)], { priority: 1, shipBy: 900 }),
    order(3, [line(1, 2, 5, 300)], { priority: 2, shipBy: 800 }),
  ];
  const first = (pick: 'priority' | 'cutoff' | 'nearest'): number[] => {
    const w = wms(orders(), { 0: 9, 1: 9, 2: 9 });
    w.policy = { ...w.policy, pick };
    w.workers = w.workers.slice(0, 1);
    w.workers[0] = { ...w.workers[0], at: 160 } as MWms['workers'][number];
    wmsStep(w, 0);
    return w.workers.map((p) => orderOf(w, p));
  };

  it('priority first takes the P1; cutoff first the earliest ship-by; nearest bin the shortest walk', () => {
    expect(first('priority')).toEqual([2]);
    expect(first('cutoff')).toEqual([1]);
    // From B-01 (bin 160): bin 9 (A-02) is 1 + 3 + 2 = 6 bays, bin 300 (B-18) 17, bin 150 (A-19) 23.
    expect(first('nearest')).toEqual([2]);
    // From B-19 (bin 308), bin 300 is the next bay.
    const w = wms(orders(), { 0: 9, 1: 9, 2: 9 });
    w.policy = { ...w.policy, pick: 'nearest' };
    w.workers = w.workers.slice(0, 1);
    w.workers[0] = { ...w.workers[0], at: 308 } as MWms['workers'][number];
    wmsStep(w, 0);
    expect(orderOf(w, w.workers[0])).toBe(3);
    // Its queue goes on from where it will stand: from bin 300 (B-18), bin 9 (A-02) is 18 + 3 + 2 bays, bin 150 (A-19) 18 + 3 + 19.
    expect(w.workers[0]?.queue.map((no) => w.tasks.find((t) => t.no === no)?.ref)).toEqual([2, 1]);
  });

  it('stock goes to the most urgent order first, whatever its number', () => {
    const w = wms([order(1, [line(1, 0, 6)], { priority: 3 }), order(2, [line(1, 0, 6)], { priority: 1 })], { 0: 6 });
    wmsStep(w, 0);
    expect(w.orders.map((o) => o.lines[0]?.allocated)).toEqual([0, 6]);
    expect(w.orders.map((o) => o.status)).toEqual(['BACKORDER', 'PICKING']);
  });

  it('with a backlog, nearest bin picks more lines in five minutes than priority first: less walking', () => {
    const lines = (pick: 'priority' | 'nearest'): number =>
      withTunables({ wmsShortPickChanceBp: 0 }, () => {
        const backlog = Array.from({ length: 40 }, (_, i) => order(i + 1, [line(1, i % 16, 6), line(2, (i * 7 + 3) % 16, 6)], { priority: ((i % 3) + 1) as 1 | 2 | 3 }));
        const w = wms(backlog, Object.fromEntries(Array.from({ length: 16 }, (_, k) => [k, 999])));
        w.policy = { ...w.policy, pick };
        w.workers = w.workers.slice(0, 2);
        run(w, 0, 300);
        return w.stats.linesPicked;
      });
    expect(lines('nearest')).toBeGreaterThan(lines('priority'));
  });
});

describe('release (RULES 8, W7)', () => {
  it('continuous releases each NEW order the step it arrives; manual never releases on its own', () => {
    const cont = wms([order(1, [line(1, 0, 4)])], { 0: 10 }, { nextWaveAt: 1e9 });
    cont.policy = { ...cont.policy, release: 'continuous' };
    wmsStep(cont, 0);
    expect(cont.orders[0]?.wave).toBe(1);
    const manual = wms([order(1, [line(1, 0, 4)])], { 0: 10 });
    manual.policy = { ...manual.policy, release: 'manual' };
    run(manual, 0, 600);
    expect(manual.orders[0]?.status).toBe('NEW');
    expect(wmsAction(manual, { action: 'release', orders: [1] }, 600 * STEP, 0).ok).toBe(true);
    expect(manual.orders[0]?.status).toBe('RELEASED');
  });

  it('back to timed waves, the next wave is a full interval away', () => {
    const w = wms([], {}, { nextWaveAt: 0 });
    w.policy = { ...w.policy, release: 'manual' };
    expect(wmsAction(w, { action: 'policy', policy: { ...w.policy, release: 'waves' } }, 1000, 0).ok).toBe(true);
    expect(w.nextWaveAt).toBe(1000 + T.wmsWaveTicks.value);
  });
});

describe('the plan as a command (RULES 8, W7)', () => {
  it('moving people between picking and receiving changes roles, highest ids first, and frees the work they leave', () => {
    const w = wms([order(1, [line(1, 0, 4), line(2, 1, 4)])], { 0: 10, 1: 10 });
    const po: WmsPo = { no: 50_001, supplier: 0, status: 'RECEIVING', lines: [{ no: 1, sku: 0, bin: 0, expected: 500, received: 0, damaged: 0, short: 0, status: 'OPEN' }], created: 0, appt: 0, arrive: 0, arrived: 1, door: 1, closed: 0, late: false };
    w.pos = [cloneWms({ ...createWms({ seed: 1, tick: 0 }), pos: [po] }).pos[0] as MWms['pos'][number]];
    w.tasks.push({ no: 99, kind: 'RECEIVE', ref: 50_001, line: 1, sku: 0, bin: -1, qty: 500, done: 0, status: 'OPEN', worker: 0, created: 0, started: 0, finished: 0 });
    run(w, 0, 3);
    expect(w.workers.slice(0, 2).map((p) => orderOf(w, p))).toEqual([1, 1]);
    const counter = w.workers.find((p) => p.task === 99);
    expect(counter?.role).toBe('receive');
    expect(w.pos[0]?.lines[0]?.status).toBe('RECEIVING');
    // One picker: workers 2-6 move to receiving; the line worker 2 was picking waits again.
    expect(wmsAction(w, { action: 'policy', policy: { ...w.policy, pickers: 1 } }, 3 * STEP, 0).ok).toBe(true);
    expect(w.workers.map((p) => p.role)).toEqual(['pick', ...Array.from({ length: CREW - 1 }, () => 'receive')]);
    expect(w.orders[0]?.lines[1]).toMatchObject({ status: 'ALLOCATED', picked: 0 });
    expect(w.workers[1]).toMatchObject({ task: 0, queue: [] });
    // Back to eight pickers: the highest-numbered receivers move (the one counting the PO line among them), so W02 stays receiving; the line starts again.
    expect(wmsAction(w, { action: 'policy', policy: { ...w.policy, pickers: CREW - 1 } }, 4 * STEP, 0).ok).toBe(true);
    expect(w.workers.map((p) => p.role)).toEqual(['pick', 'receive', ...Array.from({ length: CREW - 2 }, () => 'pick')]);
    expect(w.pos[0]?.lines[0]).toMatchObject({ status: 'OPEN', received: 0 });
    expect(w.tasks.find((t) => t.no === 99)).toMatchObject({ status: 'OPEN', worker: 0, done: 0 });
    expect(w.events.filter((e) => e.code === 'PLAN').map((e) => eventText(e).detail)).toEqual([`Crew: 1 picking, ${CREW - 1} receiving`, `Crew: ${CREW - 1} picking, 1 receiving`]);
  });

  it('refuses a plan with no one receiving or picking, an unknown rule, or no change', () => {
    const w = wms([], {});
    const p = defaultPolicy();
    expect(wmsAction(w, { action: 'policy', policy: { ...p, pickers: 0 } }, 0, 0)).toEqual({ ok: false, reason: `Pickers must be 1 to ${CREW - 1}` });
    expect(wmsAction(w, { action: 'policy', policy: { ...p, pickers: CREW } }, 0, 0).ok).toBe(false);
    expect(wmsAction(w, { action: 'policy', policy: { ...p, pick: 'random' as never } }, 0, 0).ok).toBe(false);
    expect(wmsAction(w, { action: 'policy', policy: p }, 0, 0)).toEqual({ ok: false, reason: 'No change to the plan' });
    expect(w.events).toEqual([]);
  });

  it('logs one PLAN line per setting changed, in words', () => {
    const w = wms([], {});
    wmsAction(w, { action: 'policy', policy: { ...defaultPolicy(), pick: 'nearest', release: 'continuous' } }, 0, 0);
    expect(w.events.map((e) => eventText(e).detail)).toEqual(['Pick order: Nearest bin', 'Release: Continuous']);
  });

  it('goes through the step and the command check like any WMS action; saved state replays exactly', () => {
    const plan = { pick: 'cutoff', release: 'continuous', pickers: 7 } as const;
    expect(warehouseCommandProblem({ tick: 0, type: 'wms', payload: { action: 'policy', policy: plan } })).toBeNull();
    expect(warehouseCommandProblem({ tick: 0, type: 'wms', payload: { action: 'policy', policy: { ...plan, pickers: 1.5 } } })).toBe('bad plan');
    expect(warehouseCommandProblem({ tick: 0, type: 'wms', payload: { action: 'policy' } })).toBe('bad plan');
    const start = createWarehouse({ seed: 6 });
    const r = step(start, [{ tick: 0, type: 'wms', payload: { action: 'policy', policy: plan } }]);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'wms', payload: { action: 'policy', order: 0, cents: 0 } }));
    expect(r.state.wms.policy).toEqual(plan);
    expect(r.state.wms.workers.filter((p) => p.role === 'pick')).toHaveLength(7);
    expect(r.state.wms.workers.filter((p) => p.role === 'receive')).toHaveLength(CREW - 7);
    let stepped = r.state;
    for (let i = 0; i < 400; i++) stepped = step(stepped, []).state;
    expect(hashState(advanceMany(r.state, 400))).toBe(hashState(stepped));
    const v = wmsView(stepped.wms, stepped.tick);
    expect(v.policy).toEqual(plan);
    expect(v.crew).toBe(CREW);
    expect(v.layout).toEqual({ aisles: 4, bays: 20, aisleGap: 3, doors: T.wmsDoors.value });
    expect(v.workers.filter((p) => p.role === 'receive')).toHaveLength(CREW - 7);
  });
});
