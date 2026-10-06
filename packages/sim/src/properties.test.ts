import type { WarehouseCommand, WarehouseState, BoostId, UpgradeId } from '@warehouse/contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hashState } from './hash.ts';
import { BOOST_IDS, UPGRADE_IDS } from './catalog.ts';
import { backlogCapMilliFor, maxLevel, pickingMilliAt, stageCapMilliAt } from './rules.ts';
import { WAREHOUSE_TUNABLES } from './tunables.ts';
import { WarehouseSession } from './session.ts';
import { createWarehouse } from './state.ts';
import { advanceMany, step } from './step.ts';

/**
 * The invariants of RULES 13, as properties over random play: random taps (at
 * docks and at picking), purchases, boosts and sales at random ticks, from random seeds and starting cash.
 */
type Move =
  | { at: number; kind: 'tap'; dock: number }
  | { at: number; kind: 'tapPick' }
  | { at: number; kind: 'buy'; upgrade: UpgradeId }
  | { at: number; kind: 'boost'; boost: BoostId }
  | { at: number; kind: 'sell' };

const move: fc.Arbitrary<Move> = fc.oneof(
  fc.record({ at: fc.nat(400), kind: fc.constant('tap' as const), dock: fc.nat(8) }),
  fc.record({ at: fc.nat(400), kind: fc.constant('tapPick' as const) }),
  fc.record({ at: fc.nat(400), kind: fc.constant('buy' as const), upgrade: fc.constantFrom(...UPGRADE_IDS) }),
  fc.record({ at: fc.nat(400), kind: fc.constant('boost' as const), boost: fc.constantFrom(...BOOST_IDS) }),
  fc.record({ at: fc.nat(400), kind: fc.constant('sell' as const) }),
);

interface Game {
  seed: number;
  cash: number;
  earned: number;
  site: number;
  moves: Move[];
}

const game: fc.Arbitrary<Game> = fc.record({
  seed: fc.integer({ min: 0, max: 0x7fffffff }),
  cash: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 50_000_000 })),
  earned: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 2_000_000_000 })),
  site: fc.nat(7),
  moves: fc.array(move, { maxLength: 40 }),
});

function commandFor(m: Move, tick: number): WarehouseCommand {
  if (m.kind === 'tap') return { tick, type: 'tap', payload: { dock: m.dock } };
  if (m.kind === 'tapPick') return { tick, type: 'tapPick', payload: {} };
  if (m.kind === 'buy') return { tick, type: 'buy', payload: { upgrade: m.upgrade } };
  if (m.kind === 'boost') return { tick, type: 'boost', payload: { boost: m.boost } };
  return { tick, type: 'sell', payload: {} };
}

function start(g: Game): WarehouseState {
  const s = createWarehouse({ seed: g.seed, site: g.site });
  return { ...s, cash: g.cash, run: { ...s.run, earned: g.earned } };
}

function byTick(moves: readonly Move[]): Map<number, WarehouseCommand[]> {
  const map = new Map<number, WarehouseCommand[]>();
  for (const m of moves) map.set(m.at, [...(map.get(m.at) ?? []), commandFor(m, m.at)]);
  return map;
}

function play(g: Game, ticks: number, check?: (s: WarehouseState) => void): WarehouseState {
  const cmds = byTick(g.moves);
  let s = start(g);
  for (let i = 0; i < ticks; i++) {
    s = step(s, cmds.get(s.tick) ?? []).state;
    check?.(s);
  }
  return s;
}

function invariants(s: WarehouseState): void {
  expect(s.cash).toBeGreaterThanOrEqual(0);
  expect(Number.isSafeInteger(s.cash)).toBe(true);
  expect(s.staged).toBeGreaterThanOrEqual(0);
  expect(s.staged).toBeLessThanOrEqual(stageCapMilliAt(s.levels.sales));
  // The picking line (RULES 3): never negative, never longer than its longest at this level (a new contract can slow picking below it).
  expect(s.backlog).toBeGreaterThanOrEqual(0);
  expect(s.backlog).toBeLessThanOrEqual(backlogCapMilliFor(pickingMilliAt(s.levels.picking, 0)));
  expect(s.pickRush).toBeGreaterThanOrEqual(0);
  expect(s.pickRush).toBeLessThanOrEqual(WAREHOUSE_TUNABLES.rushMaxTicks.value);
  expect(s.docks.length).toBe(1 + s.levels.docks);
  for (const g of s.docks) {
    expect(g.loaded).toBeGreaterThanOrEqual(0);
    expect(g.loaded).toBeLessThanOrEqual(g.parcels * 1000);
    expect(g.timer).toBeGreaterThanOrEqual(0);
    expect(g.turn).toBeGreaterThanOrEqual(0);
    expect(g.rush).toBeGreaterThanOrEqual(0);
  }
  for (const id of UPGRADE_IDS) expect(s.levels[id]).toBeLessThanOrEqual(maxLevel(id, s));
  for (const id of BOOST_IDS) {
    expect(s.boosts[id].left).toBeGreaterThanOrEqual(0);
    expect(s.boosts[id].recharge).toBeGreaterThanOrEqual(s.boosts[id].left);
  }
  expect(s.levels.contract).toBeLessThanOrEqual(s.levels.truck);
}

describe('warehouse invariants under random play (RULES 13)', () => {
  it('cash, passengers and loads are never negative and never over their limits', () => {
    fc.assert(fc.property(game, (g) => void play(g, 420, invariants)), { numRuns: 60 });
  }, 20_000);

  it('cash only moves by pays and purchases', () => {
    fc.assert(
      fc.property(game, (g) => {
        const cmds = byTick(g.moves);
        let s = start(g);
        for (let i = 0; i < 420; i++) {
          const r = step(s, cmds.get(s.tick) ?? []);
          let expected = s.cash;
          for (const e of r.events) {
            if (e.type === 'departed') expected += e.payload.cents;
            if (e.type === 'bought') expected -= e.payload.cents;
          }
          if (!r.events.some((e) => e.type === 'sold')) expect(r.state.cash).toBe(expected);
          s = r.state;
        }
      }),
      { numRuns: 30 },
    );
  });

  it('the same seed and the same commands give the same warehouse', () => {
    fc.assert(fc.property(game, (g) => {
      expect(hashState(play(g, 300))).toBe(hashState(play(g, 300)));
    }), { numRuns: 30 });
  });

  it('different seeds draw different expresses', () => {
    const a = advanceMany(createWarehouse({ seed: 1 }), 20_000);
    const b = advanceMany(createWarehouse({ seed: 2 }), 20_000);
    expect(hashState(a)).not.toBe(hashState(b));
  });
});

describe('catch-up equals stepping (P4)', () => {
  it('advanceMany(n) gives exactly the state of n single steps, from any reachable warehouse', () => {
    fc.assert(
      fc.property(game, fc.integer({ min: 1, max: 3000 }), (g, n) => {
        const reached = play(g, 200);
        let stepped = reached;
        for (let i = 0; i < n; i++) stepped = step(stepped, []).state;
        expect(hashState(advanceMany(reached, n))).toBe(hashState(stepped));
      }),
      { numRuns: 25 },
    );
  });

  it('a session catching up hours quietly equals one stepping tick by tick with events', () => {
    const quiet = new WarehouseSession(createWarehouse({ seed: 9 }));
    const loud = new WarehouseSession(createWarehouse({ seed: 9 }));
    for (const s of [quiet, loud]) {
      s.submit({ tick: 0, type: 'tap', payload: { dock: 0 } });
      s.submit({ tick: 300, type: 'boost', payload: { boost: 'flashSale' } });
      s.submit({ tick: 500, type: 'buy', payload: { upgrade: 'loading' } });
      s.submit({ tick: 9000, type: 'buy', payload: { upgrade: 'docks' } });
    }
    quiet.advance(4 * 3600, { events: false });
    loud.advance(4 * 3600);
    expect(quiet.state.tick).toBe(4 * 3600);
    expect(hashState(quiet.state)).toBe(hashState(loud.state));
    expect(quiet.state.levels.docks).toBe(1);
  });
});

describe('saves (S9)', () => {
  it('save, reload and continue matches an uninterrupted run', () => {
    fc.assert(
      fc.property(game, fc.integer({ min: 1, max: 399 }), fc.boolean(), (g, cut, compact) => {
        const commands = g.moves.map((m) => commandFor(m, m.at));
        const straight = new WarehouseSession(start(g));
        const split = new WarehouseSession(start(g));
        for (const c of commands) {
          straight.submit(c);
          split.submit(c);
        }
        straight.advance(400);
        split.advance(cut);
        const file = JSON.parse(JSON.stringify(split.save({ compact }))) as unknown;
        const resumed = WarehouseSession.load(file);
        resumed.advance(400 - cut);
        expect(hashState(resumed.state)).toBe(hashState(straight.state));
      }),
      { numRuns: 30 },
    );
  });

  it('refuses a save that does not replay to its hash, or comes from a newer version', () => {
    const s = new WarehouseSession(createWarehouse({ seed: 1 }));
    s.advance(50);
    const save = s.save();
    expect(() => WarehouseSession.load({ ...save, stateHash: 'nope' })).toThrow(/does not replay/);
    expect(() => WarehouseSession.load({ ...save, schemaVersion: 99 })).toThrow(/newer game version/);
  });
});
