import type { NationId, Tick } from './nation.ts';
import type { NationMap } from './economy.ts';

/**
 * Crises, contribution pools and pledges (docs/RULES.md section 4).
 *
 * Multiplayer need: every one of these is a State object with a deadline
 * tick, never a conversation (seam 8). A crisis appeal is answered by the
 * nation's own command or, on its deadline tick, by its standing policy; a
 * pledge is paid by command or collected automatically on its deadline tick.
 * Nothing waits for anyone to be online, so a week-long async game resolves
 * every crisis on time with half its players asleep.
 */

/** The two crisis types: a slow ratchet and a fast spike (RULES 4.1, 4.2). */
export type CrisisKind = 'climate' | 'pandemic';

/** One shared pool per crisis type (RULES 4.3). */
export type PoolKind = 'adaptation' | 'health';

/**
 * A shared pool of Credit. Anyone may pay in at any time; nobody can take
 * money out. It is spent when a crisis of its kind locks.
 *
 * Public: RULES 4.3 wants free-riding visible, so who paid what this round
 * is on every nation's crisis card.
 */
export interface Pool {
  readonly kind: PoolKind;
  /** Credit in the pool now. */
  readonly balance: number;
  /**
   * The part of `balance` paid after an open pandemic was triggered. It counts
   * at `lateContributionEffectPct` (RULES 4.2). Always 0 for adaptation.
   */
  readonly late: number;
  /** Credit each nation paid in since this pool last locked. */
  readonly round: NationMap<number>;
  /** How much of its target the pool met when it last locked, in basis points (10,000 = met). Starts at 10,000. */
  readonly lastFundedBp: number;
}

/** How a crisis ended (RULES 4.3, prompt 09): the pool met its target, part of it, or too little. */
export type CrisisOutcome = 'success' | 'partial' | 'failure';

/**
 * How a nation's standing policy answers a crisis appeal it has not answered
 * itself (RULES 8.2, dial 3).
 * - fairShare: pay what it still owes of its share, if it has the Credit.
 * - reciprocal: pay its share in full if the world funded this pool's last
 *   round to at least `reciprocalMatchPct` of target, else scale down in
 *   proportion. Conditional cooperation, tit for tat at world level.
 * - none: pay nothing. Free-riding is allowed, visible and remembered.
 */
export type CrisisRule = 'fairShare' | 'reciprocal' | 'none';

/** Which pools a nation's standing monthly contribution goes to. */
export type ContributionTarget = PoolKind | 'split';

/** A nation's answer to one crisis appeal. */
export interface AppealAnswer {
  readonly answer: 'contributed' | 'pledged' | 'declined';
  /** Credit paid (or pledged) towards this crisis when it answered. */
  readonly amount: number;
  /** Its own command, or its standing policy on the deadline tick. */
  readonly by: 'command' | 'policy';
}

/**
 * An open crisis: the world's appeal to every nation to fund one pool before
 * `deadlineTick`. It is answerable in ticks `openedTick + 1` to `deadlineTick`
 * and locks at the end of the `deadlineTick` step, when the damage lands.
 */
export interface Crisis {
  readonly id: number;
  readonly kind: CrisisKind;
  readonly pool: PoolKind;
  /** Climate: ramps a little every world year. Pandemic: pandemicBaseSeverity. */
  readonly severity: number;
  readonly openedTick: Tick;
  readonly deadlineTick: Tick;
  /** Credit the pool needs for full cover (RULES 4.3), fixed when the crisis opens. */
  readonly target: number;
  /** Each nation's fair share of the target, by exposure-weighted output. */
  readonly shares: NationMap<number>;
  /** Who has answered so far. A nation missing here is answered by its policy on the deadline tick. */
  readonly answers: NationMap<AppealAnswer>;
}

/** A crisis after it locked: the public record the crisis card, the recap and the score read. */
export interface CrisisResult {
  readonly id: number;
  readonly kind: CrisisKind;
  readonly severity: number;
  readonly openedTick: Tick;
  readonly deadlineTick: Tick;
  readonly target: number;
  /** Credit counted towards the target (late pandemic money at its reduced effect). */
  readonly effective: number;
  /** Damage prevented for every nation, basis points (at most poolCoverMaxPct). */
  readonly coverBp: number;
  readonly outcome: CrisisOutcome;
  /** Paid at least `contributorMinSharePct` of their share this round. */
  readonly contributors: readonly NationId[];
  /** Had a share and paid less than that. */
  readonly freeRiders: readonly NationId[];
}

/**
 * A promise to pay `amount` Credit into `pool` by `deadlineTick`. Contributions
 * to that pool count towards it. On the deadline tick the rest is collected
 * automatically if the nation has the Credit (honoured); if it cannot pay, or
 * the pledge was withdrawn, it is broken, and every other nation trusts it
 * less (RULES 4.4).
 */
export interface Pledge {
  readonly id: number;
  readonly nationId: NationId;
  readonly pool: PoolKind;
  readonly amount: number;
  readonly paid: number;
  readonly createdTick: Tick;
  readonly deadlineTick: Tick;
}

/** Damage a locked crisis deals one nation: an output penalty over a run of ticks. Private to that nation. */
export interface CrisisHit {
  readonly crisisId: number;
  readonly kind: CrisisKind;
  readonly nationId: NationId;
  /** Output penalty in basis points while the hit lasts. */
  readonly bp: number;
  /** What the penalty would have been with an empty pool: the collective goal compares the two. */
  readonly bpUnpooled: number;
  readonly fromTick: Tick;
  readonly toTick: Tick;
}

/** The world's crisis picture as every nation sees it. Public. */
export interface CrisesView {
  readonly pools: readonly Pool[];
  readonly open: readonly Crisis[];
  /** The most recent locked crises, oldest first. */
  readonly recent: readonly CrisisResult[];
  /** Every open pledge, by anyone: a promise to the world is public. */
  readonly pledges: readonly Pledge[];
  /** This nation's own crisis damage, current and scheduled. */
  readonly hits: readonly CrisisHit[];
}
