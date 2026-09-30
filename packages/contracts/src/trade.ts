import type { Command } from './command.ts';
import type { ControllerSlot, NationId, Tick } from './nation.ts';
import type { EconomyReport, ResourceAmount, StandingPolicy } from './economy.ts';
import type { AppealAnswer, Crisis, CrisisHit, CrisisResult, CrisisRule, Pledge, PoolKind } from './crisis.ts';

/**
 * A bilateral trade offer: a State object with an expiry tick, never a
 * conversation (seam 8, RULES section 3.1).
 *
 * Multiplayer need: nothing assumes the other side is online. The offer waits
 * in State; the receiver answers by command, or its standing policy answers on
 * the offer's last tick, or it expires. Every path resolves inside the step, so
 * a week-long async game never stalls on an absent player.
 *
 * The maker gives `give` and receives `get`. It may be answered in ticks
 * `createdTick` to `expiryTick - 1`; it is gone once `expiryTick` is reached.
 */
export interface TradeOffer {
  readonly id: number;
  readonly from: NationId;
  readonly to: NationId;
  readonly give: ResourceAmount;
  readonly get: ResourceAmount;
  readonly createdTick: Tick;
  readonly expiryTick: Tick;
  /** Outside the fair price band when it was made (RULES section 3.2). */
  readonly hardBargain: boolean;
  /** The offer this one counters, or null. */
  readonly counterOf: number | null;
}

/** How an offer left State. */
export type OfferOutcome = 'settled' | 'rejected' | 'countered' | 'withdrawn' | 'expired' | 'failed';

export interface MakeOfferPayload {
  readonly to: NationId;
  readonly give: ResourceAmount;
  readonly get: ResourceAmount;
}
export interface OfferRefPayload {
  readonly offerId: number;
}
export interface CounterOfferPayload {
  readonly offerId: number;
  /** What the counter-maker (the original receiver) now gives and asks. */
  readonly give: ResourceAmount;
  readonly get: ResourceAmount;
}

export type MakeOfferCommand = Command<'makeOffer', MakeOfferPayload>;
export type AcceptOfferCommand = Command<'acceptOffer', OfferRefPayload>;
export type RejectOfferCommand = Command<'rejectOffer', OfferRefPayload>;
export type CounterOfferCommand = Command<'counterOffer', CounterOfferPayload>;
export type WithdrawOfferCommand = Command<'withdrawOffer', OfferRefPayload>;
export type SetPolicyCommand = Command<'setPolicy', Partial<StandingPolicy>>;
/** Spend Credit on resilience now, `points` at `resilienceCostPerPoint` each. */
export type FundResilienceCommand = Command<'fundResilience', { readonly points: number }>;
/** Phase 0 placeholder with no game meaning; only the dummy AI and tests send it now. */
export type PingCommand = Command<'ping', { readonly target: NationId }>;
/** Seam 7: hand the nation to the caretaker AI, or take it back. */
export type SetControllerCommand = Command<'setController', { readonly controller: ControllerSlot }>;

/** Pay Credit into a pool now. Counts towards the nation's open pledges to that pool and answers its open appeal. */
export type ContributeCommand = Command<'contribute', { readonly pool: PoolKind; readonly amount: number }>;
/** Promise Credit to a pool by `deadlineTick` (at most `maxPledgeTicks` ahead). Answers the pool's open appeal. */
export type PledgeCommand = Command<'pledge', { readonly pool: PoolKind; readonly amount: number; readonly deadlineTick: Tick }>;
/** Take back an open pledge. It counts as broken. */
export type WithdrawPledgeCommand = Command<'withdrawPledge', { readonly pledgeId: number }>;
/** Answer an open crisis appeal with no. Visible to every nation, like any answer. */
export type DeclineAppealCommand = Command<'declineAppeal', { readonly crisisId: number }>;

export type GameCommand =
  | PingCommand
  | SetControllerCommand
  | MakeOfferCommand
  | AcceptOfferCommand
  | RejectOfferCommand
  | CounterOfferCommand
  | WithdrawOfferCommand
  | SetPolicyCommand
  | FundResilienceCommand
  | ContributeCommand
  | PledgeCommand
  | WithdrawPledgeCommand
  | DeclineAppealCommand;

/**
 * Event payloads, by event type. Trade events go to both parties only; the
 * shortfall and resilience events go to the nation itself only (seam 6).
 */
export interface EconomyEventPayloads {
  readonly offerMade: { readonly offer: TradeOffer };
  /** `by` is who answered: the nation's own command, or its standing policy. */
  readonly offerSettled: { readonly offer: TradeOffer; readonly by: 'command' | 'policy' };
  readonly offerRejected: { readonly offer: TradeOffer; readonly by: 'command' | 'policy' };
  readonly offerCountered: { readonly offer: TradeOffer; readonly counter: TradeOffer };
  readonly offerWithdrawn: { readonly offer: TradeOffer };
  /** Nobody answered in time. The receiver loses a little of the maker's trust. */
  readonly offerExpired: { readonly offer: TradeOffer };
  /** Accepted, but `reneger` could not pay at settlement. Nothing moved. */
  readonly offerFailed: { readonly offer: TradeOffer; readonly reneger: NationId; readonly by: 'command' | 'policy' };
  readonly shortfall: { readonly nationId: NationId; readonly report: EconomyReport };
  readonly resilienceFunded: { readonly nationId: NationId; readonly points: number; readonly cost: number };
  readonly policyChanged: { readonly nationId: NationId; readonly policy: StandingPolicy };
}
export type EconomyEventType = keyof EconomyEventPayloads;

/**
 * Crisis, pledge and explanation event payloads (RULES 4). Crisis, appeal,
 * contribution and pledge events are public, because RULES 4.3 wants
 * free-riding visible; damage goes to the nation hit only; an explanation goes
 * to the nation that acted and the nation its decision concerns.
 */
export interface CrisisEventPayloads {
  readonly crisisOpened: { readonly crisis: Crisis };
  /** A nation answered an appeal. `rule` is the standing policy that answered for it, if any. */
  readonly appealAnswered: { readonly crisisId: number; readonly nationId: NationId; readonly share: number; readonly rule: CrisisRule | null } & AppealAnswer;
  readonly contributed: { readonly nationId: NationId; readonly pool: PoolKind; readonly amount: number; readonly late: boolean; readonly by: 'command' | 'policy' | 'standing' };
  readonly pledgeMade: { readonly pledge: Pledge };
  /** Paid in full by the deadline; `by: 'policy'` when the rest was collected automatically on the deadline tick. */
  readonly pledgeHonoured: { readonly pledge: Pledge; readonly by: 'command' | 'policy' };
  /** Withdrawn, or unpaid on the deadline tick. Every other nation trusts the pledger less. */
  readonly pledgeBroken: { readonly pledge: Pledge; readonly reason: 'withdrawn' | 'unpaid' };
  readonly crisisLocked: { readonly result: CrisisResult };
  readonly crisisHit: { readonly hit: CrisisHit };
  /**
   * Why a nation decided something, in sentences built from numbers (RULES
   * 7.4). Sent by the sim for every automatic answer (`by: 'policy'`), and
   * relayed from a command's `why` (`by: 'command'`, e.g. an AI nation).
   */
  readonly explanation: {
    readonly nationId: NationId;
    /** The command type, or the automatic answer: 'answerOffer', 'answerAppeal', 'collectPledge'. */
    readonly decision: string;
    /** The offer, crisis or pledge it concerns, if any. */
    readonly subject: number | null;
    readonly reasons: readonly string[];
    readonly by: 'command' | 'policy';
  };
}
export type CrisisEventType = keyof CrisisEventPayloads;

/** One line of an away recap: what kind of news it is, and one plain sentence with numbers. */
export interface RecapLine {
  readonly kind: 'score' | 'crisis' | 'pledge' | 'trade' | 'trust' | 'policy';
  readonly text: string;
}

/**
 * What happened to one nation while it was away (RULES 8.1, the away recap
 * card): a handful of plain sentences, most important first, short enough to
 * read in under a minute (Gate 2's 24-hour absence test).
 */
export interface Recap {
  readonly nationId: NationId;
  readonly fromTick: Tick;
  readonly toTick: Tick;
  readonly lines: readonly RecapLine[];
}
