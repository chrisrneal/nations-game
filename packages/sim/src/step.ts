import type { Command, ControllerSlot, Event, NationId, NationRecord, StandingPolicy } from '@nations/contracts';
import { asSimCommand, validateCommand } from './commands.ts';
import { economyTick, referencePrices, structuralCover } from './economy.ts';
import { nextScoreTrack } from './score.ts';
import {
  acceptOffer,
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
 *    anything still unanswered expires.
 * 3. Every nation's economy: produce, consume, shortfall, income, resilience,
 *    growth, against a baseline that expects the structural shortfall
 *    (docs/RULES.md section 2); then each nation's smoothed score track.
 * 4. Trust drifts towards baseTrust; reference prices are refreshed.
 *
 * Pure: never mutates `state` or `commands`, reads no clock and draws
 * randomness only from `state.rng`. Invalid commands are not errors: they
 * become a `commandRejected` event seen only by the sender.
 */
export function step(state: WorldState, commands: readonly Command[]): StepResult {
  const events: Event[] = [];
  const nations: Record<NationId, NationRecord> = { ...state.nations };
  const controllers: Record<NationId, ControllerSlot> = { ...state.controllers };
  const ctx: TradeContext = {
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
    clearedMilli: new Map(),
    cover: structuralCover(state),
  };
  const draft = (): WorldState => ({ ...state, nations, controllers, offers: ctx.offers });
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
    }
  }

  runPolicies(ctx);
  expireOffers(ctx);

  let ledger = ctx.ledger;
  const scoreTrack: Record<NationId, ScoreTrack> = { ...state.scoreTrack };
  for (const id of state.nationOrder) {
    const endowment = state.endowments[id];
    if (endowment === undefined) throw new Error(`No endowment for "${id}"`);
    const result = economyTick(nations[id] as NationRecord, endowment, ledger, ctx.gainCbp.get(id) ?? 0, ctx.cover);
    ledger = result.ledger;
    nations[id] = driftTrust(result.nation, state.nationOrder);
    scoreTrack[id] = nextScoreTrack(state.scoreTrack[id], result.nation);
    const report = result.nation.private.last;
    if (report.unmetFood > 0 || report.unmetEnergy > 0) {
      events.push({ tick: state.tick, type: 'shortfall', payload: { nationId: id, report }, audience: [id] });
    }
  }

  const next: WorldState = {
    ...state,
    nations,
    controllers,
    offers: ctx.offers,
    nextOfferId: ctx.nextOfferId,
    ledger,
    scoreTrack,
    tick: state.tick + 1,
  };
  return { state: { ...next, prices: referencePrices(next) }, events };
}
