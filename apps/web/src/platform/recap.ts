import type { CrisisEventPayloads, Event, NationView, Recap, RecapLine } from '@nations/contracts';
import { buildRecap } from '@nations/sim';

/**
 * The away recap on the phone (RULES 8.1, Gate 2's 24-hour absence test).
 *
 * The sim writes the lines (`buildRecap`, from the player's two Views and the
 * events it saw); the host adds what the AI nations said to the player while
 * they were away (retaliation, forgiveness, answers to the player's offers),
 * ranks everything by importance and keeps the top `recapMaxLines`, so a
 * 24-hour absence reads in under a minute.
 */
export interface RankedLine extends Omit<RecapLine, 'kind'> {
  readonly kind: RecapLine['kind'] | 'ai';
  /** 0-100: how much this line matters to the player. Lines are sorted by it. */
  readonly weight: number;
}

export interface AwayRecap {
  readonly fromTick: number;
  readonly toTick: number;
  readonly lines: readonly RankedLine[];
  readonly words: number;
  /** Wall-clock milliseconds the catch-up took on this device (Gate 0 budget: 2,000). */
  readonly catchUpMs: number;
}

/** Importance of one sim recap line: harm to the player first, then the headline, then routine news. */
export function weigh(line: RecapLine): number {
  const t = line.text;
  switch (line.kind) {
    case 'pledge':
      return /broke/.test(t) ? 95 : 40;
    case 'crisis':
      if (/appeal open/.test(t)) return /you (contributed|pledged|declined)/.test(t) ? 55 : 85;
      if (/locked while you were away/.test(t)) return /failed/.test(t) ? 70 : 58;
      if (/failure/.test(t)) return 90;
      return /no damage to you/.test(t) ? 60 : 80;
    case 'score':
      return 75;
    case 'policy':
      return 50;
    case 'trade':
      return 45;
    case 'trust':
      return 35;
    case 'project':
      if (/dropped|walked out|lapsed/.test(t)) return 82;
      return /invitation/.test(t) ? 66 : 62;
    default:
      return 30;
  }
}

const AI_WEIGHT: Readonly<Record<string, number>> = {
  suspend: 88,
  withdrawOffer: 70,
  resume: 52,
  forgive: 48,
  rejectOffer: 46,
  counterOffer: 44,
  acceptOffer: 42,
};

/** Lines for what AI nations said to the player while away: at most one per nation, most important first. */
function aiLines(events: readonly Event[], selfId: string, nameOf: (id: string) => string): RankedLine[] {
  const best = new Map<string, RankedLine>();
  for (const e of events) {
    if (e.type !== 'explanation') continue;
    const p = e.payload as CrisisEventPayloads['explanation'];
    if (p.nationId === selfId || p.by !== 'command' || e.audience.length === 0) continue;
    const weight = AI_WEIGHT[p.decision];
    const first = p.reasons[0];
    if (weight === undefined || first === undefined) continue;
    const line: RankedLine = { kind: 'ai', text: `${nameOf(p.nationId)} ${first.replace(/^[A-Z]/, (c) => c.toLowerCase())}${/[.!?]$/.test(first) ? '' : '.'}`, weight };
    const had = best.get(p.nationId);
    if (had === undefined || had.weight < weight) best.set(p.nationId, line);
  }
  return [...best.values()];
}

export function countWords(lines: readonly { readonly text: string }[]): number {
  return lines.reduce((sum, l) => sum + l.text.split(/\s+/).filter((w) => w.length > 0).length, 0);
}

/**
 * The sim's lines, with the crises that locked while the player was away
 * folded into one: the one that mattered most, plus a count of the rest. A
 * day away holds several climate rounds, and five near-identical lines would
 * push the trade and trust news out of a six-line recap.
 */
function simLines(before: NationView, after: NationView, events: readonly Event[]): RecapLine[] {
  const locked = events.filter((e) => e.type === 'crisisLocked');
  const full: Recap = buildRecap(before, after, events);
  if (locked.length <= 1) return [...full.lines];
  // The same recap without the locked crises keeps what the crisis lines crowded out.
  const rest = buildRecap(before, after, events.filter((e) => e.type !== 'crisisLocked')).lines;
  const crisisLines = full.lines.filter((l) => l.kind === 'crisis' && !/appeal open/.test(l.text));
  // The heaviest line; among equals the latest, since climate ratchets and the newest crisis hurts most.
  const worst = crisisLines.reduce<RecapLine | undefined>((best, l) => (best === undefined || weigh(l) >= weigh(best) ? l : best), undefined);
  const outcomes = locked.map((e) => (e.payload as CrisisEventPayloads['crisisLocked']).result.outcome);
  const count = (o: string): number => outcomes.filter((x) => x === o).length;
  const parts = [`${count('success')} fully funded`, `${count('partial')} partly`, `${count('failure')} failed`].filter((t) => !t.startsWith('0 '));
  const summary: RecapLine = { kind: 'crisis', text: `${locked.length} crises locked while you were away: ${parts.join(', ')}.` };
  return [...(worst === undefined ? [] : [worst]), summary, ...rest];
}

/** The ranked recap between two of the player's Views. */
export function awayRecap(before: NationView, after: NationView, events: readonly Event[], catchUpMs: number): AwayRecap {
  const maxLines = after.rules.recapMaxLines ?? 6;
  const nameOf = (id: string): string => after.others.find((o) => o.id === id)?.name ?? id;
  const ranked = [
    ...simLines(before, after, events).map((line, i) => ({ line: { ...line, weight: weigh(line) } as RankedLine, i })),
    ...aiLines(events, after.selfId, nameOf).map((line, i) => ({ line, i: 100 + i })),
  ]
    .sort((a, b) => b.line.weight - a.line.weight || a.i - b.i)
    .map((x) => x.line)
    .slice(0, maxLines);
  return { fromTick: before.tick, toTick: after.tick, lines: ranked, words: countWords(ranked), catchUpMs: Math.round(catchUpMs) };
}
