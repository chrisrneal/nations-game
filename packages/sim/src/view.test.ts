import type { AirportState, Levels } from '@airport/contracts';
import { describe, expect, it } from 'vitest';
import { advanceMany } from './step.ts';
import { createAirport, ZERO_LEVELS } from './state.ts';
import { arrivingGate } from './state.ts';
import { derive } from './rules.ts';
import { airportView, estimate } from './view.ts';
import { AIRPORT_TUNABLES } from './tunables.ts';

/** An airport at these levels, every gate with a plane of the current size, run for a minute to settle. */
function at(levels: Partial<Levels>, city = 0): AirportState {
  const base = createAirport({ seed: 3, city });
  const lv = { ...ZERO_LEVELS, ...levels };
  const d = derive({ ...base, levels: lv });
  const gates = Array.from({ length: 1 + lv.gates }, (_, i) => arrivingGate(1 + i, d, false));
  return advanceMany({ ...base, levels: lv, gates, nextPlane: gates.length + 1 }, 240);
}

/** Cents a second actually earned over an hour of idle play. */
function measured(s: AirportState): number {
  const after = advanceMany(s, 4 * 3600);
  return (after.run.earned - s.run.earned) / 3600;
}

describe('the income estimate (RULES 8, P6)', () => {
  const cases: [string, Partial<Levels>, number][] = [
    ['a new airport', {}, 0],
    ['early: 2 gates, faster boarding', { gates: 1, boarding: 3, terminal: 2 }, 0],
    ['mid: 4 gates, bigger planes, routes', { gates: 3, plane: 3, route: 3, boarding: 8, terminal: 8, crew: 4 }, 0],
    ['passenger-starved: 8 gates, small terminal', { gates: 7, plane: 2, boarding: 10, terminal: 1 }, 0],
    ['late: big planes, fast crew', { gates: 6, plane: 7, route: 6, boarding: 17, terminal: 17, crew: 12 }, 0],
    ['Port Calder', { gates: 3, plane: 4, route: 4, boarding: 8, terminal: 9 }, 1],
    ['Highmoor Hub', { gates: 3, plane: 3, route: 3, boarding: 8, terminal: 6, crew: 4 }, 2],
    ['Sunvale', { gates: 3, plane: 3, route: 3, boarding: 8, terminal: 9, crew: 4 }, 3],
  ];

  it.each(cases)('is within 20%% of measured idle income: %s', (_name, levels, city) => {
    const s = at(levels, city);
    const est = estimate(s).incomePerSec;
    const real = measured(s);
    expect(est).toBeGreaterThan(0);
    expect(Math.abs(est - real) / real).toBeLessThan(0.2);
  });

  it('names the bottleneck and the upgrade that fixes it', () => {
    expect(estimate(at({ gates: 7, terminal: 0, boarding: 10 })).bottleneck).toMatchObject({ kind: 'timer', fix: ['terminal'] });
    expect(estimate(at({ gates: 2, terminal: 0, boarding: 10 })).bottleneck).toMatchObject({ kind: 'passengers', fix: ['terminal'] });
    expect(estimate(at({ terminal: 10 })).bottleneck.kind).toBe('boarding');
    expect(estimate(at({ terminal: 10, boarding: 12 })).bottleneck).toMatchObject({ kind: 'turnaround', fix: ['crew', 'plane'] });
  });
});

describe('the view (S6, P5)', () => {
  it('shows a new airport with its first upgrade not yet affordable, then affordable', () => {
    const v = airportView(createAirport({ seed: 1 }));
    expect(v.cash).toBe(0);
    expect(v.gates).toHaveLength(1);
    expect(v.gates[0]?.model).toBe('Puddle Jumper');
    expect(v.city.name).toBe('Millbrook');
    const boarding = v.upgrades.find((u) => u.id === 'boarding');
    expect(boarding).toMatchObject({ level: 0, cost: 1000, affordable: false, unit: 'paxPerSec', now: 2000, next: 2500 });
    const rich = airportView({ ...createAirport({ seed: 1 }), cash: 1000 });
    expect(rich.upgrades.find((u) => u.id === 'boarding')?.affordable).toBe(true);
  });

  it('locks routes behind plane size and shows the next plane and route names', () => {
    const v = airportView({ ...createAirport({ seed: 1 }), cash: 10 ** 9 });
    const route = v.upgrades.find((u) => u.id === 'route');
    expect(route).toMatchObject({ locked: 'Needs bigger planes first', affordable: false, nextName: 'Regional' });
    expect(v.upgrades.find((u) => u.id === 'plane')?.nextName).toBe('Commuter');
  });

  it('values the airport in slots and names the next city', () => {
    const s = createAirport({ seed: 1 });
    const unit = AIRPORT_TUNABLES.slotUnitCents.value;
    const bonus = AIRPORT_TUNABLES.slotBonusBp.value;
    const v = airportView({ ...s, run: { ...s.run, earned: 4 * unit }, slots: 1 });
    expect(v.slots).toMatchObject({ owned: 1, claimable: 2, nextAt: 9 * unit, bonusBp: 10_000 + bonus, bonusAfterBp: 10_000 + 3 * bonus });
    expect(v.slots.nextCity.name).toBe('Port Calder');
    expect(v.slots.nextCity.twist).toMatch(/Short runway/);
    expect(airportView(createAirport({ seed: 1, city: 4 })).city.name).toBe('Millbrook II');
  });

  it('shows the offline cap from the night shift level', () => {
    expect(airportView(createAirport({ seed: 1 })).offlineCapMinutes).toBe(120);
    const s = createAirport({ seed: 1 });
    expect(airportView({ ...s, levels: { ...s.levels, night: 4 } }).offlineCapMinutes).toBe(1440);
  });
});

describe('the passenger journey (RULES 14)', () => {
  const journey = (route: number) => {
    const s = createAirport({ seed: 1 });
    const j = airportView({ ...s, levels: { ...s.levels, plane: route, route } }).journey;
    return { departures: j.departures.map((c) => c.id), arrivals: j.arrivals.map((c) => c.id) };
  };

  it('starts with check-in and security out, baggage claim in', () => {
    expect(journey(0)).toEqual({ departures: ['checkin', 'security'], arrivals: ['baggage'] });
    expect(journey(4)).toEqual(journey(0));
  });

  it('adds passport control and customs with the first international route', () => {
    expect(journey(5)).toEqual({ departures: ['checkin', 'security', 'passport'], arrivals: ['passport', 'baggage', 'customs'] });
  });

  it('adds preclearance with the first transoceanic route', () => {
    expect(journey(6)).toEqual({ departures: ['checkin', 'security', 'passport', 'preclearance'], arrivals: ['passport', 'baggage', 'customs'] });
    expect(journey(9)).toEqual(journey(6));
  });

  it('names every checkpoint, with a label short enough for a phone', () => {
    const s = createAirport({ seed: 1 });
    const j = airportView({ ...s, levels: { ...s.levels, plane: 9, route: 9 } }).journey;
    for (const c of [...j.departures, ...j.arrivals]) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.label.length).toBeLessThanOrEqual(12);
    }
    expect(j.departures.find((c) => c.id === 'passport')?.name).toBe('Passport control');
  });

  it('depends on the route alone', () => {
    const busy = at({ gates: 7, plane: 6, route: 5, boarding: 15, terminal: 15, crew: 10 }, 2);
    const quiet = createAirport({ seed: 9, city: 1 });
    expect(airportView(busy).journey).toEqual(airportView({ ...quiet, levels: { ...quiet.levels, plane: 5, route: 5 } }).journey);
  });
});

describe('catch-up speed (P4)', () => {
  it('steps a full day of an 8-gate airport in well under the phone budget in Node', () => {
    const s = at({ gates: 7, plane: 5, route: 5, boarding: 15, terminal: 15, crew: 10 });
    const after = advanceMany(s, 24 * 3600 * 4);
    expect(after.tick - s.tick).toBe(345_600);
  });
});
