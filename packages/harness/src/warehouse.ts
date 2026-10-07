/**
 * Seeded warehouse runs for the determinism check and the catch-up benchmark.
 * Runs in Node and, bundled, inside Chromium (browser-entry.ts), so it must not
 * touch Node APIs.
 */
import type { WarehouseState, WmsAction, WmsLaborMode, WmsPickRule, WmsReleaseMode } from '@warehouse/contracts';
import { WarehouseSession, advanceMany, createWarehouse, hashState, hireCost, doorCost, stepWarehouse } from '@warehouse/sim';

const RULES: readonly WmsPickRule[] = ['priority', 'cutoff', 'nearest'];
const RELEASES: readonly WmsReleaseMode[] = ['waves', 'continuous', 'manual'];
const LABOR: readonly WmsLaborMode[] = ['fixed', 'balance'];
/** Wave intervals the Plan offers (W9): 30 minutes, an hour, two hours. */
const WAVES: readonly number[] = [120, 240, 480];

/** The scripted player's action this tick, if any. Integer decisions only, so it is identical everywhere. */
function scriptedAction(s: WarehouseState): WmsAction | null {
  const w = s.wms;
  const open = w.orders.filter((o) => o.status !== 'SHIPPED' && o.status !== 'CANCELLED');
  const pick = (k: number): (typeof open)[number] | undefined => open[k % Math.max(1, open.length)];
  const t = s.tick;
  if (t % 480 === 240) {
    const k = Math.floor(t / 480);
    return { action: 'policy', policy: { pick: RULES[k % 3] ?? 'priority', release: RELEASES[(k >> 1) % 3] ?? 'waves', pickers: 4 + (k % 4), waveTicks: WAVES[(k >> 2) % 3] ?? 240, labor: LABOR[k % 2] ?? 'fixed' } };
  }
  if (t % 160 === 80) {
    const k = Math.floor(t / 160);
    return { action: 'role', worker: k % 4 === 0 ? 0 : 1 + (k % w.workers.length), role: k % 3 === 0 ? 'receive' : 'pick' };
  }
  if (t % 240 === 120 && (hireCost(w.workers.length) ?? Number.POSITIVE_INFINITY) <= s.cash) return { action: 'hire', role: t % 480 === 120 ? 'pick' : 'receive' };
  if (t % 960 === 600 && (doorCost(w.doors) ?? Number.POSITIVE_INFINITY) <= s.cash) return { action: 'door' };
  if (t % 200 === 100) return { action: 'release', orders: open.filter((o) => o.status === 'NEW').map((o) => o.no).slice(0, 5) };
  if (t % 40 === 20) {
    const o = pick(Math.floor(t / 40));
    if (o !== undefined) return { action: 'priority', order: o.no, priority: ((Math.floor(t / 40) % 3) + 1) as 1 | 2 | 3 };
  }
  if (t % 96 === 48) {
    const o = pick(Math.floor(t / 96));
    if (o !== undefined) return { action: o.status === 'ON HOLD' ? 'unhold' : 'hold', order: o.no };
  }
  if (t % 64 === 32) {
    const target = open.flatMap((o) => o.lines.filter((l) => l.status === 'ALLOCATED').map((l) => ({ o, l })))[0];
    const picker = w.workers.filter((p) => p.role === 'pick')[Math.floor(t / 64) % 3];
    if (target !== undefined && picker !== undefined) return { action: 'assign', picker: picker.id, order: target.o.no, line: target.l.no };
  }
  if (t % 300 === 150) {
    const o = pick(Math.floor(t / 300));
    if (o !== undefined) return { action: 'expedite', order: o.no };
  }
  if (t % 700 === 350) {
    const o = pick(Math.floor(t / 700));
    if (o !== undefined) return { action: 'cancelLine', order: o.no, line: 1 };
  }
  return null;
}

/**
 * A scripted player that uses every WMS action: changes the plan every two
 * minutes, hires and opens doors when it can afford them, releases orders,
 * changes priorities, holds and releases, assigns pickers, expedites and
 * cancels lines, moves workers between picking and receiving and switches
 * the balance plan and the wave interval (W9). Some are refused (a plan with no change, nothing to release,
 * not enough cash), which is part of the test.
 */
export function scriptedWarehouse(seed: number, ticks: number): WarehouseState {
  // Every third seed starts with $5,000 (a test fixture), so purchases differ between seeds from the first tick.
  const session = new WarehouseSession({ ...createWarehouse({ seed }), cash: seed % 3 === 0 ? 500_000 : 0 });
  for (let i = 0; i < ticks; i++) {
    const s = session.state;
    const action = scriptedAction(s);
    if (action !== null && !(action.action === 'release' && action.orders.length === 0)) session.submit({ tick: s.tick, type: 'wms', payload: action });
    session.advance(1);
  }
  // Then an hour away, caught up quietly (P4).
  return advanceMany(session.state, 4 * 3600);
}

/** One state hash per seed. */
export function hashWarehouseSeeds(firstSeed: number, seeds: number, ticks: number): string[] {
  const hashes: string[] = [];
  for (let seed = firstSeed; seed < firstSeed + seeds; seed++) hashes.push(hashState(scriptedWarehouse(seed, ticks)));
  return hashes;
}

/** Milliseconds to catch up `ticks` ticks of a busy warehouse, `runs` times. */
export function benchWarehouseCatchUp(ticks: number, runs: number, now: () => number): number[] {
  const busy = busyWarehouse();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const started = now();
    advanceMany(busy, ticks);
    times.push(now() - started);
  }
  return times;
}

/** A busy warehouse reached by ordinary commands: the most workers, the most doors, an hour in. The benchmark's starting point. */
export function busyWarehouse(): WarehouseState {
  let s: WarehouseState = { ...createWarehouse({ seed: 11 }), cash: 10 ** 12 };
  for (let i = 0; i < 20; i++) {
    const payload: WmsAction = hireCost(s.wms.workers.length) !== null ? { action: 'hire', role: i % 3 === 2 ? 'receive' : 'pick' } : { action: 'door' };
    s = stepWarehouse(s, [{ tick: s.tick, type: 'wms', payload }]).state;
  }
  return advanceMany(s, 3600 * 4);
}
