import type { Command } from './command.ts';
import type { NationId, Tick } from './nation.ts';

/**
 * Joint projects (docs/RULES.md section 13, decision record H4).
 *
 * Multiplayer need: a project is a State object with deadlines, never a
 * conversation (seam 8). An invitation waits in State until its forming
 * deadline; installments are collected by the sim every building month; an
 * absent invitee simply has not joined when the deadline comes. Every project
 * is public: who hosts it, who was invited, who joined, who walked out and
 * what each paid, because RULES 13 wants partners' reliability visible.
 */

/** What a project makes: goods, or armour against one crisis kind. */
export type ProjectKind = 'energy' | 'food' | 'climateShield' | 'pandemicShield';

/** Who may host a template (RULES 13.1). */
export type HostRule = 'energySurplus' | 'foodSurplus' | 'anyone';

export type ProjectTemplateId = 'solar' | 'grid' | 'hydrogen' | 'grain' | 'irrigation' | 'earlyWarning' | 'vaccines';

/** One catalogue entry. Percentages scale the section 13.6 tunables. */
export interface ProjectTemplate {
  readonly id: ProjectTemplateId;
  readonly name: string;
  /** One plain sentence: what it is. No numbers needed; the card adds them. */
  readonly blurb: string;
  readonly kind: ProjectKind;
  readonly host: HostRule;
  /** Build months as a percent of projectBuildTicks. */
  readonly buildPct: number;
  /** Yield as a percent of projectYieldPct (goods only; 0 for shields). */
  readonly yieldPct: number;
  /** Cost as a percent of the unit cost (goods) or of projectShieldCostPct (shields). */
  readonly costPct: number;
  /** Host's minerals endowment must be at least this (0 = no requirement). */
  readonly minMineralsEndowment: number;
  /** Every member must share a bloc or an alliance with the host. */
  readonly sharedTieRequired: boolean;
}

export type ProjectStatus = 'forming' | 'building' | 'active';

export interface ProjectMember {
  readonly nationId: NationId;
  /** Credit paid in so far. Shares of the yield follow it (RULES 13.4). */
  readonly paid: number;
  readonly joinedTick: Tick;
  /**
   * Fixed when building starts (0 while forming, RULES 13.3): what this member
   * has committed in total, its monthly installment, and the most it may pay.
   * Goods projects split the cost equally; a shield charges each member a share
   * of its own output, because a shield's benefit scales with it.
   */
  readonly due: number;
  readonly installment: number;
  readonly cap: number;
}

export interface Project {
  readonly id: number;
  readonly template: ProjectTemplateId;
  readonly kind: ProjectKind;
  readonly host: NationId;
  readonly status: ProjectStatus;
  readonly createdTick: Tick;
  /** Last month an invitee may join. The project starts building or lapses at the end of it. */
  readonly formingDeadline: Tick;
  readonly startedTick: Tick | null;
  readonly completedTick: Tick | null;
  /** Nations the host invited that have neither joined nor declined. */
  readonly invited: readonly NationId[];
  readonly declined: readonly NationId[];
  /** Members, host first, in joining order. */
  readonly members: readonly ProjectMember[];
  /** Nations that left or were dropped while it was building, with what they forfeited. */
  readonly left: readonly { readonly nationId: NationId; readonly paid: number; readonly tick: Tick; readonly reason: 'left' | 'dropped' }[];
  /** Fixed at founding (RULES 13.2). */
  readonly buildTicks: number;
  /** Units of food or energy a month when complete, all members together; 0 for shields. */
  readonly yield: number;
  /**
   * Credit the whole build costs. Goods: fixed at founding. Shields: the sum of
   * the members' dues, set when building starts (the host's own due before that),
   * and reduced by a leaver's unpaid due.
   */
  readonly cost: number;
  /** Credit paid in by everyone, including members who left. Completes at `cost`. */
  readonly paidTotal: number;
}

/** The world's projects as every nation sees them. Public. */
export interface ProjectsView {
  readonly catalogue: readonly ProjectTemplate[];
  /** Forming, building and active projects, oldest first. Lapsed projects leave State. */
  readonly projects: readonly Project[];
  /**
   * For the viewing nation only: what each template would be if it founded it
   * now, and why it may not (null when it may). Public data, computed by the
   * sim so no interface or AI re-derives the formulas.
   */
  readonly hostable: readonly HostableProject[];
}

export interface HostableProject {
  readonly template: ProjectTemplateId;
  readonly buildTicks: number;
  readonly yield: number;
  /** Goods: the whole build. Shields: the viewer's own due. */
  readonly cost: number;
  readonly problem: string | null;
}

export type ProposeProjectCommand = Command<'proposeProject', { readonly template: ProjectTemplateId; readonly invite: readonly NationId[] }>;
export type JoinProjectCommand = Command<'joinProject', { readonly projectId: number }>;
export type DeclineProjectCommand = Command<'declineProject', { readonly projectId: number }>;
export type LeaveProjectCommand = Command<'leaveProject', { readonly projectId: number }>;
/** Pay more into a building project now, up to the member's cap: faster build, bigger share. */
export type FundProjectCommand = Command<'fundProject', { readonly projectId: number; readonly amount: number }>;

export type ProjectCommand = ProposeProjectCommand | JoinProjectCommand | DeclineProjectCommand | LeaveProjectCommand | FundProjectCommand;

/** Project events. All public (audience []), like crisis answers. */
export interface ProjectEventPayloads {
  readonly projectProposed: { readonly project: Project };
  readonly projectJoined: { readonly projectId: number; readonly nationId: NationId };
  readonly projectDeclined: { readonly projectId: number; readonly nationId: NationId };
  readonly projectStarted: { readonly project: Project };
  /** Too few members at the forming deadline. Nothing was paid. */
  readonly projectLapsed: { readonly project: Project };
  /** Left, or dropped for missing an installment. `paid` is forfeited. */
  readonly projectLeft: { readonly projectId: number; readonly nationId: NationId; readonly paid: number; readonly reason: 'left' | 'dropped' };
  readonly projectFunded: { readonly projectId: number; readonly nationId: NationId; readonly amount: number };
  readonly projectCompleted: { readonly project: Project };
}

export type ProjectEventType = keyof ProjectEventPayloads;
