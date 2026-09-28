import type { Command, NationView, TradeOffer } from '@nations/contracts';
import { nameOf } from '../world/nations.ts';
import {
  GOODS,
  ICON,
  amountText,
  buyDraft,
  commands,
  fmt,
  isFair,
  outlook,
  policyWill,
  priceGapPct,
  rule,
  sellDraft,
  spare,
  type Good,
  type TradeDraft,
} from './econ.ts';

/**
 * Decision cards, built from the View every time it changes (RULES 8.1). The
 * interface keeps no game state: an offer card exists exactly while the offer
 * is open in the sim's State (seam 8), and answering it sends a Command.
 */
export type CardAction =
  /** Send this command now: one tap. */
  | { readonly kind: 'send'; readonly command: (tick: number) => Command; readonly done: string }
  /** Open the trade sheet with these terms, to adjust and send (or counter an offer). */
  | { readonly kind: 'compose'; readonly draft: TradeDraft; readonly counterOf: number | null }
  /** Close the card for this month; nothing is sent. */
  | { readonly kind: 'dismiss' };

export interface CardOption {
  readonly id: string;
  readonly label: string;
  /** One line: what this choice does. */
  readonly consequence: string;
  readonly action: CardAction;
}

export interface DecisionCard {
  readonly id: string;
  readonly kind: 'offer' | 'shortfall' | 'opportunity' | 'pending';
  readonly icon: string;
  readonly title: string;
  readonly context: string;
  /** Months until the card goes away on its own. */
  readonly expiresIn: number;
  readonly options: readonly CardOption[];
}

function priceLine(view: NationView, offer: Pick<TradeOffer, 'give' | 'get'>, fromTheirSide: boolean): string {
  const gap = priceGapPct(view, offer.give, offer.get);
  const band = rule(view, 'priceBandPct');
  if (isFair(view, offer.give, offer.get)) return `Fair: within ${band}% of world prices.`;
  const theyAskMore = fromTheirSide ? gap > 0 : gap < 0;
  return theyAskMore
    ? `A hard bargain: they ask ${Math.abs(gap)}% more than world prices.`
    : `Generous: they ask ${Math.abs(gap)}% less than world prices.`;
}

function incoming(view: NationView, offer: TradeOffer): DecisionCard {
  const from = nameOf(offer.from);
  const left = offer.expiryTick - view.tick;
  const will = policyWill(view, offer);
  const payable = view.self.private.stocks[offer.get.resource] >= offer.get.amount;
  const absent =
    will === 'accept'
      ? 'If you do not answer, your standing policy accepts it on its last month.'
      : will === 'reject'
        ? 'If you do not answer, your standing policy rejects it.'
        : `If you do not answer it expires, and ${from} trusts you a little less.`;
  const counter: TradeDraft = { to: offer.from, give: offer.get, get: offer.give };
  return {
    id: `offer:${offer.id}`,
    kind: 'offer',
    icon: '🤝',
    title: `${from} offers ${amountText(offer.give)}`,
    context: `${from} gives you ${amountText(offer.give)} and asks for ${amountText(offer.get)}. ${priceLine(view, offer, true)} ${absent}`,
    expiresIn: left,
    options: [
      {
        id: 'accept',
        label: `Accept · pay ${amountText(offer.get)}`,
        consequence: payable ? `You receive ${amountText(offer.give)} now; trust with ${from} rises.` : `You hold only ${fmt(view.self.private.stocks[offer.get.resource])} ${offer.get.resource}: the sim will refuse it.`,
        action: { kind: 'send', command: commands.answer(view, 'acceptOffer', offer.id), done: `Accepted: ${amountText(offer.give)} from ${from}` },
      },
      {
        id: 'counter',
        label: 'Counter…',
        consequence: 'Change the amounts and send it back; this offer closes.',
        action: { kind: 'compose', draft: counter, counterOf: offer.id },
      },
      {
        id: 'reject',
        label: 'Decline',
        consequence: 'No trade and no trust lost: a clear no costs nothing.',
        action: { kind: 'send', command: commands.answer(view, 'rejectOffer', offer.id), done: `Declined ${from}'s offer` },
      },
    ],
  };
}

function pending(view: NationView, offer: TradeOffer): DecisionCard {
  const to = nameOf(offer.to);
  return {
    id: `mine:${offer.id}`,
    kind: 'pending',
    icon: '⏳',
    title: `Waiting on ${to}`,
    context: `You offered ${amountText(offer.give)} for ${amountText(offer.get)}. ${to} answers by command or by its standing policy before the offer expires.`,
    expiresIn: offer.expiryTick - view.tick,
    options: [
      {
        id: 'withdraw',
        label: 'Withdraw',
        consequence: 'Take the offer back. No trust is lost.',
        action: { kind: 'send', command: commands.answer(view, 'withdrawOffer', offer.id), done: `Withdrew your offer to ${to}` },
      },
      { id: 'wait', label: 'Keep waiting', consequence: 'Leave it open.', action: { kind: 'dismiss' } },
    ],
  };
}

function shortfall(view: NationView, good: Good): DecisionCard | null {
  const next = outlook(view, good);
  const pendingIn = view.offers.filter((o) => o.from === view.selfId && o.get.resource === good).reduce((s, o) => s + o.get.amount, 0);
  const gap = next.gap - pendingIn;
  if (gap <= 0) return null;
  const draft = buyDraft(view, good, gap);
  const pct = next.demand === 0 ? 0 : Math.round((gap * 100) / next.demand);
  const penalty = Math.min(rule(view, 'maxShortfallPenaltyPct'), Math.floor((pct * rule(view, 'shortfallPenaltyBpPerPct')) / 100));
  const options: CardOption[] = [];
  if (draft !== null) {
    options.push({
      id: 'buy',
      label: `Buy ${amountText(draft.get)} from ${nameOf(draft.to)} · ${fmt(draft.give.amount)} credit`,
      consequence: `A fair offer at world prices; ${nameOf(draft.to)} has ${fmt(draft.get.amount)} or more to spare.`,
      action: { kind: 'send', command: commands.offer(view, draft), done: `Offer sent to ${nameOf(draft.to)}` },
    });
    options.push({ id: 'adjust', label: 'Adjust the offer…', consequence: 'Pick the partner, amounts and price yourself.', action: { kind: 'compose', draft, counterOf: null } });
  }
  options.push({ id: 'ration', label: 'Ration at home', consequence: `No imports: about ${penalty}% of output lost next month.`, action: { kind: 'dismiss' } });
  return {
    id: `short:${good}:${view.tick}`,
    kind: 'shortfall',
    icon: ICON[good],
    title: `${good === 'food' ? 'Food' : 'Energy'} short by ${fmt(gap)} next month`,
    context: `You will have ${fmt(next.stock + next.production + pendingIn)} ${good} for a demand of ${fmt(next.demand)}. Unmet demand costs output: ${pct}% short loses about ${penalty}%.`,
    expiresIn: 1,
    options,
  };
}

function opportunity(view: NationView, good: Good): DecisionCard | null {
  const amount = spare(view, good);
  if (amount <= 0) return null;
  const draft = sellDraft(view, good, amount);
  if (draft === null) return null;
  return {
    id: `sell:${good}:${view.tick}`,
    kind: 'opportunity',
    icon: '📦',
    title: `Sell spare ${good} to ${nameOf(draft.to)}`,
    context: `You have ${fmt(amount)} ${good} to spare after next month. ${nameOf(draft.to)} is short of it; covering a partner's deficit grows your output as well as theirs.`,
    expiresIn: 1,
    options: [
      {
        id: 'sell',
        label: `Offer ${amountText(draft.give)} · ask ${fmt(draft.get.amount)} credit`,
        consequence: 'A fair offer at world prices.',
        action: { kind: 'send', command: commands.offer(view, draft), done: `Offer sent to ${nameOf(draft.to)}` },
      },
      { id: 'adjust', label: 'Adjust the offer…', consequence: 'Pick the partner, amounts and price yourself.', action: { kind: 'compose', draft, counterOf: null } },
      { id: 'keep', label: 'Keep it', consequence: 'Hold the surplus for now.', action: { kind: 'dismiss' } },
    ],
  };
}

/** Every card for this View, most urgent first. `dismissed` hides cards the player set aside. */
export function cardsFor(view: NationView, dismissed: ReadonlySet<string>): DecisionCard[] {
  const cards: DecisionCard[] = [];
  const priority = view.self.private.policy.coverPriority;
  for (const offer of view.offers) if (offer.to === view.selfId) cards.push(incoming(view, offer));
  for (const good of [priority, ...GOODS.filter((g) => g !== priority)]) {
    const card = shortfall(view, good);
    if (card !== null) cards.push(card);
  }
  for (const good of GOODS) {
    const card = opportunity(view, good);
    if (card !== null) cards.push(card);
  }
  for (const offer of view.offers) if (offer.from === view.selfId) cards.push(pending(view, offer));
  return cards.filter((card) => !dismissed.has(card.id));
}
