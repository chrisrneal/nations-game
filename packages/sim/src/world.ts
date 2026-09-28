import type { ControllerSlot, NationId, State } from '@nations/contracts';
import { randomInt, seedRng } from './rng.ts';
import { TUNABLES } from './tunables.ts';

/** Save format version for WorldState. Bump it and add a migration in save.ts. */
export const SCHEMA_VERSION = 1;

/** What any nation may know about another. */
export interface NationPublic {
  readonly pingsReceived: number;
}

/** What only the nation itself (and the authoritative sim) may know. */
export interface NationPrivate {
  readonly pingsSent: number;
  readonly lastRoll: number;
  /** Placeholder secret, seeded at creation so each nation's value differs. */
  readonly reserve: number;
}

export interface NationRecord {
  readonly id: NationId;
  readonly name: string;
  readonly public: NationPublic;
  readonly private: NationPrivate;
}

/**
 * The full world as the sim sees it: the contracts `State` plus the nation
 * records. Extends the contract rather than editing it (lane C owns contracts;
 * see docs/GAPS.md).
 */
export interface WorldState extends State {
  /** Stable iteration order over nations. Never iterate `nations` by key. */
  readonly nationOrder: readonly NationId[];
  readonly nations: Readonly<Record<NationId, NationRecord>>;
}

export interface RosterEntry {
  readonly id: string;
  readonly name: string;
}

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

/** Tick 0 of a new game. Pure: the same options always give the same world. */
export function createWorld(options: CreateWorldOptions): WorldState {
  const seen = new Set<string>();
  for (const entry of options.roster) {
    if (seen.has(entry.id)) throw new Error(`Duplicate nation id "${entry.id}"`);
    seen.add(entry.id);
  }
  if (seen.size < 2) throw new Error('A world needs at least two nations');

  let rng = seedRng(options.seed);
  const nationOrder: NationId[] = [];
  const nations: Record<NationId, NationRecord> = {};
  const controllers: Record<NationId, ControllerSlot> = {};
  for (const entry of options.roster) {
    const id = nationId(entry.id);
    const reserve = randomInt(rng, 0, TUNABLES.placeholderReserveMax.value);
    rng = reserve.rng;
    nationOrder.push(id);
    nations[id] = {
      id,
      name: entry.name,
      public: { pingsReceived: 0 },
      private: { pingsSent: 0, lastRoll: 0, reserve: reserve.value },
    };
    controllers[id] = options.controllers?.[entry.id] ?? 'ai';
  }
  return { schemaVersion: SCHEMA_VERSION, tick: 0, rng, controllers, nationOrder, nations };
}
