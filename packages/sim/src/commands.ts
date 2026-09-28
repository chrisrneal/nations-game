import type {
  AcceptOfferCommand,
  Command,
  CounterOfferCommand,
  FundResilienceCommand,
  GameCommand,
  MakeOfferCommand,
  NationRecord,
  PingCommand,
  RejectOfferCommand,
  Resource,
  ResourceAmount,
  SetControllerCommand,
  SetPolicyCommand,
  WithdrawOfferCommand,
} from '@nations/contracts';
import { isFair } from './economy.ts';
import { TUNABLES } from './tunables.ts';
import type { WorldState } from './world.ts';

export type {
  AcceptOfferCommand,
  CounterOfferCommand,
  FundResilienceCommand,
  MakeOfferCommand,
  PingCommand,
  RejectOfferCommand,
  SetControllerCommand,
  SetPolicyCommand,
  WithdrawOfferCommand,
};

/** Every command the sim understands (contracts `GameCommand`). */
export type SimCommand = GameCommand;

export const COMMAND_TYPES = [
  'ping',
  'setController',
  'makeOffer',
  'acceptOffer',
  'rejectOffer',
  'counterOffer',
  'withdrawOffer',
  'setPolicy',
  'fundResilience',
] as const;
const CONTROLLER_SLOTS: readonly string[] = ['human', 'ai', 'caretaker'];
export const RESOURCES: readonly Resource[] = ['food', 'energy', 'credit'];

/** Numeric safety limit on one offer leg, so price x amount stays a safe integer. Not balance. */
const MAX_AMOUNT = 1_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function amountShape(value: unknown, label: string): string | null {
  if (!isRecord(value)) return `${label} is not an object`;
  if (typeof value.resource !== 'string' || !(RESOURCES as readonly string[]).includes(value.resource)) {
    return `${label}: unknown resource`;
  }
  if (!isPositiveInt(value.amount)) return `${label}: amount must be a positive whole number`;
  if (value.amount > MAX_AMOUNT) return `${label}: amount too large`;
  return null;
}

function termsShape(give: unknown, get: unknown): string | null {
  const g = amountShape(give, 'give') ?? amountShape(get, 'get');
  if (g !== null) return g;
  if ((give as ResourceAmount).resource === (get as ResourceAmount).resource) {
    return 'an offer must swap two different resources';
  }
  return null;
}

const POLICY_BOOLEANS = ['acceptFairDeficit', 'acceptTrusted', 'rejectAll', 'hardBargains'] as const;
const POLICY_KEYS: readonly string[] = [...POLICY_BOOLEANS, 'coverPriority', 'resilienceFloor'];

function policyShape(payload: Record<string, unknown>): string | null {
  const keys = Object.keys(payload);
  if (keys.length === 0) return 'no policy fields given';
  for (const key of keys) if (!POLICY_KEYS.includes(key)) return `unknown policy "${key}"`;
  for (const key of POLICY_BOOLEANS) {
    if (key in payload && typeof payload[key] !== 'boolean') return `${key} must be true or false`;
  }
  if ('coverPriority' in payload && payload.coverPriority !== 'food' && payload.coverPriority !== 'energy') {
    return 'coverPriority must be food or energy';
  }
  if ('resilienceFloor' in payload) {
    const floor = payload.resilienceFloor;
    if (typeof floor !== 'number' || !Number.isSafeInteger(floor) || floor < 0 || floor > TUNABLES.resilienceMax.value) {
      return 'resilienceFloor out of range';
    }
  }
  return null;
}

/**
 * Checks that do not depend on the tick being stepped: shape, known nation,
 * known type, payload. Everything arriving from a UI, an AI or a network is
 * treated as untrusted `unknown` here. Returns a reason, or null when valid.
 */
export function validateCommandShape(state: WorldState, command: unknown): string | null {
  if (!isRecord(command)) return 'command is not an object';
  const { nationId, tick, type, payload } = command;
  if (typeof nationId !== 'string' || !Object.hasOwn(state.nations, nationId)) {
    return 'unknown nation';
  }
  if (typeof tick !== 'number' || !Number.isSafeInteger(tick) || tick < 0) return 'bad tick';
  if (!isRecord(payload)) return 'payload is not an object';
  switch (type) {
    case 'ping': {
      const { target } = payload;
      if (typeof target !== 'string' || !Object.hasOwn(state.nations, target)) {
        return 'unknown target';
      }
      if (target === nationId) return 'cannot ping self';
      return null;
    }
    case 'setController': {
      const { controller } = payload;
      if (typeof controller !== 'string' || !CONTROLLER_SLOTS.includes(controller)) {
        return 'unknown controller slot';
      }
      return null;
    }
    case 'makeOffer': {
      const { to } = payload;
      if (typeof to !== 'string' || !Object.hasOwn(state.nations, to)) return 'unknown partner';
      if (to === nationId) return 'cannot trade with yourself';
      return termsShape(payload.give, payload.get);
    }
    case 'acceptOffer':
    case 'rejectOffer':
    case 'withdrawOffer':
      return isPositiveInt(payload.offerId) ? null : 'unknown offer';
    case 'counterOffer':
      if (!isPositiveInt(payload.offerId)) return 'unknown offer';
      return termsShape(payload.give, payload.get);
    case 'setPolicy':
      return policyShape(payload);
    case 'fundResilience':
      return isPositiveInt(payload.points) ? null : 'points must be a positive whole number';
    default:
      return 'unknown command type';
  }
}

function nation(state: WorldState, id: string): NationRecord {
  return state.nations[id as NationRecord['id']] as NationRecord;
}

/** Whether `maker` may send these terms to `to` right now. Shared by makeOffer and counterOffer. */
function offerAllowed(
  state: WorldState,
  maker: NationRecord,
  give: ResourceAmount,
  get: ResourceAmount,
  replacing: number | null,
): string | null {
  if (maker.public.kind === 'aggregate') return 'background regions answer offers but do not make them';
  if (maker.private.stocks[give.resource] < give.amount) return `not enough ${give.resource} to offer`;
  const open = state.offers.filter((o) => o.from === maker.id && o.id !== replacing).length;
  if (open >= TUNABLES.maxOpenOffersPerNation.value) return 'too many open offers';
  if (!maker.private.policy.hardBargains && !isFair(state.prices, give, get)) {
    return 'outside the fair price band; your hard-bargains policy is off';
  }
  return null;
}

/**
 * Full validation for a command about to be applied in the step for
 * `state.tick`, against the state as already changed by earlier commands in
 * the same step.
 */
export function validateCommand(state: WorldState, command: unknown): string | null {
  const shape = validateCommandShape(state, command);
  if (shape !== null) return shape;
  const typed = command as SimCommand;
  if (typed.tick !== state.tick) return 'wrong tick';
  const self = nation(state, typed.nationId);
  switch (typed.type) {
    case 'makeOffer':
      return offerAllowed(state, self, typed.payload.give, typed.payload.get, null);
    case 'acceptOffer':
    case 'rejectOffer':
    case 'counterOffer': {
      const offer = state.offers.find((o) => o.id === typed.payload.offerId);
      if (offer === undefined) return 'offer is no longer open';
      if (offer.to !== typed.nationId) return 'this offer was not made to you';
      if (typed.type === 'acceptOffer' && self.private.stocks[offer.get.resource] < offer.get.amount) {
        return `not enough ${offer.get.resource} to pay`;
      }
      if (typed.type === 'counterOffer') {
        return offerAllowed(state, self, typed.payload.give, typed.payload.get, null);
      }
      return null;
    }
    case 'withdrawOffer': {
      const offer = state.offers.find((o) => o.id === typed.payload.offerId);
      if (offer === undefined) return 'offer is no longer open';
      if (offer.from !== typed.nationId) return 'only the maker can withdraw an offer';
      return null;
    }
    case 'fundResilience': {
      const cost = typed.payload.points * TUNABLES.resilienceCostPerPoint.value;
      if (self.private.stocks.credit < cost) return 'not enough credit';
      if (self.private.resilience + typed.payload.points > TUNABLES.resilienceMax.value) return 'above the resilience ceiling';
      return null;
    }
    default:
      return null;
  }
}

/** Narrowing helper for step.ts. */
export function asSimCommand(command: Command): SimCommand {
  return command as SimCommand;
}
