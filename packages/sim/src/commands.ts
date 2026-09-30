import type {
  AcceptOfferCommand,
  Command,
  ContributeCommand,
  CounterOfferCommand,
  DeclineAppealCommand,
  FundResilienceCommand,
  GameCommand,
  MakeOfferCommand,
  NationEndowment,
  NationRecord,
  PingCommand,
  PledgeCommand,
  RejectOfferCommand,
  Resource,
  ResourceAmount,
  SetControllerCommand,
  SetPolicyCommand,
  WithdrawOfferCommand,
  WithdrawPledgeCommand,
} from '@nations/contracts';
import { isFair } from './economy.ts';
import { TEMPLATE_IDS, hostProblem, roomToFund, sharesTie, shieldMembership, templateOf } from './projects.ts';
import { TUNABLES } from './tunables.ts';
import type { WorldState } from './world.ts';

export type {
  AcceptOfferCommand,
  ContributeCommand,
  CounterOfferCommand,
  DeclineAppealCommand,
  FundResilienceCommand,
  MakeOfferCommand,
  PingCommand,
  PledgeCommand,
  RejectOfferCommand,
  SetControllerCommand,
  SetPolicyCommand,
  WithdrawOfferCommand,
  WithdrawPledgeCommand,
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
  'contribute',
  'pledge',
  'withdrawPledge',
  'declineAppeal',
  'proposeProject',
  'joinProject',
  'declineProject',
  'leaveProject',
  'fundProject',
] as const;
const POOLS: readonly string[] = ['adaptation', 'health'];
const CRISIS_RULES: readonly string[] = ['fairShare', 'reciprocal', 'none'];
const CONTRIBUTION_TARGETS: readonly string[] = ['adaptation', 'health', 'split'];
/** Upper end of the monthly contribution dial: a tenth of income. A safety range, not balance. */
export const MAX_CONTRIBUTION_BP = 1_000;
/** Limits on a command's `why`: a few short sentences, each with a number in it (RULES 7.4). */
const MAX_WHY = 3;
const MAX_WHY_LENGTH = 200;
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

const POLICY_BOOLEANS = ['acceptFairDeficit', 'acceptTrusted', 'rejectAll', 'hardBargains', 'autoImport'] as const;
const POLICY_KEYS: readonly string[] = [...POLICY_BOOLEANS, 'coverPriority', 'resilienceFloor', 'crisisRule', 'contributionBp', 'contributionTo'];

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
  if ('crisisRule' in payload && (typeof payload.crisisRule !== 'string' || !CRISIS_RULES.includes(payload.crisisRule))) {
    return 'crisisRule must be fairShare, reciprocal or none';
  }
  if ('contributionTo' in payload && (typeof payload.contributionTo !== 'string' || !CONTRIBUTION_TARGETS.includes(payload.contributionTo))) {
    return 'contributionTo must be adaptation, health or split';
  }
  if ('contributionBp' in payload) {
    const bp = payload.contributionBp;
    if (typeof bp !== 'number' || !Number.isSafeInteger(bp) || bp < 0 || bp > MAX_CONTRIBUTION_BP) return 'contributionBp out of range';
  }
  return null;
}

function whyShape(why: unknown): string | null {
  if (why === undefined) return null;
  if (!Array.isArray(why) || why.length === 0 || why.length > MAX_WHY) return `why must be 1 to ${MAX_WHY} sentences`;
  for (const line of why) {
    if (typeof line !== 'string' || line.length === 0 || line.length > MAX_WHY_LENGTH) return `each why must be text of at most ${MAX_WHY_LENGTH} characters`;
    if (!/[0-9]/.test(line)) return 'each why must carry a number (RULES 7.4)';
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
  const why = whyShape(command.why);
  if (why !== null) return why;
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
    case 'contribute':
    case 'pledge': {
      if (typeof payload.pool !== 'string' || !POOLS.includes(payload.pool)) return 'unknown pool';
      if (!isPositiveInt(payload.amount) || payload.amount > MAX_AMOUNT) return 'amount must be a positive whole number';
      if (type === 'pledge' && (typeof payload.deadlineTick !== 'number' || !Number.isSafeInteger(payload.deadlineTick))) return 'bad deadline';
      return null;
    }
    case 'withdrawPledge':
      return isPositiveInt(payload.pledgeId) ? null : 'unknown pledge';
    case 'declineAppeal':
      return isPositiveInt(payload.crisisId) ? null : 'unknown crisis';
    case 'proposeProject': {
      if (typeof payload.template !== 'string' || !TEMPLATE_IDS.includes(payload.template)) return 'unknown project';
      const invite = payload.invite;
      // Exactly as many invitations as free seats at most, so a project is never oversubscribed (RULES 13.2).
      const most = TUNABLES.projectSlots.value - 1;
      if (!Array.isArray(invite) || invite.length === 0 || invite.length > most) return `invite 1 to ${most} nations`;
      const seen = new Set<string>();
      for (const id of invite) {
        if (typeof id !== 'string' || !Object.hasOwn(state.nations, id)) return 'unknown invitee';
        if (id === nationId) return 'you cannot invite yourself';
        if (seen.has(id)) return 'an invitee is listed twice';
        seen.add(id);
      }
      return null;
    }
    case 'joinProject':
    case 'declineProject':
    case 'leaveProject':
      return isPositiveInt(payload.projectId) ? null : 'unknown project';
    case 'fundProject':
      if (!isPositiveInt(payload.projectId)) return 'unknown project';
      return isPositiveInt(payload.amount) && payload.amount <= MAX_AMOUNT ? null : 'amount must be a positive whole number';
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
    case 'contribute':
      if (self.public.kind === 'aggregate') return 'background regions pay through their standing policy only';
      return self.private.stocks.credit < typed.payload.amount ? 'not enough credit' : null;
    case 'pledge': {
      if (self.public.kind === 'aggregate') return 'background regions pay through their standing policy only';
      const deadline = typed.payload.deadlineTick;
      if (deadline <= state.tick || deadline > state.tick + TUNABLES.maxPledgeTicks.value) {
        return `deadline must be 1 to ${TUNABLES.maxPledgeTicks.value} months ahead`;
      }
      if (state.pledges.some((p) => p.nationId === self.id && p.pool === typed.payload.pool)) return 'you already have an open pledge to this pool';
      return null;
    }
    case 'withdrawPledge': {
      const pledge = state.pledges.find((p) => p.id === typed.payload.pledgeId);
      if (pledge === undefined) return 'pledge is no longer open';
      return pledge.nationId === self.id ? null : 'only the pledger can withdraw a pledge';
    }
    case 'declineAppeal': {
      const crisis = state.crises.find((c) => c.id === typed.payload.crisisId);
      if (crisis === undefined) return 'appeal is no longer open';
      return crisis.answers[self.id] === undefined ? null : 'you already answered this appeal';
    }
    case 'proposeProject': {
      const template = templateOf(typed.payload.template);
      const problem = hostProblem(template, self, state.endowments[self.id] as NationEndowment, state.projects);
      if (problem !== null) return problem;
      for (const id of typed.payload.invite) {
        if (nation(state, id).public.kind !== 'playable') return 'only playable nations can be invited';
        if (template.sharedTieRequired && !sharesTie(state.endowments[id] as NationEndowment, state.endowments[self.id] as NationEndowment)) {
          return 'a grid link can only invite nations that share a bloc or alliance with you';
        }
      }
      return null;
    }
    case 'joinProject':
    case 'declineProject': {
      const project = state.projects.find((p) => p.id === typed.payload.projectId);
      if (project === undefined || project.status !== 'forming') return 'project is no longer forming';
      if (!project.invited.includes(self.id)) return 'you are not invited to this project';
      if (typed.type === 'declineProject') return null;
      if (project.members.length >= TUNABLES.projectSlots.value) return 'project is full';
      if (shieldMembership(state.projects, self.id, project.kind) !== undefined) return 'you are already in a network like this';
      const template = templateOf(project.template);
      if (template.sharedTieRequired && !sharesTie(state.endowments[self.id] as NationEndowment, state.endowments[project.host] as NationEndowment)) {
        return 'a grid link needs a bloc or alliance in common with the host';
      }
      return null;
    }
    case 'leaveProject': {
      const project = state.projects.find((p) => p.id === typed.payload.projectId);
      if (project === undefined || project.status === 'active') return 'project is not forming or building';
      if (!project.members.some((m) => m.nationId === self.id)) return 'you are not a member';
      return project.host === self.id ? 'a host cannot leave its own project' : null;
    }
    case 'fundProject': {
      const project = state.projects.find((p) => p.id === typed.payload.projectId);
      if (project === undefined || project.status !== 'building') return 'project is not building';
      if (!project.members.some((m) => m.nationId === self.id)) return 'you are not a member';
      const room = roomToFund(project, self.id);
      if (typed.payload.amount > room) return `you can pay at most ${room} more into this project`;
      return self.private.stocks.credit < typed.payload.amount ? 'not enough credit' : null;
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
