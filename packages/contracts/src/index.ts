/**
 * The shared vocabulary of the airport game.
 *
 * Types only: no runtime code, no dependencies, no DOM, no Node. Every other
 * package may import this one; this one imports nothing. See CLAUDE.md.
 */
export type { RngState } from './state.ts';
export type { Tunable } from './tunable.ts';
export type {
  AirportCommand,
  AirportCommandType,
  AirportEvent,
  AirportEventPayloads,
  AirportEventType,
  AirportIntent,
  AirportSaveFile,
  AirportState,
  AirportView,
  BoostId,
  BoostPayload,
  BoostState,
  BoostView,
  Boosts,
  Bottleneck,
  BottleneckKind,
  BuyPayload,
  CheckpointId,
  CheckpointView,
  CityView,
  EffectUnit,
  GateState,
  GateView,
  JourneyView,
  Levels,
  SlotsView,
  Stats,
  TapPayload,
  UpgradeId,
  UpgradeView,
} from './airport.ts';
