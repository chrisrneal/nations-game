/**
 * Seeded warehouse runs for the determinism check and the catch-up benchmark.
 * Runs in Node and, bundled, inside Chromium (browser-entry.ts), so it must not
 * touch Node APIs.
 */
import type { WarehouseState, UpgradeId } from '@warehouse/contracts';
import { WarehouseSession, BOOST_IDS, advanceMany, warehouseView, createWarehouse, hashState, stepWarehouse, upgradeCost } from '@warehouse/sim';

/**
 * A scripted player that uses every command: taps a dock every other tick (the
 * pickers every eighth instead, the receiving bay every eighth after that), buys the cheapest affordable upgrade
 * every 8 ticks, tries a boost every 96 ticks (some are refused: locked or
 * recharging), sells when the warehouse is worth a star. Integer decisions only, so it is identical everywhere.
 */
export function scriptedWarehouse(seed: number, ticks: number): WarehouseState {
  // Every third seed starts with $500 (a test fixture), so purchases differ between seeds from the first tick.
  const session = new WarehouseSession({ ...createWarehouse({ seed }), cash: seed % 3 === 0 ? 50_000 : 0 });
  for (let i = 0; i < ticks; i++) {
    const s = session.state;
    if (s.tick % 8 === 4) session.submit({ tick: s.tick, type: 'tapPick', payload: {} });
    else if (s.tick % 8 === 6) session.submit({ tick: s.tick, type: 'tapReceive', payload: {} });
    else if (s.tick % 2 === 0) session.submit({ tick: s.tick, type: 'tap', payload: { dock: (s.tick >> 1) % s.docks.length } });
    if (s.tick % 96 === 48) session.submit({ tick: s.tick, type: 'boost', payload: { boost: BOOST_IDS[Math.floor(s.tick / 96) % BOOST_IDS.length] ?? 'flashSale' } });
    if (s.tick % 8 === 0) {
      const view = warehouseView(s);
      const options = view.upgrades.filter((u) => u.affordable);
      let best: UpgradeId | null = null;
      for (const u of options) if (best === null || (u.cost ?? 0) < upgradeCost(best, s.levels[best])) best = u.id;
      if (best !== null) session.submit({ tick: s.tick, type: 'buy', payload: { upgrade: best } });
      if (view.stars.claimable >= 1 && s.tick % 512 === 0) session.submit({ tick: s.tick, type: 'sell', payload: {} });
    }
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

/** Milliseconds to catch up `ticks` ticks of a busy 8-dock warehouse, `runs` times. */
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

/** A busy 8-dock, mid-game warehouse reached by ordinary commands: the benchmark's starting point. */
export function busyWarehouse(): WarehouseState {
  let s: WarehouseState = { ...createWarehouse({ seed: 11 }), cash: 10 ** 12 };
  const buys: [UpgradeId, number][] = [['docks', 7], ['truck', 5], ['contract', 5], ['loading', 15], ['sales', 15], ['picking', 10], ['receiving', 10], ['crew', 10]];
  for (const [upgrade, times] of buys) {
    for (let i = 0; i < times; i++) s = stepWarehouse(s, [{ tick: s.tick, type: 'buy', payload: { upgrade } }]).state;
  }
  return advanceMany(s, 240);
}
