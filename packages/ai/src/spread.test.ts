import { describe, expect, it } from 'vitest';
import type { NationId } from '@nations/contracts';
import { NEUTRAL_ENDOWMENT, Session, createWorld, viewFor, type RosterEntry } from '@nations/sim';
import { greedyDecide } from './greedy.ts';

/**
 * Prompt 11 (Gate 1 review, top scorer): a seller must not send its spare to
 * the same biggest importers every month. One big energy exporter faces six
 * importers of different sizes and three nations with no energy deficit.
 */
const base = { ...NEUTRAL_ENDOWMENT, gdpPppBn: 12_000, foodSelfSufficiency: 50 };
const energy = (id: string, selfSufficiency: number, gdpPppBn = 12_000): RosterEntry => ({
  id,
  name: id,
  endowment: { ...base, gdpPppBn, energySelfSufficiency: selfSufficiency },
});
const ROSTER: RosterEntry[] = [
  energy('seller', 130, 30_000),
  energy('huge', 10, 30_000),
  energy('big', 20, 20_000),
  energy('mid', 30),
  energy('small', 37),
  energy('tiny', 42),
  energy('least', 46),
  energy('balanced', 50),
  energy('exporter', 70),
  energy('rich', 90),
];
const IMPORTERS = ['huge', 'big', 'mid', 'small', 'tiny', 'least'];
const NO_DEFICIT = ['seller', 'balanced', 'exporter', 'rich'];

/** Energy offers the seller would make, per recipient, over many seeds and months (nothing is submitted). */
function offersBySeller(
  seeds: number,
  months: number,
): { offers: Record<string, number>; first: Record<string, number>; decisions: number; reasons: string[] } {
  const offers: Record<string, number> = {};
  const first: Record<string, number> = {};
  const reasons: string[] = [];
  let decisions = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const session = new Session(createWorld({ seed, roster: ROSTER }));
    for (let month = 0; month < months; month++) {
      const view = viewFor(session.state, 'seller' as NationId);
      const decision = greedyDecide(view, seed);
      decisions++;
      let seen = false;
      decision.commands.forEach((c, i) => {
        if (c.type !== 'makeOffer') return;
        const p = c.payload as { to: string; give: { resource: string } };
        if (p.give.resource !== 'energy') return;
        offers[p.to] = (offers[p.to] ?? 0) + 1;
        if (!seen) first[p.to] = (first[p.to] ?? 0) + 1;
        seen = true;
        reasons.push(decision.reasons[i] as string);
      });
      session.advance(1);
    }
  }
  return { offers, first, decisions, reasons };
}

describe('greedy trader spreads its offers (energy self-sufficiency: 50 = balanced)', () => {
  const { offers, first, decisions, reasons } = offersBySeller(60, 8);
  const total = Object.values(offers).reduce((s, n) => s + n, 0);

  it('the fixture has six importers and a seller with spare energy', () => {
    const state = createWorld({ seed: 1, roster: ROSTER });
    const view = viewFor(state, 'seller' as NationId);
    const deficit = (id: string): number => {
      const n = view.others.find((o) => o.id === id)!;
      return n.public.energy.demand - n.public.energy.production;
    };
    for (const id of IMPORTERS) expect(deficit(id)).toBeGreaterThan(0);
    for (const id of NO_DEFICIT.slice(1)) expect(deficit(id)).toBeLessThanOrEqual(0);
    expect(deficit('huge')).toBeGreaterThan(10 * deficit('least'));
    expect(total).toBeGreaterThan(decisions);
  });

  it('every nation with a deficit gets offers, not only the biggest ones', () => {
    for (const id of IMPORTERS) expect(offers[id] ?? 0, id).toBeGreaterThanOrEqual(Math.ceil(total * 0.03));
  });

  it('never offers to a nation without a deficit', () => {
    for (const id of NO_DEFICIT) expect(offers[id] ?? 0, id).toBe(0);
  });

  it('bigger deficits still get more offers (weighted, not uniform)', () => {
    expect(offers.huge ?? 0).toBeGreaterThan(offers.least ?? 0);
    expect(offers.big ?? 0).toBeGreaterThan(offers.tiny ?? 0);
  });

  it('the biggest importer is not first in line every month', () => {
    expect(first.huge ?? 0).toBeLessThan(decisions * 0.75);
    expect(Object.keys(first).length).toBeGreaterThanOrEqual(4);
  });

  it('keeps a numeric reason for every offer', () => {
    for (const reason of reasons) expect(reason).toMatch(/\d/);
  });

  it('the spread depends on the seed and the month, and is deterministic', () => {
    const a = offersBySeller(5, 4).offers;
    expect(offersBySeller(5, 4).offers).toEqual(a);
    const firstPick = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const view = viewFor(createWorld({ seed, roster: ROSTER }), 'seller' as NationId);
      const offer = greedyDecide(view, seed).commands.find((c) => c.type === 'makeOffer');
      if (offer !== undefined) firstPick.add((offer.payload as { to: string }).to);
    }
    expect(firstPick.size).toBeGreaterThan(2);
  });
});
