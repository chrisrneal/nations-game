import type { WarehouseCommand, WarehouseEvent, WarehouseState, Levels } from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';
import { createWarehouse } from './state.ts';
import { step } from './step.ts';
import { orderMilliAt, derive, backlogCapMilliFor, pickingMilliAt, upgradeCost, stageCapMilliAt } from './rules.ts';
import { warehouseView, estimate } from './view.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';

/** The backlog (RULES 3): new orders queue for the pickers, who pick them into staging at their own rate, a unit of stock each. */

function run(state: WarehouseState, ticks: number, commands: (s: WarehouseState) => WarehouseCommand[] = () => []): { state: WarehouseState; events: WarehouseEvent[] } {
  const events: WarehouseEvent[] = [];
  let current = state;
  for (let i = 0; i < ticks; i++) {
    const result = step(current, commands(current));
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

/** A state with fields replaced, for setting up a case (tests only). */
const tweak = (s: WarehouseState, patch: Partial<WarehouseState>): WarehouseState => ({ ...s, ...patch });
const withLevels = (s: WarehouseState, levels: Partial<Levels>): WarehouseState => tweak(s, { levels: { ...s.levels, ...levels } });
/** A warehouse built by buying upgrades (so the docks exist), with `cash` cents left over. */
function built(seed: number, buys: Partial<Levels>): WarehouseState {
  let s = tweak(createWarehouse({ seed }), { cash: 10 ** 12 });
  for (const [upgrade, times] of Object.entries(buys) as [keyof Levels, number][]) {
    for (let i = 0; i < times; i++) s = step(s, [{ tick: s.tick, type: 'buy', payload: { upgrade } }]).state;
  }
  return s;
}
/** No docks loading: one dock stuck in a long turnaround, so only the line and the staging move. */
const noLoading = (s: WarehouseState): WarehouseState => tweak(s, { docks: s.docks.map((g) => ({ ...g, turn: 100_000, turnMax: 100_000 })) });

describe('the picking line (RULES 3)', () => {
  it('a new warehouse has an empty line, Picking lanes at level 0 and no extra lane open', () => {
    const s = createWarehouse({ seed: 1 });
    expect(s.backlog).toBe(0);
    expect(s.pickRush).toBe(0);
    expect(s.levels.picking).toBe(0);
  });

  it('picking clears 2.4 a second at level 0, ahead of the 1.6 arriving: no line forms while the staging has room', () => {
    expect(pickingMilliAt(0, 0)).toBe(600);
    const s = noLoading(tweak(createWarehouse({ seed: 1 }), { staged: 0 }));
    const { state } = run(s, 40);
    expect(state.backlog).toBe(0);
    expect(state.staged).toBe(40 * 400);
  });

  it('when arrivals outrun picking the line grows by the difference and the staging fills at picking speed', () => {
    // Sales level 5: 1.6 x 1.35^5 = 7.17 a second arrive; picking clears 2.4.
    const s = noLoading(tweak(withLevels(createWarehouse({ seed: 1 }), { sales: 5 }), { staged: 0 }));
    const arrive = orderMilliAt(5);
    expect(arrive).toBe(1792);
    const { state } = run(s, 10);
    expect(state.staged).toBe(10 * 600);
    expect(state.backlog).toBe(10 * (arrive - 600));
  });

  it('customers will not wait behind a backlog longer than 30 s of picking: the rest cancel', () => {
    const cap = backlogCapMilliFor(pickingMilliAt(0, 0));
    expect(cap).toBe(72_000); // 2.4 a second x 30 s = 72 orders
    const s = noLoading(tweak(withLevels(createWarehouse({ seed: 1 }), { sales: 5 }), { staged: 0, backlog: cap - 500 }));
    const { state } = run(s, 1);
    // 1.792 arrive, 0.5 fit, then picking clears 0.6 from the head.
    expect(state.backlog).toBe(cap - 600);
    expect(state.run.missed).toBe(1792 - 500);
  });

  it('a full staging holds the backlog: picking stops and the line backs up', () => {
    const s0 = createWarehouse({ seed: 1 });
    const full = stageCapMilliAt(0);
    const s = noLoading(tweak(s0, { staged: full, backlog: 0 }));
    const { state } = run(s, 10);
    expect(state.staged).toBe(full);
    expect(state.backlog).toBe(10 * 400);
    expect(state.run.missed).toBe(0);
  });

  it('a tap opens an extra lane: 2.5 s of rush, 5 s at most, clearing 2.5x', () => {
    const s = noLoading(tweak(withLevels(createWarehouse({ seed: 1 }), { sales: 5 }), { staged: 0, backlog: 50_000 }));
    const tapped = step(s, [{ tick: s.tick, type: 'tapPick', payload: {} }]).state;
    expect(tapped.pickRush).toBe(T.rushTicksPerTap.value - 1);
    expect(tapped.staged).toBe(1500); // 600 x 2.5
    expect(tapped.run.taps).toBe(1);
    const thrice = step(s, [0, 1, 2].map(() => ({ tick: s.tick, type: 'tapPick' as const, payload: {} }))).state;
    expect(thrice.pickRush).toBe(T.rushMaxTicks.value - 1);
    const after = run(tapped, T.rushTicksPerTap.value).state;
    expect(after.pickRush).toBe(0);
    expect(after.staged).toBe(1500 * T.rushTicksPerTap.value + 600);
  });

  it('All hands opens the extra lane too', () => {
    const s = noLoading(tweak(withLevels(createWarehouse({ seed: 1 }), { sales: 5, docks: 2 }), { staged: 0, backlog: 50_000 }));
    const { state } = run(s, 1, (cur) => [{ tick: cur.tick, type: 'boost', payload: { boost: 'allHands' } }]);
    expect(state.staged).toBe(1500);
  });

  it('export paperwork (Cross-border) and customs (Overseas) each slow picking to 95%', () => {
    expect(pickingMilliAt(0, 4)).toBe(600);
    expect(pickingMilliAt(0, 5)).toBe(570);
    expect(pickingMilliAt(0, 6)).toBe(541); // 600 x 0.95 x 0.95, floored at each step
    expect(pickingMilliAt(3, 0)).toBe(2025); // 600 x 1.5^3
  });

  it('More pickers costs $25, then x1.8 a level, and shows its speed now and next', () => {
    expect(upgradeCost('picking', 0)).toBe(2500);
    expect(upgradeCost('picking', 3)).toBe(14_580);
    const view = warehouseView(createWarehouse({ seed: 1 }));
    const lanes = view.upgrades.find((u) => u.id === 'picking');
    expect(lanes).toMatchObject({ name: 'More pickers', level: 0, cost: 2500, unit: 'ordersPerSec', now: 2400, next: 3600 });
  });

  it('hiring pickers lengthens the backlog customers will wait behind', () => {
    const s = tweak(createWarehouse({ seed: 1 }), { cash: 100_000 });
    const after = step(s, [{ tick: 0, type: 'buy', payload: { upgrade: 'picking' } }]).state;
    expect(after.levels.picking).toBe(1);
    expect(derive(after).backlogCapMilli).toBe(900 * 120);
  });

  it('cross-dock orders go straight to staging: they skip picking and the shelves', () => {
    const s0 = createWarehouse({ seed: 1, site: 2 });
    const g = s0.docks[0];
    if (g === undefined) throw new Error('no dock');
    const s = tweak(s0, { staged: 0, backlog: 0, docks: [{ ...g, loaded: 9600, timer: 30 }] });
    const after = step(s, []).state;
    // 0.4 arrive and are cleared; the truck boards them, leaves full and sends 2 back.
    expect(after.backlog).toBe(0);
    expect(after.staged).toBe(2000);
  });

  it('the view shows the line, its cap, the rate, the wait and the extra lane', () => {
    const s = tweak(withLevels(createWarehouse({ seed: 1 }), { sales: 5 }), { backlog: 12_000, pickRush: 3 });
    const v = warehouseView(s).picking;
    expect(v).toEqual({ backlog: 12_000, cap: 72_000, ratePerTick: 1500, baseRatePerTick: 600, rushed: true, waitTicks: 8, slowBp: 10_000 });
  });
});

describe('the bottleneck names the picking line (RULES 8)', () => {
  it('orders beyond what picking clears: orders pile up at picking, fixed by More pickers', () => {
    const s = withLevels(createWarehouse({ seed: 1 }), { sales: 6, receiving: 6, docks: 4, loading: 10, truck: 1 });
    const est = estimate(s);
    expect(est.bottleneck).toEqual({ kind: 'picking', text: 'Orders are piling up at picking.', fix: ['picking'] });
    // Throughput is picking's 2.4 a second.
    expect(est.ordersPerSec).toBe(2400);
    const boosts = warehouseView(s).boosts;
    expect(boosts.find((b) => b.helps)?.id).toBe('allHands');
  });

  it('enough pickers and the backlog is no longer the bottleneck', () => {
    const s = withLevels(createWarehouse({ seed: 1 }), { sales: 6, picking: 6, receiving: 6, docks: 4, loading: 10, truck: 1 });
    expect(estimate(s).bottleneck.kind).not.toBe('picking');
  });

  it('the estimate matches a measured warehouse held back by picking within 5%', () => {
    const s = built(3, { sales: 6, docks: 2, loading: 10, truck: 1, picking: 1, receiving: 4 });
    expect(s.docks).toHaveLength(3);
    expect(estimate(s).bottleneck.kind).toBe('picking');
    const warm = run(s, 2400).state;
    const end = run(warm, 4800).state;
    const measured = ((end.run.earned - warm.run.earned) / 4800) * 4;
    const est = estimate(s).incomePerSec;
    expect(Math.abs(measured - est) / est).toBeLessThan(0.05);
  });
});
