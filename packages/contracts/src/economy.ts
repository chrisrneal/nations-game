import type { NationId } from './nation.ts';
import type { ContributionTarget, CrisisRule } from './crisis.ts';

/**
 * The three tradable stocks (docs/RULES.md section 2). Resilience is the fourth
 * number in the strip but is a level, not a stock, and never changes hands.
 *
 * Multiplayer need: a fixed, closed list means a client and a server can never
 * disagree about what may be traded, and an offer naming anything else is
 * rejected by shape alone.
 */
export type Resource = 'food' | 'energy' | 'credit';

/** One amount of one resource. Amounts are positive whole units (S5). */
export interface ResourceAmount {
  readonly resource: Resource;
  readonly amount: number;
}

/** How much of each resource a nation holds. Never negative (Gate 1 invariant). */
export interface Stocks {
  readonly food: number;
  readonly energy: number;
  readonly credit: number;
}

/**
 * `playable` nations are modelled individually and scored; `aggregate`
 * regions are background economies that answer offers through their standing
 * policies but never start one and are never scored (D9, RULES section 12 Q1).
 */
export type NationKind = 'playable' | 'aggregate';

/**
 * A nation's starting facts, taken from data/world-2030.json, integers only.
 *
 * Multiplayer need: the whole economy is derived from these numbers, so a
 * server and a client that build a world from the same endowments build the
 * same world. Floats in the data file (median age, growth paths) never enter.
 */
export interface NationEndowment {
  readonly id: string;
  readonly name: string;
  readonly kind: NationKind;
  /** People, 1 July 2030. */
  readonly population: number;
  /** Billions of international dollars at PPP, 2030. */
  readonly gdpPppBn: number;
  /** Annual baseline growth in basis points: the D3 baseline trajectory. */
  readonly baselineGrowthBp: number;
  /** 0-100 game indices, 50 = balanced. */
  readonly foodSelfSufficiency: number;
  readonly energySelfSufficiency: number;
  readonly mineralsEndowment: number;
  readonly mineralsRefining: number;
  readonly climateExposure: number;
  readonly pandemicPreparedness: number;
  readonly blocs: readonly string[];
  readonly alliances: readonly string[];
  readonly topTradePartners: readonly string[];
}

/** Structural demand and production of one resource per tick, before trade. */
export interface Flow {
  readonly demand: number;
  readonly production: number;
}

/**
 * Standing policies: the answer a nation gives while nobody is at the controls
 * (seam 8, RULES sections 3.4, 4.4 and 8.2).
 *
 * Multiplayer need: every interaction must resolve with the other side offline.
 * These dials are stored in State and changed only by the `setPolicy` command,
 * so an absent player's nation keeps trading and answering crises exactly as
 * they set it, on every machine.
 *
 * The three groups the rules name:
 * - trade posture: `rejectAll` (closed) and `hardBargains` (how it offers);
 * - auto-accept conditions: `acceptFairDeficit` and `acceptTrusted`; an offer
 *   that meets none of them is declined on its last tick, never left to lapse;
 * - crisis contribution rule: `crisisRule`, `contributionBp` and `contributionTo`.
 */
export interface StandingPolicy {
  /** Auto-accept fair offers that cover a structural deficit. On by default. */
  readonly acceptFairDeficit: boolean;
  /** Auto-accept anything from a nation trusted at or above the threshold. Off by default. */
  readonly acceptTrusted: boolean;
  /** Reject every offer (the isolationist setting). Overrides the two above. */
  readonly rejectAll: boolean;
  /** Which deficit the policy covers first when several offers compete. */
  readonly coverPriority: 'food' | 'energy';
  /** Resilience level below which Credit is spent automatically to restore it. */
  readonly resilienceFloor: number;
  /** Whether this nation may send offers outside the fair price band. */
  readonly hardBargains: boolean;
  /** How it answers a crisis appeal it has not answered itself, on the deadline tick. */
  readonly crisisRule: CrisisRule;
  /** Share of each month's income paid into the pools, in basis points (RULES 8.2 dial 3). */
  readonly contributionBp: number;
  /** Which pool the monthly contribution goes to; `split` halves it. */
  readonly contributionTo: ContributionTarget;
  /** Share of each month's income invested in home Food or Energy capacity, in basis points (RULES 2.9, 8.2 dial 3). */
  readonly investBp: number;
}

/** The two goods a nation can produce at home (RULES 2.9). Credit is never built. */
export type HomeGood = 'food' | 'energy';

/**
 * Home capacity online, per good, in basis points of that good's demand
 * (100 = one point = 1% of demand). Adds units to production (RULES 2.9).
 */
export interface HomeCapacity {
  readonly food: number;
  readonly energy: number;
}

/**
 * An order still being built: `bp` of capacity in `good`, online from the
 * start of `readyTick`. Counts as committed for price and ceiling, but
 * produces nothing yet (RULES 2.9).
 */
export interface Build {
  readonly good: HomeGood;
  readonly bp: number;
  readonly readyTick: number;
}

/** What happened to one nation's economy in the tick just stepped. Private. */
export interface EconomyReport {
  readonly consumedFood: number;
  readonly consumedEnergy: number;
  readonly unmetFood: number;
  readonly unmetEnergy: number;
  /** Output lost to shortfalls this tick, whole percent. */
  readonly penaltyPct: number;
  /** Credit earned this tick (equals realised output). */
  readonly income: number;
  readonly resilienceSpent: number;
  /** Capacity gained from trade this tick, in hundredths of a basis point. */
  readonly tradeGainCbp: number;
  /** Output lost to crisis damage this tick, whole percent. */
  readonly crisisPct: number;
  /** Credit paid into the pools this tick by the standing contribution. */
  readonly contributed: number;
  /** Credit put into home capacity this tick, by command and by the standing rule (RULES 2.9). */
  readonly invested: number;
}

/**
 * Reference prices in thousandths of a Credit per unit, moved by world-wide
 * scarcity (RULES section 3.2). Credit is always 1000.
 */
export interface Prices {
  readonly food: number;
  readonly energy: number;
  readonly credit: number;
}

/**
 * World totals of every source and sink since tick 0: what the Gate 1
 * "sources and sinks in band" metric and the conservation invariant read.
 */
export interface WorldLedger {
  readonly foodProduced: number;
  readonly foodConsumed: number;
  /** Demand nobody could meet: the "deficits met" collective goal reads these. */
  readonly foodUnmet: number;
  readonly energyProduced: number;
  readonly energyConsumed: number;
  readonly energyUnmet: number;
  readonly creditIncome: number;
  readonly creditSpentResilience: number;
  /** Credit put into home capacity: a named sink (RULES 2.9). */
  readonly creditSpentInvestment: number;
  readonly tradesSettled: number;
  readonly offersExpired: number;
  readonly offersFailed: number;
  /** Credit paid into the crisis pools (a transfer, not yet a sink). */
  readonly creditPooled: number;
  /** Credit spent by pools when crises locked: the crisis sink. */
  readonly creditSpentCrises: number;
  /** Output lost to climate damage, and what it would have been with empty pools (RULES 5.2). */
  readonly climateLoss: number;
  readonly climateLossUnpooled: number;
  readonly pandemicLoss: number;
  readonly pandemicLossUnpooled: number;
  readonly crisesLocked: number;
  readonly crisesSucceeded: number;
  readonly pledgesHonoured: number;
  readonly pledgesBroken: number;
}

/** A per-nation map, e.g. one nation's trust in each other nation (5-90). */
export type NationMap<T> = Readonly<Record<NationId, T>>;
