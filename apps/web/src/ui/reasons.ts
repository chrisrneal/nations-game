import type { TradeOffer } from '@nations/contracts';
import type { ExplanationNote, JournalSnapshot } from '../platform/index.ts';
import { nameOf } from '../world/nations.ts';

/**
 * AI explanations on cards (RULES 7.4). They come from the sim's
 * `explanation` events (packages/contracts), which the host keeps in the
 * player's journal. Until a nation has explained a decision, the card shows a
 * placeholder rather than a guess.
 */

/** One reason sentence, with its nation: "Japan: declined: you broke the deal in month 3". */
export function said(note: ExplanationNote): string {
  const first = note.reasons[0] ?? '';
  return `${nameOf(note.nationId)}: ${first}`;
}

export const EMPTY_JOURNAL: JournalSnapshot = { version: 1, since: 0, startTrust: {}, causes: {}, explanations: [], trades: [] };

/** Placeholder until a real explanation arrives. */
export function notYet(nationId: string): string {
  return `${nameOf(nationId)} has not said why yet; its reasons show here when it does.`;
}

/** Why the maker sent this offer (or counter-offer), if it said. */
export function offerReason(journal: JournalSnapshot, offer: TradeOffer): ExplanationNote | undefined {
  const notes = journal.explanations;
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    if (n.nationId !== offer.from || n.tick !== offer.createdTick) continue;
    if (offer.counterOf === null ? n.decision === 'makeOffer' : n.decision === 'counterOffer' && n.subject === offer.counterOf) return n;
  }
  return undefined;
}

/** What other nations said about a crisis appeal, newest first. */
export function crisisReasons(journal: JournalSnapshot, crisisId: number, selfId: string, max = 2): ExplanationNote[] {
  const out: ExplanationNote[] = [];
  const notes = journal.explanations;
  for (let i = notes.length - 1; i >= 0 && out.length < max; i--) {
    const n = notes[i]!;
    if (n.subject === crisisId && n.nationId !== selfId && (n.decision === 'contribute' || n.decision === 'declineAppeal' || n.decision === 'pledge')) out.push(n);
  }
  return out;
}

/** AI announcements to the player (retaliation) in the last `months` months, newest first. */
export function announcements(journal: JournalSnapshot, selfId: string, tick: number, months = 2): ExplanationNote[] {
  return journal.explanations.filter((n) => n.decision === 'suspend' && n.nationId !== selfId && tick - n.tick <= months).reverse();
}

/** The latest thing a nation said to the player, for its row on the map. */
export function lastWord(journal: JournalSnapshot, nationId: string): ExplanationNote | undefined {
  for (let i = journal.explanations.length - 1; i >= 0; i--) {
    const n = journal.explanations[i]!;
    if (n.nationId === nationId && n.by === 'command') return n;
  }
  return undefined;
}
