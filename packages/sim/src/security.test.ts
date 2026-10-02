import type { AirportCommand, AirportEvent, AirportState, Levels } from '@airport/contracts';
import { describe, expect, it } from 'vitest';
import { createAirport } from './state.ts';
import { step } from './step.ts';
import { arrivalMilliAt, derive, lineCapMilliFor, securityMilliAt, upgradeCost, waitCapMilliAt } from './rules.ts';
import { airportView, estimate } from './view.ts';
import { AIRPORT_TUNABLES as T } from './tunables.ts';

/** The security line (RULES 3): arrivals queue at security, which clears them into the lounge at its own rate. */

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

/** A state with fields replaced, for setting up a case (tests only). */
const tweak = (s: AirportState, patch: Partial<AirportState>): AirportState => ({ ...s, ...patch });
const withLevels = (s: AirportState, levels: Partial<Levels>): AirportState => tweak(s, { levels: { ...s.levels, ...levels } });
/** An airport built by buying upgrades (so the gates exist), with `cash` cents left over. */
function built(seed: number, buys: Partial<Levels>): AirportState {
  let s = tweak(createAirport({ seed }), { cash: 10 ** 12 });
  for (const [upgrade, times] of Object.entries(buys) as [keyof Levels, number][]) {
    for (let i = 0; i < times; i++) s = step(s, [{ tick: s.tick, type: 'buy', payload: { upgrade } }]).state;
  }
  return s;
}
/** No gates boarding: one gate stuck in a long turnaround, so only the line and the lounge move. */
const noBoarding = (s: AirportState): AirportState => tweak(s, { gates: s.gates.map((g) => ({ ...g, turn: 100_000, turnMax: 100_000 })) });

describe('the security line (RULES 3)', () => {
  it('a new airport has an empty line, Security lanes at level 0 and no extra lane open', () => {
    const s = createAirport({ seed: 1 });
    expect(s.line).toBe(0);
    expect(s.securityRush).toBe(0);
    expect(s.levels.security).toBe(0);
  });

  it('security clears 2.4 a second at level 0, ahead of the 1.6 arriving: no line forms while the lounge has room', () => {
    expect(securityMilliAt(0, 0)).toBe(600);
    const s = noBoarding(tweak(createAirport({ seed: 1 }), { waiting: 0 }));
    const { state } = run(s, 40);
    expect(state.line).toBe(0);
    expect(state.waiting).toBe(40 * 400);
  });

  it('when arrivals outrun security the line grows by the difference and the lounge fills at security speed', () => {
    // Terminal level 5: 1.6 x 1.35^5 = 7.17 a second arrive; security clears 2.4.
    const s = noBoarding(tweak(withLevels(createAirport({ seed: 1 }), { terminal: 5 }), { waiting: 0 }));
    const arrive = arrivalMilliAt(5);
    expect(arrive).toBe(1792);
    const { state } = run(s, 10);
    expect(state.waiting).toBe(10 * 600);
    expect(state.line).toBe(10 * (arrive - 600));
  });

  it('people will not join a line longer than 30 s of clearing: the rest turn back and are missed', () => {
    const cap = lineCapMilliFor(securityMilliAt(0, 0));
    expect(cap).toBe(72_000); // 2.4 a second x 30 s = 72 people
    const s = noBoarding(tweak(withLevels(createAirport({ seed: 1 }), { terminal: 5 }), { waiting: 0, line: cap - 500 }));
    const { state } = run(s, 1);
    // 1.792 arrive, 0.5 fit, then security clears 0.6 from the head.
    expect(state.line).toBe(cap - 600);
    expect(state.run.missed).toBe(1792 - 500);
  });

  it('a full lounge holds the line: security stops and the line backs up', () => {
    const s0 = createAirport({ seed: 1 });
    const full = waitCapMilliAt(0);
    const s = noBoarding(tweak(s0, { waiting: full, line: 0 }));
    const { state } = run(s, 10);
    expect(state.waiting).toBe(full);
    expect(state.line).toBe(10 * 400);
    expect(state.run.missed).toBe(0);
  });

  it('a tap opens an extra lane: 2.5 s of rush, 5 s at most, clearing 2.5x', () => {
    const s = noBoarding(tweak(withLevels(createAirport({ seed: 1 }), { terminal: 5 }), { waiting: 0, line: 50_000 }));
    const tapped = step(s, [{ tick: s.tick, type: 'tapSecurity', payload: {} }]).state;
    expect(tapped.securityRush).toBe(T.rushTicksPerTap.value - 1);
    expect(tapped.waiting).toBe(1500); // 600 x 2.5
    expect(tapped.run.taps).toBe(1);
    const thrice = step(s, [0, 1, 2].map(() => ({ tick: s.tick, type: 'tapSecurity' as const, payload: {} }))).state;
    expect(thrice.securityRush).toBe(T.rushMaxTicks.value - 1);
    const after = run(tapped, T.rushTicksPerTap.value).state;
    expect(after.securityRush).toBe(0);
    expect(after.waiting).toBe(1500 * T.rushTicksPerTap.value + 600);
  });

  it('All hands opens the extra lane too', () => {
    const s = noBoarding(tweak(withLevels(createAirport({ seed: 1 }), { terminal: 5, gates: 2 }), { waiting: 0, line: 50_000 }));
    const { state } = run(s, 1, (cur) => [{ tick: cur.tick, type: 'boost', payload: { boost: 'allHands' } }]);
    expect(state.waiting).toBe(1500);
  });

  it('passport control (Continental) and preclearance (Transatlantic) each slow security to 95%', () => {
    expect(securityMilliAt(0, 4)).toBe(600);
    expect(securityMilliAt(0, 5)).toBe(570);
    expect(securityMilliAt(0, 6)).toBe(541); // 600 x 0.95 x 0.95, floored at each step
    expect(securityMilliAt(3, 0)).toBe(2025); // 600 x 1.5^3
  });

  it('Security lanes costs $25, then x1.8 a level, and shows its speed now and next', () => {
    expect(upgradeCost('security', 0)).toBe(2500);
    expect(upgradeCost('security', 3)).toBe(14_580);
    const view = airportView(createAirport({ seed: 1 }));
    const lanes = view.upgrades.find((u) => u.id === 'security');
    expect(lanes).toMatchObject({ name: 'Security lanes', level: 0, cost: 2500, unit: 'paxPerSec', now: 2400, next: 3600 });
  });

  it('buying Security lanes lengthens the line people will join', () => {
    const s = tweak(createAirport({ seed: 1 }), { cash: 100_000 });
    const after = step(s, [{ tick: 0, type: 'buy', payload: { upgrade: 'security' } }]).state;
    expect(after.levels.security).toBe(1);
    expect(derive(after).lineCapMilli).toBe(900 * 120);
  });

  it('connecting passengers at a hub go straight to the lounge: they are already past security', () => {
    const s0 = createAirport({ seed: 1, city: 2 });
    const g = s0.gates[0];
    if (g === undefined) throw new Error('no gate');
    const s = tweak(s0, { waiting: 0, line: 0, gates: [{ ...g, boarded: 9600, timer: 30 }] });
    const after = step(s, []).state;
    // 0.4 arrive and are cleared; the plane boards them, leaves full and sends 2 back.
    expect(after.line).toBe(0);
    expect(after.waiting).toBe(2000);
  });

  it('the view shows the line, its cap, the rate, the wait and the extra lane', () => {
    const s = tweak(withLevels(createAirport({ seed: 1 }), { terminal: 5 }), { line: 12_000, securityRush: 3 });
    const v = airportView(s).security;
    expect(v).toEqual({ line: 12_000, cap: 72_000, ratePerTick: 1500, baseRatePerTick: 600, rushed: true, waitTicks: 8, slowBp: 10_000 });
  });
});

describe('the bottleneck names the security line (RULES 8)', () => {
  it('arrivals beyond what security clears: long lines at security, fixed by Security lanes', () => {
    const s = withLevels(createAirport({ seed: 1 }), { terminal: 6, gates: 4, boarding: 10, plane: 1 });
    const est = estimate(s);
    expect(est.bottleneck).toEqual({ kind: 'security', text: 'Long lines at security.', fix: ['security'] });
    // Throughput is security's 2.4 a second.
    expect(est.paxPerSec).toBe(2400);
    const boosts = airportView(s).boosts;
    expect(boosts.find((b) => b.helps)?.id).toBe('allHands');
  });

  it('enough lanes and the line is no longer the bottleneck', () => {
    const s = withLevels(createAirport({ seed: 1 }), { terminal: 6, security: 6, gates: 4, boarding: 10, plane: 1 });
    expect(estimate(s).bottleneck.kind).not.toBe('security');
  });

  it('the estimate matches a measured airport held back by security within 5%', () => {
    const s = built(3, { terminal: 6, gates: 2, boarding: 10, plane: 1, security: 1 });
    expect(s.gates).toHaveLength(3);
    expect(estimate(s).bottleneck.kind).toBe('security');
    const warm = run(s, 2400).state;
    const end = run(warm, 4800).state;
    const measured = ((end.run.earned - warm.run.earned) / 4800) * 4;
    const est = estimate(s).incomePerSec;
    expect(Math.abs(measured - est) / est).toBeLessThan(0.05);
  });
});
