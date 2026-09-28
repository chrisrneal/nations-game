import type { NationId } from './nation.ts';
import type {
  EconomyReport,
  Flow,
  NationKind,
  NationMap,
  Prices,
  StandingPolicy,
  Stocks,
} from './economy.ts';
import type { TradeOffer } from './trade.ts';
import type { View } from './view.ts';

/**
 * What any nation may know about another (seam 6). Structural positions and
 * output are public because they follow from published data; stocks, trust,
 * resilience and policies are not.
 */
export interface NationPublic {
  readonly kind: NationKind;
  /** Phase 0 placeholder counter used by the interface's sample cards. */
  readonly pingsReceived: number;
  /** Realised output last tick: the scoreboard (RULES section 2). */
  readonly output: number;
  /** Where the nation's own baseline trajectory says output should be now (D3). */
  readonly baselineOutput: number;
  readonly food: Flow;
  readonly energy: Flow;
}

/** What only the nation itself, and the authoritative sim, may know. */
export interface NationPrivate {
  readonly pingsSent: number;
  readonly stocks: Stocks;
  /** 0 to resilienceMax. Hidden until the owner rules on RULES section 12 Q2. */
  readonly resilience: number;
  /** Potential output x 10,000, before minerals and shortfalls. Grows at baseline plus trade gains. */
  readonly capacityE4: number;
  /** Baseline output x 10,000: the same growth with no trade gains. */
  readonly baselineE4: number;
  readonly policy: StandingPolicy;
  /** This nation's trust in each other nation (RULES section 6). */
  readonly trust: NationMap<number>;
  readonly last: EconomyReport;
  readonly tradesSettled: number;
  readonly reneges: number;
}

export interface NationRecord {
  readonly id: NationId;
  readonly name: string;
  readonly public: NationPublic;
  readonly private: NationPrivate;
}

/** Another nation as seen from outside: identity and public fields only. */
export interface ForeignNation {
  readonly id: NationId;
  readonly name: string;
  readonly public: NationPublic;
}

/**
 * One playable nation's score (RULES 5), as the sim's scoreboard computes it.
 * Public: it follows from output and baseline output, which are public, and
 * every player sees the same table.
 */
export interface NationScore {
  readonly id: NationId;
  /** Smoothed realised output over smoothed baseline output, x 10,000 (RULES 5.1). */
  readonly ownScoreBp: number;
  /** ownScore x the collective multiplier x the score scale (RULES 5.3). */
  readonly finalScore: number;
}

/** The world's scoreboard as every nation sees it. */
export interface ScoresView {
  /** Collective multiplier x 10,000 (RULES 5.2), the same for every nation. */
  readonly multiplierBp: number;
  /** Every playable nation, in the world's nation order. */
  readonly nations: readonly NationScore[];
}

/**
 * One nation's picture of the world: the contracts `View` plus this nation's
 * own record, every other nation's public face, the offers it is party to and
 * the reference prices.
 *
 * Multiplayer need: this is all a client or an AI ever receives. Offers
 * between two other nations never appear in it.
 */
export interface NationView extends View {
  readonly self: NationRecord;
  readonly others: readonly ForeignNation[];
  /** Open offers this nation made or received, by id. */
  readonly offers: readonly TradeOffer[];
  readonly prices: Prices;
  /** The sim's own scoreboard, so no interface or AI recomputes a score. */
  readonly scores: ScoresView;
  /**
   * The value of every tunable, by id: the public rules of this game. An AI
   * reads its numbers here, never from its own constants, so tuning one file
   * moves every player the same way.
   */
  readonly rules: Readonly<Record<string, number>>;
}
