import type { Command, Crisis, NationView, Pledge, Project, TradeOffer } from '@nations/contracts';
import type { JournalSnapshot, PendingPrediction, PredictionsView } from '../platform/index.ts';
import { nameOf } from '../world/nations.ts';
import {
  CRISIS_NAME,
  GOODS,
  ICON,
  POOL_NAME,
  amountText,
  balance,
  buyDraft,
  commands,
  fairAmount,
  fmt,
  fundedPct,
  isFair,
  outlook,
  owedShare,
  policyWill,
  priceGapPct,
  rule,
  sellDraft,
  spare,
  type Good,
  type TradeDraft,
} from './econ.ts';
import { EMPTY_JOURNAL, announcements, crisisReasons, notYet, offerReason, projectReason, said } from './reasons.ts';
import {
  KIND_ICON,
  benefitLine,
  etaMonth,
  goodOf,
  invitations,
  joinTerms,
  myProjects,
  nameList,
  projectCommands,
  suggestedPartners,
  templateOf,
} from './projects.ts';

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
  | { readonly kind: 'dismiss' }
  /** Prediction mode: the player's guess at what an AI nation did. */
  | { readonly kind: 'predict'; readonly id: number; readonly choice: string }
  /** Open the Projects screen (to pick partners, or read the whole picture). */
  | { readonly kind: 'projects' };

export interface CardOption {
  readonly id: string;
  readonly label: string;
  /** One line: what this choice does. */
  readonly consequence: string;
  readonly action: CardAction;
}

export interface DecisionCard {
  readonly id: string;
  readonly kind: 'crisis' | 'alert' | 'offer' | 'shortfall' | 'opportunity' | 'predict' | 'pending' | 'project';
  readonly icon: string;
  readonly title: string;
  readonly context: string;
  /** What the nation behind the card said, in its own numbers (RULES 7.4), or a placeholder until it says. */
  readonly reasons?: readonly string[];
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

function incoming(view: NationView, offer: TradeOffer, journal: JournalSnapshot): DecisionCard {
  const from = nameOf(offer.from);
  const left = offer.expiryTick - view.tick;
  const will = policyWill(view, offer);
  const payable = view.self.private.stocks[offer.get.resource] >= offer.get.amount;
  const absent =
    will === 'accept'
      ? 'If you do not answer, your standing policy accepts it on its last month.'
      : 'If you do not answer, your standing policy declines it on its last month.';
  const note = offerReason(journal, offer);
  const counter: TradeDraft = { to: offer.from, give: offer.get, get: offer.give };
  return {
    id: `offer:${offer.id}`,
    kind: 'offer',
    icon: '🤝',
    title: `${from} offers ${amountText(offer.give)}`,
    context: `${from} gives you ${amountText(offer.give)} and asks for ${amountText(offer.get)}. ${priceLine(view, offer, true)} ${absent}`,
    reasons: note === undefined ? [notYet(offer.from)] : [said(note), ...note.reasons.slice(1)],
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
  if (view.self.private.policy.autoImport === true) {
    // "Keep us supplied" buys what trade can supply (RULES 3.4). A card only when no seller is left: the gap trade cannot close.
    if (draft !== null) return null;
    const name = good === 'food' ? 'Food' : 'Energy';
    return {
      id: `short:${good}`,
      kind: 'shortfall',
      icon: ICON[good],
      title: `${name}: ${fmt(gap)} a month no seller can supply`,
      context: `Your policy buys what the world has to spare, and every seller is already in a deal with you. The rest of the shortfall costs about ${penalty}% of output a month. Only new supply closes it: a joint project that makes ${good}.`,
      expiresIn: 1,
      options: [
        { id: 'projects', label: `Find ${good} projects`, consequence: 'Open the Projects screen: invitations, and projects hosted by nations with a surplus.', action: { kind: 'projects' } },
        { id: 'accept', label: 'Accept it for now', consequence: 'Hide this until you reopen the app; the policy keeps buying what it can.', action: { kind: 'dismiss' } },
      ],
    };
  }
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

/** An open crisis appeal the player has not answered, or one closing short of its target. */
function crisisCard(view: NationView, crisis: Crisis, journal: JournalSnapshot): DecisionCard | null {
  if (view.tick > crisis.deadlineTick || view.tick <= crisis.openedTick) return null;
  const { share, paid, owed } = owedShare(view, crisis);
  if (share <= 0) return null;
  const left = crisis.deadlineTick - view.tick + 1;
  const name = CRISIS_NAME[crisis.kind];
  const pool = POOL_NAME[crisis.pool];
  const pct = fundedPct(view, crisis);
  const credit = view.self.private.stocks.credit;
  const answered = crisis.answers[view.selfId];
  const heard = crisisReasons(journal, crisis.id, view.selfId).map(said);
  const reasons = heard.length > 0 ? heard : ['No other nation has explained its answer yet; their reasons show here when they do.'];
  const refuse = (amount: number): string | null => (credit < amount ? `You hold only ${fmt(credit)} credit: the sim will refuse it.` : null);

  if (answered !== undefined) {
    // Crisis closing (RULES 8.1): one month left and the pool is short.
    if (left > 1 || pct >= 100) return null;
    const topUp = Math.max(1, Math.min(crisis.target - Math.floor((pct * crisis.target) / 100), Math.max(share, 1)));
    return {
      id: `closing:${crisis.id}`,
      kind: 'crisis',
      icon: '⏰',
      title: `${name} pool closes at ${pct}%`,
      context: `The ${pool} pool locks at the end of this month holding ${pct}% of its ${fmt(crisis.target)} credit target. Damage to every nation is cut in proportion to how full it is. You ${answered.answer} ${fmt(answered.amount)}.`,
      reasons,
      expiresIn: 1,
      options: [
        {
          id: 'topup',
          label: `Top up · ${fmt(topUp)} credit`,
          consequence: refuse(topUp) ?? `Brings the pool closer to full cover; everyone's damage falls, yours included.`,
          action: { kind: 'send', command: commands.contribute(view, crisis.pool, topUp), done: `Paid ${fmt(topUp)} into the ${pool} pool` },
        },
        { id: 'pass', label: 'Pass', consequence: 'Keep your credit; the pool locks as it is.', action: { kind: 'dismiss' } },
      ],
    };
  }

  const policy = view.self.private.policy.crisisRule;
  const byPolicy =
    policy === 'none'
      ? 'your policy pays nothing'
      : policy === 'fairShare'
        ? `your policy pays the ${fmt(owed)} you still owe`
        : 'your policy pays your share if the world funded the last round, less if not';
  const options: CardOption[] = [];
  if (owed > 0) {
    options.push({
      id: 'pay',
      label: `Pay your share · ${fmt(owed)} credit`,
      consequence: refuse(owed) ?? `The pool reaches about ${Math.min(999, pct + Math.floor((owed * 100) / Math.max(1, crisis.target)))}% of target and you count as a contributor.`,
      action: { kind: 'send', command: commands.contribute(view, crisis.pool, owed), done: `Paid ${fmt(owed)} into the ${pool} pool` },
    });
    const hasPledge = view.crises.pledges.some((p) => p.nationId === view.selfId && p.pool === crisis.pool);
    const deadline = Math.min(crisis.deadlineTick, view.tick + rule(view, 'maxPledgeTicks'));
    if (!hasPledge && deadline > view.tick) {
      options.push({
        id: 'pledge',
        label: `Pledge ${fmt(owed)} by month ${deadline}`,
        consequence: `Collected automatically in month ${deadline}; if you cannot pay then, every nation trusts you ${rule(view, 'trustPerPledgeBroken')} less.`,
        action: { kind: 'send', command: commands.pledge(view, crisis.pool, owed, deadline), done: `Pledged ${fmt(owed)} to the ${pool} pool` },
      });
    }
  } else {
    const extra = Math.max(1, Math.ceil(share / 2));
    options.push({
      id: 'pay',
      label: `Pay a little more · ${fmt(extra)} credit`,
      consequence: refuse(extra) ?? 'Your monthly payments already cover your share; extra fills the pool for everyone.',
      action: { kind: 'send', command: commands.contribute(view, crisis.pool, extra), done: `Paid ${fmt(extra)} into the ${pool} pool` },
    });
  }
  options.push({
    id: 'decline',
    label: 'Decline',
    consequence: owed > 0 ? 'You keep the credit, but every nation sees it and strict nations remember free-riders.' : 'Your monthly payments stand; nothing more is paid.',
    action: { kind: 'send', command: commands.declineAppeal(view, crisis.id), done: `Declined the ${name.toLowerCase()} appeal` },
  });
  return {
    id: `crisis:${crisis.id}`,
    kind: 'crisis',
    icon: crisis.kind === 'climate' ? '🌪️' : '🦠',
    title: `${name} appeal: your share ${fmt(share)} credit`,
    context: `The ${pool} pool needs ${fmt(crisis.target)} credit by month ${crisis.deadlineTick} and holds ${pct}%. Your share, by exposure, is ${fmt(share)}; you have paid ${fmt(paid)} this round. If you do not answer, ${byPolicy} on the deadline.`,
    reasons,
    expiresIn: left,
    options,
  };
}

/** Alerts: a pledge you cannot cover, resilience under your floor, an AI nation that suspended trade with you. */
function alerts(view: NationView, journal: JournalSnapshot): DecisionCard[] {
  const cards: DecisionCard[] = [];
  const credit = view.self.private.stocks.credit;
  for (const p of view.crises.pledges.filter((x: Pledge) => x.nationId === view.selfId)) {
    const due = p.amount - p.paid;
    const left = p.deadlineTick - view.tick;
    if (due <= credit || left > 1) continue;
    const payNow = Math.max(0, Math.min(credit, due));
    const options: CardOption[] = [];
    if (payNow > 0) {
      options.push({
        id: 'pay',
        label: `Pay ${fmt(payNow)} now`,
        consequence: `Leaves ${fmt(due - payNow)} to find by month ${p.deadlineTick}, or the pledge breaks.`,
        action: { kind: 'send', command: commands.contribute(view, p.pool, payNow), done: `Paid ${fmt(payNow)} towards your pledge` },
      });
    }
    options.push({
      id: 'withdraw',
      label: 'Withdraw the pledge',
      consequence: `It counts as broken: every nation trusts you ${rule(view, 'trustPerPledgeBroken')} less.`,
      action: { kind: 'send', command: commands.withdrawPledge(view, p.id), done: 'Pledge withdrawn' },
    });
    options.push({ id: 'keep', label: 'Keep it', consequence: 'Income may cover it by the deadline; if not, it breaks.', action: { kind: 'dismiss' } });
    cards.push({
      id: `pledge:${p.id}:${view.tick}`,
      kind: 'alert',
      icon: '⚠️',
      title: `Pledge at risk: ${fmt(due)} due month ${p.deadlineTick}`,
      context: `You pledged ${fmt(p.amount)} to the ${POOL_NAME[p.pool]} pool and paid ${fmt(p.paid)}. You hold ${fmt(credit)} credit.`,
      expiresIn: Math.max(1, left),
      options,
    });
  }

  const floor = view.self.private.policy.resilienceFloor;
  const resilience = view.self.private.resilience;
  if (resilience < floor) {
    const points = floor - resilience;
    const cost = points * rule(view, 'resilienceCostPerPoint');
    cards.push({
      id: `resilience:${view.tick}`,
      kind: 'alert',
      icon: '🛡️',
      title: `Resilience ${resilience}, under your floor of ${floor}`,
      context: `Resilience cuts crisis damage. Your policy refills it from credit when it can; you hold ${fmt(credit)}.`,
      expiresIn: 1,
      options: [
        {
          id: 'fund',
          label: `Fund ${points} points · ${fmt(cost)} credit`,
          consequence: credit < cost ? `You hold only ${fmt(credit)} credit: the sim will refuse it.` : 'Back at your floor next month.',
          action: { kind: 'send', command: commands.fundResilience(view, points), done: `Funded ${points} resilience` },
        },
        { id: 'accept', label: 'Accept it for now', consequence: 'A crisis hits you harder until it recovers.', action: { kind: 'dismiss' } },
      ],
    });
  }

  for (const note of announcements(journal, view.selfId, view.tick)) {
    const partner = view.others.find((o) => o.id === note.nationId);
    if (partner === undefined) continue;
    const good = GOODS.find((g) => spare(view, g) > 0 && balance(partner, g) < 0);
    const give = good === undefined ? null : { resource: good, amount: Math.max(1, Math.min(spare(view, good), -balance(partner, good))) };
    const options: CardOption[] = [];
    if (give !== null) {
      // A goodwill offer: fair goods for a little under their credit value.
      const credit = Math.max(1, Math.floor((fairAmount(view, give, 'credit') * (100 - Math.floor(rule(view, 'priceBandPct') / 2))) / 100));
      options.push({
        id: 'goodwill',
        label: `Offer goodwill · ${amountText(give)}`,
        consequence: 'Adjust and send a generous offer; a kept deal rebuilds trust.',
        action: { kind: 'compose', draft: { to: note.nationId, give, get: { resource: 'credit', amount: credit } }, counterOf: null },
      });
    }
    options.push({ id: 'accept', label: 'Accept it', consequence: 'Trade with them waits until the suspension ends.', action: { kind: 'dismiss' } });
    cards.push({
      id: `suspend:${note.nationId}:${note.tick}`,
      kind: 'alert',
      icon: '🚫',
      title: `${nameOf(note.nationId)} suspended trade with you`,
      context: `In month ${note.tick}, ${nameOf(note.nationId)} stopped trading with you. It will answer your offers with no until the suspension ends.`,
      reasons: [said(note), ...note.reasons.slice(1)],
      expiresIn: 1,
      options,
    });
  }
  return cards;
}

const GUESS_LABEL: Readonly<Record<string, { label: string; consequence: string }>> = {
  accept: { label: 'They accept', consequence: 'The deal goes through as you offered it.' },
  reject: { label: 'They decline', consequence: 'No deal this time.' },
  counter: { label: 'They counter', consequence: 'They send back different terms.' },
  contributed: { label: 'They pay in', consequence: 'Credit goes into the pool now.' },
  pledged: { label: 'They pledge', consequence: 'They promise to pay by a deadline.' },
  declined: { label: 'They decline', consequence: 'They pay nothing towards it.' },
};

/** Prediction mode: "What will they do?" before the AI's answer is shown. */
function predictCard(p: PendingPrediction, tick: number): DecisionCard {
  return {
    id: `predict:${p.id}`,
    kind: 'predict',
    icon: '🔮',
    title: `What will ${nameOf(p.nationId)} do?`,
    context: `${p.question} Guess first; then see the real answer and their reasons. Your guesses are kept in the save.`,
    expiresIn: Math.max(1, 6 - (tick - p.tick)),
    options: p.choices.map((choice) => ({
      id: `guess-${choice}`,
      label: GUESS_LABEL[choice]?.label ?? choice,
      consequence: GUESS_LABEL[choice]?.consequence ?? '',
      action: { kind: 'predict', id: p.id, choice },
    })),
  };
}

/**
 * Invitations, best value first: goods by units a month times months of use per
 * credit, weighted by how much of a real shortfall they cover; shields after.
 */
function rankInvitations(view: NationView, list: readonly Project[]): Project[] {
  const value = (p: Project): number => {
    const t = joinTerms(view, p);
    if (goodOf(p.kind) === null) return 0;
    return Math.floor((t.units * t.monthsOfUse * (50 + Math.min(100, t.coversPct))) / Math.max(1, t.due));
  };
  return [...list].sort((a, b) => value(b) - value(a) || a.id - b.id);
}

/** One line to triage an invitation from the list: what it gives, for how long, for how much. */
function glance(view: NationView, p: Project): string {
  const t = joinTerms(view, p);
  const good = goodOf(p.kind);
  const gives = good === null ? `cuts crisis damage ${Math.round(rule(view, 'projectShieldBp') / 100)}%` : `${fmt(t.units)} ${good}/month${t.coversPct > 0 ? ` (${t.coversPct}% of your shortfall)` : ''}`;
  return `${gives} for ${t.monthsOfUse} months · ${fmt(t.due)} credit`;
}

/** An invitation to join a forming joint project (RULES 13.2): two taps, join or decline. */
function invitationCard(view: NationView, p: Project, journal: JournalSnapshot): DecisionCard {
  const t = templateOf(view, p.template);
  const host = nameOf(p.host);
  const terms = joinTerms(view, p);
  const credit = view.self.private.stocks.credit;
  const seats = rule(view, 'projectSlots');
  const others = p.members.filter((m) => m.nationId !== p.host).map((m) => m.nationId);
  const note = projectReason(journal, p);
  const late = terms.monthsOfUse <= 0;
  return {
    id: `invite:${p.id}`,
    kind: 'project',
    icon: KIND_ICON[t.kind] ?? '🏗️',
    title: `${host} invites you: ${t.name}`,
    context: `${benefitLine(view, p, terms.units)[0]!.toUpperCase()}${benefitLine(view, p, terms.units).slice(1)}, from month ${terms.ready} (${terms.monthsOfUse} months of use). About ${fmt(terms.due)} credit over ${p.buildTicks} months. ${p.members.length} of ${seats} seats taken${others.length > 0 ? ` (${nameList(others)})` : ''}; answer by month ${p.formingDeadline}.`,
    // The first line is what the inbox list shows under the title: the numbers that decide it, at a glance.
    reasons: [glance(view, p), note === undefined ? notYet(p.host) : said(note)],
    expiresIn: Math.max(1, p.formingDeadline - view.tick + 1),
    options: [
      {
        id: 'join',
        label: `Join · ${fmt(terms.perMonth)} credit a month for ${p.buildTicks} months`,
        consequence: late
          ? 'Built too late to pay back before the game ends.'
          : credit < terms.perMonth
            ? `You hold only ${fmt(credit)} credit: a missed installment drops you.`
            : `Paid automatically. Leaving mid-build forfeits what you paid and costs trust with ${nameList([p.host, ...others])}.`,
        action: { kind: 'send', command: projectCommands.answer(view, 'joinProject', p.id), done: `Joined ${host}'s ${t.name}` },
      },
      {
        id: 'decline',
        label: 'Decline',
        consequence: `A clear no costs nothing; ${host} can invite someone else.`,
        action: { kind: 'send', command: projectCommands.answer(view, 'declineProject', p.id), done: `Declined ${host}'s ${t.name}` },
      },
    ],
  };
}

/**
 * The best goods project the player could host now, when it has partners
 * short of that good to invite (RULES 13.1-13.2). One tap founds it with the
 * suggested partners; "Choose partners" opens the Projects screen.
 */
function hostCard(view: NationView): DecisionCard | null {
  if (view.projects.projects.some((p) => p.host === view.selfId && p.status === 'forming')) return null;
  const last = rule(view, 'gameLengthTicks') - 6;
  const options = view.projects.hostable
    .filter((h) => h.problem === null && goodOf(templateOf(view, h.template).kind) !== null)
    .filter((h) => view.tick + rule(view, 'projectFormingTicks') + h.buildTicks < last)
    .map((h) => ({ h, partners: suggestedPartners(view, h) }))
    .filter((x) => x.partners.length >= rule(view, 'projectMinMembers') - 1)
    .sort((a, b) => b.h.yield - a.h.yield);
  const best = options[0];
  if (best === undefined) return null;
  const t = templateOf(view, best.h.template);
  const good = goodOf(t.kind) as 'food' | 'energy';
  const seats = rule(view, 'projectSlots');
  const due = Math.ceil(best.h.cost / seats);
  return {
    id: `host:${t.id}`,
    kind: 'opportunity',
    icon: '🏗️',
    title: `Host a ${t.name}`,
    context: `You have ${good} to spare, and ${nameList(best.partners)} are short of it. ${t.blurb} Built in ${best.h.buildTicks} months, it makes ${fmt(best.h.yield)} more ${good} a month, shared by what each member pays; the whole build costs ${fmt(best.h.cost)} credit, about ${fmt(due)} each if every seat fills. Building together raises trust between all members; every unit it makes cuts the world's shortfall, which lifts the multiplier on every score.`,
    expiresIn: 1,
    options: [
      {
        id: 'found',
        label: `Found it with ${nameList(best.partners)}`,
        consequence: `They have ${rule(view, 'projectFormingTicks')} months to join; it needs ${rule(view, 'projectMinMembers')} members to start.`,
        action: { kind: 'send', command: projectCommands.propose(view, t.id, best.partners), done: `Invited ${nameList(best.partners)} to your ${t.name}` },
      },
      { id: 'choose', label: 'Choose partners…', consequence: 'Pick who to invite on the Projects screen.', action: { kind: 'projects' } },
      { id: 'later', label: 'Not now', consequence: 'You can found it later from the Projects screen.', action: { kind: 'dismiss' } },
    ],
  };
}

/** A partner walked out of a project the player is building (RULES 13.3): pay more to keep the schedule, or carry on. */
function partnerLeftCards(view: NationView): DecisionCard[] {
  const cards: DecisionCard[] = [];
  for (const p of myProjects(view)) {
    if (p.status !== 'building') continue;
    const gone = p.left.filter((l) => l.tick >= view.tick - 1 && l.nationId !== view.selfId);
    if (gone.length === 0) continue;
    const t = templateOf(view, p.template);
    const me = p.members.find((m) => m.nationId === view.selfId);
    if (me === undefined) continue;
    const room = Math.max(0, Math.min(me.cap - me.paid, p.cost - p.paidTotal));
    const cover = Math.min(room, gone.reduce((s, l) => s + Math.max(0, me.due - l.paid), 0));
    const credit = view.self.private.stocks.credit;
    const options: CardOption[] = [];
    if (cover > 0) {
      options.push({
        id: 'fund',
        label: `Cover the gap · ${fmt(cover)} credit`,
        consequence: credit < cover ? `You hold only ${fmt(credit)} credit: the sim will refuse it.` : 'The build speeds up and your share of the yield grows with what you paid.',
        action: { kind: 'send', command: projectCommands.fund(view, p.id, cover), done: `Paid ${fmt(cover)} into the ${t.name}` },
      });
    }
    options.push({ id: 'carry', label: 'Carry on', consequence: `Your installments continue; it now finishes about month ${etaMonth(view, p)}.`, action: { kind: 'dismiss' } });
    cards.push({
      id: `left:${p.id}:${gone.map((g) => g.nationId).join(',')}`,
      kind: 'alert',
      icon: '🚪',
      title: `${nameList(gone.map((g) => g.nationId))} left the ${t.name}`,
      context: `They forfeited ${fmt(gone.reduce((s, g) => s + g.paid, 0))} credit they had paid, and every member trusts them ${rule(view, 'projectTrustLeave')} less. The build is ${Math.floor((p.paidTotal * 100) / Math.max(1, p.cost))}% paid and now finishes about month ${etaMonth(view, p)}.`,
      expiresIn: 1,
      options,
    });
  }
  return cards;
}

export interface CardSources {
  readonly journal?: JournalSnapshot;
  readonly predictions?: PredictionsView;
}

/** Every card for this View, most urgent first. `dismissed` hides cards the player set aside. */
export function cardsFor(view: NationView, dismissed: ReadonlySet<string>, sources: CardSources = {}): DecisionCard[] {
  const journal = sources.journal ?? EMPTY_JOURNAL;
  const cards: DecisionCard[] = [];
  const priority = view.self.private.policy.coverPriority;
  for (const crisis of view.crises.open) {
    const card = crisisCard(view, crisis, journal);
    if (card !== null) cards.push(card);
  }
  cards.push(...alerts(view, journal));
  for (const p of rankInvitations(view, invitations(view))) cards.push(invitationCard(view, p, journal));
  cards.push(...partnerLeftCards(view));
  for (const offer of view.offers) if (offer.to === view.selfId) cards.push(incoming(view, offer, journal));
  for (const good of [priority, ...GOODS.filter((g) => g !== priority)]) {
    const card = shortfall(view, good);
    if (card !== null) cards.push(card);
  }
  for (const good of GOODS) {
    const card = opportunity(view, good);
    if (card !== null) cards.push(card);
  }
  const host = hostCard(view);
  if (host !== null) cards.push(host);
  if (sources.predictions?.mode === true) for (const p of sources.predictions.pending) cards.push(predictCard(p, view.tick));
  // With "keep us supplied" on, the policy's own purchases are routine: they do not wait as cards.
  if (view.self.private.policy.autoImport !== true) for (const offer of view.offers) if (offer.from === view.selfId) cards.push(pending(view, offer));
  return cards.filter((card) => !dismissed.has(card.id));
}
