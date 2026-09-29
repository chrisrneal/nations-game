import type { ControllerSlot, CrisisEventPayloads, EconomyEventPayloads, Event, ResourceAmount, TradeOffer } from '@nations/contracts';

/**
 * Prediction mode (Gate 2: "owner predicts AI responses 70%+ after one game").
 *
 * When it is on, every AI answer to one of the player's offers, and each
 * crisis appeal answer from the AI nation the player trusts most, is held
 * back as a question - "What will they do?" - until the player guesses. The
 * guess and the real answer are stored in the save, so exported saves can be
 * graded by `npm run harness -- predictions`.
 *
 * Host-side, never State: a guess changes nothing in the world.
 */

export type PredictionKind = 'offer' | 'appeal';
/** Choices, by kind. The first word of each is what the harness grades. */
export const CHOICES: Readonly<Record<PredictionKind, readonly string[]>> = {
  offer: ['accept', 'reject', 'counter'],
  appeal: ['contributed', 'pledged', 'declined'],
};

export interface PredictionRecord {
  readonly id: number;
  /** Month the AI answered. */
  readonly tick: number;
  /** The AI nation that answered. */
  readonly nationId: string;
  readonly kind: PredictionKind;
  /** The offer or crisis it answered. */
  readonly subject: number;
  /** One line: what they were answering. */
  readonly question: string;
  /** What they actually did: one of CHOICES[kind]. Withheld from the interface until guessed. */
  readonly outcome: string;
  readonly reasons: readonly string[];
  readonly guess: string | null;
  readonly guessedTick: number | null;
  /** open: waiting for a guess; guessed; lapsed: never guessed in time, not graded. */
  readonly status: 'open' | 'guessed' | 'lapsed';
}

export interface PredictionBook {
  readonly version: 1;
  readonly mode: boolean;
  readonly nextId: number;
  readonly records: readonly PredictionRecord[];
}

/** A question waiting for the player: the answer is not in it. */
export interface PendingPrediction {
  readonly id: number;
  readonly tick: number;
  readonly nationId: string;
  readonly kind: PredictionKind;
  readonly question: string;
  readonly choices: readonly string[];
}

export interface ResolvedPrediction extends PendingPrediction {
  readonly outcome: string;
  readonly reasons: readonly string[];
  readonly guess: string;
  readonly correct: boolean;
}

export interface PredictionsView {
  readonly mode: boolean;
  readonly pending: readonly PendingPrediction[];
  /** The latest guesses, newest first. */
  readonly recent: readonly ResolvedPrediction[];
  readonly guessed: number;
  readonly correct: number;
}

/** An open question lapses (is never graded) after this many months without a guess. */
export const PREDICTION_LAPSE_MONTHS = 6;
/** At most this many open questions are shown at once; older ones lapse first. */
export const PREDICTION_OPEN_MAX = 4;

export const EMPTY_BOOK: PredictionBook = { version: 1, mode: false, nextId: 1, records: [] };

export interface PredictionContext {
  readonly selfId: string;
  readonly tick: number;
  readonly controllerOf: (id: string) => ControllerSlot | undefined;
  readonly isPlayable: (id: string) => boolean;
  /** The player's trust in each nation, for choosing whose crisis answer to ask about. */
  readonly trust: Readonly<Record<string, number>>;
  readonly nameOf: (id: string) => string;
}

function amount(a: ResourceAmount): string {
  return `${a.amount.toLocaleString('en-US')} ${a.resource}`;
}

function isAi(ctx: PredictionContext, id: string): boolean {
  const c = ctx.controllerOf(id);
  return (c === 'ai' || c === 'caretaker') && ctx.isPlayable(id);
}

/** The AI nation the player trusts most (ties by id): whose crisis answer is asked about. */
function mostTrustedAi(ctx: PredictionContext): string | null {
  let best: string | null = null;
  for (const [id, value] of Object.entries(ctx.trust).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (!isAi(ctx, id)) continue;
    if (best === null || value > (ctx.trust[best] ?? 0)) best = id;
  }
  return best;
}

function reasonsFor(events: readonly Event[], nationId: string, match: (subject: number | null, decision: string) => boolean): string[] {
  for (const e of events) {
    if (e.type !== 'explanation') continue;
    const p = e.payload as CrisisEventPayloads['explanation'];
    if (p.nationId === nationId && match(p.subject, p.decision)) return [...p.reasons];
  }
  return [];
}

/**
 * New questions from one step's events (already filtered to what the player may
 * see), plus the book with old questions lapsed. Returns the book unchanged
 * when prediction mode is off.
 */
export function recordAnswers(book: PredictionBook, events: readonly Event[], ctx: PredictionContext): PredictionBook {
  if (!book.mode) return book;
  const records = [...book.records];
  let nextId = book.nextId;
  const has = (kind: PredictionKind, subject: number): boolean => records.some((r) => r.kind === kind && r.subject === subject);
  const add = (r: Omit<PredictionRecord, 'id' | 'guess' | 'guessedTick' | 'status'>): void => {
    records.push({ ...r, id: nextId++, guess: null, guessedTick: null, status: 'open' });
  };

  const trusted = mostTrustedAi(ctx);
  for (const e of events) {
    const outcome =
      e.type === 'offerSettled' || e.type === 'offerFailed' ? 'accept' : e.type === 'offerRejected' ? 'reject' : e.type === 'offerCountered' ? 'counter' : null;
    if (outcome !== null) {
      const offer = (e.payload as EconomyEventPayloads['offerSettled']).offer as TradeOffer;
      if (offer.from !== ctx.selfId || !isAi(ctx, offer.to) || has('offer', offer.id)) continue;
      add({
        tick: e.tick,
        nationId: offer.to,
        kind: 'offer',
        subject: offer.id,
        question: `${ctx.nameOf(offer.to)} answered your offer of ${amount(offer.give)} for ${amount(offer.get)}.`,
        outcome,
        reasons: reasonsFor(events, offer.to, (subject) => subject === offer.id),
      });
      continue;
    }
    if (e.type === 'appealAnswered') {
      const p = e.payload as CrisisEventPayloads['appealAnswered'];
      if (p.nationId !== trusted || has('appeal', p.crisisId)) continue;
      add({
        tick: e.tick,
        nationId: p.nationId,
        kind: 'appeal',
        subject: p.crisisId,
        question: `${ctx.nameOf(p.nationId)} answered the crisis appeal; its share was ${p.share.toLocaleString('en-US')} credit.`,
        outcome: p.answer,
        reasons: reasonsFor(events, p.nationId, (subject) => subject === p.crisisId),
      });
    }
  }

  // Old or surplus open questions lapse: they are never graded.
  const open = records.filter((r) => r.status === 'open').sort((a, b) => b.id - a.id);
  const keep = new Set(open.filter((r) => ctx.tick - r.tick < PREDICTION_LAPSE_MONTHS).slice(0, PREDICTION_OPEN_MAX).map((r) => r.id));
  return {
    ...book,
    nextId,
    records: records.map((r) => (r.status === 'open' && !keep.has(r.id) ? { ...r, status: 'lapsed' as const } : r)),
  };
}

/** Record the player's guess for one open question. Throws if it is not open or the guess is not a choice. */
export function guess(book: PredictionBook, id: number, choice: string, tick: number): { book: PredictionBook; record: PredictionRecord } {
  const record = book.records.find((r) => r.id === id);
  if (record === undefined || record.status !== 'open') throw new Error('That question is already answered');
  if (!CHOICES[record.kind].includes(choice)) throw new Error(`"${choice}" is not one of the choices`);
  const done: PredictionRecord = { ...record, guess: choice, guessedTick: tick, status: 'guessed' };
  return { book: { ...book, records: book.records.map((r) => (r.id === id ? done : r)) }, record: done };
}

export function resolved(r: PredictionRecord): ResolvedPrediction {
  return { ...pending(r), outcome: r.outcome, reasons: r.reasons, guess: r.guess ?? '', correct: r.guess === r.outcome };
}

function pending(r: PredictionRecord): PendingPrediction {
  return { id: r.id, tick: r.tick, nationId: r.nationId, kind: r.kind, question: r.question, choices: CHOICES[r.kind] };
}

export function predictionsView(book: PredictionBook): PredictionsView {
  const guessed = book.records.filter((r) => r.status === 'guessed');
  return {
    mode: book.mode,
    pending: book.records.filter((r) => r.status === 'open').map(pending),
    recent: guessed.slice(-5).reverse().map(resolved),
    guessed: guessed.length,
    correct: guessed.filter((r) => r.guess === r.outcome).length,
  };
}
