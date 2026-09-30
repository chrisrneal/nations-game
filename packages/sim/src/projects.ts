import type {
  CrisisHit,
  CrisisKind,
  Event,
  NationEndowment,
  NationId,
  NationRecord,
  Project,
  ProjectKind,
  ProjectMember,
  ProjectTemplate,
  ProjectTemplateId,
  WorldLedger,
} from '@nations/contracts';
import { mulDiv } from './economy.ts';
import { adjustTrust } from './trust.ts';
import { TUNABLES } from './tunables.ts';

/**
 * Joint projects: docs/RULES.md section 13, decision record H4.
 *
 * A project is a State object with deadlines (seam 8). It is proposed by a
 * host, joined by invitees until its forming deadline, paid for in monthly
 * installments collected by the sim, and once complete it adds new
 * production of its good to each member in proportion to what that member
 * paid, or cuts its members' crisis damage (shields). Nothing transfers
 * between nations: Credit goes into the ground, and yield is new production,
 * so RULES 5.3 holds. Works on the step's mutable draft, never on input State.
 */

/** The catalogue (RULES 13.1). Design data, like the world file; every number it scales is a tunable. */
export const CATALOGUE: readonly ProjectTemplate[] = [
  {
    id: 'solar',
    name: 'Solar and storage belt',
    blurb: 'Utility solar farms with battery storage, built on the host’s land and shared by its partners.',
    kind: 'energy',
    host: 'energySurplus',
    buildPct: 67,
    yieldPct: 63,
    costPct: 100,
    minMineralsEndowment: 0,
    sharedTieRequired: false,
  },
  {
    id: 'grid',
    name: 'Cross-border grid link',
    blurb: 'High-voltage lines that carry the host’s spare power to partners it already shares a bloc or alliance with.',
    kind: 'energy',
    host: 'energySurplus',
    buildPct: 100,
    yieldPct: 88,
    costPct: 90,
    minMineralsEndowment: 0,
    sharedTieRequired: true,
  },
  {
    id: 'hydrogen',
    name: 'Green hydrogen corridor',
    blurb: 'Electrolysers and export terminals turning the host’s sun, wind and minerals into fuel for its partners.',
    kind: 'energy',
    host: 'energySurplus',
    buildPct: 133,
    yieldPct: 125,
    costPct: 110,
    minMineralsEndowment: 50,
    sharedTieRequired: false,
  },
  {
    id: 'grain',
    name: 'Grain corridor and reserve',
    blurb: 'Storage, rail and port capacity that moves the host’s harvest to its partners, with a shared reserve.',
    kind: 'food',
    host: 'foodSurplus',
    buildPct: 67,
    yieldPct: 75,
    costPct: 100,
    minMineralsEndowment: 0,
    sharedTieRequired: false,
  },
  {
    id: 'irrigation',
    name: 'Desalination and smart irrigation',
    blurb: 'Desalination plants and precision irrigation that raise the host’s farm output for its partners.',
    kind: 'food',
    host: 'foodSurplus',
    buildPct: 133,
    yieldPct: 113,
    costPct: 110,
    minMineralsEndowment: 0,
    sharedTieRequired: false,
  },
  {
    id: 'earlyWarning',
    name: 'Climate early-warning network',
    blurb: 'Satellites, sensors and evacuation plans shared by every member: storms and floods cost less.',
    kind: 'climateShield',
    host: 'anyone',
    buildPct: 67,
    yieldPct: 0,
    costPct: 100,
    minMineralsEndowment: 0,
    sharedTieRequired: false,
  },
  {
    id: 'vaccines',
    name: 'Vaccine manufacturing network',
    blurb: 'Shared vaccine plants and stockpiles: when a pandemic comes, members are protected first.',
    kind: 'pandemicShield',
    host: 'anyone',
    buildPct: 100,
    yieldPct: 0,
    costPct: 50,
    minMineralsEndowment: 0,
    sharedTieRequired: false,
  },
];

export function templateOf(id: ProjectTemplateId): ProjectTemplate {
  const t = CATALOGUE.find((x) => x.id === id);
  if (t === undefined) throw new Error(`Unknown project template "${id}"`);
  return t;
}

export const TEMPLATE_IDS: readonly string[] = CATALOGUE.map((t) => t.id);

/** The good a goods project makes, or null for a shield. */
export function goodOf(kind: ProjectKind): 'food' | 'energy' | null {
  return kind === 'food' || kind === 'energy' ? kind : null;
}

/** The crisis a shield protects against, or null for a goods project. */
export function shieldOf(kind: ProjectKind): CrisisKind | null {
  return kind === 'climateShield' ? 'climate' : kind === 'pandemicShield' ? 'pandemic' : null;
}

/** A host's surplus in a good from its public flows, or 0. */
export function surplusOf(n: Pick<NationRecord, 'public'>, good: 'food' | 'energy'): number {
  const f = n.public[good];
  return Math.max(0, f.production - f.demand);
}

/** A shield member's total due: a share of its own monthly output (RULES 13.2), at least 1. */
export function shieldDue(template: ProjectTemplate, member: Pick<NationRecord, 'public'>): number {
  return Math.max(1, Math.floor((mulDiv(member.public.output, TUNABLES.projectShieldCostPct.value, 100) * template.costPct) / 100));
}

export interface ProjectTerms {
  readonly buildTicks: number;
  readonly yield: number;
  /** Goods: the whole build. Shields: this nation's own due. */
  readonly cost: number;
}

/** What a project would be if `host` founded it now (RULES 13.2). */
export function projectTerms(template: ProjectTemplate, host: Pick<NationRecord, 'public'>): ProjectTerms {
  const buildTicks = Math.max(1, Math.floor((TUNABLES.projectBuildTicks.value * template.buildPct) / 100));
  const good = goodOf(template.kind);
  if (good === null) return { buildTicks, yield: 0, cost: shieldDue(template, host) };
  const yieldUnits = Math.floor((mulDiv(surplusOf(host, good), TUNABLES.projectYieldPct.value, 100) * template.yieldPct) / 100);
  const unit = good === 'food' ? TUNABLES.projectFoodUnitCost.value : TUNABLES.projectEnergyUnitCost.value;
  const cost = Math.max(1, Math.floor((yieldUnits * unit * template.costPct) / 100));
  return { buildTicks, yield: yieldUnits, cost };
}

/** Projects the host already hosts that started building, and whether it has one forming. */
function hosted(projects: readonly Project[], host: NationId): { built: number; forming: boolean } {
  let built = 0;
  let forming = false;
  for (const p of projects) {
    if (p.host !== host) continue;
    if (p.status === 'forming') forming = true;
    else built += 1;
  }
  return { built, forming };
}

/**
 * Why `host` may not found `template` now, or null (RULES 13.1 and 13.2).
 * Also counts projects it hosted that were completed (they stay in State).
 */
export function hostProblem(
  template: ProjectTemplate,
  host: Pick<NationRecord, 'id' | 'public'>,
  endowment: Pick<NationEndowment, 'mineralsEndowment'>,
  projects: readonly Project[],
): string | null {
  if (host.public.kind !== 'playable') return 'background regions do not host projects';
  const mine = hosted(projects, host.id);
  if (mine.forming) return 'you already have a project forming';
  if (mine.built >= TUNABLES.projectMaxHosted.value) return `you have hosted ${TUNABLES.projectMaxHosted.value} projects this game`;
  if (projects.some((p) => p.host === host.id && p.template === template.id)) return 'you already host this project';
  const good = template.host === 'energySurplus' ? 'energy' : template.host === 'foodSurplus' ? 'food' : null;
  if (good !== null) {
    const demand = host.public[good].demand;
    const needed = Math.max(1, Math.ceil((demand * TUNABLES.projectMinSurplusPct.value) / 100));
    if (surplusOf(host, good) < needed) return `needs a ${good} surplus of at least ${needed}`;
  }
  if (endowment.mineralsEndowment < template.minMineralsEndowment) return `needs a minerals endowment of at least ${template.minMineralsEndowment}`;
  if (shieldMembership(projects, host.id, template.kind) !== undefined) return 'you are already in a network like this';
  return null;
}

/** The shield of `kind` a nation is already in (forming, building or active), if any: one per crisis kind (RULES 13.2). */
export function shieldMembership(projects: readonly Project[], id: NationId, kind: ProjectKind): Project | undefined {
  if (goodOf(kind) !== null) return undefined;
  return projects.find((p) => p.kind === kind && p.members.some((m) => m.nationId === id));
}

/** Whether two nations share a bloc or an alliance (the grid link's rule). */
export function sharesTie(a: Pick<NationEndowment, 'blocs' | 'alliances'>, b: Pick<NationEndowment, 'blocs' | 'alliances'>): boolean {
  return a.blocs.some((x) => b.blocs.includes(x)) || a.alliances.some((x) => b.alliances.includes(x));
}

export interface ProjectContext {
  readonly tick: number;
  readonly nationOrder: readonly NationId[];
  readonly nations: Record<NationId, NationRecord>;
  readonly endowments: Readonly<Record<NationId, NationEndowment>>;
  readonly events: Event[];
  ledger: WorldLedger;
  /** Forming, building and active projects, oldest first. Mutated in place. */
  readonly projects: Project[];
  nextProjectId: number;
  readonly hits: readonly CrisisHit[];
}

function nation(ctx: ProjectContext, id: NationId): NationRecord {
  return ctx.nations[id] as NationRecord;
}

function put(ctx: ProjectContext, project: Project): void {
  const index = ctx.projects.findIndex((p) => p.id === project.id);
  ctx.projects[index] = project;
}

function publicEvent<T>(ctx: ProjectContext, type: string, payload: T): void {
  ctx.events.push({ tick: ctx.tick, type, payload, audience: [] });
}

/** Moves Credit from a nation into a project (the project sink). Caller has checked the Credit. */
function pay(ctx: ProjectContext, project: Project, id: NationId, amount: number): Project {
  const n = nation(ctx, id);
  ctx.nations[id] = { ...n, private: { ...n.private, stocks: { ...n.private.stocks, credit: n.private.stocks.credit - amount } } };
  ctx.ledger = { ...ctx.ledger, creditSpentProjects: ctx.ledger.creditSpentProjects + amount };
  return {
    ...project,
    paidTotal: project.paidTotal + amount,
    members: project.members.map((m) => (m.nationId === id ? { ...m, paid: m.paid + amount } : m)),
  };
}

export function proposeProject(ctx: ProjectContext, host: NationId, templateId: ProjectTemplateId, invite: readonly NationId[]): Project {
  const template = templateOf(templateId);
  const terms = projectTerms(template, nation(ctx, host));
  const project: Project = {
    id: ctx.nextProjectId,
    template: template.id,
    kind: template.kind,
    host,
    status: 'forming',
    createdTick: ctx.tick,
    formingDeadline: ctx.tick + TUNABLES.projectFormingTicks.value - 1,
    startedTick: null,
    completedTick: null,
    invited: [...invite],
    declined: [],
    members: [{ nationId: host, paid: 0, joinedTick: ctx.tick, due: 0, installment: 0, cap: 0 }],
    left: [],
    buildTicks: terms.buildTicks,
    yield: terms.yield,
    cost: terms.cost,
    paidTotal: 0,
  };
  ctx.nextProjectId += 1;
  ctx.projects.push(project);
  publicEvent(ctx, 'projectProposed', { project });
  return project;
}

/**
 * Building starts: each member's due, installment and cap are fixed (RULES
 * 13.3). Goods split the cost equally and may pay up to twice their due (to
 * cover a partner who walks out, or to take a bigger share). A shield charges
 * each member a share of its own output and nothing more.
 */
function start(ctx: ProjectContext, project: Project): Project {
  const n = project.members.length;
  const template = templateOf(project.template);
  const goods = goodOf(project.kind) !== null;
  const members = project.members.map((m) => {
    const due = goods ? Math.ceil(project.cost / n) : shieldDue(template, nation(ctx, m.nationId));
    return { ...m, due, installment: Math.max(1, Math.ceil(due / project.buildTicks)), cap: goods ? 2 * due : due };
  });
  const started: Project = {
    ...project,
    status: 'building',
    startedTick: ctx.tick,
    invited: [],
    members,
    cost: goods ? project.cost : members.reduce((sum, m) => sum + m.due, 0),
  };
  put(ctx, started);
  publicEvent(ctx, 'projectStarted', { project: started });
  return started;
}

export function joinProject(ctx: ProjectContext, id: NationId, projectId: number): void {
  const project = ctx.projects.find((p) => p.id === projectId) as Project;
  const member: ProjectMember = { nationId: id, paid: 0, joinedTick: ctx.tick, due: 0, installment: 0, cap: 0 };
  const joined: Project = { ...project, invited: project.invited.filter((x) => x !== id), members: [...project.members, member] };
  put(ctx, joined);
  publicEvent(ctx, 'projectJoined', { projectId, nationId: id });
  if (joined.members.length >= TUNABLES.projectSlots.value) start(ctx, joined);
}

export function declineProject(ctx: ProjectContext, id: NationId, projectId: number): void {
  const project = ctx.projects.find((p) => p.id === projectId) as Project;
  put(ctx, { ...project, invited: project.invited.filter((x) => x !== id), declined: [...project.declined, id] });
  publicEvent(ctx, 'projectDeclined', { projectId, nationId: id });
}

/** A member leaves (or is dropped). Mid-build it forfeits what it paid and loses the remaining members' trust. */
export function leaveProject(ctx: ProjectContext, id: NationId, projectId: number, reason: 'left' | 'dropped'): void {
  const project = ctx.projects.find((p) => p.id === projectId) as Project;
  const member = project.members.find((m) => m.nationId === id) as ProjectMember;
  const members = project.members.filter((m) => m.nationId !== id);
  const building = project.status === 'building';
  // A shield's cost is the members' dues, so a leaver's unpaid due leaves with it; a goods build still costs the same.
  const shrink = building && goodOf(project.kind) === null ? Math.max(0, member.due - member.paid) : 0;
  put(ctx, {
    ...project,
    cost: project.cost - shrink,
    members,
    left: building ? [...project.left, { nationId: id, paid: member.paid, tick: ctx.tick, reason }] : project.left,
  });
  if (building) {
    for (const m of members) ctx.nations[m.nationId] = adjustTrust(nation(ctx, m.nationId), id, -TUNABLES.projectTrustLeave.value);
  }
  publicEvent(ctx, 'projectLeft', { projectId, nationId: id, paid: member.paid, reason });
}

/** Most `id` may still pay into a building project now: its cap, and what the build still needs. */
export function roomToFund(project: Project, id: NationId): number {
  const member = project.members.find((m) => m.nationId === id);
  if (member === undefined || project.status !== 'building') return 0;
  return Math.max(0, Math.min(member.cap - member.paid, project.cost - project.paidTotal));
}

export function fundProject(ctx: ProjectContext, id: NationId, projectId: number, amount: number): void {
  const project = ctx.projects.find((p) => p.id === projectId) as Project;
  put(ctx, pay(ctx, project, id, amount));
  publicEvent(ctx, 'projectFunded', { projectId, nationId: id, amount });
}

function complete(ctx: ProjectContext, project: Project): void {
  const done: Project = { ...project, status: 'active', completedTick: ctx.tick };
  put(ctx, done);
  const bonus = TUNABLES.projectTrustBuilt.value;
  for (const a of done.members) {
    for (const b of done.members) {
      if (a.nationId !== b.nationId) ctx.nations[a.nationId] = adjustTrust(nation(ctx, a.nationId), b.nationId, bonus);
    }
  }
  publicEvent(ctx, 'projectCompleted', { project: done });
}

/**
 * The month's project work, after commands (RULES 13.2-13.4): forming
 * projects whose deadline is this month start or lapse; building projects
 * collect each member's installment (a member that cannot pay is dropped)
 * and complete once fully paid. A project that starts this month collects
 * from the next.
 */
export function processProjects(ctx: ProjectContext): void {
  for (const original of [...ctx.projects]) {
    let project = ctx.projects.find((p) => p.id === original.id) as Project;
    if (project.status === 'forming') {
      if (ctx.tick < project.formingDeadline) continue;
      if (project.members.length >= TUNABLES.projectMinMembers.value) start(ctx, project);
      else {
        ctx.projects.splice(ctx.projects.indexOf(project), 1);
        publicEvent(ctx, 'projectLapsed', { project });
      }
      continue;
    }
    if (project.status !== 'building' || project.startedTick === ctx.tick) continue;
    for (const m of [...project.members]) {
      const amount = Math.min(m.installment, roomToFund(project, m.nationId));
      if (amount <= 0) continue;
      if (nation(ctx, m.nationId).private.stocks.credit < amount) {
        if (m.nationId === project.host) continue; // A host cannot be dropped from its own project; it just pays nothing this month.
        leaveProject(ctx, m.nationId, project.id, 'dropped');
        project = ctx.projects.find((p) => p.id === original.id) as Project;
        continue;
      }
      project = pay(ctx, project, m.nationId, amount);
      put(ctx, project);
    }
    if (project.paidTotal >= project.cost) complete(ctx, project);
  }
}

/**
 * Each nation's project production for month `tick`: for every active goods
 * project, `yield * paid_i / paidTotal`, cut by the climate damage its host is
 * taking that month (RULES 13.4). Integer, stable order.
 */
export function projectYields(projects: readonly Project[], hits: readonly CrisisHit[], tick: number): Map<NationId, { food: number; energy: number }> {
  const out = new Map<NationId, { food: number; energy: number }>();
  for (const p of projects) {
    const good = goodOf(p.kind);
    if (p.status !== 'active' || good === null || p.paidTotal <= 0) continue;
    let damageBp = 0;
    for (const h of hits) if (h.nationId === p.host && h.kind === 'climate' && h.fromTick <= tick && tick <= h.toTick) damageBp += h.bp;
    const total = mulDiv(p.yield, 10_000 - Math.min(10_000, damageBp), 10_000);
    for (const m of p.members) {
      if (m.paid <= 0) continue;
      const units = mulDiv(total, m.paid, p.paidTotal);
      if (units <= 0) continue;
      const cur = out.get(m.nationId) ?? { food: 0, energy: 0 };
      out.set(m.nationId, { ...cur, [good]: cur[good] + units });
    }
  }
  return out;
}

/** Damage cut, in basis points, a nation's active shields give it against one crisis kind (RULES 13.4). */
export function shieldBp(projects: readonly Project[], id: NationId, kind: CrisisKind): number {
  for (const p of projects) {
    if (p.status !== 'active' || shieldOf(p.kind) !== kind) continue;
    if (p.members.some((m) => m.nationId === id && m.paid > 0)) return TUNABLES.projectShieldBp.value;
  }
  return 0;
}
