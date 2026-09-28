import { describe, expect, it } from 'vitest';
import type { Event } from '@nations/contracts';
import { Session, createWorld, viewFor } from '@nations/sim';
import { dummyDecide } from './dummy.ts';

const ROSTER = [
  { id: 'AAA', name: 'Alpha' },
  { id: 'BBB', name: 'Bravo' },
  { id: 'CCC', name: 'Charlie' },
  { id: 'DDD', name: 'Delta' },
  { id: 'EEE', name: 'Echo' },
];

describe('dummy AI', () => {
  it('is deterministic for the same seed and View, and varies with the seed', () => {
    const state = createWorld({ seed: 1, roster: ROSTER });
    const view = viewFor(state, state.nationOrder[0]!);
    expect(dummyDecide(view, 7)).toEqual(dummyDecide(view, 7));
    const seeds = Array.from({ length: 20 }, (_, s) => JSON.stringify(dummyDecide(view, s)));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('only targets nations its View says exist, stamped with the View tick', () => {
    const state = createWorld({ seed: 2, roster: ROSTER });
    for (const id of state.nationOrder) {
      const view = viewFor(state, id);
      for (let seed = 0; seed < 50; seed++) {
        for (const command of dummyDecide(view, seed)) {
          expect(command.nationId).toBe(id);
          expect(command.tick).toBe(view.tick);
          expect(view.knownNations).toContain((command.payload as { target: string }).target);
        }
      }
    }
  });

  it('100 ticks of dummy AI for every nation produce only accepted commands', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const session = new Session(createWorld({ seed, roster: ROSTER }));
      const events: Event[] = [];
      let submitted = 0;
      for (let t = 0; t < 100; t++) {
        for (const id of session.state.nationOrder) {
          for (const command of dummyDecide(viewFor(session.state, id), seed)) {
            expect(session.submit(command)).toEqual({ ok: true });
            submitted++;
          }
        }
        events.push(...session.advance(1));
      }
      expect(submitted).toBeGreaterThan(100);
      expect(events.filter((e) => e.type === 'commandRejected')).toEqual([]);
      expect(events.filter((e) => e.type === 'pinged')).toHaveLength(submitted);
    }
  });
});
