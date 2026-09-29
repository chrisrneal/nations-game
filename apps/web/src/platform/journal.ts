import type { CrisisEventPayloads, EconomyEventPayloads, Event, NationView, ResourceAmount } from '@nations/contracts';

/**
 * The player's journal: a small memory of derived facts the View does not
 * carry, built only from events the player was allowed to see (seam 6). It
 * feeds the explanations on cards, the trade lines on the map and the trust
 * why-sheet. Derived data, never State: it is saved beside the sim save so a
 * reopened game still shows why, and a missing journal only means less
 * explanation, never a different game.
 */

/** Why a nation decided something: the sim's `explanation` event payload, with its tick. */
export interface ExplanationNote {
  readonly tick: number;
  readonly nationId: string;
  /** The command type, the automatic answer ('answerOffer', 'answerAppeal', ...), or an AI announcement ('suspend', 'forgive', 'resume'). */
  readonly decision: string;
  /** The offer, crisis or pledge it concerns, if any. */
  readonly subject: number | null;
  readonly reasons: readonly string[];
  readonly by: 'command' | 'policy';
}

/** One settled trade the player was party to. */
export interface TradeLine {
  readonly tick: number;
  readonly partner: string;
  readonly gave: ResourceAmount;
  readonly got: ResourceAmount;
}

/** What moved the player's trust in one nation, counted since the game began (or since the journal began). */
export interface TrustCauses {
  readonly trades: number;
  readonly reneges: number;
  readonly pledgesKept: number;
  readonly pledgesBroken: number;
  readonly ignored: number;
}

export interface JournalSnapshot {
  readonly version: 1;
  /** Tick the journal started counting from (0 for a new game, later for an old save). */
  readonly since: number;
  /** The player's trust in each nation when the journal started. */
  readonly startTrust: Readonly<Record<string, number>>;
  readonly causes: Readonly<Record<string, TrustCauses>>;
  readonly explanations: readonly ExplanationNote[];
  readonly trades: readonly TradeLine[];
}

/** Months of explanations kept, and at most how many. */
export const EXPLANATION_MONTHS = 24;
export const EXPLANATION_MAX = 120;
/** Months of settled trades kept for the map's trade lines. */
export const TRADE_MONTHS = 12;

const NO_CAUSES: TrustCauses = { trades: 0, reneges: 0, pledgesKept: 0, pledgesBroken: 0, ignored: 0 };

export class Journal {
  private since: number;
  private startTrust: Record<string, number>;
  private causes: Record<string, TrustCauses>;
  private explanations: ExplanationNote[];
  private trades: TradeLine[];

  private constructor(snapshot: JournalSnapshot) {
    this.since = snapshot.since;
    this.startTrust = { ...snapshot.startTrust };
    this.causes = { ...snapshot.causes };
    this.explanations = [...snapshot.explanations];
    this.trades = [...snapshot.trades];
  }

  /** A fresh journal for the player's View at its current tick. */
  static start(view: NationView): Journal {
    return new Journal({ version: 1, since: view.tick, startTrust: { ...view.self.private.trust }, causes: {}, explanations: [], trades: [] });
  }

  static restore(snapshot: JournalSnapshot | undefined, view: NationView): Journal {
    return snapshot?.version === 1 ? new Journal(snapshot) : Journal.start(view);
  }

  /** Take in one step's events (already filtered to what the player may see). */
  record(selfId: string, tick: number, events: readonly Event[]): void {
    const bump = (id: string, key: keyof TrustCauses): void => {
      const c = this.causes[id] ?? NO_CAUSES;
      this.causes[id] = { ...c, [key]: c[key] + 1 };
    };
    for (const e of events) {
      switch (e.type) {
        case 'explanation': {
          const p = e.payload as CrisisEventPayloads['explanation'];
          this.explanations.push({ tick: e.tick, nationId: p.nationId, decision: p.decision, subject: p.subject, reasons: [...p.reasons], by: p.by });
          break;
        }
        case 'offerSettled': {
          const { offer } = e.payload as EconomyEventPayloads['offerSettled'];
          if (offer.from !== selfId && offer.to !== selfId) break;
          const mine = offer.from === selfId;
          const partner = mine ? offer.to : offer.from;
          this.trades.push({ tick: e.tick, partner, gave: mine ? offer.give : offer.get, got: mine ? offer.get : offer.give });
          bump(partner, 'trades');
          break;
        }
        case 'offerFailed': {
          const { offer, reneger } = e.payload as EconomyEventPayloads['offerFailed'];
          const victim = reneger === offer.from ? offer.to : offer.from;
          if (victim === selfId && reneger !== selfId) bump(reneger, 'reneges');
          break;
        }
        case 'offerExpired': {
          const { offer } = e.payload as EconomyEventPayloads['offerExpired'];
          if (offer.from === selfId) bump(offer.to, 'ignored');
          break;
        }
        case 'pledgeHonoured': {
          const { pledge } = e.payload as CrisisEventPayloads['pledgeHonoured'];
          if (pledge.nationId !== selfId) bump(pledge.nationId, 'pledgesKept');
          break;
        }
        case 'pledgeBroken': {
          const { pledge } = e.payload as CrisisEventPayloads['pledgeBroken'];
          if (pledge.nationId !== selfId) bump(pledge.nationId, 'pledgesBroken');
          break;
        }
        default:
          break;
      }
    }
    const oldestExplanation = tick - EXPLANATION_MONTHS;
    this.explanations = this.explanations.filter((x) => x.tick >= oldestExplanation).slice(-EXPLANATION_MAX);
    const oldestTrade = tick - TRADE_MONTHS;
    this.trades = this.trades.filter((t) => t.tick >= oldestTrade);
  }

  snapshot(): JournalSnapshot {
    return {
      version: 1,
      since: this.since,
      startTrust: { ...this.startTrust },
      causes: { ...this.causes },
      explanations: [...this.explanations],
      trades: [...this.trades],
    };
  }
}
