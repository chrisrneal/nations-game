import type { AirportCommand, AirportEvent, AirportState, BoostId, GateState } from '@airport/contracts';
import { describe, expect, it } from 'vitest';
import { createAirport, READY_BOOSTS } from './state.ts';
import { advanceMany, step } from './step.ts';
import { airportView, estimate } from './view.ts';
import { AIRPORT_TUNABLES as T } from './tunables.ts';

/** The boosts of RULES 15: free, timed, each on its own recharge. */

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

const boost = (s: AirportState, id: BoostId): AirportCommand => ({ tick: s.tick, type: 'boost', payload: { boost: id } });
const use = (s: AirportState, id: BoostId): { state: AirportState; events: readonly AirportEvent[] } => step(s, [boost(s, id)]);
const gate = (s: AirportState, i = 0): GateState => s.gates[i] as GateState;
/** An airport with every boost unlocked: three gates and a route (tests only; play changes state only by commands). */
function unlocked(seed = 1): AirportState {
  const s = createAirport({ seed });
  const g = gate(s);
  return {
    ...s,
    levels: { ...s.levels, gates: T.allHandsMinGates.value - 1, plane: T.surgeMinRoute.value, route: T.surgeMinRoute.value },
    gates: Array.from({ length: T.allHandsMinGates.value }, (_, i) => ({ ...g, plane: 1 + i })),
    nextPlane: 1 + T.allHandsMinGates.value,
  };
}

describe('boosts (RULES 15)', () => {
  it('a new airport opens with every boost ready', () => {
    expect(createAirport({ seed: 1 }).boosts).toEqual(READY_BOOSTS);
    for (const b of Object.values(READY_BOOSTS)) expect(b).toEqual({ left: 0, recharge: 0 });
  });

  it('using a boost starts its effect and its recharge, and says so', () => {
    const { state, events } = use(createAirport({ seed: 1 }), 'rushHour');
    // The step that used it counts as its first tick.
    expect(state.boosts.rushHour).toEqual({ left: T.rushHourTicks.value - 1, recharge: T.rushHourRechargeTicks.value - 1 });
    expect(events).toContainEqual({ tick: 0, type: 'boosted', payload: { boost: 'rushHour', ticks: T.rushHourTicks.value } });
  });

  it('runs for its length, then recharges, then can be used again', () => {
    let s = use(createAirport({ seed: 1 }), 'rushHour').state;
    s = advanceMany(s, T.rushHourTicks.value - 1);
    expect(s.boosts.rushHour.left).toBe(0);
    expect(s.boosts.rushHour.recharge).toBe(T.rushHourRechargeTicks.value - T.rushHourTicks.value);
    const early = use(s, 'rushHour');
    expect(early.events).toContainEqual(expect.objectContaining({ type: 'rejected', payload: { command: 'boost', reason: 'Recharging' } }));
    expect(early.state.boosts.rushHour.left).toBe(0);
    s = advanceMany(s, T.rushHourRechargeTicks.value - T.rushHourTicks.value);
    expect(s.boosts.rushHour).toEqual({ left: 0, recharge: 0 });
    expect(use(s, 'rushHour').state.boosts.rushHour.left).toBe(T.rushHourTicks.value - 1);
  });

  it('cannot be used while it is running', () => {
    const s = use(createAirport({ seed: 1 }), 'rushHour').state;
    const again = use(s, 'rushHour');
    expect(again.events).toContainEqual(expect.objectContaining({ type: 'rejected', payload: { command: 'boost', reason: 'Already running' } }));
  });

  it('All hands opens at 3 gates and Fare surge with the first new route', () => {
    const s = createAirport({ seed: 1 });
    expect(use(s, 'allHands').events).toContainEqual(expect.objectContaining({ type: 'rejected', payload: { command: 'boost', reason: `Opens at ${T.allHandsMinGates.value} gates` } }));
    expect(use(s, 'surge').events).toContainEqual(expect.objectContaining({ type: 'rejected', payload: { command: 'boost', reason: 'Opens with a new route' } }));
    const u = unlocked();
    expect(use(u, 'allHands').state.boosts.allHands.left).toBe(T.allHandsTicks.value - 1);
    expect(use(u, 'surge').state.boosts.surge.left).toBe(T.surgeTicks.value - 1);
  });

  it('rejects an unknown boost', () => {
    const s = createAirport({ seed: 1 });
    const bad = step(s, [{ tick: 0, type: 'boost', payload: { boost: 'nitro' as BoostId } }]);
    expect(bad.events[0]).toMatchObject({ type: 'rejected', payload: { command: 'boost' } });
    expect(bad.state.boosts).toEqual(READY_BOOSTS);
  });

  it('Rush hour: 3x arrivals while it runs', () => {
    const s = { ...createAirport({ seed: 1 }), waiting: 0, gates: [{ ...gate(createAirport({ seed: 1 })), turn: 400, turnMax: 400 }] };
    const plain = step(s, []).state.waiting;
    const boosted = use(s, 'rushHour').state.waiting;
    expect(plain).toBe(T.arrivalBaseMilliPerTick.value);
    expect(boosted).toBe((T.arrivalBaseMilliPerTick.value * T.rushHourArrivalBp.value) / 10_000);
  });

  it('All hands: every gate is rushed while it runs, with no taps', () => {
    const u = { ...unlocked(), waiting: 0 };
    const { state } = use(u, 'allHands');
    const rushRate = (T.boardBaseMilliPerTick.value * T.rushBoardBp.value) / 10_000;
    // Walk-ups board at the rushed rate even with the terminal empty (RULES 6).
    for (const g of state.gates) expect(g.boarded).toBe(rushRate);
    for (const g of state.gates) expect(g.rush).toBe(0);
    const view = airportView(state);
    expect(view.gates.every((g) => g.rushed && g.rate === rushRate)).toBe(true);
  });

  it('Fare surge: every fare x2 while it runs', () => {
    const u = unlocked();
    const plain = run(u, 70).events.find((e) => e.type === 'departed');
    const surged = run(u, 70, (s) => (s.tick === 0 ? [boost(s, 'surge')] : [])).events.find((e) => e.type === 'departed');
    expect(plain?.type).toBe('departed');
    if (plain?.type !== 'departed' || surged?.type !== 'departed') throw new Error('no departure');
    expect(surged.payload.cents).toBe((plain.payload.cents * T.surgeFareBp.value) / 10_000);
  });

  it('a boost ends on its own while the app is closed, and recharges there too', () => {
    const s = use(unlocked(), 'surge').state;
    const later = advanceMany(s, T.surgeRechargeTicks.value);
    expect(later.boosts.surge).toEqual({ left: 0, recharge: 0 });
  });

  it('selling opens the next airport with every boost ready', () => {
    const u = use({ ...unlocked(), run: { ...unlocked().run, earned: T.slotUnitCents.value } }, 'surge').state;
    const sold = step(u, [{ tick: u.tick, type: 'sell', payload: {} }]).state;
    expect(sold.city).toBe(1);
    expect(sold.boosts).toEqual(READY_BOOSTS);
  });
});

describe('boosts in the view (RULES 15)', () => {
  it('lists the three boosts with their numbers, locks and clocks', () => {
    const view = airportView(createAirport({ seed: 1 }));
    expect(view.boosts.map((b) => b.id)).toEqual(['rushHour', 'allHands', 'surge']);
    const [rush, hands, surge] = view.boosts;
    expect(rush).toMatchObject({ name: 'Rush hour', effect: '3x passengers for 60 s', ready: true, locked: null, left: 0, length: T.rushHourTicks.value });
    expect(hands).toMatchObject({ name: 'All hands', effect: 'Every gate rushed for 60 s', ready: false, locked: 'Opens at 3 gates' });
    expect(surge).toMatchObject({ name: 'Fare surge', effect: '2x fares for 60 s', ready: false, locked: 'Opens with a new route' });
  });

  it('points at the boost that fixes the bottleneck', () => {
    const view = airportView(unlocked());
    const helps = view.boosts.filter((b) => b.helps).map((b) => b.id);
    if (view.bottleneck.kind === 'passengers' || view.bottleneck.kind === 'timer') expect(helps).toContain('rushHour');
    else expect(helps).toContain('allHands');
  });

  it('shows boosted income while a boost runs and plain income otherwise', () => {
    const u = unlocked();
    const before = airportView(u);
    expect(before.boostedIncomePerSec).toBe(before.incomePerSec);
    const surged = airportView(use(u, 'surge').state);
    expect(surged.incomePerSec).toBe(before.incomePerSec);
    expect(Math.abs(surged.boostedIncomePerSec - (estimate(u).incomePerSec * T.surgeFareBp.value) / 10_000)).toBeLessThanOrEqual(1);
    const hands = airportView(use(u, 'allHands').state);
    expect(hands.boostedIncomePerSec).toBeGreaterThan(hands.incomePerSec);
  });

  it('shows Rush hour in the arrivals the passenger flow draws', () => {
    const s = createAirport({ seed: 1 });
    const view = airportView(use(s, 'rushHour').state);
    expect(view.terminal.arrivalPerTick).toBe((T.arrivalBaseMilliPerTick.value * T.rushHourArrivalBp.value) / 10_000);
  });
});
