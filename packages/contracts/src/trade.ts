import type { Command } from './command.ts';
import type { ControllerSlot, NationId, Tick } from './nation.ts';
import type { EconomyReport, ResourceAmount, StandingPolicy } from './economy.ts';

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
/** Phase 0 placeholder kept for the interface's sample cards. No game meaning. */
export type PingCommand = Command<'ping', { readonly target: NationId }>;
/** Seam 7: hand the nation to the caretaker AI, or take it back. */
export type SetControllerCommand = Command<'setController', { readonly controller: ControllerSlot }>;

export type GameCommand =
  | PingCommand
  | SetControllerCommand
  | MakeOfferCommand
  | AcceptOfferCommand
  | RejectOfferCommand
  | CounterOfferCommand
  | WithdrawOfferCommand
  | SetPolicyCommand
  | FundResilienceCommand;

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
