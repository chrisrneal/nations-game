import { describe, expect, it } from 'vitest';
import type { Command, NationId } from '@nations/contracts';
import { NEUTRAL_ENDOWMENT, TUNABLES, type RosterEntry } from '@nations/sim';
import { id, play } from './testkit.test.helpers.ts';

/**
 * The Done-when scenario (prompt 10): a human nation breaks a deal with an AI
 * nation, and the AI answers according to its reciprocity style, with an
 * explanation the human can read.
 *
 * The breaker is short of energy: it offers its whole energy stock for Credit,
 * then burns part of it in the month's economy. When the AI accepts the next
 * month the energy is no longer there, so the breaker reneges (RULES 3.5):
 * nothing moves and the deal is broken.
 */
const base = { ...NEUTRAL_ENDOWMENT, gdpPppBn: 1_200, population: 100_000_000 };
const BREAKER = id('breaker');
const STRICT = id('strict');
const FORGIVING = id('forgiving');
const HARD = id('hard');

const ROSTER: RosterEntry[] = [
  // The human: produces 96% of the energy it burns, so its stock shrinks a little every month.
  { id: 'breaker', name: 'Breaker', endowment: { ...base, foodSelfSufficiency: 50, energySelfSufficiency: 48 } },
  // Two alliances: alliance density 40, so strict (RULES 7.2).
  { id: 'strict', name: 'Strict', endowment: { ...base, foodSelfSufficiency: 50, energySelfSufficiency: 20, alliances: ['a1', 'a2'] } },
  // Import dependence 70 and no alliances: forgiving.
  { id: 'forgiving', name: 'Forgiving', endowment: { ...base, foodSelfSufficiency: 40, energySelfSufficiency: 20 } },
  // Food exporter, import dependence 35: hard bargainer (exploiter).
  { id: 'hard', name: 'Hard', endowment: { ...base, foodSelfSufficiency: 100, energySelfSufficiency: 30 } },
];

const WINDOW = TUNABLES.aiRetaliationWindowTicks.value;
const PUNISH = TUNABLES.aiPunishTicks.value;

/** The breaker offers its whole energy stock to `victim` at `ticks`, asking `pricePct` of reference value. */
function breakDeal(victim: NationId, ticks: readonly number[], pricePct = 100) {
  return (tick: number, session: { state: { nations: Record<string, { private: { stocks: { energy: number } } }>; prices: { energy: number } } }): Command[] => {
    if (!ticks.includes(tick)) return [];
    const amount = session.state.nations[BREAKER]!.private.stocks.energy;
    const credit = Math.max(1, Math.floor((amount * session.state.prices.energy * pricePct) / 100_000));
    return [{ nationId: BREAKER, tick, type: 'makeOffer', payload: { to: victim, give: { resource: 'energy', amount }, get: { resource: 'credit', amount: credit } } }];
  };
}

/** A fair offer from the breaker to the victim at `tick`: 40 energy for its reference value in Credit. */
function fairOffer(victim: NationId) {
  return (tick: number, session: Parameters<ReturnType<typeof breakDeal>>[1]): Command => ({
    nationId: BREAKER,
    tick,
    type: 'makeOffer',
    payload: { to: victim, give: { resource: 'energy', amount: 40 }, get: { resource: 'credit', amount: Math.max(1, Math.floor((40 * session.state.prices.energy) / 1000)) } },
  });
}

function breaks(events: readonly { type: string; tick: number; payload: unknown }[], victim: NationId): number[] {
  return events
    .filter((e) => e.type === 'offerFailed')
    .filter((e) => {
      const p = e.payload as { reneger: string; offer: { from: string; to: string } };
      return p.reneger === BREAKER && (p.offer.to === victim || p.offer.from === victim);
    })
    .map((e) => e.tick);
}

describe('a strict reciprocator retaliates within the tunable window after a broken deal', () => {
  const script = (tick: number, session: Parameters<ReturnType<typeof breakDeal>>[1]): Command[] => [
    ...breakDeal(STRICT, [0])(tick, session),
    ...((tick >= 2 && tick <= 6) || tick === 9 ? [fairOffer(STRICT)(tick, session)] : []),
  ];
  const g = play({ seed: 7, ticks: 16, roster: ROSTER, controllers: { breaker: 'human' }, script: script as never });
  const broke = breaks(g.events, STRICT);
  const fromStrict = g.explanations.filter((e) => e.payload.nationId === STRICT && e.payload.partner === BREAKER);

  it('the scenario really breaks a deal with the strict nation', () => {
    expect(broke).toEqual([1]);
    expect(g.director.mind(STRICT)?.memoryOf(BREAKER)?.broken).toBe(1);
  });

  it(`announces the retaliation to the breaker within aiRetaliationWindowTicks (${WINDOW})`, () => {
    const suspend = fromStrict.find((e) => e.payload.decision === 'suspend');
    expect(suspend).toBeDefined();
    expect(suspend!.tick - broke[0]!).toBeGreaterThan(0);
    expect(suspend!.tick - broke[0]!).toBeLessThanOrEqual(WINDOW);
    expect(suspend!.audience).toContain(BREAKER);
    expect(suspend!.payload.text).toMatch(/^suspended trade with you until month \d+: you broke the deal in month 1 \(\d+ energy for \d+ credit\)$/);
  });

  it('declines every offer from the breaker while retaliating, saying why', () => {
    const answers = fromStrict.filter((e) => ['accept', 'reject', 'counter'].includes(e.payload.decision));
    const during = answers.filter((e) => e.tick > broke[0]! && e.tick <= broke[0]! + PUNISH);
    expect(during.length).toBeGreaterThanOrEqual(PUNISH - 1);
    for (const e of during) {
      expect(e.payload.decision).toBe('reject');
      expect(e.payload.text).toMatch(/^declined: you broke the deal in month 1 .*; no trade with you until month \d+$/);
    }
    // And makes no offers of its own to the breaker meanwhile.
    expect(fromStrict.filter((e) => e.payload.decision === 'offer' && e.tick <= broke[0]! + PUNISH)).toEqual([]);
  });

  it(`resumes trading after aiPunishTicks (${PUNISH}): the retaliation is proportionate`, () => {
    const resume = fromStrict.find((e) => e.payload.decision === 'resume');
    expect(resume?.tick).toBe(broke[0]! + 1 + PUNISH);
    const after = fromStrict.filter((e) => e.tick >= resume!.tick && e.payload.decision === 'accept');
    expect(after.length).toBeGreaterThan(0);
  });
});

describe('a forgiving nation lets aiForgiveLimit breaks pass, then retaliates', () => {
  const g = play({ seed: 7, ticks: 12, roster: ROSTER, controllers: { breaker: 'human' }, script: breakDeal(FORGIVING, [0, 3]) as never });
  const broke = breaks(g.events, FORGIVING);
  const fromF = g.explanations.filter((e) => e.payload.nationId === FORGIVING && e.payload.partner === BREAKER);

  it('forgives the first break and says so, then suspends after the second', () => {
    expect(broke).toEqual([1, 4]);
    const forgive = fromF.find((e) => e.payload.decision === 'forgive');
    expect(forgive?.tick).toBe(2);
    expect(forgive?.payload.text).toMatch(/^forgave the deal in month 1 .*: 1 of 1 allowed; the next one counts$/);
    const suspend = fromF.find((e) => e.payload.decision === 'suspend');
    expect(suspend?.tick).toBe(5);
  });
});

describe('a hard bargainer never refuses, it charges', () => {
  const g = play({ seed: 7, ticks: 10, roster: ROSTER, controllers: { breaker: 'human' }, script: breakDeal(HARD, [0], 80) as never });

  it('remembers the break but announces no suspension', () => {
    expect(breaks(g.events, HARD)).toEqual([1]);
    expect(g.director.mind(HARD)?.memoryOf(BREAKER)?.broken).toBe(1);
    const fromH = g.explanations.filter((e) => e.payload.nationId === HARD && e.payload.partner === BREAKER);
    expect(fromH.filter((e) => e.payload.decision === 'suspend' || e.payload.decision === 'forgive')).toEqual([]);
  });
});
