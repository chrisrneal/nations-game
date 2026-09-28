import type { NationEndowment, NationKind } from '@nations/contracts';
import type { RosterEntry } from './world.ts';

/**
 * Reads the nations and background regions out of data/world-2030.json.
 *
 * Pure: the host loads the file and passes the parsed object in; the sim
 * never reads files. Only whole-number fields are taken, so the floats in the
 * data file (median age, growth paths, raw percentages) never reach State.
 * Order is playable nations then regions, each sorted by id, so every machine
 * builds the same `nationOrder`.
 */
export function rosterFromWorldData(data: unknown, options: { includeAggregates?: boolean } = {}): RosterEntry[] {
  const root = record(data, 'world data');
  if (root.schemaVersion !== 1) throw new Error(`Unsupported world data schemaVersion ${String(root.schemaVersion)}`);
  const nations = list(root.nations, 'nations').map((raw) => entry(raw, 'playable'));
  const aggregates = options.includeAggregates === false ? [] : list(root.aggregates, 'aggregates').map((raw) => entry(raw, 'aggregate'));
  const byId = (a: RosterEntry, b: RosterEntry): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return [...nations.sort(byId), ...aggregates.sort(byId)];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} is not an object`);
  return value as Record<string, unknown>;
}

function list(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} is not a list`);
  return value;
}

function int(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`${label} is not a whole number`);
  return value;
}

function strings(value: unknown, label: string): string[] {
  return list(value ?? [], label).map((item) => {
    if (typeof item !== 'string') throw new Error(`${label} has a non-string entry`);
    return item;
  });
}

function entry(raw: unknown, kind: NationKind): RosterEntry {
  const n = record(raw, 'nation');
  const id = typeof n.id === 'string' ? n.id : '';
  if (id === '') throw new Error('nation without an id');
  const at = (path: string): unknown => path.split('.').reduce<unknown>((v, key) => record(v, `${id}.${path}`)[key], n);
  const endowment: Omit<NationEndowment, 'id' | 'name'> = {
    kind,
    population: int(n.population2030, `${id}.population2030`),
    gdpPppBn: int(n.gdp2030PppBn, `${id}.gdp2030PppBn`),
    baselineGrowthBp: int(at('baselineGrowth.basisPoints'), `${id}.baselineGrowth.basisPoints`),
    foodSelfSufficiency: int(at('food.selfSufficiencyIndex'), `${id}.food`),
    energySelfSufficiency: int(at('energy.selfSufficiencyIndex'), `${id}.energy`),
    mineralsEndowment: int(at('minerals.endowmentIndex'), `${id}.minerals.endowmentIndex`),
    mineralsRefining: int(at('minerals.refiningLeverageIndex'), `${id}.minerals.refiningLeverageIndex`),
    climateExposure: int(at('climate.exposureIndex'), `${id}.climate`),
    pandemicPreparedness: int(at('pandemic.preparednessIndex'), `${id}.pandemic`),
    blocs: strings(n.blocs, `${id}.blocs`),
    alliances: strings(n.alliances, `${id}.alliances`),
    topTradePartners: strings(n.topTradePartners, `${id}.topTradePartners`),
  };
  return { id, name: typeof n.name === 'string' ? n.name : id, endowment };
}
