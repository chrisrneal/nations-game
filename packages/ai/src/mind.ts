import type { Command, Event, NationEndowment, NationId, NationView, ResourceAmount, TradeOffer } from '@nations/contracts';
import { proposePurchases, proposeSales, type Proposal } from './actions.ts';
import { believe, decayMemory, emptyMemory, offenceText, punishing, remember, type PartnerBelief, type PartnerMemory } from './beliefs.ts';
import { explanationEvent, hasNumber, type DecisionKind, type ExplanationEvent } from './explain.ts';
import { scoreGoals, type Goal } from './goals.ts';
import { answerOffer, type Ledger } from './negotiation.ts';
import { observe, openAppeals, visibleTo } from './perception.ts';
import { personalityFor, type Personality } from './personality.ts';
import { decidePledge } from './pledge.ts';
import { decideProjects } from './projects.ts';
import { clamp, GOODS, month, rule, show, type Good } from './util.ts';

/**
 * One AI nation: the seven layers wired together (docs/AI_DESIGN.md).
 *
 *   perceive  - fold the events it may see into memory (every tick, cheap)
 *   act       - react: announce retaliation or forgiveness, answer every offer,
 *                      decide pledges for open crises (every tick, cheap)
 *               think: re-derive beliefs and re-score goals (staggered)
 *               trade: score partners and make offers (every tick, budgeted)
 *
 * Every command it returns has exactly one explanation, addressed to the
 * nations that will see the decision.
 */
/** The sim's limits on a command's `why` (packages/sim/src/commands.ts). */
const WHY_MAX_LINES = 3;
const WHY_MAX_LENGTH = 200;

export interface MindSnapshot {
  readonly id: string;
  readonly memory: readonly (readonly [string, PartnerMemory])[];
  readonly goals: readonly Goal[];
  /** Beliefs as of the last think: part of the snapshot so a reloaded mind acts identically. */
  readonly beliefs: readonly PartnerBelief[];
  readonly lastThink: number;
  readonly lastDecay: number;
  readonly decidedCrises: readonly number[];
  readonly policySet: boolean;
}

export interface MindOutput {
  readonly commands: Command[];
  readonly explanations: ExplanationEvent[];
}

export interface ActOptions {
  readonly think: boolean;
  readonly trade: boolean;
  readonly spend: (units: number) => void;
}

export class NationMind {
  private personality: Personality | null = null;
  private memory = new Map<NationId, PartnerMemory>();
  private goals: Goal[] = [];
  private beliefs: PartnerBelief[] = [];
  private lastThink = -1;
  private lastDecay = -1;
  private decidedCrises = new Set<number>();
  private policySet = false;

  constructor(
    readonly id: NationId,
    private readonly endowment: Omit<NationEndowment, 'id' | 'name'>,
    private readonly worldGdpPppBn: number,
    private readonly seed: number,
    /** False only for the free-rider in the AI's Gate 2 check: never pays into a pool. */
    private readonly pays = true,
  ) {}

  /** Personality is fixed by the data; the thresholds come from the View's rules. */
  personalityOf(view: Pick<NationView, 'rules'>): Personality {
    this.personality ??= personalityFor(this.endowment, this.worldGdpPppBn, view.rules);
    return this.personality;
  }

  /** Read-only look at what the mind remembers about a partner (tests, why-sheets). */
  memoryOf(partner: NationId): Readonly<PartnerMemory> | undefined {
    return this.memory.get(partner);
  }

  currentGoals(): readonly Goal[] {
    return this.goals;
  }

  get thoughtAt(): number {
    return this.lastThink;
  }

  /** Layers 1-2: perceive the events a player of this nation would see, and remember. */
  perceive(view: NationView, events: readonly Event[]): void {
    const p = this.personalityOf(view);
    if (this.lastDecay < view.tick) {
      decayMemory(this.memory, view);
      this.lastDecay = view.tick;
    }
    const mine = events.filter((e) => visibleTo(e, this.id));
    if (mine.length === 0) return;
    remember(this.memory, observe(this.id, mine), p.reciprocity, view, view.tick);
  }

  act(view: NationView, options: ActOptions): MindOutput {
    const commands: Command[] = [];
    const explanations: ExplanationEvent[] = [];
    if (view.self.public.kind === 'aggregate') return { commands, explanations };
    const p = this.personalityOf(view);
    const now = view.tick;
    const maxCommands = rule(view, 'maxCommandsPerNationPerTick');

    const say = (decision: DecisionKind, partner: NationId | null, text: string, reasons: readonly string[], extra: { offerId?: number; crisisId?: number; projectId?: number } = {}, audience?: readonly NationId[]): void => {
      explanations.push(
        explanationEvent(
          now,
          { nationId: this.id, decision, partner, offerId: extra.offerId ?? null, crisisId: extra.crisisId ?? null, ...(extra.projectId === undefined ? {} : { projectId: extra.projectId }), text, reasons: reasons.slice(0, 3) },
          audience ?? (partner === null ? [this.id] : [this.id, partner]),
        ),
      );
    };
    /**
     * Sends a command and explains it: the explanation event for the host, and
     * the same sentences as the command's `why`, which the sim relays to the
     * nations the decision concerns (RULES 7.4). False when the tick's command cap is full.
     */
    const decide = (
      command: Omit<Command, 'nationId' | 'tick' | 'why'>,
      decision: DecisionKind,
      partner: NationId | null,
      text: string,
      reasons: readonly string[],
      extra: { offerId?: number; crisisId?: number; projectId?: number } = {},
      audience?: readonly NationId[],
    ): boolean => {
      if (commands.length >= maxCommands) return false;
      const why = [text, ...reasons].filter(hasNumber).map((line) => line.slice(0, WHY_MAX_LENGTH)).slice(0, WHY_MAX_LINES);
      commands.push({ ...command, nationId: this.id, tick: now, ...(why.length > 0 ? { why } : {}) } as Command);
      say(decision, partner, text, reasons, extra, audience);
      return true;
    };

    // Standing policies that express the personality, set once (seam 7: they answer if nobody else does).
    if (!this.policySet) {
      const floor = clamp(rule(view, 'defaultResilienceFloor') + Math.floor((p.timeHorizon - 50) / 2), 0, rule(view, 'resilienceMax'));
      const deficit = (g: Good): number => Math.max(0, view.self.public[g].demand - view.self.public[g].production);
      const coverPriority: Good = deficit('energy') > deficit('food') ? 'energy' : 'food';
      const hardBargains = p.reciprocity === 'exploiter';
      // The crisis rule its standing policy uses if it ever leaves an appeal unanswered, by style.
      const crisisRule = !this.pays ? 'none' : p.reciprocity === 'strict' ? 'reciprocal' : p.reciprocity === 'forgiving' ? 'fairShare' : 'none';
      const payload = { hardBargains, coverPriority, resilienceFloor: floor, crisisRule, ...(this.pays ? {} : { contributionBp: 0 }) };
      const text = `set policies: resilience floor ${floor}, ${coverPriority} first, crisis rule ${crisisRule}${hardBargains ? ', hard bargains on' : ''}`;
      if (decide({ type: 'setPolicy', payload }, 'policy', null, text, [`time horizon ${p.timeHorizon}`, `food deficit ${deficit('food')}, energy deficit ${deficit('energy')}`])) {
        this.policySet = true;
      }
    }

    // --- React: retaliation, forgiveness and resumption are announced to the partner, with numbers.
    const mineOpen = view.offers.filter((o) => o.from === this.id);
    const withdrawn = new Set<number>();
    for (const [partner, m] of [...this.memory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (m.punishFrom >= 0 && now >= m.punishUntil) {
        m.punishFrom = -1;
        m.pending.push('resume');
      }
      const pending = m.pending.splice(0);
      for (const kind of pending) {
        const o = m.lastOffence;
        const why = offenceText(o);
        if (kind === 'suspend' && punishing(m, now)) {
          say('suspend', partner, `suspended trade with you until month ${month(m.punishUntil)}: ${why}`, [why, `${m.broken} broken deal${m.broken === 1 ? '' : 's'}, ${m.kept} kept`]);
          for (const offer of mineOpen.filter((x) => x.to === partner && !withdrawn.has(x.id))) {
            if (!decide({ type: 'withdrawOffer', payload: { offerId: offer.id } }, 'withdraw', partner, `withdrew my offer of ${show(offer.give)}: ${why}`, [why], { offerId: offer.id })) break;
            withdrawn.add(offer.id);
          }
        } else if (kind === 'forgive') {
          const limit = rule(view, 'aiForgiveLimit');
          say('forgive', partner, `forgave ${o === null ? 'your record' : o.what}: ${m.offences} of ${limit} allowed; the next one counts`, [why, `${m.kept} deals kept`]);
        } else if (kind === 'resume') {
          say('resume', partner, `resumed trade with you in month ${month(now)} after ${why}`, [`retaliation ended in month ${month(now)}`]);
        }
      }
    }

    // --- Ledger: what I need and can spare this tick, net of my own open offers.
    const self = view.self;
    const stocks = { ...self.private.stocks };
    const open = mineOpen.filter((o) => !withdrawn.has(o.id));
    const buffer = rule(view, 'aiStockBufferTicks');
    const need = { food: 0, energy: 0 };
    const spare = { food: 0, energy: 0 };
    // Goods in an offer withdrawn this tick stay promised until next month: the partner may accept it
    // earlier in the same step (commands run in nation order), and then they are gone.
    for (const good of GOODS) {
      const flow = self.public[good];
      const pendingIn = open.filter((o) => o.get.resource === good).reduce((s, o) => s + o.get.amount, 0);
      const pendingOut = mineOpen.filter((o) => o.give.resource === good).reduce((s, o) => s + o.give.amount, 0);
      need[good] = Math.max(0, flow.demand - flow.production - stocks[good] - pendingIn);
      spare[good] = Math.max(0, Math.min(stocks[good], stocks[good] + flow.production - flow.demand * buffer) - pendingOut);
    }
    const creditPromised = mineOpen.filter((o) => o.give.resource === 'credit').reduce((s, o) => s + o.give.amount, 0);
    const ledger: Ledger = { need, spare, stocks, creditFree: stocks.credit - creditPromised, open: open.length };

    // --- React: answer every offer made to me. Offenders first, so retaliation is never crowded out.
    const priority = self.private.policy.coverPriority;
    const incoming = view.offers
      .filter((o) => o.to === this.id)
      .sort(
        (a, b) =>
          Number(punishing(this.memory.get(b.from), now)) - Number(punishing(this.memory.get(a.from), now)) ||
          Number(b.give.resource === priority) - Number(a.give.resource === priority) ||
          a.id - b.id,
      );
    for (const offer of incoming) {
      options.spend(2);
      const answer = answerOffer(view, p, offer, this.memory.get(offer.from), ledger);
      const ref = { offerId: offer.id };
      if (answer.kind === 'accept') {
        if (!decide({ type: 'acceptOffer', payload: ref }, 'accept', offer.from, answer.text, answer.reasons, ref)) break;
        this.settleInLedger(ledger, offer);
      } else if (answer.kind === 'counter') {
        if (!decide({ type: 'counterOffer', payload: { ...ref, give: answer.give, get: answer.get } }, 'counter', offer.from, answer.text, answer.reasons, ref)) break;
        this.promise(ledger, answer.give, answer.get);
      } else if (!decide({ type: 'rejectOffer', payload: ref }, 'reject', offer.from, answer.text, answer.reasons, ref)) break;
    }

    // --- Crisis appeals: answered the first tick they can be, by paying or declining. Public, like the crisis card.
    for (const crisis of openAppeals(view)) {
      if (this.decidedCrises.has(crisis.id)) continue;
      options.spend(view.others.length);
      const d = decidePledge({ view, p, crisis, creditFree: ledger.creditFree, pays: this.pays });
      const ref = { crisisId: crisis.id };
      if (d.amount > 0) {
        if (!decide({ type: 'contribute', payload: { pool: crisis.pool, amount: d.amount } }, 'pledge', null, d.text, d.reasons, ref, [])) break;
        ledger.creditFree -= d.amount;
        ledger.stocks.credit -= d.amount;
      } else if (!decide({ type: 'declineAppeal', payload: ref }, 'skipPledge', null, d.text, d.reasons, ref, [])) break;
      this.decidedCrises.add(crisis.id);
    }

    // --- Joint projects (RULES 13): answer invitations, reconsider builds, and on think ticks perhaps found one.
    const projectDecisions = decideProjects({
      view,
      p,
      endowment: this.endowment,
      memory: this.memory,
      creditFree: ledger.creditFree,
      // Founding waits for a real (staggered) think tick, so the whole roster never proposes in the same month.
      think: options.think && this.lastThink >= 0,
      seed: this.seed,
    });
    for (const d of projectDecisions) {
      options.spend(view.others.length);
      const projectId = 'projectId' in d.command.payload ? d.command.payload.projectId : undefined;
      if (!decide(d.command, d.kind, d.partner, d.text, d.reasons, projectId === undefined ? {} : { projectId }, d.audience)) break;
    }

    // --- Think (staggered): beliefs and goals.
    if (options.think || this.lastThink < 0) {
      options.spend(view.others.length * 4);
      this.beliefs = believe(view);
      this.goals = scoreGoals(view, p, openAppeals(view));
      this.lastThink = now;
    }

    // --- Trade (budgeted): make offers in goal order.
    if (options.trade && commands.length < maxCommands) {
      const ctx = {
        view,
        p,
        goals: this.goals,
        beliefs: this.beliefs,
        memory: this.memory,
        seed: this.seed,
        ledger,
        busy: new Set<NationId>(open.map((o) => o.to)),
        spend: options.spend,
      };
      const room = (): number => maxCommands - commands.length;
      const proposals: Proposal[] = proposeSales(ctx, room());
      proposals.push(...proposePurchases(ctx, room() - proposals.length));
      for (const prop of proposals) {
        if (!decide({ type: 'makeOffer', payload: { to: prop.to, give: prop.give, get: prop.get } }, 'offer', prop.to, prop.text, prop.reasons)) break;
      }
    }
    return { commands, explanations };
  }

  private settleInLedger(ledger: Ledger, offer: TradeOffer): void {
    const pays = offer.get;
    const gets = offer.give;
    ledger.stocks[pays.resource] -= pays.amount;
    if (pays.resource === 'credit') ledger.creditFree -= pays.amount;
    else ledger.spare[pays.resource as Good] = Math.max(0, ledger.spare[pays.resource as Good] - pays.amount);
    if (gets.resource !== 'credit') ledger.need[gets.resource as Good] = Math.max(0, ledger.need[gets.resource as Good] - gets.amount);
  }

  private promise(ledger: Ledger, give: ResourceAmount, get: ResourceAmount): void {
    ledger.open++;
    if (give.resource === 'credit') ledger.creditFree -= give.amount;
    else ledger.spare[give.resource as Good] = Math.max(0, ledger.spare[give.resource as Good] - give.amount);
    if (get.resource !== 'credit') ledger.need[get.resource as Good] = Math.max(0, ledger.need[get.resource as Good] - get.amount);
  }

  snapshot(): MindSnapshot {
    return {
      id: this.id,
      memory: [...this.memory.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([k, m]) => [k, { ...m, lastOffence: m.lastOffence === null ? null : { ...m.lastOffence }, pending: [...m.pending] }] as const),
      goals: this.goals.map((g) => ({ ...g })),
      beliefs: this.beliefs.map((b) => ({ ...b, need: { ...b.need }, surplus: { ...b.surplus } })),
      lastThink: this.lastThink,
      lastDecay: this.lastDecay,
      decidedCrises: [...this.decidedCrises].sort((a, b) => a - b),
      policySet: this.policySet,
    };
  }

  restore(s: MindSnapshot): void {
    this.memory = new Map(s.memory.map(([k, m]) => [k as NationId, { ...emptyMemory(), ...m, pending: [...m.pending] }]));
    this.goals = s.goals.map((g) => ({ ...g }));
    this.lastThink = s.lastThink;
    this.lastDecay = s.lastDecay;
    this.decidedCrises = new Set(s.decidedCrises);
    this.policySet = s.policySet;
    this.beliefs = s.beliefs.map((b) => ({ ...b, need: { ...b.need }, surplus: { ...b.surplus } }));
  }
}
