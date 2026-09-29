import { describe, expect, it } from 'vitest';
import type { Event, NationId, NationView } from '@nations/contracts';
import { NEUTRAL_ENDOWMENT, createWorld, viewFor, type RosterEntry } from '@nations/sim';
import { AiDirector, endowmentsOf } from './director.ts';
import { CRISIS_CLOSED_EVENT, PLEDGE_COMMAND, type CrisisSeen } from './perception.ts';
import { personalityFor, type Personality } from './personality.ts';
import { decidePledge, fairShare } from './pledge.ts';

/**
 * Crisis pledges are decided against the crisis contract the AI expects
 * (perception.ts, docs/AI_DESIGN.md). The sim does not model crises yet, so
 * these tests put crises into the View by hand.
 */
const base = { ...NEUTRAL_ENDOWMENT, gdpPppBn: 24_000, population: 100_000_000 };
const ROSTER: RosterEntry[] = [
  { id: 'strict', name: 'Strict', endowment: { ...base, climateExposure: 50, alliances: ['a', 'b'] } },
  { id: 'forgiving', name: 'Forgiving', endowment: { ...base, climateExposure: 50, foodSelfSufficiency: 20, energySelfSufficiency: 20 } },
  { id: 'hard', name: 'Hard', endowment: { ...base, climateExposure: 50, foodSelfSufficiency: 100, energySelfSufficiency: 45 } },
  { id: 'rider', name: 'Rider', endowment: { ...base, climateExposure: 50 } },
];
const S = 'strict' as NationId;
const state = createWorld({ seed: 1, roster: ROSTER });
const exposure = new Map(ROSTER.map((r) => [r.id as NationId, r.endowment!.climateExposure]));
const world = ROSTER.reduce((s, r) => s + r.endowment!.gdpPppBn, 0);

function crisis(pooled: number, target: number): CrisisSeen {
  return { id: 7, kind: 'climate', label: 'flood relief', openedTick: 2, closesTick: 5, pooled, target, pledges: [] };
}
function withCrisis(id: string, c: CrisisSeen): NationView {
  return { ...viewFor(state, id as NationId), crises: [c] } as NationView;
}
const personality = (id: string): Personality => personalityFor(ROSTER.find((r) => r.id === id)!.endowment!, world, viewFor(state, S).rules);

describe('crisis pledges by reciprocity style', () => {
  const c = crisis(0, 400);
  const input = (id: string, lastPaidPct: number | null) => ({ view: withCrisis(id, c), p: personality(id), crisis: c, exposure, lastPaidPct, creditFree: 10_000 });

  it('splits the pool gap by exposure x output', () => {
    expect(fairShare(withCrisis('strict', c), c, exposure)).toBe(100);
  });

  it('strict pays its full share at the first crisis, and only matches others after a poor turnout', () => {
    expect(personality('strict').reciprocity).toBe('strict');
    const first = decidePledge(input('strict', null));
    expect(first.amount).toBe(100);
    expect(first.text).toBe('pledged 100 credit to the flood relief (month 3): first crisis: I pay my full share');
    expect(decidePledge(input('strict', 75)).amount).toBe(100);
    const poor = decidePledge(input('strict', 25));
    expect(poor.amount).toBe(25);
    expect(poor.text).toMatch(/only 25% of nations paid last time/);
  });

  it('forgiving pays whatever others did', () => {
    const p = personality('forgiving');
    expect(p.reciprocity).toBe('forgiving');
    expect(decidePledge(input('forgiving', 0)).amount).toBe(Math.floor((100 * (50 + p.cooperativeness)) / 100));
  });

  it('a hard bargainer free-rides on a well-funded pool and pays a token otherwise', () => {
    expect(personality('hard').reciprocity).toBe('exploiter');
    const funded = crisis(300, 400);
    const skip = decidePledge({ ...input('hard', null), view: withCrisis('hard', funded), crisis: funded });
    expect(skip.amount).toBe(0);
    expect(skip.text).toBe('no pledge to the flood relief (month 3): the pool is 75% funded and pays out by exposure');
    expect(decidePledge(input('hard', null)).amount).toBeGreaterThan(0);
    expect(decidePledge(input('hard', null)).amount).toBeLessThan(50);
  });

  it('never pledges more than aiPledgeMaxIncomePct of a month of output', () => {
    const huge = crisis(0, 10_000_000);
    const view = withCrisis('strict', huge);
    const d = decidePledge({ ...input('strict', null), view, crisis: huge });
    expect(d.amount).toBe(Math.floor((view.self.public.output * view.rules.aiPledgeMaxIncomePct!) / 100));
  });
});

describe('crisis memory reaches trade: "declined: you skipped the flood relief"', () => {
  it('a strict nation that paid declines offers from a nation that skipped', () => {
    const director = new AiDirector({ endowments: endowmentsOf(ROSTER), seed: 1 });
    const closed = { ...crisis(400, 400), pledges: [{ nationId: S, amount: 100 }, { nationId: 'forgiving' as NationId, amount: 100 }] };
    const event: Event = { tick: 5, type: CRISIS_CLOSED_EVENT, payload: { crisis: closed }, audience: [] };
    const tick6 = { ...state, tick: 6 };
    director.observe([event]);
    const out = director.decide(6, (id) => (id === 'rider' ? 'human' : 'ai'), (id) => viewFor(tick6, id));
    const suspend = out.explanations.find((e) => e.payload.nationId === S && e.payload.partner === 'rider');
    expect(suspend?.payload.text).toBe('suspended trade with you until month 10: you skipped the flood relief in month 3');
    // The forgiving nation also paid, but lets it pass; the hard bargainer never punishes.
    expect(out.explanations.find((e) => e.payload.nationId === 'forgiving' && e.payload.partner === 'rider')?.payload.decision).toBe('forgive');
    expect(out.explanations.find((e) => e.payload.nationId === 'hard' && e.payload.partner === 'rider')).toBeUndefined();
  });

  it('pledges go out as public commands, one per open crisis, each explained to everyone', () => {
    const director = new AiDirector({ endowments: endowmentsOf(ROSTER), seed: 1 });
    const c = crisis(0, 400);
    const out = director.decide(3, () => 'ai', (id) => withCrisis(id, { ...c }));
    const pledges = out.commands.filter((x) => x.type === PLEDGE_COMMAND);
    expect(pledges.map((x) => x.nationId).sort()).toEqual(['forgiving', 'hard', 'rider', 'strict']);
    for (const e of out.explanations.filter((x) => x.payload.decision === 'pledge')) expect(e.audience).toEqual([]);
    // Decided once: the next tick sends no second pledge for the same crisis.
    const again = director.decide(4, () => 'ai', (id) => withCrisis(id, { ...c }));
    expect(again.commands.filter((x) => x.type === PLEDGE_COMMAND)).toEqual([]);
  });
});
