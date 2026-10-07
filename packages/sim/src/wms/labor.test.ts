import { describe, expect, it } from 'vitest';
import type { WmsLine, WmsOrder, WmsStock } from '@warehouse/contracts';
import { warehouseCommandProblem } from '../commands.ts';
import { hashState } from '../hash.ts';
import { createWarehouse } from '../state.ts';
import { advanceMany, step } from '../step.ts';
import { WAREHOUSE_TUNABLES } from '../tunables.ts';
import { wmsAction } from './actions.ts';
import { createWms } from './generate.ts';
import { crewNeeds, shortSide, waveChoices } from './policy.ts';
import { cloneWms, wmsStep, type MWms } from './tick.ts';
import { eventText, wmsView } from './view.ts';

/**
 * Labour and waves (decision record W9): moving a worker between picking and
 * receiving, the balance plan that moves people to where the work waits, and
 * the wave interval.
 */

const T = WAREHOUSE_TUNABLES;
const STEP = T.wmsStepTicks.value;
const BALANCE = T.wmsBalanceTicks.value;

function line(no: number, sku: number, ordered: number): WmsLine {
  return { no, sku, bin: sku * 37, ordered, allocated: 0, picked: 0, short: 0, status: 'OPEN' };
}

function order(no: number, lines: WmsLine[]): WmsOrder {
  return { no, dest: 0, customer: 0, priority: 3, wave: 0, status: 'NEW', lines, shipBy: 100_000, created: 0, next: 0, late: false, held: null, closed: 0, expedited: false };
}

/** A quiet WMS with `orders` orders of four 20-unit lines each and plenty of stock, all released at the first step; no trucks. */
function busy(orders: number): MWms {
  const base = createWms({ seed: 1, tick: 0 });
  const inventory: WmsStock[] = base.inventory.map((s) => ({ ...s, bin: s.sku * 37, onHand: 10_000, allocated: 0 }));
  const list = Array.from({ length: orders }, (_, i) => order(20_000 + i, [line(1, i % 16, 20), line(2, (i + 3) % 16, 20), line(3, (i + 7) % 16, 20), line(4, (i + 11) % 16, 20)]));
  return cloneWms({ ...base, orders: list, inventory, events: [], nextOrderAt: 1e9, nextWaveAt: 0, nextReplenAt: 1e9, nextCountAt: 1e9 });
}

const need = (people: number, waiting: number, idle = 0): { people: number; waiting: number; idle: number } => ({ people, waiting, idle });

describe('where the work is (W9)', () => {
  it('a side is short when it has at least the gap more tasks waiting a head, and the other side can spare someone', () => {
    const gap = T.wmsBalanceGap.value;
    expect(shortSide(need(6, 6 * gap), need(3, 0))).toBe('pick');
    expect(shortSide(need(6, 6 * gap - 1), need(3, 0))).toBeNull();
    expect(shortSide(need(6, 12), need(3, 3 * (2 + gap)))).toBe('receive');
    expect(shortSide(need(6, 0), need(3, 0))).toBeNull();
    // Each side keeps one person.
    expect(shortSide(need(8, 80), need(1, 0))).toBeNull();
    expect(shortSide(need(1, 0), need(8, 80))).toBeNull();
  });

  it('counts the tasks lined up but not started, and the open ones ready to start', () => {
    const w = busy(10);
    wmsStep(w, 0);
    const needs = crewNeeds(w, STEP);
    const pickers = w.workers.filter((p) => p.role === 'pick');
    expect(needs.pick.people).toBe(pickers.length);
    expect(needs.pick.waiting).toBe(40 - pickers.filter((p) => p.task > 0).length);
    expect(needs.receive).toEqual({ people: w.workers.length - pickers.length, idle: w.workers.length - pickers.length, waiting: 0 });
    expect(needs.short).toBe('pick');
    expect(needs.nextBalanceIn).toBe(BALANCE - STEP);
    expect(wmsView(w, STEP).needs).toEqual(needs);
  });
});

describe('moving a worker (W9)', () => {
  it('moves the worker named: its tasks wait for someone else, the split follows, and MOVE is logged with the work waiting', () => {
    const w = busy(10);
    wmsStep(w, 0);
    const picker = w.workers.find((p) => p.role === 'pick' && p.queue.length > 0);
    if (picker === undefined) throw new Error('no busy picker');
    const held = [picker.task, ...picker.queue];
    const waiting = crewNeeds(w, STEP).receive.waiting;
    const r = wmsAction(w, { action: 'role', worker: picker.id, role: 'receive' }, STEP, 0);
    expect(r).toEqual({ ok: true, order: 0, cents: 0 });
    expect(picker.role).toBe('receive');
    expect(picker.task).toBe(0);
    expect(picker.queue).toEqual([]);
    for (const no of held) expect(w.tasks.find((t) => t.no === no)?.status).toBe('OPEN');
    expect(w.policy.pickers).toBe(T.wmsStartPickers.value - 1);
    const e = w.events.at(-1);
    expect(e).toMatchObject({ code: 'MOVE', picker: picker.id, line: 2, qty: waiting, of: 0 });
    if (e !== undefined) expect(eventText(e).detail).toBe(`to receiving, ${waiting} tasks waiting`);
  });

  it('worker 0 lets the WMS choose: someone with nothing in hand first, the highest number on a tie', () => {
    const w = busy(10);
    wmsStep(w, 0);
    expect(wmsAction(w, { action: 'role', worker: 0, role: 'pick' }, STEP, 0).ok).toBe(true);
    const crew = T.wmsStartPickers.value + T.wmsStartReceivers.value;
    expect(w.workers.find((p) => p.id === crew)?.role).toBe('pick');
    expect(w.policy.pickers).toBe(T.wmsStartPickers.value + 1);
  });

  it('refuses a worker already in the role, an unknown one, and taking the last person off a side', () => {
    const w = busy(2);
    expect(wmsAction(w, { action: 'role', worker: 1, role: 'pick' }, 0, 0)).toEqual({ ok: false, reason: 'Already picking' });
    expect(wmsAction(w, { action: 'role', worker: 99, role: 'pick' }, 0, 0)).toEqual({ ok: false, reason: 'No such worker' });
    const receivers = w.workers.filter((p) => p.role === 'receive');
    for (const p of receivers.slice(1)) expect(wmsAction(w, { action: 'role', worker: p.id, role: 'pick' }, 0, 0).ok).toBe(true);
    expect(wmsAction(w, { action: 'role', worker: 0, role: 'pick' }, 0, 0)).toEqual({ ok: false, reason: 'Someone has to keep receiving' });
  });

  it('is a command like any WMS action, shape-checked from outside', () => {
    expect(warehouseCommandProblem({ tick: 0, type: 'wms', payload: { action: 'role', worker: 0, role: 'pick' } })).toBeNull();
    expect(warehouseCommandProblem({ tick: 0, type: 'wms', payload: { action: 'role', worker: -1, role: 'pick' } })).toBe('bad move');
    expect(warehouseCommandProblem({ tick: 0, type: 'wms', payload: { action: 'role', worker: 2, role: 'pack' } })).toBe('bad move');
    const r = step(createWarehouse({ seed: 3 }), [{ tick: 0, type: 'wms', payload: { action: 'role', worker: 1, role: 'receive' } }]);
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'wms', payload: { action: 'role', order: 0, cents: 0 } }));
    expect(r.state.wms.workers[0]?.role).toBe('receive');
  });
});

describe('the balance plan (W9)', () => {
  it('moves one person a look to the side that is behind, and none under the fixed plan', () => {
    const fixed = busy(10);
    const balanced = busy(10);
    balanced.policy = { ...balanced.policy, labor: 'balance' };
    for (let tick = 0; tick <= BALANCE; tick += STEP) {
      wmsStep(fixed, tick);
      wmsStep(balanced, tick);
    }
    expect(fixed.workers.filter((p) => p.role === 'pick')).toHaveLength(T.wmsStartPickers.value);
    expect(fixed.events.some((e) => e.code === 'MOVE')).toBe(false);
    // Tick 0 is a look too: the backlog was already there.
    const moves = balanced.events.filter((e) => e.code === 'MOVE');
    expect(moves).toHaveLength(2);
    expect(moves.map((e) => e.tick)).toEqual([0, BALANCE]);
    for (const e of moves) expect(e).toMatchObject({ line: 1, of: 1 });
    expect(balanced.policy.pickers).toBe(T.wmsStartPickers.value + 2);
    const e = moves[0];
    if (e !== undefined) expect(eventText(e).detail).toMatch(/^to picking, \d+ tasks waiting \(balance\)$/);
  });

  it('moves people back when the dock gets busy, and never takes the last person off a side', () => {
    const w = busy(40);
    w.policy = { ...w.policy, labor: 'balance' };
    let tick = 0;
    for (; tick < BALANCE * 12; tick += STEP) wmsStep(w, tick);
    expect(w.workers.filter((p) => p.role === 'receive')).toHaveLength(1);
    // A big truck docks: its lines are work only receivers can do.
    w.nextReplenAt = tick;
    for (let i = 0; i < 1200 && !w.events.some((e) => e.code === 'MOVE' && e.line === 2); i++, tick += STEP) {
      for (const s of w.inventory) s.onHand = Math.min(s.onHand, 5);
      wmsStep(w, tick);
    }
    expect(w.events.some((e) => e.code === 'MOVE' && e.line === 2 && e.of === 1)).toBe(true);
  });

  it('plays the same stepped one tick at a time or caught up at once', () => {
    const start = createWarehouse({ seed: 12 });
    const r = step(start, [{ tick: 0, type: 'wms', payload: { action: 'policy', policy: { ...start.wms.policy, labor: 'balance' } } }]);
    let stepped = r.state;
    for (let i = 0; i < 2000; i++) stepped = step(stepped, []).state;
    expect(hashState(advanceMany(r.state, 2000))).toBe(hashState(stepped));
  });
});

describe('the wave interval (W9)', () => {
  it('offers the shortest, the default and the longest, and refuses anything else', () => {
    expect(waveChoices()).toEqual([T.wmsWaveMinTicks.value, T.wmsWaveTicks.value, T.wmsWaveMaxTicks.value]);
    const w = busy(1);
    expect(wmsAction(w, { action: 'policy', policy: { ...w.policy, waveTicks: 100 } }, 0, 0)).toEqual({ ok: false, reason: 'Unknown wave interval' });
    expect(warehouseCommandProblem({ tick: 0, type: 'wms', payload: { action: 'policy', policy: { ...w.policy, waveTicks: 1.5 } } })).toBe('bad plan');
  });

  it('a shorter interval brings the next wave forward and waves then go out that often; a longer one leaves the next where it is', () => {
    const w = busy(0);
    w.nextWaveAt = 200;
    const short = T.wmsWaveMinTicks.value;
    expect(wmsAction(w, { action: 'policy', policy: { ...w.policy, waveTicks: short } }, 40, 0).ok).toBe(true);
    expect(w.nextWaveAt).toBe(Math.min(200, 40 + short));
    expect(eventText(w.events.at(-1) ?? w.events[0]!).detail).toBe(`Waves every ${short / T.wmsMinuteTicks.value} min`);
    wmsStep(w, w.nextWaveAt);
    const at = w.nextWaveAt;
    expect(wmsAction(w, { action: 'policy', policy: { ...w.policy, waveTicks: T.wmsWaveMaxTicks.value } }, at - 8, 0).ok).toBe(true);
    expect(w.nextWaveAt).toBe(at);
    expect(wmsAction(w, { action: 'policy', policy: { ...w.policy, labor: 'balance' } }, at, 0).ok).toBe(true);
    expect(eventText(w.events.at(-1) ?? w.events[0]!).detail).toBe('Labour: Balance by need');
  });

  it('a timed wave goes out every interval the plan sets', () => {
    const w = busy(0);
    w.policy = { ...w.policy, waveTicks: T.wmsWaveMaxTicks.value };
    wmsStep(w, 0);
    expect(w.nextWaveAt).toBe(T.wmsWaveMaxTicks.value);
  });
});
