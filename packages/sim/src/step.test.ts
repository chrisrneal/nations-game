import type { WarehouseCommand, WarehouseEvent, WarehouseState, DockState, UpgradeId } from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';
import { createWarehouse } from './state.ts';
import { step } from './step.ts';
import { lockReason, parcelsAt, starsFor, upgradeCost } from './rules.ts';
import { siteAt } from './catalog.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';

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

const buy = (s: WarehouseState, upgrade: UpgradeId): WarehouseCommand => ({ tick: s.tick, type: 'buy', payload: { upgrade } });
const tap = (s: WarehouseState, dock: number): WarehouseCommand => ({ tick: s.tick, type: 'tap', payload: { dock } });
const dock = (s: WarehouseState, i = 0): DockState => s.docks[i] as DockState;
/** A state with fields replaced, for setting up a case (tests only; play changes state only by commands). */
const tweak = (s: WarehouseState, patch: Partial<WarehouseState>): WarehouseState => ({ ...s, ...patch });

describe('a new warehouse (RULES 3-4)', () => {
  const s = createWarehouse({ seed: 1 });

  it('opens with one dock loading a 10-parcel truck and passengers staged', () => {
    expect(s.tick).toBe(0);
    expect(s.cash).toBe(T.startingCashCents.value);
    expect(s.docks).toHaveLength(1);
    expect(dock(s).parcels).toBe(10);
    expect(dock(s).turn).toBe(0);
    expect(dock(s).loaded).toBe(0);
    expect(dock(s).timer).toBe(60);
    expect(s.staged).toBe(10_000);
    expect(Object.values(s.levels).every((l) => l === 0)).toBe(true);
  });

  it('fills the first truck in 5 s and pays $12.50 with the full-shipment bonus', () => {
    const { state, events } = run(s, 20);
    const departed = events.filter((e) => e.type === 'departed');
    expect(departed).toHaveLength(1);
    expect(departed[0]?.payload).toMatchObject({ orders: 10, parcels: 10, full: true, cents: 1250 });
    expect(state.cash).toBe(1250);
    expect(state.run.shipments).toBe(1);
    expect(state.run.fullShipments).toBe(1);
  });

  it('can afford its first upgrade within 10 seconds (RULES 11)', () => {
    let at = -1;
    run(s, 40, (cur) => {
      if (at < 0 && cur.cash >= upgradeCost('loading', 0)) at = cur.tick;
      return [];
    });
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThanOrEqual(40);
  });
});

describe('loading and departures (RULES 5)', () => {
  it('turns the dock around, then a new truck arrives', () => {
    const { state, events } = run(createWarehouse({ seed: 1 }), 20);
    expect(dock(state).turn).toBe(18); // 4 s + 10 parcels x 0.05 s
    expect(dock(state).turnMax).toBe(18);
    const after = run(state, 18);
    expect(dock(after.state).turn).toBe(0);
    expect(dock(after.state).truck).toBe(dock(state).truck + 1);
    expect(after.events.some((e) => e.type === 'arrived')).toBe(true);
    expect(events.some((e) => e.type === 'arrived')).toBe(false);
  });

  it('leaves on its timer without the bonus when it cannot fill', () => {
    const s0 = createWarehouse({ seed: 1 });
    const s = tweak(s0, { staged: 0, docks: [{ ...dock(s0), timer: 5 }] });
    const { events } = run(s, 5);
    const d = events.find((e) => e.type === 'departed');
    expect(d?.payload).toMatchObject({ orders: 2, full: false, cents: 200 });
  });

  it('waits at a zero timer for its first passenger', () => {
    const s = tweak(createWarehouse({ seed: 1 }), { staged: 0, docks: [{ ...dock(createWarehouse({ seed: 1 })), timer: 0 }] });
    const one = step(s, []);
    // 400 milli arrived and loaded: not a whole passenger yet.
    expect(one.events.some((e) => e.type === 'departed')).toBe(false);
    expect(dock(one.state).timer).toBe(0);
    const three = run(one.state, 2);
    expect(three.events.find((e) => e.type === 'departed')?.payload).toMatchObject({ orders: 1 });
  });

  it('counts passengers turned away when the staging is full and the picking line too (RULES 3)', () => {
    const s = createWarehouse({ seed: 1 });
    const full = tweak(s, { staged: 40_000, backlog: 72_000, docks: [{ ...dock(s), turn: 50, turnMax: 50 }] });
    const after = step(full, []).state;
    expect(after.staged).toBe(40_000);
    expect(after.backlog).toBe(72_000);
    expect(after.run.missed).toBe(400);
  });

  it('shares scarce passengers between docks in rotating order', () => {
    const s = createWarehouse({ seed: 1 });
    const two = tweak(s, { staged: 0, levels: { ...s.levels, docks: 1 }, docks: [dock(s), { ...dock(s), truck: 2 }] });
    const after = run(two, 10).state;
    expect(dock(after, 0).loaded).toBe(2000);
    expect(dock(after, 1).loaded).toBe(2000);
  });
});

describe('the rush (RULES 6)', () => {
  it('a tap banks 2.5 s of rush, capped at 5 s', () => {
    const s = createWarehouse({ seed: 1 });
    const once = step(s, [tap(s, 0)]).state;
    expect(dock(once).rush).toBe(T.rushTicksPerTap.value - 1);
    const many = step(s, [tap(s, 0), tap(s, 0), tap(s, 0)]).state;
    expect(dock(many).rush).toBe(T.rushMaxTicks.value - 1);
    expect(many.run.taps).toBe(3);
  });

  it('boards faster, with walk-ups when the sales is empty', () => {
    const s = tweak(createWarehouse({ seed: 1 }), { staged: 0 });
    const after = step(s, [tap(s, 0)]).state;
    // 400 arrive and board from the sales; the rest of the rushed rate walks up.
    const rushed = Math.floor((500 * T.rushLoadBp.value) / 10_000);
    expect(rushed).toBeGreaterThan(500);
    expect(dock(after).loaded).toBe(rushed);
    expect(after.staged).toBe(0);
  });

  it('runs turnaround 3x as fast', () => {
    const s = createWarehouse({ seed: 1 });
    const turning = tweak(s, { docks: [{ ...dock(s), turn: 18, turnMax: 18 }] });
    expect(dock(step(turning, [tap(turning, 0)]).state).turn).toBe(15);
    expect(dock(step(turning, []).state).turn).toBe(17);
  });

  it('rejects a tap on a dock that does not exist', () => {
    const s = createWarehouse({ seed: 1 });
    const { state, events } = step(s, [tap(s, 3)]);
    expect(events.some((e) => e.type === 'rejected')).toBe(true);
    expect(state.run.taps).toBe(0);
  });
});

describe('upgrades (RULES 7)', () => {
  const rich = (s: WarehouseState): WarehouseState => tweak(s, { cash: 1_000_000_000 });

  it('costs base x growth^level and takes the cash', () => {
    const s = rich(createWarehouse({ seed: 1 }));
    const { state, events } = step(s, [buy(s, 'loading')]);
    expect(state.levels.loading).toBe(1);
    expect(state.cash).toBe(s.cash - 1000);
    expect(events.find((e) => e.type === 'bought')?.payload).toEqual({ upgrade: 'loading', level: 1, cents: 1000 });
    expect(upgradeCost('loading', 1)).toBe(Math.floor((1000 * T.loadCostGrowthBp.value) / 10_000));
    expect(upgradeCost('docks', 1)).toBe(Math.floor((T.docksCostBase.value * T.docksCostGrowthBp.value) / 10_000));
  });

  it('refuses what it cannot afford and leaves cash alone', () => {
    const s = createWarehouse({ seed: 1 });
    const { state, events } = step(s, [buy(s, 'docks')]);
    expect(state.levels.docks).toBe(0);
    expect(state.cash).toBe(0);
    expect(events.find((e) => e.type === 'rejected')?.payload).toMatchObject({ command: 'buy' });
  });

  it('a contract needs trucks at least as big as its level', () => {
    const s = rich(createWarehouse({ seed: 1 }));
    expect(step(s, [buy(s, 'contract')]).state.levels.contract).toBe(0);
    const bigger = step(s, [buy(s, 'truck')]).state;
    expect(step(bigger, [buy(bigger, 'contract')]).state.levels.contract).toBe(1);
  });

  it('a new dock opens with a truck loading', () => {
    const s = rich(createWarehouse({ seed: 1 }));
    const after = step(s, [buy(s, 'docks')]).state;
    expect(after.docks).toHaveLength(2);
    expect(dock(after, 1).turn).toBe(0);
    expect(dock(after, 1).parcels).toBe(10);
  });

  it('a bigger truck arrives at the next turnaround, not mid-loading', () => {
    const s = rich(createWarehouse({ seed: 1 }));
    const after = step(s, [buy(s, 'truck')]).state;
    expect(dock(after).parcels).toBe(10);
    const later = run(after, 60).state;
    expect(later.docks.some((g) => g.parcels === parcelsAt(1))).toBe(true);
    expect(parcelsAt(1)).toBe(15);
  });

  it('stops at the max level', () => {
    const s = rich(createWarehouse({ seed: 1 }));
    const maxed = tweak(s, { levels: { ...s.levels, night: T.maxNightLevel.value } });
    expect(step(maxed, [buy(maxed, 'night')]).state.levels.night).toBe(T.maxNightLevel.value);
  });
});

describe('expresses (RULES 4)', () => {
  it('about 5% of arriving trucks are expresses, and they pay double', () => {
    let s = createWarehouse({ seed: 7 });
    s = tweak(s, { cash: 1_000_000_000_000 });
    // Six docks with fast crews make many arrivals.
    for (let i = 0; i < 5; i++) s = step(s, [buy(s, 'docks')]).state;
    for (let i = 0; i < 12; i++) s = step(s, [buy(s, 'crew'), buy(s, 'loading'), buy(s, 'sales')]).state;
    const { events } = run(s, 40_000);
    const arrived = events.filter((e) => e.type === 'arrived');
    const expresses = arrived.filter((e) => e.type === 'arrived' && e.payload.express).length;
    expect(arrived.length).toBeGreaterThan(2000);
    expect(expresses / arrived.length).toBeGreaterThan(0.035);
    expect(expresses / arrived.length).toBeLessThan(0.065);
    const paid = events.find((e) => e.type === 'departed' && e.payload.express && e.payload.full);
    if (paid?.type === 'departed') expect(paid.payload.cents).toBe(Math.floor((Math.floor((paid.payload.orders * 100 * 12_500) / 10_000) * 20_000) / 10_000));
  });
});

describe('selling the warehouse (RULES 10)', () => {
  it('is refused until the warehouse is worth a star', () => {
    const s = createWarehouse({ seed: 1 });
    const { state, events } = step(s, [{ tick: 0, type: 'sell', payload: {} }]);
    expect(state.site).toBe(0);
    expect(events.some((e) => e.type === 'rejected')).toBe(true);
  });

  it('opens the next site with the stars added and everything else reset', () => {
    const s0 = createWarehouse({ seed: 1 });
    const s = tweak(s0, {
      cash: 5_000_000,
      levels: { ...s0.levels, loading: 5, docks: 2 },
      run: { ...s0.run, earned: 4 * T.starUnitCents.value, shipments: 99 },
      life: { ...s0.life, earned: 4 * T.starUnitCents.value, shipments: 99 },
    });
    expect(starsFor(4 * T.starUnitCents.value)).toBe(2);
    expect(starsFor(4 * T.starUnitCents.value - 1)).toBe(1);
    const { state, events } = step(s, [{ tick: 0, type: 'sell', payload: {} }]);
    expect(events.find((e) => e.type === 'sold')?.payload).toEqual({ stars: 2, site: 1 });
    expect(state.site).toBe(1);
    expect(state.stars).toBe(2);
    expect(state.cash).toBe(T.startingCashCents.value);
    expect(state.levels.loading).toBe(0);
    expect(state.docks).toHaveLength(1);
    expect(state.run.earned).toBe(0);
    expect(state.life.shipments).toBe(99);
    expect(state.tick).toBe(1);
  });

  it('owned stars raise every pay by the star bonus each', () => {
    const s = tweak(createWarehouse({ seed: 1 }), { stars: 3 });
    const d = run(s, 20).events.find((e) => e.type === 'departed');
    expect(d?.payload).toMatchObject({ cents: Math.floor((1250 * (10_000 + 3 * T.starBonusBp.value)) / 10_000) });
  });
});

describe('site twists (RULES 10)', () => {
  it('Port Calder caps trucks at size 6 and pays +50%', () => {
    const s = tweak(createWarehouse({ seed: 1, site: 1 }), { cash: 1_000_000_000_000 });
    let cur = s;
    for (let i = 0; i < 12; i++) cur = step(cur, [buy(cur, 'truck')]).state;
    expect(cur.levels.truck).toBe(T.narrowYardMaxTruck.value);
    const d = run(createWarehouse({ seed: 1, site: 1 }), 20).events.find((e) => e.type === 'departed');
    expect(d?.payload).toMatchObject({ cents: 1875 });
  });

  it('says the narrow yard is why trucks stop growing in Port Calder', () => {
    const s = createWarehouse({ seed: 1, site: 1 });
    const capped = tweak(s, { levels: { ...s.levels, truck: T.narrowYardMaxTruck.value, contract: T.narrowYardMaxTruck.value } });
    expect(lockReason('truck', capped)).toBe('Narrow yard');
    expect(lockReason('contract', capped)).toBe('Narrow yard');
  });

  it('cycles through the sites as warehouses are sold', () => {
    let s = createWarehouse({ seed: 1 });
    const visited: number[] = [];
    for (let i = 0; i < 5; i++) {
      s = tweak(s, { run: { ...s.run, earned: T.starUnitCents.value } });
      s = step(s, [{ tick: s.tick, type: 'sell', payload: {} }]).state;
      visited.push(s.site);
    }
    expect(visited).toEqual([1, 2, 3, 4, 5]);
    expect(s.stars).toBe(5);
    expect(siteAt(4).label).toBe('Millbrook Depot II');
    expect(siteAt(6).label).toBe('Highmoor Crossdock II');
  });

  it('Highmoor Hub sends connecting passengers back after a full shipment', () => {
    const s = tweak(createWarehouse({ seed: 1, site: 2 }), { staged: 10_000 });
    const before = run(s, 19).state;
    const after = step(before, []).state;
    // 0.4 arrive, 0.5 board and fill the truck, and 2 connecting passengers come back.
    expect(after.staged - before.staged).toBe(400 - 500 + 2000);
  });

  it('Sunvale runs 3x arrivals in a wave and 0.6x between', () => {
    const s = tweak(createWarehouse({ seed: 1, site: 3 }), { staged: 0, docks: [{ ...dock(createWarehouse({ seed: 1 })), turn: 9999, turnMax: 9999 }] });
    const wave = step(s, []).state;
    // 1.2 arrive in a tick of the wave; picking clears 0.6 of them and the rest queue.
    expect(wave.staged + wave.backlog).toBe(1200);
    expect(wave.backlog).toBe(600);
    const later = tweak(s, { tick: T.waveTicks.value });
    expect(step(later, []).state.staged).toBe(240);
  });
});
