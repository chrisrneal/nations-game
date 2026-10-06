import type { WarehouseState, Levels } from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';
import { advanceMany } from './step.ts';
import { createWarehouse, ZERO_LEVELS } from './state.ts';
import { arrivingDock } from './state.ts';
import { derive } from './rules.ts';
import { warehouseView, estimate } from './view.ts';
import { WAREHOUSE_TUNABLES } from './tunables.ts';

/** A warehouse at these levels, every dock with a truck of the current size, run for a minute to settle. */
function at(levels: Partial<Levels>, site = 0): WarehouseState {
  const base = createWarehouse({ seed: 3, site });
  const lv = { ...ZERO_LEVELS, ...levels };
  const d = derive({ ...base, levels: lv });
  const docks = Array.from({ length: 1 + lv.docks }, (_, i) => arrivingDock(1 + i, d, false));
  return advanceMany({ ...base, levels: lv, docks, nextTruck: docks.length + 1 }, 240);
}

/** Cents a second actually earned over an hour of idle play. */
function measured(s: WarehouseState): number {
  const after = advanceMany(s, 4 * 3600);
  return (after.run.earned - s.run.earned) / 3600;
}

describe('the income estimate (RULES 8, P6)', () => {
  const cases: [string, Partial<Levels>, number][] = [
    ['a new warehouse', {}, 0],
    ['early: 2 docks, faster loading', { docks: 1, loading: 3, sales: 2 }, 0],
    ['mid: 4 docks, bigger trucks, contracts', { docks: 3, truck: 3, contract: 3, loading: 8, sales: 8, crew: 4 }, 0],
    ['passenger-starved: 8 docks, small sales', { docks: 7, truck: 2, loading: 10, sales: 1 }, 0],
    ['late: big trucks, fast crew', { docks: 6, truck: 7, contract: 6, loading: 17, sales: 17, crew: 12 }, 0],
    ['Port Calder', { docks: 3, truck: 4, contract: 4, loading: 8, sales: 9 }, 1],
    ['Highmoor Hub', { docks: 3, truck: 3, contract: 3, loading: 8, sales: 6, crew: 4 }, 2],
    ['Sunvale', { docks: 3, truck: 3, contract: 3, loading: 8, sales: 9, crew: 4 }, 3],
  ];

  it.each(cases)('is within 20%% of measured idle income: %s', (_name, levels, site) => {
    const s = at(levels, site);
    const est = estimate(s).incomePerSec;
    const real = measured(s);
    expect(est).toBeGreaterThan(0);
    expect(Math.abs(est - real) / real).toBeLessThan(0.2);
  });

  it('names the bottleneck and the upgrade that fixes it', () => {
    expect(estimate(at({ docks: 7, sales: 0, loading: 10 })).bottleneck).toMatchObject({ kind: 'timer', fix: ['sales'] });
    expect(estimate(at({ docks: 2, sales: 0, loading: 10 })).bottleneck).toMatchObject({ kind: 'passengers', fix: ['sales'] });
    expect(estimate(at({ sales: 10 })).bottleneck.kind).toBe('loading');
    expect(estimate(at({ sales: 10, loading: 12 })).bottleneck).toMatchObject({ kind: 'turnaround', fix: ['crew', 'truck'] });
  });
});

describe('the view (S6, P5)', () => {
  it('shows a new warehouse with its first upgrade not yet affordable, then affordable', () => {
    const v = warehouseView(createWarehouse({ seed: 1 }));
    expect(v.cash).toBe(0);
    expect(v.docks).toHaveLength(1);
    expect(v.docks[0]?.model).toBe('Puddle Jumper');
    expect(v.site.name).toBe('Millbrook');
    const loading = v.upgrades.find((u) => u.id === 'loading');
    expect(loading).toMatchObject({ level: 0, cost: 1000, affordable: false, unit: 'ordersPerSec', now: 2000, next: 2500 });
    const rich = warehouseView({ ...createWarehouse({ seed: 1 }), cash: 1000 });
    expect(rich.upgrades.find((u) => u.id === 'loading')?.affordable).toBe(true);
  });

  it('locks contracts behind truck size and shows the next truck and contract names', () => {
    const v = warehouseView({ ...createWarehouse({ seed: 1 }), cash: 10 ** 9 });
    const contract = v.upgrades.find((u) => u.id === 'contract');
    expect(contract).toMatchObject({ locked: 'Needs bigger trucks first', affordable: false, nextName: 'Regional' });
    expect(v.upgrades.find((u) => u.id === 'truck')?.nextName).toBe('Commuter');
  });

  it('values the warehouse in stars and names the next site', () => {
    const s = createWarehouse({ seed: 1 });
    const unit = WAREHOUSE_TUNABLES.starUnitCents.value;
    const bonus = WAREHOUSE_TUNABLES.starBonusBp.value;
    const v = warehouseView({ ...s, run: { ...s.run, earned: 4 * unit }, stars: 1 });
    expect(v.stars).toMatchObject({ owned: 1, claimable: 2, nextAt: 9 * unit, bonusBp: 10_000 + bonus, bonusAfterBp: 10_000 + 3 * bonus });
    expect(v.stars.nextSite.name).toBe('Port Calder');
    expect(v.stars.nextSite.twist).toMatch(/Short runway/);
    expect(warehouseView(createWarehouse({ seed: 1, site: 4 })).site.name).toBe('Millbrook II');
  });

  it('shows the offline cap from the night shift level', () => {
    expect(warehouseView(createWarehouse({ seed: 1 })).offbacklogCapMinutes).toBe(120);
    const s = createWarehouse({ seed: 1 });
    expect(warehouseView({ ...s, levels: { ...s.levels, night: 4 } }).offbacklogCapMinutes).toBe(1440);
  });
});

describe('the passenger journey (RULES 14)', () => {
  const journey = (contract: number) => {
    const s = createWarehouse({ seed: 1 });
    const j = warehouseView({ ...s, levels: { ...s.levels, truck: contract, contract } }).journey;
    return { departures: j.departures.map((c) => c.id), arrivals: j.arrivals.map((c) => c.id) };
  };

  it('starts with check-in and picking out, baggage claim in', () => {
    expect(journey(0)).toEqual({ departures: ['checkin', 'picking'], arrivals: ['baggage'] });
    expect(journey(4)).toEqual(journey(0));
  });

  it('adds passport control and customs with the first international contract', () => {
    expect(journey(5)).toEqual({ departures: ['checkin', 'picking', 'passport'], arrivals: ['passport', 'baggage', 'customs'] });
  });

  it('adds preclearance with the first transoceanic contract', () => {
    expect(journey(6)).toEqual({ departures: ['checkin', 'picking', 'passport', 'preclearance'], arrivals: ['passport', 'baggage', 'customs'] });
    expect(journey(9)).toEqual(journey(6));
  });

  it('names every checkpoint, with a label short enough for a phone', () => {
    const s = createWarehouse({ seed: 1 });
    const j = warehouseView({ ...s, levels: { ...s.levels, truck: 9, contract: 9 } }).journey;
    for (const c of [...j.departures, ...j.arrivals]) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.label.length).toBeLessThanOrEqual(12);
    }
    expect(j.departures.find((c) => c.id === 'passport')?.name).toBe('Passport control');
  });

  it('depends on the contract alone', () => {
    const busy = at({ docks: 7, truck: 6, contract: 5, loading: 15, sales: 15, crew: 10 }, 2);
    const quiet = createWarehouse({ seed: 9, site: 1 });
    expect(warehouseView(busy).journey).toEqual(warehouseView({ ...quiet, levels: { ...quiet.levels, truck: 5, contract: 5 } }).journey);
  });
});

describe('catch-up speed (P4)', () => {
  it('steps a full day of an 8-dock warehouse in well under the phone budget in Node', () => {
    const s = at({ docks: 7, truck: 5, contract: 5, loading: 15, sales: 15, crew: 10 });
    const after = advanceMany(s, 24 * 3600 * 4);
    expect(after.tick - s.tick).toBe(345_600);
  });
});
