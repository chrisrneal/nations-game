import type { NationEndowment, NationId, NationView, Project, ProjectTemplate, ProjectTemplateId } from '@nations/contracts';
import type { PartnerMemory } from './beliefs.ts';
import { punishing } from './beliefs.ts';
import type { Personality } from './personality.ts';
import { month, noiseBp, rule, type Good } from './util.ts';

/**
 * Joint projects (docs/RULES.md section 13, docs/AI_DESIGN.md "Joint projects").
 *
 * The AI prices a project by what it is worth to its own output, month by
 * month, over the months left in the game once it is built, and compares that
 * with its own due, demanding more the shorter its time horizon and the less it
 * trusts its partners. Everything comes from its own View and its own row of
 * the world data; every decision carries its numbers (RULES 7.4).
 *
 * The value of a unit of food or energy follows the prompt 17b diagnosis: a
 * unit only saves the shortfall penalty on the part of the deficit that went
 * unmet last month; the rest of the deficit is being bought, so a unit there
 * saves only its price. A unit beyond the deficit is a surplus worth half its
 * price (it has to be sold). All values are in thousandths of a Credit a month.
 */

export type ProjectAction =
  | { readonly type: 'joinProject'; readonly payload: { readonly projectId: number } }
  | { readonly type: 'declineProject'; readonly payload: { readonly projectId: number } }
  | { readonly type: 'leaveProject'; readonly payload: { readonly projectId: number } }
  | { readonly type: 'proposeProject'; readonly payload: { readonly template: ProjectTemplateId; readonly invite: readonly NationId[] } };

export interface ProjectDecision {
  readonly command: ProjectAction;
  readonly kind: 'joinProject' | 'declineProject' | 'leaveProject' | 'proposeProject';
  /** The host, for an answer; null for a proposal (its audience is the invitees). */
  readonly partner: NationId | null;
  readonly text: string;
  readonly reasons: readonly string[];
  readonly audience: readonly NationId[];
}

export interface ProjectInputs {
  readonly view: NationView;
  readonly p: Personality;
  readonly endowment: Pick<NationEndowment, 'climateExposure' | 'pandemicPreparedness'>;
  readonly memory: ReadonlyMap<NationId, PartnerMemory>;
  /** Credit not promised to open offers or already spent this tick. */
  readonly creditFree: number;
  /** Proposals are thought about only on the nation's staggered think ticks. */
  readonly think: boolean;
  /** Seed for the founding roll, so each game's world builds differently (never Math.random). */
  readonly seed?: number;
}

function templateOf(view: NationView, id: ProjectTemplateId): ProjectTemplate {
  return view.projects.catalogue.find((t) => t.id === id) as ProjectTemplate;
}

function goodOf(t: Pick<ProjectTemplate, 'kind'>): Good | null {
  return t.kind === 'food' || t.kind === 'energy' ? t.kind : null;
}

/** Output saved a month by one unit that closes an unmet shortfall, in milli-Credit (RULES 2.7). */
function penaltyMilliPerUnit(view: NationView, good: Good): number {
  const demand = view.self.public[good].demand;
  if (demand <= 0) return 0;
  return Math.floor((view.self.public.output * rule(view, 'shortfallPenaltyBpPerPct') * 10) / demand);
}

/**
 * The share of the world's deficits the world's surpluses can cover, in basis
 * points, from public flows (the RULES 2.8 structural cover, as a nation can
 * see it): how much of a deficit trade can be expected to fill.
 */
export function worldCoverBp(view: NationView, good: Good): number {
  let surplus = 0;
  let deficit = 0;
  for (const n of [view.self, ...view.others]) {
    const b = n.public[good].production - n.public[good].demand;
    if (b > 0) surplus += b;
    else deficit -= b;
  }
  if (deficit <= 0) return 10_000;
  return Math.min(10_000, Math.floor((surplus * rule(view, 'structuralCoverSharePct') * 100) / deficit));
}

/**
 * What `units` more of a good each month are worth to this nation, in
 * milli-Credit a month. The part of its deficit it expects to go unmet is the
 * larger of last month's shortfall and what world cover leaves uncovered.
 */
export function goodsValueMilli(view: NationView, good: Good, units: number): number {
  if (units <= 0) return 0;
  const flow = view.self.public[good];
  const deficit = Math.max(0, flow.demand - flow.production);
  const last = good === 'food' ? view.self.private.last.unmetFood : view.self.private.last.unmetEnergy;
  const unmet = Math.max(last, Math.floor((deficit * (10_000 - worldCoverBp(view, good))) / 10_000));
  const price = view.prices[good];
  const inDeficit = Math.min(units, deficit);
  const unmetUnits = Math.min(inDeficit, unmet);
  return unmetUnits * penaltyMilliPerUnit(view, good) + (inDeficit - unmetUnits) * price + Math.floor(((units - inDeficit) * price) / 2);
}

/**
 * Expected crisis damage a month, in basis points of output, before a shield
 * (RULES 4.4): half the pool's cover is assumed, and resilience cuts it.
 */
function expectedDamageBp(view: NationView, kind: 'climateShield' | 'pandemicShield', e: ProjectInputs['endowment']): number {
  const res = view.self.private.resilience;
  const resCut = (bp: number): number => Math.floor((bp * (200 - Math.min(100, res))) / 200);
  if (kind === 'climateShield') {
    const years = Math.floor(view.tick / 12);
    const severity = rule(view, 'climateBaseSeverity') + rule(view, 'climateRampPerYear') * (years + 1);
    const spread = rule(view, 'climateDamageSpreadTicks');
    const interval = rule(view, 'climateEventIntervalTicks');
    return resCut(Math.floor((severity * e.climateExposure * spread) / interval / 2));
  }
  const perMonth = Math.floor((rule(view, 'pandemicChanceBpPerTick') * rule(view, 'pandemicBaseSeverity') * (100 - e.pandemicPreparedness)) / 10_000);
  return resCut(Math.floor(perMonth / 2));
}

/** A shield's value a month to this nation, in milli-Credit. */
function shieldValueMilli(view: NationView, kind: 'climateShield' | 'pandemicShield', e: ProjectInputs['endowment']): number {
  return Math.floor((view.self.public.output * 1000 * expectedDamageBp(view, kind, e) * rule(view, 'projectShieldBp')) / 100_000_000);
}

/** This nation's own due for a shield template (RULES 13.2). */
function ownShieldDue(view: NationView, t: ProjectTemplate): number {
  return Math.max(1, Math.floor((Math.floor((view.self.public.output * rule(view, 'projectShieldCostPct')) / 100) * t.costPct) / 100));
}

/** Months a project would run inside the game if it completes `buildTicks` after `startTick`. */
function monthsActive(view: NationView, startTick: number, buildTicks: number): number {
  return Math.max(0, rule(view, 'gameLengthTicks') - (startTick + buildTicks + 1));
}

/**
 * Percent the total value must reach against the due before the AI commits:
 * a longer horizon asks less, and a cooperative nation accepts a thinner margin
 * for a shared build. Never below 100: it never joins at a loss.
 */
export function hurdlePct(p: Personality): number {
  return Math.max(100, 100 + Math.floor((100 - p.timeHorizon) / 2) - Math.floor((p.cooperativeness - 50) / 4));
}

/** Mean trust in the host and the other members, 0-100. */
function partnerTrust(view: NationView, others: readonly NationId[]): number {
  const ids = others.filter((id) => id !== view.selfId);
  if (ids.length === 0) return 50;
  return Math.floor(ids.reduce((s, id) => s + (view.self.private.trust[id] ?? 35), 0) / ids.length);
}

export interface Appraisal {
  /** Total value over the months it would run, milli-Credit. */
  readonly valueMilli: number;
  /** What this nation would pay, Credit. */
  readonly due: number;
  readonly units: number;
  readonly months: number;
  /** Value as a percent of the due. */
  readonly returnPct: number;
  /** Mean trust in the host and the other members. */
  readonly trust: number;
}

/** What joining a forming project is worth to this nation, if it joins now. */
export function appraise(view: NationView, e: ProjectInputs['endowment'], project: Project): Appraisal {
  const t = templateOf(view, project.template);
  const slots = rule(view, 'projectSlots');
  const invitedOthers = project.invited.filter((id) => id !== view.selfId).length;
  const members = Math.max(rule(view, 'projectMinMembers'), Math.min(slots, project.members.length + 1 + Math.floor(invitedOthers / 2)));
  const start = Math.max(view.tick, project.status === 'forming' ? Math.min(project.formingDeadline, view.tick + 1) : view.tick);
  const months = monthsActive(view, start, project.buildTicks);
  const good = goodOf(t);
  const units = good === null ? 0 : Math.floor(project.yield / members);
  const monthly = good === null ? shieldValueMilli(view, t.kind as 'climateShield' | 'pandemicShield', e) : goodsValueMilli(view, good, units);
  const due = good === null ? ownShieldDue(view, t) : Math.ceil(project.cost / members);
  const valueMilli = monthly * months;
  const trust = partnerTrust(view, [project.host, ...project.members.map((m) => m.nationId)]);
  return { valueMilli, due, units, months, trust, returnPct: due <= 0 ? 0 : Math.floor(valueMilli / (due * 10)) };
}

/** Credit a month already committed to installments of projects still building. */
function committedMonthly(view: NationView): number {
  let sum = 0;
  for (const p of view.projects.projects) {
    if (p.status !== 'building') continue;
    const m = p.members.find((x) => x.nationId === view.selfId);
    if (m !== undefined && m.paid < m.cap) sum += m.installment;
  }
  return sum;
}

/** Whether this nation can carry one more installment of `due / buildTicks` a month. */
function affordable(view: NationView, due: number, buildTicks: number, creditFree: number): boolean {
  const installment = Math.ceil(due / Math.max(1, buildTicks));
  const income = view.self.public.output;
  return installment + committedMonthly(view) <= Math.floor(income / 2) && creditFree >= installment;
}

function nameOf(view: NationView, id: NationId): string {
  return view.others.find((o) => o.id === id)?.name ?? id;
}

function answerInvitation(input: ProjectInputs, project: Project, creditFree: number): ProjectDecision {
  const { view, p } = input;
  const t = templateOf(view, project.template);
  const a = appraise(view, input.endowment, project);
  const host = project.host;
  const hostName = nameOf(view, host);
  const hurdle = hurdlePct(p);
  const audience = [view.selfId, host];
  const ref = { projectId: project.id };
  const good = goodOf(t);
  const what = good === null ? `${t.name}` : `${a.units} ${good} a month from ${t.name}`;
  const worth = `worth ${Math.floor(a.valueMilli / 1000)} credit over ${a.months} months against my ${a.due}`;
  if (punishing(input.memory.get(host), view.tick)) {
    return { command: { type: 'declineProject', payload: ref }, kind: 'declineProject', partner: host, text: `declined ${hostName}'s ${t.name}: I am not dealing with you until my retaliation ends (month ${month(view.tick)})`, reasons: [worth], audience };
  }
  const minTrust = rule(view, 'aiProjectMinTrust');
  if (a.trust < minTrust) {
    return {
      command: { type: 'declineProject', payload: ref },
      kind: 'declineProject',
      partner: host,
      text: `declined ${hostName}'s ${t.name}: my trust in its partners is ${a.trust}, below ${minTrust}; they could walk out mid-build`,
      reasons: [worth],
      audience,
    };
  }
  if (a.returnPct < hurdle) {
    return {
      command: { type: 'declineProject', payload: ref },
      kind: 'declineProject',
      partner: host,
      text: `declined ${hostName}'s ${t.name}: ${what} returns ${a.returnPct}% of my ${a.due} credit, I need ${hurdle}%`,
      reasons: [worth, `trust in the partners ${a.trust}`],
      audience,
    };
  }
  if (!affordable(view, a.due, project.buildTicks, creditFree)) {
    return {
      command: { type: 'declineProject', payload: ref },
      kind: 'declineProject',
      partner: host,
      text: `declined ${hostName}'s ${t.name}: ${Math.ceil(a.due / project.buildTicks)} credit a month is more than I can commit now`,
      reasons: [`${committedMonthly(view)} credit a month already goes to projects`, `income ${view.self.public.output} a month`],
      audience,
    };
  }
  return {
    command: { type: 'joinProject', payload: ref },
    kind: 'joinProject',
    partner: host,
    text: `joined ${hostName}'s ${t.name}: ${what} returns ${a.returnPct}% of my ${a.due} credit`,
    reasons: [worth, `my ${good ?? 'crisis'} need drives it; hurdle ${hurdle}%`],
    audience,
  };
}

/**
 * Leave a building project when finishing it is no longer worth what is left
 * to pay (the sunk part is gone either way), or when Credit has run too short
 * to carry the installments. RULES 13.3: it forfeits what it paid and loses its
 * partners' trust, so the AI leaves only when the numbers clearly say so.
 */
function considerLeaving(input: ProjectInputs, project: Project): ProjectDecision | null {
  const { view } = input;
  const me = project.members.find((m) => m.nationId === view.selfId);
  if (me === undefined || project.host === view.selfId) return null;
  const t = templateOf(view, project.template);
  const left = Math.max(0, Math.min(me.cap, me.due) - me.paid);
  if (left <= 0) return null;
  const remainingCost = Math.max(0, project.cost - project.paidTotal);
  const perMonth = project.members.reduce((s, m) => s + m.installment, 0);
  const monthsToGo = perMonth <= 0 ? 99 : Math.ceil(remainingCost / perMonth);
  const months = monthsActive(view, view.tick, monthsToGo);
  const good = goodOf(t);
  const share = Math.floor((me.due * 10_000) / Math.max(1, project.cost));
  const units = good === null ? 0 : Math.floor((project.yield * share) / 10_000);
  const monthly = good === null ? shieldValueMilli(view, t.kind as 'climateShield' | 'pandemicShield', input.endowment) : goodsValueMilli(view, good, units);
  const value = Math.floor((monthly * months) / 1000);
  const hostName = nameOf(view, project.host);
  const audience = [view.selfId, ...project.members.map((m) => m.nationId).filter((id) => id !== view.selfId)];
  const broke = view.self.private.stocks.credit < me.installment * 2 && view.self.public.output < me.installment * 2;
  // A host that broke a deal with it mid-build: a strict or hard-bargaining nation walks out rather than keep paying
  // into the offender's plant (RULES 13.3); a forgiving one stays, since walking out costs it too.
  const grudge = punishing(input.memory.get(project.host), view.tick) && input.p.reciprocity !== 'forgiving';
  if (value * 2 >= left && !broke && !grudge) return null;
  return {
    command: { type: 'leaveProject', payload: { projectId: project.id } },
    kind: 'leaveProject',
    partner: project.host,
    text: broke
      ? `left ${hostName}'s ${t.name}: I hold ${view.self.private.stocks.credit} credit and owe ${me.installment} a month`
      : grudge
        ? `left ${hostName}'s ${t.name}: I am retaliating against ${hostName} until month ${month(input.memory.get(project.host)!.punishUntil)}, and I still owe ${left}`
        : `left ${hostName}'s ${t.name}: finishing is worth ${value} credit over ${months} months, and I still owe ${left}`,
    reasons: [`I forfeit the ${me.paid} credit I paid`, `${monthsToGo} months still to build`],
    audience,
  };
}

/**
 * Found a project as host, on think ticks only, when one it may host serves
 * enough partners it trusts. A surplus host gains little from its own share of
 * goods; it hosts to cover partners' deficits (the "deficits met" goal it
 * shares) and for the trust building together brings, so the drive is its
 * cooperativeness. A shield is founded for its own value.
 */
function considerProposing(input: ProjectInputs, creditFree: number): ProjectDecision | null {
  const { view, p } = input;
  // Not every think tick: a nation founds with a chance of its cooperativeness in percent, rolled from the game's
  // seed, so which host moves first (and so who partners whom) differs from game to game.
  if (input.seed !== undefined && noiseBp(input.seed, view.tick, view.selfId, 'found', 9_999) >= p.cooperativeness * 100) return null;
  const slots = rule(view, 'projectSlots');
  const minMembers = rule(view, 'projectMinMembers');
  const last = rule(view, 'gameLengthTicks') - 12;
  let best: { decision: ProjectDecision; score: number } | null = null;
  for (const h of view.projects.hostable) {
    if (h.problem !== null) continue;
    if (view.tick + rule(view, 'projectFormingTicks') + h.buildTicks > last) continue;
    const t = templateOf(view, h.template);
    const good = goodOf(t);
    if (good !== null && h.yield < rule(view, 'aiProjectMinYield')) continue;
    // One shield of a kind forming at a time: join the one on offer rather than found a rival.
    if (good === null && view.projects.projects.some((x) => x.kind === t.kind && x.status === 'forming')) continue;
    const trustOf = (id: NationId): number => view.self.private.trust[id] ?? 35;
    const candidates = view.others
      .filter((o) => o.public.kind === 'playable' && !punishing(input.memory.get(o.id), view.tick) && trustOf(o.id) >= rule(view, 'aiProjectMinTrust'))
      .filter((o) => !t.sharedTieRequired || view.projects.tiedTo.includes(o.id))
      // Nobody already in a shield of this kind can join another.
      .filter((o) => good !== null || !view.projects.projects.some((x) => x.kind === t.kind && x.members.some((m) => m.nationId === o.id)))
      .map((o) => {
        const need = good === null ? 0 : Math.max(0, o.public[good].demand - o.public[good].production);
        return { id: o.id, need, weight: good === null ? trustOf(o.id) : Math.floor((need * trustOf(o.id)) / 100) };
      })
      .filter((c) => good === null || c.need > 0)
      .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1));
    if (candidates.length < minMembers - 1) continue;
    const invite = candidates.slice(0, slots - 1).map((c) => c.id);
    let score: number;
    let why: string;
    if (good === null) {
      const due = h.cost;
      const months = monthsActive(view, view.tick + rule(view, 'projectFormingTicks'), h.buildTicks);
      const value = shieldValueMilli(view, t.kind as 'climateShield' | 'pandemicShield', input.endowment) * months;
      const returnPct = Math.floor(value / (due * 10));
      if (returnPct < hurdlePct(p) || !affordable(view, due, h.buildTicks, creditFree)) continue;
      score = returnPct;
      why = `it returns ${returnPct}% of my ${due} credit due over ${months} months`;
    } else {
      const served = candidates.slice(0, slots - 1).reduce((s, c) => s + c.need, 0);
      const covered = Math.min(served, h.yield);
      // Hosting drive: the cooperative nations host; the rest only when partners' need is large.
      if (covered * p.cooperativeness < h.yield * 40) continue;
      const myDue = Math.ceil(h.cost / slots);
      if (!affordable(view, myDue, h.buildTicks, creditFree)) continue;
      score = Math.floor((covered * p.cooperativeness) / 100);
      why = `${h.yield} ${good} a month when built would cover ${covered} of my partners' ${served} deficit`;
    }
    const decision: ProjectDecision = {
      command: { type: 'proposeProject', payload: { template: t.id, invite } },
      kind: 'proposeProject',
      partner: null,
      text: `proposed a ${t.name}: ${why}`,
      reasons: [`${invite.length} nations invited, ${h.buildTicks} months to build`, `cost ${h.cost} credit`],
      audience: [view.selfId, ...invite],
    };
    if (best === null || score > best.score) best = { decision, score };
  }
  return best?.decision ?? null;
}

/**
 * This month's project decisions: answer every invitation (join or decline),
 * reconsider every building project it is in, and on think ticks perhaps
 * found one. Joins are paid for out of `creditFree` in order, so two joins in
 * one month never over-commit.
 */
export function decideProjects(input: ProjectInputs): ProjectDecision[] {
  const { view } = input;
  if (view.self.public.kind !== 'playable') return [];
  const out: ProjectDecision[] = [];
  let creditFree = input.creditFree;
  // A nation can be in one shield of each kind: of several invitations, it considers the best and declines the rest.
  const bestShield = new Map<string, number>();
  for (const project of view.projects.projects) {
    if (goodOf(project) !== null || project.status !== 'forming' || !project.invited.includes(view.selfId)) continue;
    const current = bestShield.get(project.kind);
    const other = current === undefined ? undefined : view.projects.projects.find((x) => x.id === current);
    if (other === undefined || appraise(view, input.endowment, project).returnPct > appraise(view, input.endowment, other).returnPct) bestShield.set(project.kind, project.id);
  }
  const inShield = (kind: string): boolean => view.projects.projects.some((x) => x.kind === kind && x.members.some((m) => m.nationId === view.selfId));
  for (const project of view.projects.projects) {
    if (project.status === 'forming' && project.invited.includes(view.selfId)) {
      if (goodOf(project) === null && (inShield(project.kind) || bestShield.get(project.kind) !== project.id)) {
        const t = templateOf(view, project.template);
        out.push({
          command: { type: 'declineProject', payload: { projectId: project.id } },
          kind: 'declineProject',
          partner: project.host,
          text: `declined ${nameOf(view, project.host)}'s ${t.name}: I am joining another network like it (1 per kind)`,
          reasons: [`project ${project.id} of ${view.projects.projects.length} on offer`],
          audience: [view.selfId, project.host],
        });
        continue;
      }
      const d = answerInvitation({ ...input, creditFree }, project, creditFree);
      if (d.kind === 'joinProject') creditFree -= Math.ceil(appraise(view, input.endowment, project).due / Math.max(1, project.buildTicks));
      out.push(d);
    } else if (project.status === 'building') {
      const d = considerLeaving(input, project);
      if (d !== null) out.push(d);
    }
  }
  if (input.think) {
    const d = considerProposing(input, creditFree);
    if (d !== null) out.push(d);
  }
  return out;
}
