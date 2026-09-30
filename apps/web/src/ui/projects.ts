import type { Command, HostableProject, NationId, NationView, Project, ProjectTemplate, ProjectTemplateId } from '@nations/contracts';
import { nameOf } from '../world/nations.ts';
import { balance, fmt, rule, type Good } from './econ.ts';

/**
 * Joint projects on the phone (docs/RULES.md section 13). Pure helpers over
 * the player's View: every number here is the sim's (terms come from the View's
 * catalogue and hostable list; shares follow what each member paid).
 */

export const KIND_ICON: Readonly<Record<string, string>> = { energy: '⚡', food: '🌾', climateShield: '🌪️', pandemicShield: '🦠' };

export function templateOf(view: NationView, id: ProjectTemplateId): ProjectTemplate {
  return view.projects.catalogue.find((t) => t.id === id) as ProjectTemplate;
}

export function goodOf(kind: Project['kind'] | ProjectTemplate['kind']): Good | null {
  return kind === 'food' || kind === 'energy' ? kind : null;
}

/** What a shield protects against, in plain words. */
export function shieldText(kind: Project['kind']): string {
  return kind === 'climateShield' ? 'climate damage' : 'pandemic damage';
}

const mine = (p: Project, id: string): boolean => p.members.some((m) => m.nationId === id);

/** Projects the player is in (any status), then open invitations to the player. */
export function myProjects(view: NationView): Project[] {
  return view.projects.projects.filter((p) => mine(p, view.selfId));
}

/** Open invitations to the player it can still take: not to a second shield of a kind it is already in (RULES 13.2). */
export function invitations(view: NationView): Project[] {
  const inShield = (kind: Project['kind']): boolean => goodOf(kind) === null && view.projects.projects.some((x) => x.kind === kind && mine(x, view.selfId));
  return view.projects.projects.filter((p) => p.status === 'forming' && p.invited.includes(view.selfId) && !inShield(p.kind));
}

/** The player's shortfall in a good per month, 0 when it has none. */
export function shortfallOf(view: NationView, good: Good): number {
  return Math.max(0, -balance(view.self, good));
}

/** The month a project would be built if it started in `start`: the first month its yield arrives. */
export function readyMonth(p: Pick<Project, 'buildTicks'>, start: number): number {
  return start + p.buildTicks + 1;
}

/** Months left in the game after `month`. */
export function monthsLeft(view: NationView, month: number): number {
  return Math.max(0, rule(view, 'gameLengthTicks') - month);
}

/** A member's share of a completed goods project's yield, before any climate damage at the host. */
export function yieldShare(p: Project, id: string): number {
  const m = p.members.find((x) => x.nationId === id);
  if (m === undefined || p.paidTotal <= 0 || goodOf(p.kind) === null) return 0;
  return Math.floor((p.yield * m.paid) / p.paidTotal);
}

/** What joining a forming project would mean for the player, if every seat fills. */
export interface JoinTerms {
  readonly units: number;
  readonly due: number;
  readonly perMonth: number;
  readonly ready: number;
  readonly monthsOfUse: number;
  /** Percent of the player's shortfall in that good the units would cover (goods only). */
  readonly coversPct: number;
}

export function joinTerms(view: NationView, p: Project): JoinTerms {
  const seats = rule(view, 'projectSlots');
  const good = goodOf(p.kind);
  const start = Math.max(view.tick, Math.min(p.formingDeadline, view.tick));
  const ready = readyMonth(p, start);
  const units = good === null ? 0 : Math.floor(p.yield / seats);
  const t = templateOf(view, p.template);
  const due =
    good === null
      ? Math.max(1, Math.floor((Math.floor((view.self.public.output * rule(view, 'projectShieldCostPct')) / 100) * t.costPct) / 100))
      : Math.ceil(p.cost / seats);
  const short = good === null ? 0 : shortfallOf(view, good);
  return {
    units,
    due,
    perMonth: Math.ceil(due / Math.max(1, p.buildTicks)),
    ready,
    monthsOfUse: monthsLeft(view, ready),
    coversPct: short <= 0 ? 0 : Math.min(100, Math.round((units * 100) / short)),
  };
}

/** One plain line on what a project gives: goods a month, or damage cut. */
export function benefitLine(view: NationView, p: Project, units: number): string {
  const good = goodOf(p.kind);
  if (good === null) return `cuts your ${shieldText(p.kind)} by ${Math.round(rule(view, 'projectShieldBp') / 100)}% after the pool's cover`;
  const short = shortfallOf(view, good);
  const cover = short <= 0 ? `you have no ${good} shortfall, so it is surplus to sell` : `${Math.min(100, Math.round((units * 100) / short))}% of your ${fmt(short)} ${good} shortfall`;
  return `${fmt(units)} ${good} a month: ${cover}`;
}

/** Progress of a building project, 0-100. */
export function progressPct(p: Project): number {
  return p.cost <= 0 ? 100 : Math.min(100, Math.floor((p.paidTotal * 100) / p.cost));
}

/** When a building project should finish at the members' current installments. */
export function etaMonth(view: NationView, p: Project): number {
  const perMonth = p.members.reduce((s, m) => s + (m.paid < m.cap ? m.installment : 0), 0);
  const left = Math.max(0, p.cost - p.paidTotal);
  return view.tick + (perMonth <= 0 ? 99 : Math.ceil(left / perMonth)) + 1;
}

/**
 * The best partners for a project the player could host: the free seats'
 * worth of playable nations short of that good (for a shield, the ones the
 * player trusts most), ranked by shortfall times trust. Grid links only invite
 * nations the player shares a bloc or alliance with.
 */
export function suggestedPartners(view: NationView, h: HostableProject): NationId[] {
  const t = templateOf(view, h.template);
  const good = goodOf(t.kind);
  const trust = (id: NationId): number => view.self.private.trust[id] ?? 0;
  const inShield = (id: NationId): boolean => good === null && view.projects.projects.some((p) => p.kind === t.kind && mine(p, id));
  return view.others
    .filter((o) => o.public.kind === 'playable' && !inShield(o.id))
    .filter((o) => !t.sharedTieRequired || view.projects.tiedTo.includes(o.id))
    .map((o) => ({ id: o.id, weight: good === null ? trust(o.id) : Math.floor((Math.max(0, -balance(o, good)) * trust(o.id)) / 100) }))
    .filter((c) => c.weight > 0)
    .sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1))
    .slice(0, rule(view, 'projectSlots') - 1)
    .map((c) => c.id);
}

/** Names as "A, B and C". */
export function nameList(ids: readonly string[]): string {
  const names = ids.map(nameOf);
  return names.length <= 1 ? (names[0] ?? 'nobody') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** Command builders for projects. `tick` is stamped at send time. */
export const projectCommands = {
  propose: (view: NationView, template: ProjectTemplateId, invite: readonly NationId[]) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type: 'proposeProject',
    payload: { template, invite: [...invite] },
  }),
  answer: (view: NationView, type: 'joinProject' | 'declineProject' | 'leaveProject', projectId: number) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type,
    payload: { projectId },
  }),
  fund: (view: NationView, projectId: number, amount: number) => (tick: number): Command => ({
    nationId: view.selfId,
    tick,
    type: 'fundProject',
    payload: { projectId, amount },
  }),
};
