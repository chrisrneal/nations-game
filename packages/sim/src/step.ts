import type { Command, ControllerSlot, Event, NationId, NationRecord, StandingPolicy } from '@nations/contracts';
import { asSimCommand, validateCommand } from './commands.ts';
import {
  answerAppeals,
  breakPledge,
  contributeByCommand,
  damageAt,
  declineAppeal,
  draftPools,
  lockCrises,
  makePledge,
  openCrises,
  pruneHits,
  resolvePledges,
  standingContribution,
  type CrisisContext,
} from './crisis.ts';
import { economyTick, referencePrices, structuralCover } from './economy.ts';
import {
  declineProject,
  fundProject,
  joinProject,
  leaveProject,
  processProjects,
  projectYields,
  proposeProject,
  type ProjectContext,
} from './projects.ts';
import { nextScoreTrack } from './score.ts';
import {
  acceptOffer,
  autoImports,
  counterOffer,
  createOffer,
  expireOffers,
  rejectOffer,
  runPolicies,
  withdrawOffer,
  type TradeContext,
} from './trade.ts';
import { driftTrust } from './trust.ts';
import { TUNABLES } from './tunables.ts';
import type { ScoreTrack, WorldState } from './world.ts';

export interface StepResult {
  readonly state: WorldState;
  readonly events: readonly Event[];
}

/**
 * Puts commands in the one order every machine agrees on: by the nation's
 * position in `nationOrder`, then by the order that nation submitted them.
 * Arrival order across nations (which differs between a phone and a server)
 * therefore never affects the result. Unknown nations sort last and are
 * rejected by validation.
 */
export function canonicalOrder(state: WorldState, commands: readonly Command[]): Command[] {
  const rank = new Map<string, number>();
  state.nationOrder.forEach((id, index) => rank.set(id, index));
  return commands
    .map((command, index) => ({ command, index }))
    .sort((a, b) => {
      const ra = rank.get(a.command.nationId) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.command.nationId) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.index - b.index;
    })
    .map((entry) => entry.command);
}

/**
 * The whole simulation surface (seam 1). One tick, in this order:
 *
 * 1. Commands stamped for `state.tick`, in canonical order. Trades settle the
 *    moment they are accepted.
 * 2. Standing policies answer offers on their last tick (seam 8), then
 *    anything still unanswered expires, then "keep us supplied" policies send
 *    next month's import offers (RULES 3.4).
 * 3. Crises (RULES 4): pledges due this tick are collected or broken,
 *    standing policies answer appeals due this tick, and pools whose deadline
 *    is this tick lock and schedule each nation's damage (cut by shields).
 *    Then joint projects (RULES 13): forming deadlines, installments,
 *    completion, and next month's project production.
 * 4. Every nation's economy: produce, consume, shortfall, crisis damage,
 *    income, resilience, growth, against a baseline that expects the
 *    structural shortfall (docs/RULES.md section 2); then its monthly
 *    standing contribution to the pools and its smoothed score track.
 * 5. Trust drifts towards baseTrust; spent damage is dropped; new crises open
 *    (a climate appeal once a year, a pandemic on a seeded roll); reference
 *    prices are refreshed.
 *
 * Pure: never mutates `state` or `commands`, reads no clock and draws
 * randomness only from `state.rng`. Invalid commands are not errors: they
 * become a `commandRejected` event seen only by the sender.
 */
export function step(state: WorldState, commands: readonly Command[]): StepResult {
  const events: Event[] = [];
  const nations: Record<NationId, NationRecord> = { ...state.nations };
  const controllers: Record<NationId, ControllerSlot> = { ...state.controllers };
  const ctx: TradeContext & CrisisContext & ProjectContext = {
    tick: state.tick,
    prices: state.prices,
    nationOrder: state.nationOrder,
    nations,
    endowments: state.endowments,
    offers: [...state.offers],
    nextOfferId: state.nextOfferId,
    ledger: state.ledger,
    events,
    covered: new Map(),
    gainCbp: new Map(),
    cover: structuralCover(state),
    pools: draftPools(state.pools),
    crises: [...state.crises],
    pledges: [...state.pledges],
    hits: [...state.hits],
    recent: [...state.recentCrises],
    nextCrisisId: state.nextCrisisId,
    nextPledgeId: state.nextPledgeId,
    rng: state.rng,
    projects: [...state.projects],
    nextProjectId: state.nextProjectId,
  };
  const draft = (): WorldState => ({ ...state, nations, controllers, offers: ctx.offers, crises: ctx.crises, pledges: ctx.pledges, projects: ctx.projects });
  const perNation = new Map<string, number>();

  const reject = (command: Command, reason: string): void => {
    events.push({
      tick: state.tick,
      type: 'commandRejected',
      payload: { commandType: String(command.type), reason },
      audience: typeof command.nationId === 'string' ? [command.nationId] : [],
    });
  };

  for (const command of canonicalOrder(state, commands)) {
    const reason = validateCommand(draft(), command);
    if (reason !== null) {
      reject(command, reason);
      continue;
    }
    const count = (perNation.get(command.nationId) ?? 0) + 1;
    perNation.set(command.nationId, count);
    if (count > TUNABLES.maxCommandsPerNationPerTick.value) {
      reject(command, 'too many commands this tick');
      continue;
    }

    const typed = asSimCommand(command);
    if (command.why !== undefined) explainCommand(ctx, typed, command.why);
    switch (typed.type) {
      case 'ping': {
        const sender = nations[typed.nationId] as NationRecord;
        nations[sender.id] = { ...sender, private: { ...sender.private, pingsSent: sender.private.pingsSent + 1 } };
        const target = nations[typed.payload.target] as NationRecord;
        nations[target.id] = { ...target, public: { ...target.public, pingsReceived: target.public.pingsReceived + 1 } };
        events.push({
          tick: state.tick,
          type: 'pinged',
          payload: { from: sender.id, to: target.id },
          audience: [sender.id, target.id],
        });
        break;
      }
      case 'setController': {
        const from = controllers[typed.nationId];
        controllers[typed.nationId] = typed.payload.controller;
        events.push({
          tick: state.tick,
          type: 'controllerChanged',
          payload: { nationId: typed.nationId, from, to: typed.payload.controller },
          audience: [],
        });
        break;
      }
      case 'makeOffer':
        createOffer(ctx, typed.nationId, typed.payload.to, typed.payload.give, typed.payload.get, null);
        break;
      case 'acceptOffer':
        acceptOffer(ctx, typed.payload.offerId, 'command');
        break;
      case 'rejectOffer':
        rejectOffer(ctx, typed.payload.offerId, 'command');
        break;
      case 'counterOffer':
        counterOffer(ctx, typed.payload.offerId, typed.payload.give, typed.payload.get);
        break;
      case 'withdrawOffer':
        withdrawOffer(ctx, typed.payload.offerId);
        break;
      case 'setPolicy': {
        const n = nations[typed.nationId] as NationRecord;
        const policy: StandingPolicy = { ...n.private.policy, ...typed.payload };
        nations[n.id] = { ...n, private: { ...n.private, policy } };
        events.push({
          tick: state.tick,
          type: 'policyChanged',
          payload: { nationId: n.id, policy },
          audience: [n.id],
        });
        break;
      }
      case 'fundResilience': {
        const n = nations[typed.nationId] as NationRecord;
        const points = typed.payload.points;
        const cost = points * TUNABLES.resilienceCostPerPoint.value;
        nations[n.id] = {
          ...n,
          private: {
            ...n.private,
            resilience: n.private.resilience + points,
            stocks: { ...n.private.stocks, credit: n.private.stocks.credit - cost },
          },
        };
        ctx.ledger = { ...ctx.ledger, creditSpentResilience: ctx.ledger.creditSpentResilience + cost };
        events.push({
          tick: state.tick,
          type: 'resilienceFunded',
          payload: { nationId: n.id, points, cost },
          audience: [n.id],
        });
        break;
      }
      case 'contribute':
        contributeByCommand(ctx, typed.nationId, typed.payload.pool, typed.payload.amount);
        break;
      case 'pledge':
        makePledge(ctx, typed.nationId, typed.payload.pool, typed.payload.amount, typed.payload.deadlineTick);
        break;
      case 'withdrawPledge':
        breakPledge(ctx, typed.payload.pledgeId, 'withdrawn');
        break;
      case 'declineAppeal':
        declineAppeal(ctx, typed.nationId, typed.payload.crisisId);
        break;
      case 'proposeProject':
        proposeProject(ctx, typed.nationId, typed.payload.template, typed.payload.invite);
        break;
      case 'joinProject':
        joinProject(ctx, typed.nationId, typed.payload.projectId);
        break;
      case 'declineProject':
        declineProject(ctx, typed.nationId, typed.payload.projectId);
        break;
      case 'leaveProject':
        leaveProject(ctx, typed.nationId, typed.payload.projectId, 'left');
        break;
      case 'fundProject':
        fundProject(ctx, typed.nationId, typed.payload.projectId, typed.payload.amount);
        break;
    }
  }

  runPolicies(ctx);
  expireOffers(ctx);
  autoImports(ctx);

  resolvePledges(ctx);
  answerAppeals(ctx);
  lockCrises(ctx);
  processProjects(ctx);
  // Next month's project production, cut by climate damage at each host (RULES 13.4).
  const yields = projectYields(ctx.projects, ctx.hits, state.tick + 1);

  const scoreTrack: Record<NationId, ScoreTrack> = { ...state.scoreTrack };
  for (const id of state.nationOrder) {
    const endowment = state.endowments[id];
    if (endowment === undefined) throw new Error(`No endowment for "${id}"`);
    const damage = damageAt(ctx.hits, id, state.tick);
    const result = economyTick(nations[id] as NationRecord, endowment, ctx.ledger, ctx.gainCbp.get(id) ?? 0, ctx.cover, damage.bp, yields.get(id));
    const lost = (bp: number): number => Math.floor((result.preCrisisOutput * Math.min(10_000, bp)) / 10_000);
    ctx.ledger = {
      ...result.ledger,
      climateLoss: result.ledger.climateLoss + lost(damage.climate.bp),
      climateLossUnpooled: result.ledger.climateLossUnpooled + lost(damage.climate.unpooled),
      pandemicLoss: result.ledger.pandemicLoss + lost(damage.pandemic.bp),
      pandemicLossUnpooled: result.ledger.pandemicLossUnpooled + lost(damage.pandemic.unpooled),
    };
    nations[id] = result.nation;
    const contributed = standingContribution(ctx, id);
    const stepped = nations[id] as NationRecord;
    const withReport = contributed === 0 ? stepped : { ...stepped, private: { ...stepped.private, last: { ...stepped.private.last, contributed } } };
    nations[id] = driftTrust(withReport, state.nationOrder);
    scoreTrack[id] = nextScoreTrack(state.scoreTrack[id], result.nation);
    const report = result.nation.private.last;
    if (report.unmetFood > 0 || report.unmetEnergy > 0) {
      events.push({ tick: state.tick, type: 'shortfall', payload: { nationId: id, report }, audience: [id] });
    }
  }

  pruneHits(ctx);
  openCrises(ctx);

  const next: WorldState = {
    ...state,
    rng: ctx.rng,
    nations,
    controllers,
    offers: ctx.offers,
    nextOfferId: ctx.nextOfferId,
    ledger: ctx.ledger,
    scoreTrack,
    pools: ctx.pools,
    crises: ctx.crises,
    recentCrises: ctx.recent,
    pledges: ctx.pledges,
    hits: ctx.hits,
    nextCrisisId: ctx.nextCrisisId,
    nextPledgeId: ctx.nextPledgeId,
    projects: ctx.projects,
    nextProjectId: ctx.nextProjectId,
    tick: state.tick + 1,
  };
  return { state: { ...next, prices: referencePrices(next) }, events };
}

/**
 * Relays a command's `why` (RULES 7.4) as an `explanation` event to the
 * nation that acted and, for an offer, the other side. Built before the
 * command applies, so the offer it answers is still in the draft.
 */
function explainCommand(ctx: TradeContext & CrisisContext & ProjectContext, command: ReturnType<typeof asSimCommand>, why: readonly string[]): void {
  let other: NationId | null = null;
  let subject: number | null = null;
  const p = command.payload as unknown as Record<string, unknown>;
  if (command.type === 'makeOffer') other = command.payload.to;
  if (typeof p.offerId === 'number') {
    subject = p.offerId;
    const offer = ctx.offers.find((o) => o.id === p.offerId);
    if (offer !== undefined) other = offer.from === command.nationId ? offer.to : offer.from;
  }
  if (typeof p.crisisId === 'number') subject = p.crisisId;
  if (typeof p.pledgeId === 'number') subject = p.pledgeId;
  let audience: NationId[] = other === null || other === command.nationId ? [command.nationId] : [command.nationId, other];
  // Joint projects (RULES 13): an answer goes to the host, a proposal to every invitee (the id it will get).
  if (typeof p.projectId === 'number') {
    subject = p.projectId;
    const host = ctx.projects.find((x) => x.id === p.projectId)?.host;
    if (host !== undefined && host !== command.nationId) audience = [command.nationId, host];
  }
  if (command.type === 'proposeProject') {
    subject = ctx.nextProjectId;
    audience = [command.nationId, ...command.payload.invite];
  }
  ctx.events.push({
    tick: ctx.tick,
    type: 'explanation',
    payload: { nationId: command.nationId, decision: command.type, subject, reasons: [...why], by: 'command' },
    audience,
  });
}
