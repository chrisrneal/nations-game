/**
 * Seeded airport runs for the determinism check and the catch-up benchmark.
 * Runs in Node and, bundled, inside Chromium (browser-entry.ts), so it must not
 * touch Node APIs.
 */
import type { AirportState, UpgradeId } from '@airport/contracts';
import { AirportSession, BOOST_IDS, advanceMany, airportView, createAirport, hashState, stepAirport, upgradeCost } from '@airport/sim';

/**
 * A scripted player that uses every command: taps a gate every other tick, buys
 * the cheapest affordable upgrade every 8 ticks, tries a boost every 96 ticks
 * (some are refused: locked or recharging), sells when the airport is worth a
 * slot. Integer decisions only, so it is identical everywhere.
 */
export function scriptedAirport(seed: number, ticks: number): AirportState {
  // Every third seed starts with $500 (a test fixture), so purchases differ between seeds from the first tick.
  const session = new AirportSession({ ...createAirport({ seed }), cash: seed % 3 === 0 ? 50_000 : 0 });
  for (let i = 0; i < ticks; i++) {
    const s = session.state;
    if (s.tick % 2 === 0) session.submit({ tick: s.tick, type: 'tap', payload: { gate: (s.tick >> 1) % s.gates.length } });
    if (s.tick % 96 === 48) session.submit({ tick: s.tick, type: 'boost', payload: { boost: BOOST_IDS[Math.floor(s.tick / 96) % BOOST_IDS.length] ?? 'rushHour' } });
    if (s.tick % 8 === 0) {
      const view = airportView(s);
      const options = view.upgrades.filter((u) => u.affordable);
      let best: UpgradeId | null = null;
      for (const u of options) if (best === null || (u.cost ?? 0) < upgradeCost(best, s.levels[best])) best = u.id;
      if (best !== null) session.submit({ tick: s.tick, type: 'buy', payload: { upgrade: best } });
      if (view.slots.claimable >= 1 && s.tick % 512 === 0) session.submit({ tick: s.tick, type: 'sell', payload: {} });
    }
    session.advance(1);
  }
  // Then an hour away, caught up quietly (P4).
  return advanceMany(session.state, 4 * 3600);
}

/** One state hash per seed. */
export function hashAirportSeeds(firstSeed: number, seeds: number, ticks: number): string[] {
  const hashes: string[] = [];
  for (let seed = firstSeed; seed < firstSeed + seeds; seed++) hashes.push(hashState(scriptedAirport(seed, ticks)));
  return hashes;
}

/** Milliseconds to catch up `ticks` ticks of a busy 8-gate airport, `runs` times. */
export function benchAirportCatchUp(ticks: number, runs: number, now: () => number): number[] {
  const busy = busyAirport();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const started = now();
    advanceMany(busy, ticks);
    times.push(now() - started);
  }
  return times;
}

/** A busy 8-gate, mid-game airport reached by ordinary commands: the benchmark's starting point. */
export function busyAirport(): AirportState {
  let s: AirportState = { ...createAirport({ seed: 11 }), cash: 10 ** 12 };
  const buys: [UpgradeId, number][] = [['gates', 7], ['plane', 5], ['route', 5], ['boarding', 15], ['terminal', 15], ['crew', 10]];
  for (const [upgrade, times] of buys) {
    for (let i = 0; i < times; i++) s = stepAirport(s, [{ tick: s.tick, type: 'buy', payload: { upgrade } }]).state;
  }
  return advanceMany(s, 240);
}
