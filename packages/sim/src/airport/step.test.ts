import type { AirportCommand, AirportEvent, AirportState, GateState, UpgradeId } from '@nations/contracts';
import { describe, expect, it } from 'vitest';
import { createAirport } from './state.ts';
import { step } from './step.ts';
import { seatsAt, slotsFor, upgradeCost } from './rules.ts';
import { AIRPORT_TUNABLES as T } from './tunables.ts';

function run(state: AirportState, ticks: number, commands: (s: AirportState) => AirportCommand[] = () => []): { state: AirportState; events: AirportEvent[] } {
  const events: AirportEvent[] = [];
  let current = state;
  for (let i = 0; i < ticks; i++) {
    const result = step(current, commands(current));
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

const buy = (s: AirportState, upgrade: UpgradeId): AirportCommand => ({ tick: s.tick, type: 'buy', payload: { upgrade } });
const tap = (s: AirportState, gate: number): AirportCommand => ({ tick: s.tick, type: 'tap', payload: { gate } });
const gate = (s: AirportState, i = 0): GateState => s.gates[i] as GateState;
/** A state with fields replaced, for setting up a case (tests only; play changes state only by commands). */
const tweak = (s: AirportState, patch: Partial<AirportState>): AirportState => ({ ...s, ...patch });

describe('a new airport (RULES 3-4)', () => {
  const s = createAirport({ seed: 1 });

  it('opens with one gate boarding a 10-seat plane and passengers waiting', () => {
    expect(s.tick).toBe(0);
    expect(s.cash).toBe(T.startingCashCents.value);
    expect(s.gates).toHaveLength(1);
    expect(gate(s).seats).toBe(10);
    expect(gate(s).turn).toBe(0);
    expect(gate(s).boarded).toBe(0);
    expect(gate(s).timer).toBe(60);
    expect(s.waiting).toBe(10_000);
    expect(Object.values(s.levels).every((l) => l === 0)).toBe(true);
  });

  it('fills the first plane in 5 s and pays $12.50 with the full-flight bonus', () => {
    const { state, events } = run(s, 20);
    const departed = events.filter((e) => e.type === 'departed');
    expect(departed).toHaveLength(1);
    expect(departed[0]?.payload).toMatchObject({ pax: 10, seats: 10, full: true, cents: 1250 });
    expect(state.cash).toBe(1250);
    expect(state.run.flights).toBe(1);
    expect(state.run.fullFlights).toBe(1);
  });

  it('can afford its first upgrade within 10 seconds (RULES 11)', () => {
    let at = -1;
    run(s, 40, (cur) => {
      if (at < 0 && cur.cash >= upgradeCost('boarding', 0)) at = cur.tick;
      return [];
    });
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThanOrEqual(40);
  });
});

describe('boarding and departures (RULES 5)', () => {
  it('turns the gate around, then a new plane arrives', () => {
    const { state, events } = run(createAirport({ seed: 1 }), 20);
    expect(gate(state).turn).toBe(18); // 4 s + 10 seats x 0.05 s
    expect(gate(state).turnMax).toBe(18);
    const after = run(state, 18);
    expect(gate(after.state).turn).toBe(0);
    expect(gate(after.state).plane).toBe(gate(state).plane + 1);
    expect(after.events.some((e) => e.type === 'arrived')).toBe(true);
    expect(events.some((e) => e.type === 'arrived')).toBe(false);
  });

  it('leaves on its timer without the bonus when it cannot fill', () => {
    const s0 = createAirport({ seed: 1 });
    const s = tweak(s0, { waiting: 0, gates: [{ ...gate(s0), timer: 5 }] });
    const { events } = run(s, 5);
    const d = events.find((e) => e.type === 'departed');
    expect(d?.payload).toMatchObject({ pax: 2, full: false, cents: 200 });
  });

  it('waits at a zero timer for its first passenger', () => {
    const s = tweak(createAirport({ seed: 1 }), { waiting: 0, gates: [{ ...gate(createAirport({ seed: 1 })), timer: 0 }] });
    const one = step(s, []);
    // 400 milli arrived and boarded: not a whole passenger yet.
    expect(one.events.some((e) => e.type === 'departed')).toBe(false);
    expect(gate(one.state).timer).toBe(0);
    const three = run(one.state, 2);
    expect(three.events.find((e) => e.type === 'departed')?.payload).toMatchObject({ pax: 1 });
  });

  it('counts passengers the full terminal turns away', () => {
    const s = createAirport({ seed: 1 });
    const full = tweak(s, { waiting: 40_000, gates: [{ ...gate(s), turn: 50, turnMax: 50 }] });
    const after = step(full, []).state;
    expect(after.waiting).toBe(40_000);
    expect(after.run.missed).toBe(400);
  });

  it('shares scarce passengers between gates in rotating order', () => {
    const s = createAirport({ seed: 1 });
    const two = tweak(s, { waiting: 0, levels: { ...s.levels, gates: 1 }, gates: [gate(s), { ...gate(s), plane: 2 }] });
    const after = run(two, 10).state;
    expect(gate(after, 0).boarded).toBe(2000);
    expect(gate(after, 1).boarded).toBe(2000);
  });
});

describe('the rush (RULES 6)', () => {
  it('a tap banks 2.5 s of rush, capped at 5 s', () => {
    const s = createAirport({ seed: 1 });
    const once = step(s, [tap(s, 0)]).state;
    expect(gate(once).rush).toBe(T.rushTicksPerTap.value - 1);
    const many = step(s, [tap(s, 0), tap(s, 0), tap(s, 0)]).state;
    expect(gate(many).rush).toBe(T.rushMaxTicks.value - 1);
    expect(many.run.taps).toBe(3);
  });

  it('boards 3x as fast, with walk-ups when the terminal is empty', () => {
    const s = tweak(createAirport({ seed: 1 }), { waiting: 0 });
    const after = step(s, [tap(s, 0)]).state;
    // 400 arrive, 400 board from the terminal, 1,100 walk up: 1,500 = 3 x 500.
    expect(gate(after).boarded).toBe(1500);
    expect(after.waiting).toBe(0);
  });

  it('runs turnaround 3x as fast', () => {
    const s = createAirport({ seed: 1 });
    const turning = tweak(s, { gates: [{ ...gate(s), turn: 18, turnMax: 18 }] });
    expect(gate(step(turning, [tap(turning, 0)]).state).turn).toBe(15);
    expect(gate(step(turning, []).state).turn).toBe(17);
  });

  it('rejects a tap on a gate that does not exist', () => {
    const s = createAirport({ seed: 1 });
    const { state, events } = step(s, [tap(s, 3)]);
    expect(events.some((e) => e.type === 'rejected')).toBe(true);
    expect(state.run.taps).toBe(0);
  });
});

describe('upgrades (RULES 7)', () => {
  const rich = (s: AirportState): AirportState => tweak(s, { cash: 1_000_000_000 });

  it('costs base x growth^level and takes the cash', () => {
    const s = rich(createAirport({ seed: 1 }));
    const { state, events } = step(s, [buy(s, 'boarding')]);
    expect(state.levels.boarding).toBe(1);
    expect(state.cash).toBe(s.cash - 1000);
    expect(events.find((e) => e.type === 'bought')?.payload).toEqual({ upgrade: 'boarding', level: 1, cents: 1000 });
    expect(upgradeCost('boarding', 1)).toBe(1900);
    expect(upgradeCost('gates', 1)).toBe(50_000);
  });

  it('refuses what it cannot afford and leaves cash alone', () => {
    const s = createAirport({ seed: 1 });
    const { state, events } = step(s, [buy(s, 'gates')]);
    expect(state.levels.gates).toBe(0);
    expect(state.cash).toBe(0);
    expect(events.find((e) => e.type === 'rejected')?.payload).toMatchObject({ command: 'buy' });
  });

  it('a route needs planes at least as big as its level', () => {
    const s = rich(createAirport({ seed: 1 }));
    expect(step(s, [buy(s, 'route')]).state.levels.route).toBe(0);
    const bigger = step(s, [buy(s, 'plane')]).state;
    expect(step(bigger, [buy(bigger, 'route')]).state.levels.route).toBe(1);
  });

  it('a new gate opens with a plane boarding', () => {
    const s = rich(createAirport({ seed: 1 }));
    const after = step(s, [buy(s, 'gates')]).state;
    expect(after.gates).toHaveLength(2);
    expect(gate(after, 1).turn).toBe(0);
    expect(gate(after, 1).seats).toBe(10);
  });

  it('a bigger plane arrives at the next turnaround, not mid-boarding', () => {
    const s = rich(createAirport({ seed: 1 }));
    const after = step(s, [buy(s, 'plane')]).state;
    expect(gate(after).seats).toBe(10);
    const later = run(after, 60).state;
    expect(later.gates.some((g) => g.seats === seatsAt(1))).toBe(true);
    expect(seatsAt(1)).toBe(15);
  });

  it('stops at the max level', () => {
    const s = rich(createAirport({ seed: 1 }));
    const maxed = tweak(s, { levels: { ...s.levels, night: T.maxNightLevel.value } });
    expect(step(maxed, [buy(maxed, 'night')]).state.levels.night).toBe(T.maxNightLevel.value);
  });
});

describe('charters (RULES 4)', () => {
  it('about 5% of arriving planes are charters, and they pay double', () => {
    let s = createAirport({ seed: 7 });
    s = tweak(s, { cash: 1_000_000_000_000 });
    // Six gates with fast crews make many arrivals.
    for (let i = 0; i < 5; i++) s = step(s, [buy(s, 'gates')]).state;
    for (let i = 0; i < 12; i++) s = step(s, [buy(s, 'crew'), buy(s, 'boarding'), buy(s, 'terminal')]).state;
    const { events } = run(s, 40_000);
    const arrived = events.filter((e) => e.type === 'arrived');
    const charters = arrived.filter((e) => e.type === 'arrived' && e.payload.charter).length;
    expect(arrived.length).toBeGreaterThan(2000);
    expect(charters / arrived.length).toBeGreaterThan(0.035);
    expect(charters / arrived.length).toBeLessThan(0.065);
    const paid = events.find((e) => e.type === 'departed' && e.payload.charter && e.payload.full);
    if (paid?.type === 'departed') expect(paid.payload.cents).toBe(Math.floor((Math.floor((paid.payload.pax * 100 * 12_500) / 10_000) * 20_000) / 10_000));
  });
});

describe('selling the airport (RULES 10)', () => {
  it('is refused until the airport is worth a slot', () => {
    const s = createAirport({ seed: 1 });
    const { state, events } = step(s, [{ tick: 0, type: 'sell', payload: {} }]);
    expect(state.city).toBe(0);
    expect(events.some((e) => e.type === 'rejected')).toBe(true);
  });

  it('opens the next city with the slots added and everything else reset', () => {
    const s0 = createAirport({ seed: 1 });
    const s = tweak(s0, {
      cash: 5_000_000,
      levels: { ...s0.levels, boarding: 5, gates: 2 },
      run: { ...s0.run, earned: 4_000_000, flights: 99 },
      life: { ...s0.life, earned: 4_000_000, flights: 99 },
    });
    expect(slotsFor(4_000_000)).toBe(2);
    const { state, events } = step(s, [{ tick: 0, type: 'sell', payload: {} }]);
    expect(events.find((e) => e.type === 'sold')?.payload).toEqual({ slots: 2, city: 1 });
    expect(state.city).toBe(1);
    expect(state.slots).toBe(2);
    expect(state.cash).toBe(T.startingCashCents.value);
    expect(state.levels.boarding).toBe(0);
    expect(state.gates).toHaveLength(1);
    expect(state.run.earned).toBe(0);
    expect(state.life.flights).toBe(99);
    expect(state.tick).toBe(1);
  });

  it('owned slots raise every fare by 10% each', () => {
    const s = tweak(createAirport({ seed: 1 }), { slots: 3 });
    const d = run(s, 20).events.find((e) => e.type === 'departed');
    expect(d?.payload).toMatchObject({ cents: 1625 }); // 1,250 x 1.3
  });
});

describe('city twists (RULES 10)', () => {
  it('Port Calder caps planes at size 6 and pays +50%', () => {
    const s = tweak(createAirport({ seed: 1, city: 1 }), { cash: 1_000_000_000_000 });
    let cur = s;
    for (let i = 0; i < 12; i++) cur = step(cur, [buy(cur, 'plane')]).state;
    expect(cur.levels.plane).toBe(T.shortRunwayMaxPlane.value);
    const d = run(createAirport({ seed: 1, city: 1 }), 20).events.find((e) => e.type === 'departed');
    expect(d?.payload).toMatchObject({ cents: 1875 });
  });

  it('Highmoor Hub sends connecting passengers back after a full flight', () => {
    const s = tweak(createAirport({ seed: 1, city: 2 }), { waiting: 10_000 });
    const before = run(s, 19).state;
    const after = step(before, []).state;
    // 0.4 arrive, 0.5 board and fill the plane, and 2 connecting passengers come back.
    expect(after.waiting - before.waiting).toBe(400 - 500 + 2000);
  });

  it('Sunvale runs 3x arrivals in a wave and 0.6x between', () => {
    const s = tweak(createAirport({ seed: 1, city: 3 }), { waiting: 0, gates: [{ ...gate(createAirport({ seed: 1 })), turn: 9999, turnMax: 9999 }] });
    expect(step(s, []).state.waiting).toBe(1200);
    const later = tweak(s, { tick: T.waveTicks.value });
    expect(step(later, []).state.waiting).toBe(240);
  });
});
