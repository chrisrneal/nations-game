import type { WarehouseCommand, WarehouseEvent, WarehouseState, BoostId, DockState } from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';
import { createWarehouse, READY_BOOSTS } from './state.ts';
import { advanceMany, step } from './step.ts';
import { warehouseView, estimate } from './view.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';

/** The boosts of RULES 15: free, timed, each on its own recharge. */

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

const boost = (s: WarehouseState, id: BoostId): WarehouseCommand => ({ tick: s.tick, type: 'boost', payload: { boost: id } });
const use = (s: WarehouseState, id: BoostId): { state: WarehouseState; events: readonly WarehouseEvent[] } => step(s, [boost(s, id)]);
const dock = (s: WarehouseState, i = 0): DockState => s.docks[i] as DockState;
/** A warehouse with every boost unlocked: three docks and a contract (tests only; play changes state only by commands). */
function unlocked(seed = 1): WarehouseState {
  const s = createWarehouse({ seed });
  const g = dock(s);
  return {
    ...s,
    levels: { ...s.levels, docks: T.allHandsMinDocks.value - 1, truck: T.surgeMinContract.value, contract: T.surgeMinContract.value },
    docks: Array.from({ length: T.allHandsMinDocks.value }, (_, i) => ({ ...g, truck: 1 + i })),
    nextTruck: 1 + T.allHandsMinDocks.value,
  };
}

describe('boosts (RULES 15)', () => {
  it('a new warehouse opens with every boost ready', () => {
    expect(createWarehouse({ seed: 1 }).boosts).toEqual(READY_BOOSTS);
    for (const b of Object.values(READY_BOOSTS)) expect(b).toEqual({ left: 0, recharge: 0 });
  });

  it('using a boost starts its effect and its recharge, and says so', () => {
    const { state, events } = use(createWarehouse({ seed: 1 }), 'flashSale');
    // The step that used it counts as its first tick.
    expect(state.boosts.flashSale).toEqual({ left: T.flashSaleTicks.value - 1, recharge: T.flashSaleRechargeTicks.value - 1 });
    expect(events).toContainEqual({ tick: 0, type: 'boosted', payload: { boost: 'flashSale', ticks: T.flashSaleTicks.value } });
  });

  it('runs for its length, then recharges, then can be used again', () => {
    let s = use(createWarehouse({ seed: 1 }), 'flashSale').state;
    s = advanceMany(s, T.flashSaleTicks.value - 1);
    expect(s.boosts.flashSale.left).toBe(0);
    expect(s.boosts.flashSale.recharge).toBe(T.flashSaleRechargeTicks.value - T.flashSaleTicks.value);
    const early = use(s, 'flashSale');
    expect(early.events).toContainEqual(expect.objectContaining({ type: 'rejected', payload: { command: 'boost', reason: 'Recharging' } }));
    expect(early.state.boosts.flashSale.left).toBe(0);
    s = advanceMany(s, T.flashSaleRechargeTicks.value - T.flashSaleTicks.value);
    expect(s.boosts.flashSale).toEqual({ left: 0, recharge: 0 });
    expect(use(s, 'flashSale').state.boosts.flashSale.left).toBe(T.flashSaleTicks.value - 1);
  });

  it('cannot be used while it is running', () => {
    const s = use(createWarehouse({ seed: 1 }), 'flashSale').state;
    const again = use(s, 'flashSale');
    expect(again.events).toContainEqual(expect.objectContaining({ type: 'rejected', payload: { command: 'boost', reason: 'Already running' } }));
  });

  it('All hands opens at 3 docks and Pay surge with the first new contract', () => {
    const s = createWarehouse({ seed: 1 });
    expect(use(s, 'allHands').events).toContainEqual(expect.objectContaining({ type: 'rejected', payload: { command: 'boost', reason: `Needs ${T.allHandsMinDocks.value} docks` } }));
    expect(use(s, 'surge').events).toContainEqual(expect.objectContaining({ type: 'rejected', payload: { command: 'boost', reason: 'Needs Regional' } }));
    const u = unlocked();
    expect(use(u, 'allHands').state.boosts.allHands.left).toBe(T.allHandsTicks.value - 1);
    expect(use(u, 'surge').state.boosts.surge.left).toBe(T.surgeTicks.value - 1);
  });

  it('rejects an unknown boost', () => {
    const s = createWarehouse({ seed: 1 });
    const bad = step(s, [{ tick: 0, type: 'boost', payload: { boost: 'nitro' as BoostId } }]);
    expect(bad.events[0]).toMatchObject({ type: 'rejected', payload: { command: 'boost' } });
    expect(bad.state.boosts).toEqual(READY_BOOSTS);
  });

  it('Rush hour: 3x arrivals while it runs', () => {
    const s = { ...createWarehouse({ seed: 1 }), staged: 0, docks: [{ ...dock(createWarehouse({ seed: 1 })), turn: 400, turnMax: 400 }] };
    // Everyone who arrives is in the staging or the picking line (RULES 3).
    const total = (x: WarehouseState): number => x.staged + x.backlog;
    const plain = total(step(s, []).state);
    const boosted = total(use(s, 'flashSale').state);
    expect(plain).toBe(T.orderBaseMilliPerTick.value);
    expect(boosted).toBe((T.orderBaseMilliPerTick.value * T.flashSaleOrderBp.value) / 10_000);
  });

  it('All hands: every dock is rushed while it runs, with no taps', () => {
    const u = { ...unlocked(), staged: 0 };
    const { state } = use(u, 'allHands');
    const rushRate = (T.loadBaseMilliPerTick.value * T.rushLoadBp.value) / 10_000;
    // Walk-ups board at the rushed rate even with the sales empty (RULES 6).
    for (const g of state.docks) expect(g.loaded).toBe(rushRate);
    for (const g of state.docks) expect(g.rush).toBe(0);
    const view = warehouseView(state);
    expect(view.docks.every((g) => g.rushed && g.rate === rushRate)).toBe(true);
  });

  it('Pay surge: every pay x2 while it runs', () => {
    const u = unlocked();
    const plain = run(u, 70).events.find((e) => e.type === 'departed');
    const surged = run(u, 70, (s) => (s.tick === 0 ? [boost(s, 'surge')] : [])).events.find((e) => e.type === 'departed');
    expect(plain?.type).toBe('departed');
    if (plain?.type !== 'departed' || surged?.type !== 'departed') throw new Error('no departure');
    expect(surged.payload.cents).toBe((plain.payload.cents * T.surgePayBp.value) / 10_000);
  });

  it('a boost ends on its own while the app is closed, and recharges there too', () => {
    const s = use(unlocked(), 'surge').state;
    const later = advanceMany(s, T.surgeRechargeTicks.value);
    expect(later.boosts.surge).toEqual({ left: 0, recharge: 0 });
  });

  it('selling opens the next warehouse with every boost ready', () => {
    const u = use({ ...unlocked(), run: { ...unlocked().run, earned: T.starUnitCents.value } }, 'surge').state;
    const sold = step(u, [{ tick: u.tick, type: 'sell', payload: {} }]).state;
    expect(sold.site).toBe(1);
    expect(sold.boosts).toEqual(READY_BOOSTS);
  });
});

describe('boosts in the view (RULES 15)', () => {
  it('lists the three boosts with their numbers, locks and clocks', () => {
    const view = warehouseView(createWarehouse({ seed: 1 }));
    expect(view.boosts.map((b) => b.id)).toEqual(['flashSale', 'allHands', 'surge']);
    const [rush, hands, surge] = view.boosts;
    expect(rush).toMatchObject({ name: 'Rush hour', effect: '3x passengers for 60 s', ready: true, locked: null, left: 0, length: T.flashSaleTicks.value });
    expect(hands).toMatchObject({ name: 'All hands', effect: 'Every dock rushed for 60 s', ready: false, locked: 'Needs 3 docks' });
    expect(surge).toMatchObject({ name: 'Pay surge', effect: '2x pays for 60 s', ready: false, locked: 'Needs Regional' });
  });

  it('points at the boost that fixes the bottleneck', () => {
    const view = warehouseView(unlocked());
    const helps = view.boosts.filter((b) => b.helps).map((b) => b.id);
    if (view.bottleneck.kind === 'passengers' || view.bottleneck.kind === 'timer') expect(helps).toContain('flashSale');
    else expect(helps).toContain('allHands');
  });

  it('shows boosted income while a boost runs and plain income otherwise', () => {
    const u = unlocked();
    const before = warehouseView(u);
    expect(before.boostedIncomePerSec).toBe(before.incomePerSec);
    const surged = warehouseView(use(u, 'surge').state);
    expect(surged.incomePerSec).toBe(before.incomePerSec);
    expect(Math.abs(surged.boostedIncomePerSec - (estimate(u).incomePerSec * T.surgePayBp.value) / 10_000)).toBeLessThanOrEqual(1);
    const hands = warehouseView(use(u, 'allHands').state);
    expect(hands.boostedIncomePerSec).toBeGreaterThan(hands.incomePerSec);
  });

  it('shows Rush hour in the arrivals the passenger flow draws', () => {
    const s = createWarehouse({ seed: 1 });
    const view = warehouseView(use(s, 'flashSale').state);
    expect(view.staging.orderPerTick).toBe((T.orderBaseMilliPerTick.value * T.flashSaleOrderBp.value) / 10_000);
  });
});
