import type {
  AppealAnswer,
  Crisis,
  CrisisHit,
  CrisisKind,
  CrisisOutcome,
  CrisisResult,
  CrisisRule,
  Event,
  NationEndowment,
  NationId,
  NationRecord,
  Pledge,
  Pool,
  PoolKind,
  RngState,
  WorldLedger,
} from '@nations/contracts';
import { mulDiv } from './economy.ts';
import { randomInt } from './rng.ts';
import { adjustTrust, clampTrust } from './trust.ts';
import { TUNABLES } from './tunables.ts';

/**
 * Crises, contribution pools and pledges: docs/RULES.md section 4.
 *
 * Every interaction resolves inside the step with nobody online (seam 8):
 * a crisis appeal a nation has not answered is answered by its standing
 * policy on the deadline tick; a pledge not yet paid is collected on its
 * deadline tick if the Credit is there, and broken if not. Damage lands on
 * each nation by its own exposure, and the pool's cover reaches it in
 * proportion to how much of its own share it paid (RULES 4.3 rule 1).
 *
 * Works on the step's mutable draft (`CrisisContext`), never on input State.
 */
export interface CrisisContext {
  readonly tick: number;
  readonly nationOrder: readonly NationId[];
  readonly nations: Record<NationId, NationRecord>;
  readonly endowments: Readonly<Record<NationId, NationEndowment>>;
  readonly events: Event[];
  ledger: WorldLedger;
  readonly pools: Record<PoolKind, Pool>;
  /** Open crises, oldest first. Mutated in place. */
  readonly crises: Crisis[];
  /** Open pledges, oldest first. Mutated in place. */
  readonly pledges: Pledge[];
  /** Damage still to land. Mutated in place. */
  readonly hits: CrisisHit[];
  /** Locked crises, oldest first, trimmed to `crisisHistoryKept`. */
  readonly recent: CrisisResult[];
  nextCrisisId: number;
  nextPledgeId: number;
  rng: RngState;
}

export const POOL_OF: Readonly<Record<CrisisKind, PoolKind>> = { climate: 'adaptation', pandemic: 'health' };

/** The pools as a step's working copy: each pool's `round` map is copied once, then written in place during the step. */
export function draftPools(pools: Readonly<Record<PoolKind, Pool>>): Record<PoolKind, Pool> {
  return {
    adaptation: { ...pools.adaptation, round: { ...pools.adaptation.round } },
    health: { ...pools.health, round: { ...pools.health.round } },
  };
}

function nation(ctx: CrisisContext, id: NationId): NationRecord {
  return ctx.nations[id] as NationRecord;
}

/** How exposed a nation is to the crisis a pool covers, 0-100 (RULES 4.1, 4.2). */
export function exposureFor(e: Pick<NationEndowment, 'climateExposure' | 'pandemicPreparedness'>, pool: PoolKind): number {
  return pool === 'adaptation' ? e.climateExposure : 100 - e.pandemicPreparedness;
}

function explain(ctx: CrisisContext, nationId: NationId, decision: string, subject: number | null, reasons: string[]): void {
  ctx.events.push({
    tick: ctx.tick,
    type: 'explanation',
    payload: { nationId, decision, subject, reasons, by: 'policy' },
    audience: [nationId],
  });
}

// ---------------------------------------------------------------- opening

/**
 * Opens an appeal on the pool for `kind`. The target is RULES 4.3's
 * `sum(exposure_i / 100 x output_i) x poolTargetScaleBp / 10,000`, and each
 * nation's share is its part of that sum. Every nation, background regions
 * too, is asked.
 */
export function openCrisis(ctx: CrisisContext, kind: CrisisKind, severity: number, deadlineTick: number): Crisis {
  const pool = POOL_OF[kind];
  const weights: [NationId, number][] = [];
  let total = 0;
  for (const id of ctx.nationOrder) {
    const w = exposureFor(ctx.endowments[id] as NationEndowment, pool) * Math.max(0, nation(ctx, id).public.output);
    weights.push([id, w]);
    total += w;
  }
  const target = Math.max(1, mulDiv(total, TUNABLES.poolTargetScaleBp.value, 1_000_000));
  const shares: Record<NationId, number> = {};
  for (const [id, w] of weights) shares[id] = total === 0 ? 0 : mulDiv(target, w, total);
  const crisis: Crisis = {
    id: ctx.nextCrisisId,
    kind,
    pool,
    severity,
    openedTick: ctx.tick,
    deadlineTick,
    target,
    shares,
    answers: {},
  };
  ctx.nextCrisisId += 1;
  ctx.crises.push(crisis);
  // A pandemic pool counts money paid from now on at the late rate (RULES 4.2).
  if (kind === 'pandemic') ctx.pools[pool] = { ...ctx.pools[pool], late: 0 };
  ctx.events.push({ tick: ctx.tick, type: 'crisisOpened', payload: { crisis }, audience: [] });
  return crisis;
}

/**
 * The step's last act on crises: a climate appeal opens once a world year
 * (RULES 4.1), and a pandemic fires on a seeded roll when none is open
 * (RULES 4.2). Severity ramps with the years elapsed.
 */
export function openCrises(ctx: CrisisContext): void {
  const interval = TUNABLES.climateEventIntervalTicks.value;
  if (ctx.tick % interval === TUNABLES.climateFirstOpenTick.value % interval && !ctx.crises.some((c) => c.kind === 'climate')) {
    const years = Math.floor((ctx.tick * TUNABLES.tickMonths.value) / 12);
    const severity = TUNABLES.climateBaseSeverity.value + TUNABLES.climateRampPerYear.value * years;
    openCrisis(ctx, 'climate', severity, ctx.tick + TUNABLES.crisisResponseTicks.value);
  }
  if (!ctx.crises.some((c) => c.kind === 'pandemic')) {
    const roll = randomInt(ctx.rng, 0, 9_999);
    ctx.rng = roll.rng;
    if (roll.value < TUNABLES.pandemicChanceBpPerTick.value) {
      openCrisis(ctx, 'pandemic', TUNABLES.pandemicBaseSeverity.value, ctx.tick + TUNABLES.pandemicWindowTicks.value);
    }
  }
}

// ---------------------------------------------------------------- paying

/** Moves Credit from a nation into a pool. Returns what was paid (never more than it holds). */
function payIntoPool(ctx: CrisisContext, id: NationId, pool: PoolKind, amount: number): number {
  const n = nation(ctx, id);
  const paid = Math.max(0, Math.min(amount, n.private.stocks.credit));
  if (paid === 0) return 0;
  ctx.nations[id] = {
    ...n,
    private: {
      ...n.private,
      stocks: { ...n.private.stocks, credit: n.private.stocks.credit - paid },
      pooledTotal: n.private.pooledTotal + paid,
    },
  };
  const p = ctx.pools[pool];
  const late = pool === 'health' && ctx.crises.some((c) => c.pool === 'health');
  // `round` is this step's own copy (see `draftPools`), so it is safe to write in place.
  (p.round as Record<NationId, number>)[id] = (p.round[id] ?? 0) + paid;
  ctx.pools[pool] = { ...p, balance: p.balance + paid, late: p.late + (late ? paid : 0) };
  ctx.ledger = { ...ctx.ledger, creditPooled: ctx.ledger.creditPooled + paid };
  return paid;
}

function honourPledge(ctx: CrisisContext, pledge: Pledge, by: 'command' | 'policy'): void {
  const index = ctx.pledges.findIndex((p) => p.id === pledge.id);
  if (index !== -1) ctx.pledges.splice(index, 1);
  const bonus = TUNABLES.trustPerPledgeHonoured.value;
  for (const other of ctx.nationOrder) {
    if (other !== pledge.nationId) ctx.nations[other] = adjustTrust(nation(ctx, other), pledge.nationId, bonus);
  }
  const n = nation(ctx, pledge.nationId);
  ctx.nations[n.id] = { ...n, private: { ...n.private, pledgesHonoured: n.private.pledgesHonoured + 1 } };
  ctx.ledger = { ...ctx.ledger, pledgesHonoured: ctx.ledger.pledgesHonoured + 1 };
  ctx.events.push({ tick: ctx.tick, type: 'pledgeHonoured', payload: { pledge, by }, audience: [] });
}

/** Withdrawn or unpaid: every other nation trusts the pledger `trustPerPledgeBroken` less (RULES 4.4). */
export function breakPledge(ctx: CrisisContext, pledgeId: number, reason: 'withdrawn' | 'unpaid'): void {
  const index = ctx.pledges.findIndex((p) => p.id === pledgeId);
  if (index === -1) return;
  const [pledge] = ctx.pledges.splice(index, 1) as [Pledge];
  const penalty = TUNABLES.trustPerPledgeBroken.value;
  for (const other of ctx.nationOrder) {
    if (other !== pledge.nationId) ctx.nations[other] = adjustTrust(nation(ctx, other), pledge.nationId, -penalty);
  }
  const n = nation(ctx, pledge.nationId);
  ctx.nations[n.id] = { ...n, private: { ...n.private, pledgesBroken: n.private.pledgesBroken + 1 } };
  ctx.ledger = { ...ctx.ledger, pledgesBroken: ctx.ledger.pledgesBroken + 1 };
  ctx.events.push({ tick: ctx.tick, type: 'pledgeBroken', payload: { pledge, reason }, audience: [] });
}

/** Counts `amount` just paid into `pool` towards the nation's open pledges to it, oldest first. */
function applyToPledges(ctx: CrisisContext, id: NationId, pool: PoolKind, amount: number, by: 'command' | 'policy'): void {
  let left = amount;
  for (const pledge of ctx.pledges.filter((p) => p.nationId === id && p.pool === pool)) {
    if (left <= 0) break;
    const pay = Math.min(left, pledge.amount - pledge.paid);
    left -= pay;
    const updated: Pledge = { ...pledge, paid: pledge.paid + pay };
    const index = ctx.pledges.findIndex((p) => p.id === pledge.id);
    ctx.pledges[index] = updated;
    if (updated.paid >= updated.amount) honourPledge(ctx, updated, by);
  }
}

/**
 * Pays Credit into a pool: by command, by the monthly standing contribution,
 * or by a policy answering an appeal. It counts towards the nation's open
 * pledges to that pool. Returns what was paid.
 */
export function contribute(ctx: CrisisContext, id: NationId, pool: PoolKind, amount: number, by: 'command' | 'policy' | 'standing'): number {
  const late = pool === 'health' && ctx.crises.some((c) => c.pool === 'health');
  const paid = payIntoPool(ctx, id, pool, amount);
  if (paid === 0) return 0;
  applyToPledges(ctx, id, pool, paid, by === 'command' ? 'command' : 'policy');
  // The monthly standing contribution is too frequent to be news; the pool's round shows it.
  if (by !== 'standing') {
    ctx.events.push({ tick: ctx.tick, type: 'contributed', payload: { nationId: id, pool, amount: paid, late, by }, audience: [] });
  }
  return paid;
}

/** Records a nation's answer to the open appeal on `pool`, if there is one and it has not answered yet. */
function markAnswered(ctx: CrisisContext, id: NationId, pool: PoolKind, answer: AppealAnswer, rule: CrisisRule | null): void {
  const index = ctx.crises.findIndex((c) => c.pool === pool);
  const crisis = ctx.crises[index];
  if (crisis === undefined || crisis.answers[id] !== undefined) return;
  ctx.crises[index] = { ...crisis, answers: { ...crisis.answers, [id]: answer } };
  ctx.events.push({
    tick: ctx.tick,
    type: 'appealAnswered',
    payload: { crisisId: crisis.id, nationId: id, share: crisis.shares[id] ?? 0, rule, ...answer },
    audience: [],
  });
}

/** The `contribute` command: pay now, which also answers the pool's open appeal. */
export function contributeByCommand(ctx: CrisisContext, id: NationId, pool: PoolKind, amount: number): void {
  const paid = contribute(ctx, id, pool, amount, 'command');
  markAnswered(ctx, id, pool, { answer: 'contributed', amount: paid, by: 'command' }, null);
}

/** The `pledge` command. A pledge due by the open appeal's deadline answers that appeal. */
export function makePledge(ctx: CrisisContext, id: NationId, pool: PoolKind, amount: number, deadlineTick: number): Pledge {
  const pledge: Pledge = { id: ctx.nextPledgeId, nationId: id, pool, amount, paid: 0, createdTick: ctx.tick, deadlineTick };
  ctx.nextPledgeId += 1;
  ctx.pledges.push(pledge);
  ctx.events.push({ tick: ctx.tick, type: 'pledgeMade', payload: { pledge }, audience: [] });
  const crisis = ctx.crises.find((c) => c.pool === pool);
  if (crisis !== undefined && deadlineTick <= crisis.deadlineTick) {
    markAnswered(ctx, id, pool, { answer: 'pledged', amount, by: 'command' }, null);
  }
  return pledge;
}

/** True when the nation has a share of `crisis` and has already paid all of it into the pool this round. */
function sharePaid(ctx: CrisisContext, id: NationId, crisis: Crisis): boolean {
  const share = crisis.shares[id] ?? 0;
  return share > 0 && (ctx.pools[crisis.pool].round[id] ?? 0) >= share;
}

/**
 * The `declineAppeal` command. A nation whose share is already paid (by its
 * monthly contribution) has contributed, not declined, whatever it answers
 * now: the record says what it paid (GATE-2 F2).
 */
export function declineAppeal(ctx: CrisisContext, id: NationId, crisisId: number): void {
  const crisis = ctx.crises.find((c) => c.id === crisisId);
  if (crisis === undefined) return;
  const answer: AppealAnswer = sharePaid(ctx, id, crisis) ? { answer: 'contributed', amount: 0, by: 'command' } : { answer: 'declined', amount: 0, by: 'command' };
  markAnswered(ctx, id, crisis.pool, answer, null);
}

/**
 * The monthly standing contribution (RULES 8.2 dial 3): `contributionBp` of
 * this month's income, to one pool or split between both. Returns the total paid.
 */
export function standingContribution(ctx: CrisisContext, id: NationId): number {
  const n = nation(ctx, id);
  const policy = n.private.policy;
  const amount = mulDiv(n.private.last.income, policy.contributionBp, 10_000);
  if (amount <= 0) return 0;
  if (policy.contributionTo !== 'split') return contribute(ctx, id, policy.contributionTo, amount, 'standing');
  const health = Math.floor(amount / 2);
  return contribute(ctx, id, 'adaptation', amount - health, 'standing') + contribute(ctx, id, 'health', health, 'standing');
}

// ---------------------------------------------------------------- deadlines

/**
 * Pledges on their deadline tick: the rest is collected automatically if the
 * nation holds the Credit (honoured), otherwise the pledge is broken. Runs
 * after commands, so a nation may still pay by command on the deadline tick.
 */
export function resolvePledges(ctx: CrisisContext): void {
  for (const pledge of ctx.pledges.filter((p) => p.deadlineTick <= ctx.tick)) {
    const current = ctx.pledges.find((p) => p.id === pledge.id);
    if (current === undefined) continue;
    const owed = current.amount - current.paid;
    const credit = nation(ctx, current.nationId).private.stocks.credit;
    if (credit >= owed) {
      payIntoPool(ctx, current.nationId, current.pool, owed);
      const index = ctx.pledges.findIndex((p) => p.id === current.id);
      ctx.pledges[index] = { ...current, paid: current.amount };
      honourPledge(ctx, { ...current, paid: current.amount }, 'policy');
      explain(ctx, current.nationId, 'collectPledge', current.id, [
        `Pledge due: paid the last ${owed} of ${current.amount} Credit into the ${current.pool} pool from ${credit} held.`,
      ]);
    } else {
      breakPledge(ctx, current.id, 'unpaid');
      explain(ctx, current.nationId, 'collectPledge', current.id, [
        `Pledge due: ${owed} Credit owed but only ${credit} held, so the pledge broke; every nation's trust fell ${TUNABLES.trustPerPledgeBroken.value}.`,
      ]);
    }
  }
}

/** What a standing crisis rule pays towards an appeal: owed share, scaled for reciprocity (RULES 4.4). */
export function rulePayment(rule: CrisisRule, owed: number, lastFundedBp: number): number {
  if (rule === 'none' || owed <= 0) return 0;
  if (rule === 'fairShare') return owed;
  const match = TUNABLES.reciprocalMatchPct.value * 100;
  return lastFundedBp >= match ? owed : mulDiv(owed, Math.max(0, lastFundedBp), match);
}

/** Standing policies answer every appeal still unanswered on its deadline tick, in nation order. */
export function answerAppeals(ctx: CrisisContext): void {
  for (const due of ctx.crises.filter((c) => c.deadlineTick <= ctx.tick)) {
    for (const id of ctx.nationOrder) {
      const crisis = ctx.crises.find((c) => c.id === due.id) as Crisis;
      if (crisis.answers[id] !== undefined) continue;
      const n = nation(ctx, id);
      const rule = n.private.policy.crisisRule;
      const share = crisis.shares[id] ?? 0;
      const pool = ctx.pools[crisis.pool];
      const already = pool.round[id] ?? 0;
      const owed = Math.max(0, share - already);
      const wanted = rulePayment(rule, owed, pool.lastFundedBp);
      const paid = wanted > 0 ? contribute(ctx, id, crisis.pool, wanted, 'policy') : 0;
      const answer: AppealAnswer =
        paid > 0 || (owed === 0 && rule !== 'none') || sharePaid(ctx, id, crisis)
          ? { answer: 'contributed', amount: paid, by: 'policy' }
          : { answer: 'declined', amount: 0, by: 'policy' };
      markAnswered(ctx, id, crisis.pool, answer, rule);
      const funded = Math.floor(pool.lastFundedBp / 100);
      const reason =
        rule === 'none' && !sharePaid(ctx, id, crisis)
          ? `Policy pays nothing to crises: share ${share} of the ${crisis.target} target, ${already} paid this round.`
          : owed === 0
            ? `Share ${share} of the ${crisis.target} target already paid this round (${already}).`
            : rule === 'fairShare'
              ? `Policy pays its fair share: ${paid} of ${owed} still owed on a share of ${share}.`
              : `Policy matches the world: this pool met ${funded}% of target last time, so it paid ${paid} of ${owed} owed on a share of ${share}.`;
      explain(ctx, id, 'answerAppeal', crisis.id, [reason]);
    }
  }
}

/**
 * Locks every crisis whose deadline is this tick (RULES 4.3): spends the pool
 * up to its target (late pandemic money at `lateContributionEffectPct`), sets
 * the cover, grades the outcome, rewards contributors, and schedules each
 * nation's damage by its own exposure and resilience, less the share of the
 * pool's cover its own payments earned (`ownCoverBp`).
 */
export function lockCrises(ctx: CrisisContext): void {
  for (const crisis of ctx.crises.filter((c) => c.deadlineTick <= ctx.tick)) {
    ctx.crises.splice(ctx.crises.indexOf(crisis), 1);
    const pool = ctx.pools[crisis.pool];
    const lateEffect: number = crisis.kind === 'pandemic' ? TUNABLES.lateContributionEffectPct.value : 100;
    const early = Math.min(pool.balance - pool.late, crisis.target);
    const gap = crisis.target - early;
    const lateUsed = lateEffect === 0 ? 0 : Math.min(pool.late, Math.ceil((gap * 100) / lateEffect));
    const effective = Math.min(crisis.target, early + Math.floor((lateUsed * lateEffect) / 100));
    const spent = early + lateUsed;
    const fundedBp = Math.min(10_000, Math.floor((effective * 10_000) / crisis.target));
    const maxCoverBp = TUNABLES.poolCoverMaxPct.value * 100;
    const coverBp = Math.min(maxCoverBp, fundedBp);
    const outcome: CrisisOutcome =
      coverBp >= maxCoverBp ? 'success' : fundedBp >= TUNABLES.crisisPartialPct.value * 100 ? 'partial' : 'failure';

    const contributors: NationId[] = [];
    const freeRiders: NationId[] = [];
    for (const id of ctx.nationOrder) {
      const share = crisis.shares[id] ?? 0;
      if (share <= 0) continue;
      if ((pool.round[id] ?? 0) * 100 >= share * TUNABLES.contributorMinSharePct.value) contributors.push(id);
      else freeRiders.push(id);
    }
    const resilienceBonus = TUNABLES.contributorResilienceBonus.value;
    const trustBonus = TUNABLES.contributorTrustBonus.value;
    for (const id of contributors) {
      const n = nation(ctx, id);
      const trust: Record<NationId, number> = { ...n.private.trust };
      for (const other of contributors) {
        const current = trust[other];
        if (other !== id && current !== undefined) trust[other] = clampTrust(current + trustBonus);
      }
      const resilience = Math.min(TUNABLES.resilienceMax.value, n.private.resilience + resilienceBonus);
      ctx.nations[id] = { ...n, private: { ...n.private, resilience, trust } };
    }

    ctx.pools[crisis.pool] = { ...pool, balance: pool.balance - spent, late: 0, round: {}, lastFundedBp: fundedBp };
    const result: CrisisResult = {
      id: crisis.id,
      kind: crisis.kind,
      severity: crisis.severity,
      openedTick: crisis.openedTick,
      deadlineTick: crisis.deadlineTick,
      target: crisis.target,
      effective,
      coverBp,
      outcome,
      contributors,
      freeRiders,
    };
    ctx.recent.push(result);
    while (ctx.recent.length > TUNABLES.crisisHistoryKept.value) ctx.recent.shift();
    ctx.ledger = {
      ...ctx.ledger,
      creditSpentCrises: ctx.ledger.creditSpentCrises + spent,
      crisesLocked: ctx.ledger.crisesLocked + 1,
      crisesSucceeded: ctx.ledger.crisesSucceeded + (outcome === 'success' ? 1 : 0),
    };
    ctx.events.push({ tick: ctx.tick, type: 'crisisLocked', payload: { result }, audience: [] });

    const lasts = crisis.kind === 'climate' ? TUNABLES.climateDamageSpreadTicks.value : 1;
    for (const id of ctx.nationOrder) {
      const bpUnpooled = hitBp(crisis, ctx.endowments[id] as NationEndowment, nation(ctx, id).private.resilience);
      if (bpUnpooled <= 0) continue;
      const hit: CrisisHit = {
        crisisId: crisis.id,
        kind: crisis.kind,
        nationId: id,
        bp: mulDiv(bpUnpooled, 10_000 - ownCoverBp(coverBp, pool.round[id] ?? 0, crisis.shares[id] ?? 0), 10_000),
        bpUnpooled,
        fromTick: ctx.tick,
        toTick: ctx.tick + lasts - 1,
      };
      ctx.hits.push(hit);
      ctx.events.push({ tick: ctx.tick, type: 'crisisHit', payload: { hit }, audience: [id] });
    }
  }
}

/**
 * How much of a pool's cover reaches one nation (RULES 4.3 rule 1): all of it
 * for a nation that paid its whole share, `nonPayerCoverPct`% of it for one
 * that paid nothing, a straight line between. Paying more than the share earns
 * nothing extra, and a nation that was asked for nothing keeps all of it.
 * Basis points in, basis points out.
 */
export function ownCoverBp(poolCoverBp: number, paid: number, share: number): number {
  if (share <= 0) return poolCoverBp;
  const floorBp = TUNABLES.nonPayerCoverPct.value * 100;
  const keepBp = floorBp + mulDiv(10_000 - floorBp, Math.min(Math.max(0, paid), share), share);
  return mulDiv(poolCoverBp, keepBp, 10_000);
}

/**
 * One nation's damage from a crisis with an empty pool, in basis points of
 * output per tick it lasts (RULES 4.1, 4.2): severity x exposure, reduced by
 * resilience (a nation at 100 takes half).
 */
export function hitBp(crisis: Pick<Crisis, 'pool' | 'severity'>, e: NationEndowment, resilience: number): number {
  const raw = crisis.severity * exposureFor(e, crisis.pool);
  return mulDiv(raw, 200 - Math.max(0, Math.min(100, resilience)), 200);
}

/** A nation's damage this tick, per crisis kind: what lands, and what would have landed with empty pools. */
export interface DamageNow {
  readonly bp: number;
  readonly climate: { readonly bp: number; readonly unpooled: number };
  readonly pandemic: { readonly bp: number; readonly unpooled: number };
}

export function damageAt(hits: readonly CrisisHit[], id: NationId, tick: number): DamageNow {
  const sum = { climate: { bp: 0, unpooled: 0 }, pandemic: { bp: 0, unpooled: 0 } };
  for (const h of hits) {
    if (h.nationId !== id || h.fromTick > tick || h.toTick < tick) continue;
    sum[h.kind].bp += h.bp;
    sum[h.kind].unpooled += h.bpUnpooled;
  }
  return { bp: Math.min(10_000, sum.climate.bp + sum.pandemic.bp), ...sum };
}

/** Drops damage whose last tick has passed. */
export function pruneHits(ctx: CrisisContext): void {
  for (let i = ctx.hits.length - 1; i >= 0; i--) if ((ctx.hits[i] as CrisisHit).toTick <= ctx.tick) ctx.hits.splice(i, 1);
}
