import { describe, expect, it } from 'vitest';
import type { Command, CrisisEventPayloads, Event, NationId, NationRecord, StandingPolicy } from '@nations/contracts';
import { hitBp, ownCoverBp } from './crisis.ts';
import { buildRecap } from './recap.ts';
import { scoreboard } from './score.ts';
import { step } from './step.ts';
import { TUNABLES } from './tunables.ts';
import { viewFor } from './view.ts';
import { createWorld, NEUTRAL_ENDOWMENT, type RosterEntry, type WorldState } from './world.ts';

/**
 * Crises, pools, pledges and crisis trust (docs/RULES.md section 4, Phase 2
 * prompt 09). Every test runs with nobody online unless it sends a command:
 * deadlines pass and standing policies answer.
 */
const id = (raw: string): NationId => raw as NationId;
const HI = id('hi');
const LO = id('lo');
const MID = id('mid');
const REG = id('reg');

// Output about 2,000 a month each, so pool targets are a few hundred Credit and rounding stays small.
const base = { ...NEUTRAL_ENDOWMENT, population: 100_000_000, gdpPppBn: 24_000 };
/** HI is highly exposed and unprepared, LO barely exposed, MID in between; REG a background region. */
const ROSTER: RosterEntry[] = [
  { id: 'hi', name: 'High', endowment: { ...base, climateExposure: 60, pandemicPreparedness: 20 } },
  { id: 'lo', name: 'Low', endowment: { ...base, climateExposure: 20, pandemicPreparedness: 80 } },
  { id: 'mid', name: 'Mid', endowment: { ...base, climateExposure: 40, pandemicPreparedness: 50 } },
  { id: 'reg', name: 'Region', endowment: { ...base, kind: 'aggregate', climateExposure: 40, pandemicPreparedness: 50 } },
];
const ALL = [HI, LO, MID, REG];
const OPEN = TUNABLES.climateFirstOpenTick.value;
const DEADLINE = OPEN + TUNABLES.crisisResponseTicks.value;

/** A world where nobody is at the controls; `policy` is applied to every nation at tick 0 by the sim's own command path. */
function world(policy: Partial<StandingPolicy> = {}, seed = 3): WorldState {
  const s = createWorld({ seed, roster: ROSTER, controllers: { hi: 'human', lo: 'human', mid: 'human' } });
  if (Object.keys(policy).length === 0) return s;
  return step(s, ALL.map((n) => ({ nationId: n, tick: 0, type: 'setPolicy', payload: policy }))).state;
}

/** Steps until `tick` is the next tick to be stepped, collecting events; `script[t]` are the commands stamped for tick t. */
function runTo(s: WorldState, tick: number, script: Record<number, Command[]> = {}): { state: WorldState; events: Event[] } {
  const events: Event[] = [];
  let state = s;
  while (state.tick < tick) {
    const r = step(state, script[state.tick] ?? []);
    events.push(...r.events);
    state = r.state;
  }
  return { state, events };
}

const nation = (s: WorldState, n: NationId): NationRecord => s.nations[n] as NationRecord;
const trust = (s: WorldState, holder: NationId, of: NationId): number => nation(s, holder).private.trust[of] ?? -1;
const of = <K extends keyof CrisisEventPayloads>(events: readonly Event[], type: K): CrisisEventPayloads[K][] =>
  events.filter((e) => e.type === type).map((e) => e.payload as CrisisEventPayloads[K]);
const cmd = (nationId: NationId, tick: number, type: string, payload: unknown): Command => ({ nationId, tick, type, payload });

/** Nobody pays anything unless told to: no monthly contribution, no appeal answers. */
const SILENT: Partial<StandingPolicy> = { crisisRule: 'none', contributionBp: 0 };

/** Runs `fn` with a tunable set to `value`, then puts it back. TUNABLES is one module per test file, so this cannot leak. */
function withTunable<T>(name: 'nonPayerCoverPct', value: number, fn: () => T): T {
  const tunable = TUNABLES[name] as unknown as { value: number };
  const before = tunable.value;
  tunable.value = value;
  try {
    return fn();
  } finally {
    tunable.value = before;
  }
}

describe('climate appeal: opens on schedule, sized by exposure (RULES 4.1, 4.3)', () => {
  it('opens in month climateFirstOpenTick with the RULES 4.3 target and exposure-weighted shares', () => {
    const { state, events } = runTo(world(SILENT), OPEN + 1);
    const opened = of(events, 'crisisOpened');
    expect(opened).toHaveLength(1);
    const c = opened[0]!.crisis;
    expect(c).toMatchObject({ kind: 'climate', pool: 'adaptation', openedTick: OPEN, deadlineTick: DEADLINE, severity: TUNABLES.climateBaseSeverity.value });
    const out = (n: NationId): number => nation(state, n).public.output;
    const weight = (n: NationId, exposure: number): number => exposure * out(n);
    const total = weight(HI, 60) + weight(LO, 20) + weight(MID, 40) + weight(REG, 40);
    expect(c.target).toBe(Math.floor((total * TUNABLES.poolTargetScaleBp.value) / 1_000_000));
    expect(c.shares[HI]!).toBeGreaterThan(c.shares[MID]!);
    expect(c.shares[MID]!).toBeGreaterThan(c.shares[LO]!);
    expect(Object.values(c.shares).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(c.target);
  });

  it('ratchets: each world year\'s appeal is climateRampPerYear more severe', () => {
    const { events } = runTo(world(SILENT), 40);
    expect(of(events, 'crisisOpened').filter((p) => p.crisis.kind === 'climate').map((p) => p.crisis.severity)).toEqual([
      TUNABLES.climateBaseSeverity.value,
      TUNABLES.climateBaseSeverity.value + TUNABLES.climateRampPerYear.value,
      TUNABLES.climateBaseSeverity.value + 2 * TUNABLES.climateRampPerYear.value,
      TUNABLES.climateBaseSeverity.value + 3 * TUNABLES.climateRampPerYear.value,
    ].slice(0, 4));
  });
});

describe('deadlines pass with nobody online (seam 8)', () => {
  it('every nation\'s standing policy answers the appeal on its deadline tick, and the pool locks', () => {
    const { state, events } = runTo(world(), DEADLINE + 1);
    const answers = of(events, 'appealAnswered');
    expect(answers.map((a) => a.nationId).sort()).toEqual([...ALL].sort());
    expect(answers.every((a) => a.by === 'policy' && a.rule === 'reciprocal')).toBe(true);
    expect(events.find((e) => e.type === 'appealAnswered')?.tick).toBe(DEADLINE);
    const locked = of(events, 'crisisLocked');
    expect(locked).toHaveLength(1);
    expect(state.crises.filter((c) => c.kind === 'climate')).toEqual([]);
    // Default policies (reciprocal, first round trusted) pay every share: full cover.
    expect(locked[0]!.result.outcome).toBe('success');
    expect(locked[0]!.result.coverBp).toBe(TUNABLES.poolCoverMaxPct.value * 100);
    expect(locked[0]!.result.freeRiders).toEqual([]);
    // Each automatic answer carries its numbers (RULES 7.4).
    const why = events.filter((e) => e.type === 'explanation' && (e.payload as { decision: string }).decision === 'answerAppeal');
    expect(why).toHaveLength(ALL.length);
    for (const e of why) expect((e.payload as { reasons: string[] }).reasons[0]).toMatch(/[0-9]/);
  });

  it('a pledge nobody pays by hand is collected automatically on its deadline tick', () => {
    const s = world(SILENT);
    const { state, events } = runTo(s, 6, { 1: [cmd(HI, 1, 'pledge', { pool: 'adaptation', amount: 50, deadlineTick: 5 })] });
    expect(state.pledges).toEqual([]);
    const honoured = of(events, 'pledgeHonoured');
    expect(honoured).toHaveLength(1);
    expect(honoured[0]).toMatchObject({ by: 'policy', pledge: { nationId: HI, amount: 50, paid: 50 } });
    expect(events.find((e) => e.type === 'pledgeHonoured')?.tick).toBe(5);
    expect(state.pools.adaptation.round[HI] ?? state.pools.adaptation.balance).toBeGreaterThanOrEqual(0);
    expect(nation(state, HI).private.pledgesHonoured).toBe(1);
    expect(nation(state, HI).private.pooledTotal).toBe(50);
  });
});

describe('pledges (RULES 4.4)', () => {
  it('paying by command before the deadline honours the pledge at once', () => {
    const { state, events } = runTo(world(SILENT), 3, {
      1: [cmd(HI, 1, 'pledge', { pool: 'health', amount: 30, deadlineTick: 8 })],
      2: [cmd(HI, 2, 'contribute', { pool: 'health', amount: 30 })],
    });
    expect(of(events, 'pledgeHonoured')).toMatchObject([{ by: 'command' }]);
    expect(state.pledges).toEqual([]);
    expect(state.pools.health.balance).toBe(30);
  });

  it('a pledge the nation cannot pay on its deadline breaks, and every nation trusts it less', () => {
    const broke = runTo(world(SILENT), 4, {
      0: [cmd(HI, 0, 'fundResilience', { points: 20 })],
      1: [cmd(HI, 1, 'pledge', { pool: 'adaptation', amount: 1_000_000, deadlineTick: 3 })],
    });
    const twin = runTo(world(SILENT), 4, { 0: [cmd(HI, 0, 'fundResilience', { points: 20 })] });
    expect(of(broke.events, 'pledgeBroken')).toMatchObject([{ reason: 'unpaid', pledge: { nationId: HI } }]);
    expect(nation(broke.state, HI).private.pledgesBroken).toBe(1);
    for (const other of [LO, MID, REG]) {
      expect(trust(broke.state, other, HI)).toBe(trust(twin.state, other, HI) - TUNABLES.trustPerPledgeBroken.value);
    }
    expect(broke.state.ledger.pledgesBroken).toBe(1);
  });

  it('a withdrawn pledge counts as broken', () => {
    const { events, state } = runTo(world(SILENT), 3, {
      1: [cmd(HI, 1, 'pledge', { pool: 'adaptation', amount: 10, deadlineTick: 9 })],
      2: [cmd(HI, 2, 'withdrawPledge', { pledgeId: 1 })],
    });
    expect(of(events, 'pledgeBroken')).toMatchObject([{ reason: 'withdrawn' }]);
    expect(state.pledges).toEqual([]);
  });

  it('a broken pledge lowers trust, and it recovers over time until it matches an honest twin', () => {
    const script = (brk: boolean): Record<number, Command[]> => ({
      1: [cmd(HI, 1, 'pledge', { pool: 'adaptation', amount: 10, deadlineTick: 9 })],
      ...(brk ? { 2: [cmd(HI, 2, 'withdrawPledge', { pledgeId: 1 })] } : {}),
    });
    const gap = (t: number): number => {
      const a = runTo(world(SILENT), t, script(true)).state;
      const b = runTo(world(SILENT), t, script(false)).state;
      return trust(b, LO, HI) - trust(a, LO, HI);
    };
    // The honest twin kept its pledge (+trustPerPledgeHonoured at tick 9); by tick 3 the breaker is already 12 behind.
    expect(gap(3)).toBe(TUNABLES.trustPerPledgeBroken.value);
    const later = [6, 20, 40, 80].map(gap);
    for (let i = 1; i < later.length; i++) expect(later[i]!).toBeLessThanOrEqual(later[i - 1]!);
    expect(later[later.length - 1]).toBe(0);
  });

  it('refuses pledges beyond maxPledgeTicks, a second pledge to the same pool, and background regions', () => {
    const { events } = runTo(world(SILENT), 2, {
      1: [
        cmd(HI, 1, 'pledge', { pool: 'adaptation', amount: 10, deadlineTick: 1 + TUNABLES.maxPledgeTicks.value + 1 }),
        cmd(LO, 1, 'pledge', { pool: 'adaptation', amount: 10, deadlineTick: 4 }),
        cmd(LO, 1, 'pledge', { pool: 'adaptation', amount: 10, deadlineTick: 5 }),
        cmd(REG, 1, 'pledge', { pool: 'adaptation', amount: 10, deadlineTick: 5 }),
      ],
    });
    const reasons = events.filter((e) => e.type === 'commandRejected').map((e) => (e.payload as { reason: string }).reason);
    expect(reasons).toEqual([
      expect.stringMatching(/months ahead/),
      expect.stringMatching(/already have an open pledge/),
      expect.stringMatching(/background regions/),
    ]);
  });
});

describe('pool outcomes: success, partial success and failure (RULES 4.3)', () => {
  /** Silent world; HI pays `pct`% of the target by command during the appeal. */
  function lockWith(pct: number): { result: CrisisEventPayloads['crisisLocked']['result']; state: WorldState; events: Event[] } {
    const opened = runTo(world(SILENT), OPEN + 1);
    const target = opened.state.crises.find((c) => c.kind === 'climate')!.target;
    const amount = Math.floor((target * pct) / 100);
    const script = amount > 0 ? { [OPEN + 1]: [cmd(HI, OPEN + 1, 'contribute', { pool: 'adaptation', amount })] } : {};
    const r = runTo(opened.state, DEADLINE + 1, script);
    return { result: of(r.events, 'crisisLocked')[0]!.result, state: r.state, events: r.events };
  }

  it('success: the pool reaches full cover; spends only up to its target', () => {
    const { result, state } = lockWith(150);
    expect(result.outcome).toBe('success');
    expect(result.coverBp).toBe(TUNABLES.poolCoverMaxPct.value * 100);
    expect(state.pools.adaptation.balance).toBe(Math.floor((result.target * 150) / 100) - result.target);
    expect(state.ledger.creditSpentCrises).toBe(result.target);
  });

  it('partial success: between crisisPartialPct and full cover, cover is the funded share', () => {
    const { result } = lockWith(60);
    expect(result.outcome).toBe('partial');
    expect(result.coverBp).toBe(Math.floor((result.effective * 10_000) / result.target));
    expect(result.coverBp).toBeGreaterThan(5_900);
    expect(result.coverBp).toBeLessThan(6_100);
    expect(result.contributors).toEqual([HI]);
  });

  it('failure: below crisisPartialPct; nobody paid, no cover, full damage by exposure', () => {
    const { result, events } = lockWith(0);
    expect(result.outcome).toBe('failure');
    expect(result.coverBp).toBe(0);
    expect([...result.freeRiders].sort()).toEqual([...ALL].sort());
    const hits = of(events, 'crisisHit').map((h) => h.hit);
    const hi = hits.find((h) => h.nationId === HI)!;
    const lo = hits.find((h) => h.nationId === LO)!;
    expect(hi.bp).toBe(hi.bpUnpooled);
    expect(hi.bp).toBeGreaterThan(lo.bp * 2);
    expect(hi.toTick - hi.fromTick + 1).toBe(TUNABLES.climateDamageSpreadTicks.value);
  });

  it('damage lands as an output penalty for climateDamageSpreadTicks months, then stops', () => {
    const failed = lockWith(0).state;
    const e = failed.endowments[HI]!;
    expect(nation(failed, HI).private.last.crisisPct).toBe(Math.floor(hitBp({ pool: 'adaptation', severity: 20 }, e, nation(runTo(world(SILENT), DEADLINE).state, HI).private.resilience) / 100));
    const spread = TUNABLES.climateDamageSpreadTicks.value;
    // Months DEADLINE to DEADLINE + spread - 1 are hit; the hit is dropped once its last month is stepped.
    expect(runTo(failed, DEADLINE + spread - 1).state.hits.some((h) => h.kind === 'climate' && h.nationId === HI)).toBe(true);
    expect(runTo(failed, DEADLINE + spread).state.hits.some((h) => h.kind === 'climate')).toBe(false);
  });

  it('contributors get the resilience bonus and trust with each other; free-riders do not', () => {
    // Floor 0, so automatic resilience funding cannot top the free-riders up to the same level.
    const opened = runTo(world({ ...SILENT, resilienceFloor: 0 }), OPEN + 1);
    const c = opened.state.crises[0]!;
    const pay = (n: NationId): Command => cmd(n, OPEN + 1, 'contribute', { pool: 'adaptation', amount: c.shares[n]! });
    const paid = runTo(opened.state, DEADLINE + 1, { [OPEN + 1]: [pay(HI), pay(MID)] }).state;
    const none = runTo(opened.state, DEADLINE + 1).state;
    expect(nation(paid, HI).private.resilience).toBe(nation(none, HI).private.resilience + TUNABLES.contributorResilienceBonus.value);
    expect(nation(paid, LO).private.resilience).toBe(nation(none, LO).private.resilience);
    expect(trust(paid, HI, MID)).toBe(trust(none, HI, MID) + TUNABLES.contributorTrustBonus.value);
    expect(trust(paid, HI, LO)).toBe(trust(none, HI, LO));
  });
});

describe('the pool pays out in proportion to what a nation paid (RULES 4.3 rule 1, prompt 14)', () => {
  const KEEP = (): number => TUNABLES.nonPayerCoverPct.value;
  type Hit = CrisisEventPayloads['crisisHit']['hit'];
  const landed = (h: Hit, ownBp: number): number => Math.floor((h.bpUnpooled * (10_000 - ownBp)) / 10_000);

  /**
   * Silent world with the pool filled to 150% of its target by HI (who so pays
   * more than its own share), MID paying `midPct`% of its own share, and LO and
   * the region paying nothing.
   */
  function lockWithMid(midPct: number): { result: CrisisEventPayloads['crisisLocked']['result']; hits: Hit[]; shares: Record<string, number> } {
    const opened = runTo(world({ ...SILENT, resilienceFloor: 0 }), OPEN + 1);
    const crisis = opened.state.crises.find((c) => c.kind === 'climate')!;
    const midPays = Math.floor((crisis.shares[MID]! * midPct) / 100);
    const script = {
      [OPEN + 1]: [
        cmd(HI, OPEN + 1, 'contribute', { pool: 'adaptation', amount: Math.floor((crisis.target * 3) / 2) }),
        ...(midPays > 0 ? [cmd(MID, OPEN + 1, 'contribute', { pool: 'adaptation', amount: midPays })] : []),
      ],
    };
    const r = runTo(opened.state, DEADLINE + 1, script);
    return {
      result: of(r.events, 'crisisLocked')[0]!.result,
      hits: of(r.events, 'crisisHit').map((h) => h.hit),
      shares: crisis.shares,
    };
  }

  it('a nation that paid its whole share gets the pool\'s whole cover; one that paid nothing keeps nonPayerCoverPct% of it', () => {
    const { result, hits } = lockWithMid(100);
    expect(result.coverBp).toBe(TUNABLES.poolCoverMaxPct.value * 100);
    const at = (n: NationId): Hit => hits.find((h) => h.nationId === n)!;
    expect(at(MID).bp).toBe(landed(at(MID), result.coverBp));
    expect(at(HI).bp).toBe(landed(at(HI), result.coverBp));
    const kept = Math.floor((result.coverBp * KEEP()) / 100);
    expect(at(LO).bp).toBe(landed(at(LO), kept));
    expect(at(REG).bp).toBe(landed(at(REG), kept));
    // The free-rider takes strictly more damage than a payer with the same exposure would (LO is the least exposed, so compare per unit).
    expect(at(LO).bp).toBeGreaterThan(landed(at(LO), result.coverBp));
  });

  it('in between, cover is a straight line in the share paid', () => {
    const { result, hits, shares } = lockWithMid(50);
    const mid = hits.find((h) => h.nationId === MID)!;
    const paid = Math.floor((shares[MID]! * 50) / 100);
    const keepBp = KEEP() * 100 + Math.floor(((100 - KEEP()) * 100 * paid) / shares[MID]!);
    expect(mid.bp).toBe(landed(mid, Math.floor((result.coverBp * keepBp) / 10_000)));
    const none = lockWithMid(0).hits.find((h) => h.nationId === MID)!;
    const full = lockWithMid(100).hits.find((h) => h.nationId === MID)!;
    expect(full.bp).toBeLessThan(mid.bp);
    expect(mid.bp).toBeLessThan(none.bp);
  });

  it('paying more than its share earns no extra cover', () => {
    const { result, hits } = lockWithMid(100);
    const hi = hits.find((h) => h.nationId === HI)!;
    expect(hi.bp).toBe(landed(hi, result.coverBp));
    expect(result.coverBp).toBeLessThanOrEqual(TUNABLES.poolCoverMaxPct.value * 100);
  });

  it('nonPayerCoverPct 100 is the old rule: everyone is covered alike; 0 leaves a non-payer with no cover', () => {
    const old = withTunable('nonPayerCoverPct', 100, () => lockWithMid(0));
    for (const h of old.hits) expect(h.bp).toBe(landed(h, old.result.coverBp));
    const none = withTunable('nonPayerCoverPct', 0, () => lockWithMid(0));
    const lo = none.hits.find((h) => h.nationId === LO)!;
    expect(lo.bp).toBe(lo.bpUnpooled);
    const hi = none.hits.find((h) => h.nationId === HI)!;
    expect(hi.bp).toBe(landed(hi, none.result.coverBp));
  });

  it('grades the pool, not the nation: cover, outcome and contributors do not depend on the rule', () => {
    const a = withTunable('nonPayerCoverPct', 0, () => lockWithMid(50));
    const b = withTunable('nonPayerCoverPct', 100, () => lockWithMid(50));
    expect(a.result).toEqual(b.result);
    expect(a.hits.map((h) => h.bpUnpooled)).toEqual(b.hits.map((h) => h.bpUnpooled));
  });

  it('ownCoverBp: a straight line from the floor to the pool\'s whole cover, and a nation with no share keeps all of it', () => {
    withTunable('nonPayerCoverPct', 50, () => {
      expect(ownCoverBp(8_000, 0, 100)).toBe(4_000);
      expect(ownCoverBp(8_000, 50, 100)).toBe(6_000);
      expect(ownCoverBp(8_000, 100, 100)).toBe(8_000);
      expect(ownCoverBp(8_000, 250, 100)).toBe(8_000);
      expect(ownCoverBp(8_000, 0, 0)).toBe(8_000);
      expect(ownCoverBp(0, 0, 100)).toBe(0);
    });
  });

  it('a nation on the default policies is never touched: its monthly contribution and reciprocal rule pay its share', () => {
    const { events } = runTo(world(), DEADLINE + 1);
    const result = of(events, 'crisisLocked')[0]!.result;
    expect(result.freeRiders).toEqual([]);
    for (const h of of(events, 'crisisHit').map((x) => x.hit)) expect(h.bp).toBe(landed(h, result.coverBp));
  });

  it('a nation that paid its share into the monthly contribution and answers no is still fully covered', () => {
    // 10% of income a month into the adaptation pool pays HI's share several times over before the appeal opens.
    let s = world(SILENT);
    s = step(s, [cmd(HI, 1, 'setPolicy', { crisisRule: 'none', contributionBp: 1_000, contributionTo: 'adaptation' })]).state;
    const opened = runTo(s, OPEN + 1);
    const crisis = opened.state.crises[0]!;
    const filler = cmd(MID, OPEN + 1, 'contribute', { pool: 'adaptation', amount: crisis.target });
    const r = runTo(opened.state, DEADLINE + 1, { [OPEN + 1]: [filler] });
    const result = of(r.events, 'crisisLocked')[0]!.result;
    const hi = of(r.events, 'crisisHit').map((x) => x.hit).find((h) => h.nationId === HI)!;
    expect(result.contributors).toContain(HI);
    expect(hi.bp).toBe(landed(hi, result.coverBp));
  });

  it('a pandemic works the same way: late money counts at face value for the payer, and a non-payer keeps only part of the cover', () => {
    const s = (() => {
      for (let seed = 1; seed < 400; seed++) {
        let w = world({ ...SILENT, resilienceFloor: 0 }, seed);
        for (let t = 0; t < 60; t++) {
          w = step(w, []).state;
          if (w.crises.some((c) => c.kind === 'pandemic')) return w;
        }
      }
      throw new Error('no pandemic in 400 seeds');
    })();
    const p = s.crises.find((c) => c.kind === 'pandemic')!;
    const fill = cmd(HI, s.tick, 'contribute', { pool: 'health', amount: p.target * 3 });
    const pay = cmd(MID, s.tick, 'contribute', { pool: 'health', amount: p.shares[MID]! });
    const r = runTo(s, p.deadlineTick + 1, { [s.tick]: [fill, pay] });
    const result = of(r.events, 'crisisLocked').find((l) => l.result.kind === 'pandemic')!.result;
    expect(result.coverBp).toBeGreaterThan(0);
    const hits = of(r.events, 'crisisHit').map((h) => h.hit).filter((h) => h.kind === 'pandemic');
    const mid = hits.find((h) => h.nationId === MID)!;
    const lo = hits.find((h) => h.nationId === LO)!;
    expect(mid.bp).toBe(landed(mid, result.coverBp));
    expect(lo.bp).toBe(landed(lo, Math.floor((result.coverBp * KEEP()) / 100)));
  });

  it('the recap tells a nation that took more damage than the pool\'s cover why', () => {
    const opened = runTo(world({ ...SILENT, resilienceFloor: 0 }), OPEN + 1);
    const crisis = opened.state.crises[0]!;
    const before = viewFor(opened.state, LO);
    const r = runTo(opened.state, DEADLINE + 1, { [OPEN + 1]: [cmd(HI, OPEN + 1, 'contribute', { pool: 'adaptation', amount: crisis.target * 2 })] });
    const seen = r.events.filter((e) => e.audience.length === 0 || e.audience.includes(LO));
    const line = buildRecap(before, viewFor(r.state, LO), seen).lines.find((l) => l.kind === 'crisis')!;
    expect(line.text).toContain(`only ${KEEP()}% of the pool's cover reached you`);
  });
});

describe('standing crisis rules (RULES 4.4, 8.2)', () => {
  it('reciprocal pays in proportion when the last round fell short; fairShare pays in full; none pays nothing', () => {
    // Round 1: nobody pays. Round 2: reciprocal nations see 0% met last time and pay 0.
    let s = world(SILENT);
    s = runTo(s, 13).state;
    expect(s.pools.adaptation.lastFundedBp).toBe(0);
    s = step(s, [
      cmd(HI, 13, 'setPolicy', { crisisRule: 'reciprocal' }),
      cmd(LO, 13, 'setPolicy', { crisisRule: 'fairShare' }),
    ]).state;
    const r = runTo(s, 12 + DEADLINE + 1);
    const answers = of(r.events, 'appealAnswered');
    expect(answers.find((a) => a.nationId === HI)).toMatchObject({ answer: 'declined', rule: 'reciprocal' });
    expect(answers.find((a) => a.nationId === LO)).toMatchObject({ answer: 'contributed', rule: 'fairShare' });
    expect(answers.find((a) => a.nationId === LO)!.amount).toBe(answers.find((a) => a.nationId === LO)!.share);
    expect(answers.find((a) => a.nationId === MID)).toMatchObject({ answer: 'declined', rule: 'none' });
  });

  it('the monthly standing contribution fills the pools from income, split between them', () => {
    const s = runTo(world({ contributionBp: 100, crisisRule: 'none' }), 2).state;
    const hi = nation(s, HI);
    expect(hi.private.last.contributed).toBe(Math.floor((hi.private.last.income * 100) / 10_000));
    expect(s.pools.adaptation.round[HI]! - s.pools.health.round[HI]!).toBeLessThanOrEqual(2);
  });
});

describe('a nation whose share is already paid has contributed (GATE-2 F2)', () => {
  // HI pays 10% of its income into the adaptation pool every month, so its share is paid in full well before the appeal.
  const PAID_UP: Partial<StandingPolicy> = { crisisRule: 'none', contributionBp: 1_000, contributionTo: 'adaptation' };
  function paidUp(): { state: WorldState; share: number } {
    let s = world(SILENT);
    s = step(s, [cmd(HI, 1, 'setPolicy', PAID_UP)]).state;
    s = runTo(s, OPEN + 1).state;
    const crisis = s.crises[0]!;
    const share = crisis.shares[HI]!;
    expect(s.pools.adaptation.round[HI]!).toBeGreaterThanOrEqual(share);
    return { state: s, share };
  }

  it('declining an appeal after paying the whole share by monthly payments is recorded as contributed', () => {
    const { state, share } = paidUp();
    const r = runTo(state, OPEN + 2, { [OPEN + 1]: [cmd(HI, OPEN + 1, 'declineAppeal', { crisisId: state.crises[0]!.id })] });
    expect(of(r.events, 'appealAnswered').find((a) => a.nationId === HI)).toMatchObject({ answer: 'contributed', amount: 0, by: 'command', share });
    expect(r.state.crises[0]!.answers[HI]).toMatchObject({ answer: 'contributed' });
  });

  it('declining with part of the share unpaid is still declined', () => {
    const s = runTo(world(SILENT), OPEN + 1).state;
    const r = runTo(s, OPEN + 2, { [OPEN + 1]: [cmd(HI, OPEN + 1, 'declineAppeal', { crisisId: s.crises[0]!.id })] });
    expect(of(r.events, 'appealAnswered').find((a) => a.nationId === HI)).toMatchObject({ answer: 'declined', by: 'command' });
  });

  it('a standing policy that pays nothing to appeals, with the share already paid, has contributed too', () => {
    const { state } = paidUp();
    const r = runTo(state, DEADLINE + 1);
    expect(of(r.events, 'appealAnswered').find((a) => a.nationId === HI)).toMatchObject({ answer: 'contributed', amount: 0, by: 'policy', rule: 'none' });
  });
});

describe('pandemic: late money counts less (RULES 4.2)', () => {
  function firstPandemic(): WorldState {
    for (let seed = 1; seed < 400; seed++) {
      let s = world(SILENT, seed);
      for (let t = 0; t < 60; t++) {
        s = step(s, []).state;
        if (s.crises.some((c) => c.kind === 'pandemic')) return s;
      }
    }
    throw new Error('no pandemic in 400 seeds');
  }

  it('money paid after the trigger counts at lateContributionEffectPct', () => {
    const s = firstPandemic();
    const p = s.crises.find((c) => c.kind === 'pandemic')!;
    const r = runTo(s, p.deadlineTick + 1, { [s.tick]: [cmd(HI, s.tick, 'contribute', { pool: 'health', amount: p.target })] });
    const result = of(r.events, 'crisisLocked').find((l) => l.result.kind === 'pandemic')!.result;
    expect(result.effective).toBe(Math.floor((p.target * TUNABLES.lateContributionEffectPct.value) / 100));
    expect(result.outcome).not.toBe('success');
    expect(of(r.events, 'contributed')[0]).toMatchObject({ late: true });
  });

  it('a pandemic hits once, by (100 - preparedness)', () => {
    const s = firstPandemic();
    const p = s.crises.find((c) => c.kind === 'pandemic')!;
    const hits = of(runTo(s, p.deadlineTick + 1).events, 'crisisHit').map((h) => h.hit).filter((h) => h.kind === 'pandemic');
    const hi = hits.find((h) => h.nationId === HI)!;
    const lo = hits.find((h) => h.nationId === LO)!;
    expect(hi.fromTick).toBe(hi.toTick);
    expect(hi.bpUnpooled).toBeGreaterThan(lo.bpUnpooled * 3);
  });
});

describe('scoring with the collective multiplier (RULES 5.2)', () => {
  it('climate damage avoided is 1 - loss / loss with empty pools, and it moves the multiplier', () => {
    const funded = runTo(world(), 20).state;
    const empty = runTo(world(SILENT), 20).state;
    const f = scoreboard(funded);
    const e = scoreboard(empty);
    expect(e.goals.climateAvoidedBp).toBe(0);
    expect(f.goals.climateAvoidedBp).toBeGreaterThanOrEqual(TUNABLES.poolCoverMaxPct.value * 100 - 50);
    expect(f.multiplierBp).toBeGreaterThan(e.multiplierBp);
    expect(f.collectiveBp).toBe(Math.floor((f.goals.climateAvoidedBp + f.goals.pandemicAvoidedBp + f.goals.atBaselineBp + f.goals.deficitsMetBp) / 4));
    // A crisis hurts: the exposed nation ends below its own baseline when nobody paid.
    expect(e.nations.find((n) => n.id === HI)!.ownScoreBp).toBeLessThan(f.nations.find((n) => n.id === HI)!.ownScoreBp);
  });
});

describe('a nation left alone for 1,000 months answers everything', () => {
  it('every offer, appeal and own pledge addressed to it is answered by its policies; nothing lapses', () => {
    let s = createWorld({ seed: 11, roster: ROSTER, controllers: { hi: 'human', lo: 'human', mid: 'human' } });
    let appealsDue = 0;
    let answeredForHi = 0;
    let offersToHi = 0;
    let offersAnswered = 0;
    let lapsed = 0;
    for (let t = 0; t < 1_000; t++) {
      // The others keep busy: offers to the absent HI, and the odd pledge by HI made before it left.
      const commands: Command[] = [];
      if (t % 2 === 0) {
        // Fair Credit for goods: HI's policy must answer each one, yes or no.
        const get = t % 4 === 0 ? { resource: 'food', amount: 30 } : { resource: 'energy', amount: 30 };
        commands.push(cmd(LO, t, 'makeOffer', { to: HI, give: { resource: 'credit', amount: t % 4 === 0 ? 3 : 2 }, get }));
      }
      if (t < 30 && t % 10 === 1) commands.push(cmd(HI, t, 'pledge', { pool: 'health', amount: 20, deadlineTick: t + 5 }));
      const r = step(s, commands);
      for (const e of r.events) {
        if (e.type === 'offerMade' && (e.payload as { offer: { to: NationId } }).offer.to === HI) offersToHi++;
        if ((e.type === 'offerSettled' || e.type === 'offerRejected') && (e.payload as { offer: { to: NationId } }).offer.to === HI) offersAnswered++;
        if (e.type === 'offerExpired') lapsed++;
        if (e.type === 'crisisLocked') appealsDue++;
        if (e.type === 'appealAnswered' && (e.payload as { nationId: NationId }).nationId === HI) answeredForHi++;
      }
      s = r.state;
    }
    expect(s.tick).toBe(1_000);
    expect(offersToHi).toBeGreaterThan(400);
    expect(offersAnswered + s.offers.filter((o) => o.to === HI).length).toBe(offersToHi);
    expect(lapsed).toBe(0);
    expect(appealsDue).toBeGreaterThan(80);
    expect(answeredForHi + s.crises.length).toBeGreaterThanOrEqual(appealsDue);
    expect(s.pledges).toEqual([]);
    expect(nation(s, HI).private.pledgesHonoured + nation(s, HI).private.pledgesBroken).toBe(3);
    expect(s.recentCrises.length).toBeLessThanOrEqual(TUNABLES.crisisHistoryKept.value);
    for (const n of ALL) expect(nation(s, n).private.stocks.credit).toBeGreaterThanOrEqual(0);
  });
});

describe('explanations and the away recap', () => {
  it('relays a command\'s numeric why to both sides of an offer, and refuses a why with no number', () => {
    const s = createWorld({ seed: 1, roster: ROSTER });
    const good: Command = { ...cmd(HI, 0, 'makeOffer', { to: LO, give: { resource: 'credit', amount: 5 }, get: { resource: 'food', amount: 40 } }), why: ['Food stock 12 is under 2 months of demand 100.'] };
    const bad: Command = { ...cmd(MID, 0, 'declineAppeal', { crisisId: 1 }), why: ['Because I said so.'] };
    const r = step(step(s, []).state.tick === 1 ? s : s, [good, bad]);
    const why = r.events.find((e) => e.type === 'explanation');
    expect(why).toMatchObject({ audience: [HI, LO], payload: { nationId: HI, decision: 'makeOffer', by: 'command' } });
    expect(r.events.find((e) => e.type === 'commandRejected')?.payload).toMatchObject({ reason: expect.stringMatching(/number/) });
  });

  it('a recap of an absence is a few short sentences with numbers', () => {
    const s0 = runTo(world(), 2).state;
    const before = viewFor(s0, HI);
    const r = runTo(s0, 30);
    const seen = r.events.filter((e) => e.audience.length === 0 || e.audience.includes(HI));
    const recap = buildRecap(before, viewFor(r.state, HI), seen);
    expect(recap.lines.length).toBeGreaterThanOrEqual(3);
    expect(recap.lines.length).toBeLessThanOrEqual(TUNABLES.recapMaxLines.value);
    expect(recap.lines[0]!.kind).toBe('score');
    expect(recap.lines.filter((l) => l.kind === 'crisis').length).toBeGreaterThanOrEqual(2);
    for (const line of recap.lines) {
      expect(line.text).toMatch(/[0-9]/);
      expect(line.text.length).toBeLessThanOrEqual(200);
    }
  });
});
