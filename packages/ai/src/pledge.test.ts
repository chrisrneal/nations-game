import { describe, expect, it } from 'vitest';
import type { Crisis, CrisisResult, CrisesView, Event, NationId, NationView, Pledge } from '@nations/contracts';
import { NEUTRAL_ENDOWMENT, createWorld, viewFor, type RosterEntry } from '@nations/sim';
import { AiDirector, endowmentsOf } from './director.ts';
import { personalityFor, type Personality } from './personality.ts';
import { decidePledge, owedShare } from './pledge.ts';

/**
 * Answering crisis appeals (RULES 4). The appeal, pools and results are put
 * into the View by hand here, so each rule can be checked alone; the full-roster
 * games in director.test.ts and gate2.test.ts run them against the real sim.
 */
const base = { ...NEUTRAL_ENDOWMENT, gdpPppBn: 24_000, population: 100_000_000 };
const ROSTER: RosterEntry[] = [
  { id: 'strict', name: 'Strict', endowment: { ...base, climateExposure: 50, alliances: ['a', 'b'] } },
  { id: 'forgiving', name: 'Forgiving', endowment: { ...base, climateExposure: 50, foodSelfSufficiency: 20, energySelfSufficiency: 20 } },
  { id: 'hard', name: 'Hard', endowment: { ...base, climateExposure: 50, foodSelfSufficiency: 100, energySelfSufficiency: 45 } },
  { id: 'rider', name: 'Rider', endowment: { ...base, climateExposure: 50 } },
];
const S = 'strict' as NationId;
const RIDER = 'rider' as NationId;
const state = { ...createWorld({ seed: 1, roster: ROSTER }), tick: 3 };
const world = ROSTER.reduce((s, r) => s + r.endowment!.gdpPppBn, 0);
const ids = ROSTER.map((r) => r.id as NationId);

function appeal(target = 400): Crisis {
  return { id: 7, kind: 'climate', pool: 'adaptation', severity: 20, openedTick: 2, deadlineTick: 5, target, shares: Object.fromEntries(ids.map((id) => [id, target / 4])), answers: {} };
}
function lockedResult(contributors: NationId[], freeRiders: NationId[]): CrisisResult {
  return { id: 3, kind: 'climate', severity: 20, openedTick: 0, deadlineTick: 1, target: 400, effective: 0, coverBp: 0, outcome: 'partial', contributors, freeRiders };
}
function crisesView(open: Crisis[], opts: { balance?: number; paid?: number; recent?: CrisisResult[] } = {}): CrisesView {
  const pool = (kind: 'adaptation' | 'health') => ({ kind, balance: kind === 'adaptation' ? (opts.balance ?? 0) : 0, late: 0, round: kind === 'adaptation' && opts.paid ? { [S]: opts.paid } : {}, lastFundedBp: 10_000 });
  return { pools: [pool('adaptation'), pool('health')], open, recent: opts.recent ?? [], pledges: [], hits: [] };
}
function viewWith(id: string, crises: CrisesView): NationView {
  return { ...viewFor(state, id as NationId), crises };
}
const personality = (id: string): Personality => personalityFor(ROSTER.find((r) => r.id === id)!.endowment!, world, viewFor(state, S).rules);
const input = (id: string, crises: CrisesView) => ({ view: viewWith(id, crises), p: personality(id), crisis: crises.open[0]!, creditFree: 10_000 });

describe('answering a crisis appeal, by reciprocity style', () => {
  it('owes its share less what it already paid into the pool this round', () => {
    expect(owedShare(viewWith('strict', crisesView([appeal()])), appeal())).toBe(100);
    expect(owedShare(viewWith('strict', crisesView([appeal()], { paid: 30 })), appeal())).toBe(70);
  });

  it('strict pays its full share at the first appeal, and only matches others after a poor turnout', () => {
    expect(personality('strict').reciprocity).toBe('strict');
    const first = decidePledge(input('strict', crisesView([appeal()])));
    expect(first.amount).toBe(100);
    expect(first.text).toBe('paid 100 credit to the climate relief (month 3): first climate appeal: I pay my full share of 100');
    const good = crisesView([appeal()], { recent: [lockedResult([S, RIDER, 'hard' as NationId], ['forgiving' as NationId])] });
    expect(decidePledge(input('strict', good)).amount).toBe(100);
    const poor = decidePledge(input('strict', crisesView([appeal()], { recent: [lockedResult([S], ['hard', 'rider', 'forgiving'] as NationId[])] })));
    expect(poor.amount).toBe(25);
    expect(poor.text).toMatch(/only 25% of nations paid last time/);
  });

  it('forgiving pays whatever others did', () => {
    const p = personality('forgiving');
    expect(p.reciprocity).toBe('forgiving');
    const none = crisesView([appeal()], { recent: [lockedResult([], ids)] });
    expect(decidePledge(input('forgiving', none)).amount).toBe(Math.floor((100 * (50 + p.cooperativeness)) / 100));
  });

  it('a hard bargainer free-rides on a well-funded pool and pays a token otherwise', () => {
    expect(personality('hard').reciprocity).toBe('exploiter');
    const skip = decidePledge(input('hard', crisesView([appeal()], { balance: 300 })));
    expect(skip.amount).toBe(0);
    expect(skip.text).toBe('declined the climate relief (month 3): the pool is 75% funded and pays out by exposure');
    const token = decidePledge(input('hard', crisesView([appeal()])));
    expect(token.amount).toBeGreaterThan(0);
    expect(token.amount).toBeLessThan(50);
  });

  it('never pays more than aiPledgeMaxIncomePct of a month of output', () => {
    const huge = crisesView([appeal(40_000_000)]);
    const d = decidePledge(input('strict', huge));
    const view = viewWith('strict', huge);
    expect(d.amount).toBe(Math.floor((view.self.public.output * view.rules.aiPledgeMaxIncomePct!) / 100));
  });
});

describe('the director answers appeals with commands the sim relays as explanations', () => {
  it('pays with `contribute` or answers no with `declineAppeal`, once per appeal, each with a numeric why', () => {
    const director = new AiDirector({ endowments: endowmentsOf(ROSTER), seed: 1, freeRiders: ['rider'] });
    const cv = crisesView([appeal()]);
    const out = director.decide(3, () => 'ai', (id) => viewWith(id, cv));
    const answers = out.commands.filter((c) => c.type === 'contribute' || c.type === 'declineAppeal');
    expect(answers.map((c) => `${c.nationId}:${c.type}`).sort()).toEqual(['forgiving:contribute', 'hard:contribute', 'rider:declineAppeal', 'strict:contribute']);
    for (const c of answers) {
      expect(c.why?.length).toBeGreaterThan(0);
      for (const line of c.why ?? []) expect(line).toMatch(/\d/);
    }
    expect(out.explanations.filter((e) => e.payload.crisisId === 7).every((e) => e.audience.length === 0)).toBe(true);
    const again = director.decide(4, () => 'ai', (id) => viewWith(id, cv));
    expect(again.commands.filter((c) => c.type === 'contribute' || c.type === 'declineAppeal')).toEqual([]);
  });
});

describe('crisis memory reaches trade', () => {
  const tick6 = { ...state, tick: 6 };
  const decideAfter = (event: Event) => {
    const director = new AiDirector({ endowments: endowmentsOf(ROSTER), seed: 1 });
    director.observe([event]);
    return director.decide(6, (id) => (id === RIDER ? 'human' : 'ai'), (id) => viewFor(tick6, id));
  };
  const about = (out: ReturnType<typeof decideAfter>, from: string) => out.explanations.find((e) => e.payload.nationId === from && e.payload.partner === RIDER);

  it('a strict nation that paid suspends trade with a free-rider: "you skipped the climate relief"', () => {
    const result = { ...lockedResult([S, 'forgiving' as NationId], [RIDER, 'hard' as NationId]), openedTick: 2 };
    const out = decideAfter({ tick: 5, type: 'crisisLocked', payload: { result }, audience: [] });
    expect(about(out, 'strict')?.payload.text).toBe('suspended trade with you until month 10: you skipped the climate relief in month 3');
    // The forgiving nation also paid, but lets it pass; the hard bargainer paid nothing, so holds nothing.
    expect(about(out, 'forgiving')?.payload.decision).toBe('forgive');
    expect(about(out, 'hard')).toBeUndefined();
  });

  it('a broken promise to the world is remembered by everyone', () => {
    const pledge: Pledge = { id: 4, nationId: RIDER, pool: 'health', amount: 200, paid: 0, createdTick: 1, deadlineTick: 5 };
    const out = decideAfter({ tick: 5, type: 'pledgeBroken', payload: { pledge, reason: 'withdrawn' }, audience: [] });
    expect(about(out, 'strict')?.payload.text).toBe('suspended trade with you until month 10: you broke your pledge of 200 credit to the health pool in month 2');
  });
});
