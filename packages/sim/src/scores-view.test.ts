import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import type { Command, NationId } from '@nations/contracts';
import { scoreboard } from './score.ts';
import { step } from './step.ts';
import { amt, answer, offer } from './testkit.ts';
import { viewFor } from './view.ts';
import { createWorld, NEUTRAL_ENDOWMENT, type RosterEntry, type WorldState } from './world.ts';

/**
 * Prompt 12 (Gate 1 review, finding N1): the View carries the sim's own
 * scoreboard, so the interface never recomputes a score. Every viewer sees
 * the same numbers the sim ranks by, and the same winner.
 */
const base = { ...NEUTRAL_ENDOWMENT, population: 100_000_000, gdpPppBn: 1_200 };
const ROSTER: RosterEntry[] = [
  { id: 'aa', name: 'A', endowment: { ...base, foodSelfSufficiency: 100, energySelfSufficiency: 20 } },
  { id: 'bb', name: 'B', endowment: { ...base, foodSelfSufficiency: 20, energySelfSufficiency: 100 } },
  { id: 'cc', name: 'C', endowment: { ...base, foodSelfSufficiency: 35, energySelfSufficiency: 45, gdpPppBn: 6_000 } },
  { id: 'dd', name: 'D', endowment: { ...base, foodSelfSufficiency: 70, energySelfSufficiency: 60, gdpPppBn: 400 } },
  { id: 'rr', name: 'R', endowment: { ...base, kind: 'aggregate', foodSelfSufficiency: 40, energySelfSufficiency: 80 } },
];
const PLAYABLE = ['aa', 'bb', 'cc', 'dd'] as NationId[];
const ALL = [...PLAYABLE, 'rr' as NationId];

/** A seeded month of moves: each playable nation may offer a random good to a random partner, and accept what it was offered. */
const moves = fc.array(
  fc.record({
    from: fc.constantFrom(...PLAYABLE),
    to: fc.constantFrom(...ALL),
    give: fc.constantFrom('food', 'energy'),
    units: fc.integer({ min: 1, max: 60 }),
    credit: fc.integer({ min: 1, max: 40 }),
    accept: fc.boolean(),
  }),
  { maxLength: 4 },
);

function play(seed: number, months: readonly (readonly { from: NationId; to: NationId; give: string; units: number; credit: number; accept: boolean }[])[]): WorldState {
  let state = createWorld({ seed, roster: ROSTER });
  for (const month of months) {
    const commands: Command[] = [];
    for (const o of state.offers) {
      if (PLAYABLE.includes(o.to) && month.some((m) => m.accept && m.from === o.to)) commands.push(answer('acceptOffer', o.to, o.id, state.tick));
    }
    for (const m of month) {
      if (m.from === m.to) continue;
      commands.push(offer(m.from, m.to, amt(m.give as 'food' | 'energy', m.units), amt('credit', m.credit), state.tick));
    }
    state = step(state, commands).state;
  }
  return state;
}

const winner = (nations: readonly { id: NationId; finalScore: number }[]): NationId | undefined =>
  [...nations].sort((a, b) => b.finalScore - a.finalScore || (a.id < b.id ? -1 : 1))[0]?.id;

describe('scores in the View', () => {
  it('every viewer gets the scoreboard the sim ranks by: same ownScore, final score, multiplier and winner', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), fc.array(moves, { minLength: 1, maxLength: 30 }), (seed, months) => {
        const state = play(seed, months);
        const board = scoreboard(state);
        for (const id of ALL) {
          const view = viewFor(state, id);
          expect(view.scores.multiplierBp).toBe(board.multiplierBp);
          expect(view.scores.nations).toEqual(board.nations);
          expect(winner(view.scores.nations)).toBe(winner(board.nations));
        }
      }),
      { numRuns: 120 },
    );
  });

  it('scores the smoothed track, which can differ from last month read alone', () => {
    const months = Array.from({ length: 24 }, (_, t) => (t < 12 ? [{ from: 'aa' as NationId, to: 'bb' as NationId, give: 'food', units: 60, credit: 30, accept: true }] : []));
    const state = play(3, months);
    const view = viewFor(state, 'cc' as NationId);
    expect(view.scores.nations.map((n) => n.id)).toEqual(PLAYABLE);
    const track = state.scoreTrack['aa' as NationId]!;
    const a = view.scores.nations.find((n) => n.id === 'aa')!;
    expect(a.ownScoreBp).toBe(Math.floor((track.outputE3 * 10_000) / track.baselineE3));
  });

  it('carries only public numbers: no stock, trust or policy of another nation', () => {
    const view = viewFor(play(5, [[]]), 'aa' as NationId);
    for (const n of view.scores.nations) expect(Object.keys(n).sort()).toEqual(['finalScore', 'id', 'ownScoreBp']);
    // collectiveBp is the mean of the four public goals (RULES 5.2, 5.4): public by construction.
    expect(Object.keys(view.scores).sort()).toEqual(['collectiveBp', 'goals', 'multiplierBp', 'nations']);
    expect(Object.keys(view.scores.goals).sort()).toEqual(['atBaselineBp', 'climateAvoidedBp', 'deficitsMetBp', 'pandemicAvoidedBp']);
  });
});
