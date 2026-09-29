import { describe, expect, it } from 'vitest';
import type { CrisisEventPayloads, NationId } from '@nations/contracts';
import { fullRoster, play } from './testkit.test.helpers.ts';

/**
 * GATE-2 F2: an AI nation whose share of an appeal is already paid (by its
 * monthly contribution) must never be shown as having declined. Before the
 * fix, 98% of the AI's "declined" answers were nations that had paid in full.
 */
const roster = fullRoster();

describe('crisis answers of nations that already paid their share (20 all-AI games)', () => {
  it('0 paid-in-full nations are recorded as declined, and their own words say they paid', () => {
    let paidInFull = 0;
    let declined = 0;
    for (let seed = 1; seed <= 20; seed++) {
      // Each nation's share and what it had paid this round, at the start of every month (what its View showed).
      const before = new Map<string, { share: number; paid: number }>();
      const game = play({
        seed,
        ticks: 60,
        roster,
        script: (tick, session) => {
          for (const c of session.state.crises) {
            for (const [id, share] of Object.entries(c.shares)) {
              before.set(`${tick}:${c.id}:${id}`, { share, paid: session.state.pools[c.pool].round[id as NationId] ?? 0 });
            }
          }
          return [];
        },
      });
      for (const e of game.events) {
        if (e.type !== 'appealAnswered') continue;
        const a = e.payload as CrisisEventPayloads['appealAnswered'];
        const seen = before.get(`${e.tick}:${a.crisisId}:${a.nationId}`);
        if (seen === undefined || seen.share <= 0 || seen.paid < seen.share) continue;
        paidInFull++;
        if (a.answer === 'declined') declined++;
        expect(a.answer).toBe('contributed');
        const said = game.explanations.find((x) => x.tick === e.tick && x.payload.nationId === a.nationId && x.payload.crisisId === a.crisisId);
        if (said !== undefined) expect(said.payload.text).toMatch(/^paid .* in full/);
      }
    }
    expect(paidInFull).toBeGreaterThan(100);
    expect(declined).toBe(0);
  }, 60_000);
});
