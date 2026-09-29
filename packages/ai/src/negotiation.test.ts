import { describe, expect, it } from 'vitest';
import type { NationId, NationView, TradeOffer } from '@nations/contracts';
import { NEUTRAL_ENDOWMENT, createWorld, viewFor, type RosterEntry } from '@nations/sim';
import { decayMemory, emptyMemory, remember } from './beliefs.ts';
import { answerOffer, type Ledger } from './negotiation.ts';
import { personalityFor } from './personality.ts';

const base = { ...NEUTRAL_ENDOWMENT, gdpPppBn: 1_200, population: 100_000_000 };
const ROSTER: RosterEntry[] = [
  { id: 'buyer', name: 'Buyer', endowment: { ...base, foodSelfSufficiency: 20, energySelfSufficiency: 50, alliances: ['a', 'b'] } },
  { id: 'seller', name: 'Seller', endowment: { ...base, foodSelfSufficiency: 100, energySelfSufficiency: 50 } },
];
const BUYER = 'buyer' as NationId;
const SELLER = 'seller' as NationId;
const state = createWorld({ seed: 1, roster: ROSTER });

function viewWithTrust(trust: number): NationView {
  const v = viewFor(state, BUYER);
  return { ...v, self: { ...v.self, private: { ...v.self.private, trust: { ...v.self.private.trust, [SELLER]: trust } } } };
}
const p = personalityFor({ ...ROSTER[0]!.endowment! }, 2_400, viewFor(state, BUYER).rules);

/** Seller offers 1,000 food for `credit` Credit. */
function offer(credit: number): TradeOffer {
  return { id: 1, from: SELLER, to: BUYER, give: { resource: 'food', amount: 1_000 }, get: { resource: 'credit', amount: credit }, createdTick: 0, expiryTick: 3, hardBargain: false, counterOf: null };
}
function ledger(): Ledger {
  return { need: { food: 600, energy: 0 }, spare: { food: 0, energy: 0 }, stocks: { food: 1_000, energy: 100, credit: 1_000 }, creditFree: 1_000, open: 0 };
}
const fairCredit = Math.floor((1_000 * state.prices.food) / 1000);

describe('negotiation: accept, counter, reject, shifted by trust', () => {
  it('the same pricey offer is accepted from a trusted partner and countered from a distrusted one', () => {
    const pricey = offer(Math.floor(fairCredit * 1.12));
    expect(answerOffer(viewWithTrust(85), p, pricey, undefined, ledger()).kind).toBe('accept');
    const cold = answerOffer(viewWithTrust(10), p, pricey, undefined, ledger());
    expect(cold.kind).toBe('counter');
    if (cold.kind === 'counter') {
      expect(cold.get).toEqual({ resource: 'food', amount: 1_000 });
      expect(cold.give.amount).toBeLessThan(pricey.get.amount);
      expect(cold.text).toMatch(/^countered: for 1000 food I give \d+ credit, not \d+ \(your terms are \d+% under my price\)$/);
    }
  });

  it('declines far-off terms and useless goods, with the number that decided it', () => {
    const r = answerOffer(viewWithTrust(10), p, offer(Math.floor(fairCredit * 1.34)), undefined, ledger());
    expect(r.kind).toBe('reject');
    expect(r.text).toMatch(/^declined: your terms are \d+% under my price$/);
    const full = { ...ledger(), need: { food: 0, energy: 0 } };
    expect(answerOffer(viewWithTrust(50), p, offer(fairCredit), undefined, full).text).toBe('declined: no need for 1000 food: my food need this month is 0');
  });

  it('declines a partner under retaliation, naming the broken deal and the month it ends', () => {
    const view = viewWithTrust(80);
    const memory = new Map([[SELLER, emptyMemory()]]);
    const broken = { ...offer(5), createdTick: 3 };
    remember(memory, [{ kind: 'broken', partner: SELLER, tick: 4, offer: broken }], 'strict', view, 5);
    const r = answerOffer({ ...view, tick: 6 }, p, offer(fairCredit), memory.get(SELLER), ledger());
    expect(r.kind).toBe('reject');
    expect(r.text).toBe(`declined: you broke the deal in month 4 (1000 food for 5 credit); no trade with you until month ${5 + view.rules.aiPunishTicks! + 1}`);
  });
});

describe('repeat offences escalate', () => {
  it('a second break inside memory doubles the retaliation, a third triples it, then it stops growing', () => {
    const view = viewWithTrust(50);
    const punish = view.rules.aiPunishTicks!;
    const memory = new Map([[SELLER, emptyMemory()]]);
    const brk = (tick: number) => remember(memory, [{ kind: 'broken', partner: SELLER, tick, offer: offer(5) }], 'strict', view, tick + 1);
    brk(0);
    expect(memory.get(SELLER)!.punishUntil).toBe(1 + punish);
    brk(10);
    expect(memory.get(SELLER)!.punishUntil).toBe(11 + 2 * punish);
    brk(40);
    expect(memory.get(SELLER)!.punishUntil).toBe(41 + 3 * punish);
    brk(80);
    expect(memory.get(SELLER)!.punishUntil).toBe(81 + 3 * punish);
  });
});

describe('memory fades', () => {
  it('a grievance decays by aiMemoryDecayPct a tick and the offence count resets once it is gone', () => {
    const view = viewWithTrust(50);
    const memory = new Map([[SELLER, emptyMemory()]]);
    remember(memory, [{ kind: 'broken', partner: SELLER, tick: 0, offer: offer(5) }], 'forgiving', view, 1);
    const m = memory.get(SELLER)!;
    expect(m.grudgeE2).toBe(view.rules.aiGrudgePerBreak! * 100);
    expect(m.pending).toEqual(['forgive']);
    decayMemory(memory, view);
    expect(m.grudgeE2).toBe(Math.floor((view.rules.aiGrudgePerBreak! * 100 * (100 - view.rules.aiMemoryDecayPct!)) / 100));
    for (let i = 0; i < 200; i++) decayMemory(memory, view);
    expect(m.grudgeE2).toBe(0);
    expect(m.offences).toBe(0);
    expect(m.broken).toBe(1); // the record stays; only the grievance fades
  });
});
