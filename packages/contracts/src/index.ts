/**
 * @nations/contracts - the shared vocabulary of the game.
 *
 * Types only: no runtime code, no dependencies, no DOM, no Node. Every other
 * package may import this one; this one imports nothing. See CLAUDE.md.
 */
export type { ControllerSlot, NationId, Tick } from './nation.ts';
export type { Command } from './command.ts';
export type { Event, SimEvent } from './event.ts';
export type { RngState, State } from './state.ts';
export type { View } from './view.ts';
export type { Host, HostUpdate, Pace } from './host.ts';
export type { SaveFile } from './save.ts';
export type { Tunable } from './tunable.ts';
export type {
  EconomyReport,
  Flow,
  NationEndowment,
  NationKind,
  NationMap,
  Prices,
  Resource,
  ResourceAmount,
  StandingPolicy,
  Stocks,
  WorldLedger,
} from './economy.ts';
export type {
  AppealAnswer,
  ContributionTarget,
  CrisesView,
  Crisis,
  CrisisHit,
  CrisisKind,
  CrisisOutcome,
  CrisisResult,
  CrisisRule,
  Pledge,
  Pool,
  PoolKind,
} from './crisis.ts';
export type {
  AcceptOfferCommand,
  ContributeCommand,
  CrisisEventPayloads,
  CrisisEventType,
  DeclineAppealCommand,
  PledgeCommand,
  Recap,
  RecapLine,
  WithdrawPledgeCommand,
  CounterOfferCommand,
  CounterOfferPayload,
  EconomyEventPayloads,
  EconomyEventType,
  FundResilienceCommand,
  GameCommand,
  MakeOfferCommand,
  MakeOfferPayload,
  OfferOutcome,
  OfferRefPayload,
  PingCommand,
  RejectOfferCommand,
  SetControllerCommand,
  SetPolicyCommand,
  TradeOffer,
  WithdrawOfferCommand,
} from './trade.ts';
export type { CollectiveGoals, ForeignNation, NationPrivate, NationPublic, NationRecord, NationScore, NationView, ScoresView } from './nations.ts';
