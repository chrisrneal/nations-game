import type { Event, NationId } from '@nations/contracts';

/**
 * Layer 7, explanation (docs/AI_DESIGN.md, RULES 7.4).
 *
 * Every decision a player can see comes with one of these: a short, specific
 * sentence built from numbers ("declined: you broke the deal in month 12"),
 * plus up to three ranked reasons. They are ordinary contracts `Event`s with
 * an audience, so a host can hand them to exactly the nations that saw the
 * decision - the counterparty of a trade answer, everyone for a public pledge
 * - and to nobody else (seam 6). They are derived data, never State.
 */
export const EXPLANATION_EVENT = 'aiExplained';

export type DecisionKind =
  | 'accept'
  | 'reject'
  | 'counter'
  | 'offer'
  | 'withdraw'
  | 'pledge'
  | 'skipPledge'
  | 'suspend'
  | 'resume'
  | 'forgive'
  | 'policy'
  | 'invest';

export interface Explanation {
  readonly nationId: NationId;
  readonly decision: DecisionKind;
  /** The nation the decision is about, when there is one. */
  readonly partner: NationId | null;
  /** The offer or crisis it answers, when there is one. */
  readonly offerId: number | null;
  readonly crisisId: number | null;
  /** One short sentence, lower case, starting with the verb: "declined: ...". */
  readonly text: string;
  /** Up to three reasons, most important first, each carrying a number. */
  readonly reasons: readonly string[];
}

export type ExplanationEvent = Event<typeof EXPLANATION_EVENT, Explanation>;

export function explanationEvent(tick: number, e: Explanation, audience: readonly NationId[]): ExplanationEvent {
  return { tick, type: EXPLANATION_EVENT, payload: e, audience };
}

/** True when a sentence obeys RULES 7.4: it carries at least one number. */
export function hasNumber(text: string): boolean {
  return /\d/.test(text);
}
