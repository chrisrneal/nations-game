import type {
  ControllerSlot,
  NationEndowment,
  NationId,
  NationPrivate,
  NationPublic,
  NationRecord,
  Prices,
  StandingPolicy,
  State,
  TradeOffer,
  WorldLedger,
} from '@nations/contracts';
import { flowsFor, potentialOutput, referencePrices, startingCapacityE4 } from './economy.ts';
import { seedRng } from './rng.ts';
import { startingTrust } from './trust.ts';
import { TUNABLES } from './tunables.ts';

export type { NationPrivate, NationPublic, NationRecord } from '@nations/contracts';

/**
 * Save format version for WorldState. Bump it and add a migration in save.ts.
 * 2 = Phase 1 economy and trade (prompt 06).
 */
export const SCHEMA_VERSION = 2;

/**
 * The full world as the sim sees it: the contracts `State` plus nations,
 * open offers, prices and the world ledger.
 */
export interface WorldState extends State {
  /** Stable iteration order over nations. Never iterate `nations` by key. */
  readonly nationOrder: readonly NationId[];
  readonly nations: Readonly<Record<NationId, NationRecord>>;
  /** Each nation's starting facts from the world data; never changes in a game. */
  readonly endowments: Readonly<Record<NationId, NationEndowment>>;
  /** Open trade offers, oldest first (seam 8). Resolved offers leave State. */
  readonly offers: readonly TradeOffer[];
  readonly nextOfferId: number;
  /** Reference prices for the tick about to be stepped. */
  readonly prices: Prices;
  readonly ledger: WorldLedger;
}

/**
 * One roster entry. `endowment` carries the nation's data; rosters without it
 * (the Phase 0 platform passes only id and name) get `NEUTRAL_ENDOWMENT`, a
 * balanced placeholder economy, until the host passes real data (docs/GAPS.md).
 */
export interface RosterEntry {
  readonly id: string;
  readonly name: string;
  readonly endowment?: Omit<NationEndowment, 'id' | 'name'>;
}

/** A self-sufficient, mid-sized, tie-less economy. Not balance data; see RosterEntry. */
export const NEUTRAL_ENDOWMENT: Omit<NationEndowment, 'id' | 'name'> = {
  kind: 'playable',
  population: 100_000_000,
  gdpPppBn: 2_000,
  baselineGrowthBp: 0,
  foodSelfSufficiency: 50,
  energySelfSufficiency: 50,
  mineralsEndowment: 0,
  mineralsRefining: 0,
  climateExposure: 50,
  pandemicPreparedness: 50,
  blocs: [],
  alliances: [],
  topTradePartners: [],
};

export interface CreateWorldOptions {
  readonly seed: number;
  readonly roster: readonly RosterEntry[];
  /** Controller per raw nation id; nations not listed start as `ai`. */
  readonly controllers?: Readonly<Record<string, ControllerSlot>>;
}

/** The single place a raw string becomes a NationId (contracts convention). */
export function nationId(raw: string): NationId {
  if (raw.length === 0) throw new Error('A nation id cannot be empty');
  return raw as NationId;
}

export function defaultPolicy(): StandingPolicy {
  return {
    acceptFairDeficit: true,
    acceptTrusted: false,
    rejectAll: false,
    coverPriority: 'food',
    resilienceFloor: TUNABLES.defaultResilienceFloor.value,
    hardBargains: false,
  };
}

export const EMPTY_LEDGER: WorldLedger = {
  foodProduced: 0,
  foodConsumed: 0,
  foodUnmet: 0,
  energyProduced: 0,
  energyConsumed: 0,
  energyUnmet: 0,
  creditIncome: 0,
  creditSpentResilience: 0,
  tradesSettled: 0,
  offersExpired: 0,
  offersFailed: 0,
};

/** Starting resilience (RULES 2.6), clamped to [0, resilienceMax]. */
export function startingResilience(e: Pick<NationEndowment, 'pandemicPreparedness' | 'climateExposure'>): number {
  const w = TUNABLES.resilienceStartWeightPreparedness.value;
  const raw = Math.floor((e.pandemicPreparedness * w + (100 - e.climateExposure) * (100 - w)) / 100);
  return Math.max(0, Math.min(TUNABLES.resilienceMax.value, raw));
}

/** Tick 0 of a new game. Pure: the same options always give the same world. */
export function createWorld(options: CreateWorldOptions): WorldState {
  const seen = new Set<string>();
  for (const entry of options.roster) {
    if (seen.has(entry.id)) throw new Error(`Duplicate nation id "${entry.id}"`);
    seen.add(entry.id);
  }
  if (seen.size < 2) throw new Error('A world needs at least two nations');

  const endowments: NationEndowment[] = options.roster.map((entry) => ({
    ...(entry.endowment ?? NEUTRAL_ENDOWMENT),
    id: entry.id,
    name: entry.name,
  }));
  for (const e of endowments) validateEndowment(e);

  const nationOrder: NationId[] = [];
  const nations: Record<NationId, NationRecord> = {};
  const controllers: Record<NationId, ControllerSlot> = {};
  const startTicks = TUNABLES.startingStockTicks.value;
  for (const e of endowments) {
    const id = nationId(e.id);
    const capacityE4 = startingCapacityE4(e.gdpPppBn);
    const flows = flowsFor(e, capacityE4);
    const output = potentialOutput(e, capacityE4);
    const trust: Record<NationId, number> = {};
    for (const other of endowments) {
      if (other.id !== e.id) trust[nationId(other.id)] = startingTrust(e, other);
    }
    const pub: NationPublic = {
      kind: e.kind,
      pingsReceived: 0,
      output,
      baselineOutput: output,
      food: flows.food,
      energy: flows.energy,
    };
    const priv: NationPrivate = {
      pingsSent: 0,
      stocks: {
        food: flows.food.production * startTicks,
        energy: flows.energy.production * startTicks,
        credit: output * startTicks,
      },
      resilience: startingResilience(e),
      capacityE4,
      baselineE4: capacityE4,
      policy: defaultPolicy(),
      trust,
      last: {
        consumedFood: 0,
        consumedEnergy: 0,
        unmetFood: 0,
        unmetEnergy: 0,
        penaltyPct: 0,
        income: 0,
        resilienceSpent: 0,
        tradeGainCbp: 0,
      },
      tradesSettled: 0,
      reneges: 0,
    };
    nationOrder.push(id);
    nations[id] = { id, name: e.name, public: pub, private: priv };
    controllers[id] = options.controllers?.[e.id] ?? 'ai';
  }
  // The endowment's structural facts are needed every tick; keep them in State.
  const facts: Record<NationId, NationEndowment> = {};
  for (const e of endowments) facts[nationId(e.id)] = e;

  const base = {
    schemaVersion: SCHEMA_VERSION,
    tick: 0,
    rng: seedRng(options.seed),
    controllers,
    nationOrder,
    nations,
    endowments: facts,
    offers: [],
    nextOfferId: 1,
    ledger: EMPTY_LEDGER,
  };
  return { ...base, prices: referencePrices(base) };
}

function validateEndowment(e: NationEndowment): void {
  const ints: (keyof NationEndowment)[] = [
    'population',
    'gdpPppBn',
    'baselineGrowthBp',
    'foodSelfSufficiency',
    'energySelfSufficiency',
    'mineralsEndowment',
    'mineralsRefining',
    'climateExposure',
    'pandemicPreparedness',
  ];
  for (const key of ints) {
    const value = e[key];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (key === 'baselineGrowthBp' ? -10_000 : 0)) {
      throw new Error(`Nation "${e.id}": ${key} must be a whole number, got ${String(value)}`);
    }
  }
  if (e.gdpPppBn <= 0) throw new Error(`Nation "${e.id}": gdpPppBn must be positive`);
  if (e.kind !== 'playable' && e.kind !== 'aggregate') throw new Error(`Nation "${e.id}": unknown kind`);
}
