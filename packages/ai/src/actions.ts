import type { NationId, NationView, ResourceAmount } from '@nations/contracts';
import { grudgePoints, punishing, type PartnerBelief, type PartnerMemory } from './beliefs.ts';
import { goodsByGoal, type Goal } from './goals.ts';
import type { Ledger } from './negotiation.ts';
import type { Personality } from './personality.ts';
import { creditFor, goodsFor, isFair, noiseBp, rule, show, type Good } from './util.ts';

/**
 * Layer 5, action scoring (docs/AI_DESIGN.md).
 *
 * Templated commands - sell a surplus, buy a deficit - scored for every
 * partner and taken best first. A partner's score is its need (or surplus),
 * shaded by trust (cooperative styles) or by desperation (hard bargainers),
 * cut by any grievance, plus `aiNoiseBp` of seeded jitter so the AI is
 * legible but not farmable. Partners under retaliation are skipped.
 */
export interface Proposal {
  readonly to: NationId;
  readonly give: ResourceAmount;
  readonly get: ResourceAmount;
  readonly text: string;
  readonly reasons: readonly string[];
}

export interface ActionContext {
  readonly view: NationView;
  readonly p: Personality;
  readonly goals: readonly Goal[];
  readonly beliefs: readonly PartnerBelief[];
  readonly memory: ReadonlyMap<NationId, PartnerMemory>;
  readonly seed: number;
  readonly ledger: Ledger;
  /** Partners already holding an open offer from this nation. */
  readonly busy: Set<NationId>;
  /** Called once per candidate scored, for the compute budget. */
  readonly spend: (units: number) => void;
}

/** Score of one partner for one good, higher is better; <= 0 means skip. */
function partnerScore(ctx: ActionContext, b: PartnerBelief, amount: number): number {
  const { view, p } = ctx;
  const m = ctx.memory.get(b.id);
  const jitter = noiseBp(ctx.seed, view.tick, view.selfId, b.id, rule(view, 'aiNoiseBp'));
  // Cooperative styles lean towards partners they trust; hard bargainers towards the neediest.
  const trustBp = p.reciprocity === 'exploiter' ? 0 : ((b.trust - rule(view, 'baseTrust')) * p.cooperativeness) / 2;
  const grudgeCut = m === undefined ? 0 : Math.min(9_000, grudgePoints(m) * 100);
  return Math.floor((amount * (10_000 + jitter + trustBp - grudgeCut)) / 100);
}

function markupFor(ctx: ActionContext, partner: NationId): number {
  if (ctx.p.reciprocity !== 'exploiter') return 0;
  const markup = rule(ctx.view, 'aiExploiterMarkupPct');
  const m = ctx.memory.get(partner);
  return markup + Math.min(markup, m === undefined ? 0 : Math.floor(grudgePoints(m) / 2));
}

/** Sell spare goods to the best-scoring partners short of them, in goal order. */
export function proposeSales(ctx: ActionContext, maxProposals: number): Proposal[] {
  const { view, ledger } = ctx;
  const out: Proposal[] = [];
  const cap = rule(view, 'maxOpenOffersPerNation');
  for (const good of goodsByGoal(ctx.goals, 'sell')) {
    if (ledger.spare[good] <= 0) continue;
    const other: Good = good === 'food' ? 'energy' : 'food';
    const ranked = ctx.beliefs
      .filter((b) => b.need[good] > 0 && !ctx.busy.has(b.id) && !punishing(ctx.memory.get(b.id), view.tick))
      .map((b) => {
        ctx.spend(1);
        return { b, score: partnerScore(ctx, b, b.need[good]) };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score || (x.b.id < y.b.id ? -1 : 1));
    let taken = 0;
    for (const { b } of ranked) {
      if (out.length >= maxProposals || ledger.open >= cap || ledger.spare[good] <= 0 || taken >= 3) break;
      const amount = Math.min(ledger.spare[good], b.need[good]);
      if (amount <= 0) continue;
      const markup = markupFor(ctx, b.id);
      // Swap for their spare in my deficit when they have one; else Credit.
      let get: ResourceAmount;
      if (ledger.need[other] > 0 && b.surplus[other] > 0) {
        const want = goodsFor(view.prices, other, { resource: good, amount }, -markup);
        get = { resource: other, amount: Math.max(1, Math.min(b.surplus[other], ledger.need[other], want)) };
      } else {
        get = { resource: 'credit', amount: creditFor(view.prices, good, amount, markup) };
      }
      const giveAmount = get.resource === 'credit' ? amount : Math.min(amount, Math.max(1, goodsFor(view.prices, good, get, markup)));
      const give: ResourceAmount = { resource: good, amount: giveAmount };
      if (!isFair(view, give, get) && !view.self.private.policy.hardBargains) continue;
      const reasons = [`your ${good} deficit is ${b.need[good]}`, `my spare ${good} is ${ledger.spare[good]}`];
      if (markup > 0) reasons.push(`my price is ${markup}% over reference`);
      out.push({ to: b.id, give, get, text: `offered ${show(give)} for ${show(get)}: your ${good} deficit is ${b.need[good]}${markup > 0 ? `, my price ${markup}% over reference` : ''}`, reasons });
      ledger.open++;
      ctx.busy.add(b.id);
      ledger.spare[good] -= give.amount;
      if (get.resource !== 'credit') ledger.need[get.resource as Good] = Math.max(0, ledger.need[get.resource as Good] - get.amount);
      taken++;
    }
  }
  return out;
}

/** Ask partners with a surplus for what is still missing, paying Credit at reference price. */
export function proposePurchases(ctx: ActionContext, maxProposals: number): Proposal[] {
  const { view, ledger } = ctx;
  const out: Proposal[] = [];
  const cap = rule(view, 'maxOpenOffersPerNation');
  const order = goodsByGoal(ctx.goals, 'cover');
  for (const good of order) {
    if (ledger.need[good] <= 0) continue;
    const ranked = ctx.beliefs
      .filter((b) => b.playable && b.surplus[good] > 0 && !ctx.busy.has(b.id) && !punishing(ctx.memory.get(b.id), view.tick))
      .map((b) => {
        ctx.spend(1);
        return { b, score: partnerScore(ctx, b, b.surplus[good]) };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score || (x.b.id < y.b.id ? -1 : 1));
    for (const { b } of ranked) {
      if (out.length >= maxProposals || ledger.open >= cap || ledger.need[good] <= 0) break;
      const amount = Math.min(ledger.need[good], b.surplus[good]);
      const pay = creditFor(view.prices, good, amount, 0);
      if (ledger.creditFree < pay) break;
      const give: ResourceAmount = { resource: 'credit', amount: pay };
      const get: ResourceAmount = { resource: good, amount };
      if (!isFair(view, give, get)) continue;
      const reasons = [`my ${good} need is ${ledger.need[good]}`, `your ${good} surplus is ${b.surplus[good]}`];
      out.push({ to: b.id, give, get, text: `offered ${show(give)} for ${show(get)}: my ${good} need is ${ledger.need[good]}`, reasons });
      ledger.creditFree -= pay;
      ledger.stocks.credit -= pay;
      ledger.open++;
      ctx.busy.add(b.id);
      ledger.need[good] -= amount;
    }
  }
  return out;
}
