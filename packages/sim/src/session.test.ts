import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Command } from '@nations/contracts';
import { hashState } from './hash.ts';
import { MIGRATIONS, migrateSave } from './save.ts';
import { Session } from './session.ts';
import { A, B, C, D, ping, setController, world } from './testkit.ts';
import { SCHEMA_VERSION } from './world.ts';

const IDS = [A, B, C, D];

/** A scripted game: at tick t, a couple of pings chosen from the seed, and a controller switch now and then. */
function scriptFor(seed: number, tick: number): Command[] {
  const a = IDS[(seed + tick) % 4] ?? A;
  const b = IDS[(seed + tick * 3 + 1) % 4] ?? B;
  const out: Command[] = [];
  if (a !== b) out.push(ping(a, b, tick));
  if (tick % 7 === 3) out.push(setController(a, tick % 2 === 0 ? 'caretaker' : 'ai', tick));
  return out;
}

function play(session: Session, seed: number, from: number, to: number): void {
  for (let t = from; t < to; t++) {
    for (const command of scriptFor(seed, t)) session.submit(command);
    session.advance(1);
  }
}

describe('command queue via Session', () => {
  it('rejects at submit what can never succeed', () => {
    const session = new Session(world());
    session.advance(2);
    expect(session.submit(ping(A, B, 1))).toEqual({ ok: false, reason: 'tick already stepped' });
    expect(session.submit(ping(A, A, 2))).toEqual({ ok: false, reason: 'cannot ping self' });
    expect(session.submit({ nationId: A, tick: 2, type: 'x', payload: {} }).ok).toBe(false);
    expect(session.submit(ping(A, B, 2))).toEqual({ ok: true });
  });

  it('holds future commands until their tick', () => {
    const session = new Session(world());
    session.submit(ping(A, B, 3));
    session.advance(3);
    expect(session.state.nations[B]?.public.pingsReceived).toBe(0);
    const events = session.advance(1);
    expect(events.filter((e) => e.type === 'pinged')).toHaveLength(1);
    expect(session.state.nations[B]?.public.pingsReceived).toBe(1);
  });

  it('only advance moves the tick', () => {
    const session = new Session(world());
    session.submit(ping(A, B, 0));
    session.save();
    expect(session.state.tick).toBe(0);
    session.advance(5);
    expect(session.state.tick).toBe(5);
  });
});

describe('save and load', () => {
  it('save -> JSON -> load -> continue equals an uninterrupted run (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 60 }),
        fc.boolean(),
        (seed, split, compact) => {
          const total = 60;
          const first = new Session(world(seed));
          play(first, seed, 0, split);
          // A command queued for the future must survive the save too.
          first.submit(ping(A, B, split + 1));
          const json = JSON.stringify(first.save({ compact }));
          const resumed = Session.load(JSON.parse(json));
          expect(resumed.state.tick).toBe(split);
          play(resumed, seed, split, total);

          // The uninterrupted run gets the same extra command, never saved.
          const again = new Session(world(seed));
          play(again, seed, 0, split);
          again.submit(ping(A, B, split + 1));
          play(again, seed, split, total);
          expect(hashState(resumed.state)).toBe(hashState(again.state));
        },
      ),
      { numRuns: 60 },
    );
  });

  it('a full (non-compact) save replays the whole game from tick 0', () => {
    const session = new Session(world(11));
    play(session, 11, 0, 25);
    const save = session.save();
    expect(save.snapshot.tick).toBe(0);
    expect(save.savedAtTick).toBe(25);
    expect(save.commandLog.length).toBeGreaterThan(0);
    expect(hashState(Session.load(save).state)).toBe(hashState(session.state));
  });

  it('refuses a save whose log does not replay to its recorded hash', () => {
    const session = new Session(world(3));
    play(session, 3, 0, 10);
    const save = session.save();
    const tampered = { ...save, commandLog: save.commandLog.slice(1) };
    expect(() => Session.load(tampered)).toThrow(/does not replay/);
  });

  it('refuses a save from a newer version, and one with no migration path', () => {
    const save = new Session(world()).save();
    expect(() => Session.load({ ...save, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer/);
    expect(() => migrateSave({ ...save, schemaVersion: 0 })).toThrow(/No migration/);
    expect(() => migrateSave({})).toThrow(/schemaVersion/);
  });

  /** A version-3 save (before Phase 2's crises) made from a current one: no pools, crises, pledges or crisis policy. */
  function asVersion3(save: ReturnType<Session['save']>): Record<string, unknown> {
    const snapshot: Record<string, unknown> = { ...save.snapshot, schemaVersion: 3 };
    for (const key of ['pools', 'crises', 'recentCrises', 'pledges', 'hits', 'nextCrisisId', 'nextPledgeId']) delete snapshot[key];
    const nations: Record<string, unknown> = {};
    for (const [id, n] of Object.entries(save.snapshot.nations)) {
      const drop = (o: object, keys: string[]): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
      const priv = drop(n.private, ['pledgesHonoured', 'pledgesBroken', 'pooledTotal']);
      const policy = drop(n.private.policy, ['crisisRule', 'contributionBp', 'contributionTo']);
      const last = drop(n.private.last, ['crisisPct', 'contributed']);
      nations[id] = { ...n, private: { ...priv, policy, last } };
    }
    snapshot.nations = nations;
    return { ...save, schemaVersion: 3, snapshot, stateHash: hashState(snapshot as never) };
  }

  /** A version-2 save (before prompt 09's smoothed score) made from a current one. */
  function asVersion2(save: ReturnType<Session['save']>): Record<string, unknown> {
    const v3 = asVersion3(save);
    const snapshot: Record<string, unknown> = { ...(v3.snapshot as object), schemaVersion: 2 };
    delete snapshot.scoreTrack;
    return { ...v3, schemaVersion: 2, snapshot, stateHash: hashState(snapshot as never) };
  }

  /** Nations with the Phase 2 counters and crisis report zeroed, as a migrated save has them. */
  function phase1View(nations: Session['state']['nations']): unknown {
    return Object.fromEntries(
      Object.entries(nations).map(([id, n]) => [
        id,
        { ...n, private: { ...n.private, pledgesHonoured: 0, pledgesBroken: 0, pooledTotal: 0, last: { ...n.private.last, crisisPct: 0, contributed: 0 } } },
      ]),
    );
  }

  it('migrates a compact version-3 save: same position, no crises open, default crisis policy', () => {
    const session = new Session(world(5));
    play(session, 5, 0, 12);
    const v3 = asVersion3(session.save({ compact: true }));
    const loaded = Session.load(JSON.parse(JSON.stringify(v3)));
    expect(loaded.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.state.tick).toBe(12);
    expect(loaded.state.crises).toEqual([]);
    expect(loaded.state.pools.adaptation.balance).toBe(0);
    expect(loaded.state.nations).toEqual(phase1View(session.state.nations));
    loaded.advance(1);
    expect(loaded.state.tick).toBe(13);
  });

  it('refuses a version-3 save that needs its move history replayed', () => {
    const session = new Session(world(5));
    play(session, 5, 0, 12);
    expect(() => Session.load(asVersion3(session.save()))).toThrow(/crises changed the rules.*Start a new game/);
  });

  it('migrates a compact version-2 save: same position, score smoothing starts from the next month', () => {
    const session = new Session(world(5));
    play(session, 5, 0, 12);
    const v2 = asVersion2(session.save({ compact: true }));
    const loaded = Session.load(JSON.parse(JSON.stringify(v2)));
    expect(loaded.state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.state.tick).toBe(12);
    expect(loaded.state.scoreTrack).toEqual({});
    expect(loaded.state.nations).toEqual(phase1View(session.state.nations));
    loaded.advance(1);
    expect(Object.keys(loaded.state.scoreTrack)).toHaveLength(4);
  });

  it('refuses a version-2 save that needs its move history replayed, with a message a player can act on', () => {
    const session = new Session(world(5));
    play(session, 5, 0, 12);
    const v2 = asVersion2(session.save());
    expect(() => Session.load(v2)).toThrow(/scoring rules changed.*Start a new game/);
  });

  it('runs registered migrations in order (stub registry)', () => {
    expect(Object.keys(MIGRATIONS)).toEqual(['1', '2', '3', '4']);
    expect(() => migrateSave({ schemaVersion: 1 })).toThrow(/Phase 0 prototype/);
    const migrated = migrateSave(
      { schemaVersion: 1, a: 1 },
      {
        1: (s) => ({ ...s, schemaVersion: 2, b: 2 }),
        2: (s) => ({ ...s, schemaVersion: 3, c: 3 }),
      },
      3,
    );
    expect(migrated).toEqual({ schemaVersion: 3, a: 1, b: 2, c: 3 });
  });
});
