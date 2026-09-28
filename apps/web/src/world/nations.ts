import world2030 from '../../../../data/world-2030.json' with { type: 'json' };

/**
 * Static facts from data/world-2030.json that the interface shows before the
 * sim models them. Names and starting figures only: live numbers come from the
 * View once the Phase 1 economy lands (docs/GAPS.md, prompt 04).
 */
export interface NationFacts {
  readonly id: string;
  readonly name: string;
  readonly region: string;
  readonly playable: boolean;
  readonly population: number;
  readonly gdpPppBn: number;
  readonly foodIndex: number;
  readonly foodImportPct: number;
  readonly energyIndex: number;
  readonly energyImportPct: number;
  readonly climateExposure: number;
  readonly preparedness: number;
  readonly blocs: readonly string[];
  readonly alliances: readonly string[];
  readonly partners: readonly string[];
}

export const NATIONS: readonly NationFacts[] = world2030.nations.map((n) => ({
  id: n.id,
  name: n.name,
  region: n.region,
  playable: n.playable,
  population: n.population2030,
  gdpPppBn: n.gdp2030PppBn,
  foodIndex: n.food.selfSufficiencyIndex,
  foodImportPct: n.food.cerealImportDependencyPct,
  energyIndex: n.energy.selfSufficiencyIndex,
  energyImportPct: n.energy.netEnergyImportPct,
  climateExposure: n.climate.exposureIndex,
  preparedness: n.pandemic.preparednessIndex,
  blocs: n.blocs,
  alliances: n.alliances,
  partners: n.topTradePartners,
}));

export const AGGREGATES: readonly { id: string; name: string }[] = world2030.aggregates.map((a) => ({
  id: a.id,
  name: a.name,
}));

const byId = new Map(NATIONS.map((n) => [n.id, n]));

export function facts(id: string): NationFacts {
  const found = byId.get(id);
  if (found === undefined) throw new Error(`Unknown nation "${id}"`);
  return found;
}

export function nameOf(id: string): string {
  return byId.get(id)?.name ?? id;
}

/** Short display name for tight spaces (the map, chips). */
export function shortName(id: string): string {
  const short: Record<string, string> = {
    'united-states': 'USA',
    'russia': 'Russia',
    'saudi-arabia': 'Saudi',
    'korea': 'Korea',
    'south-africa': 'S. Africa',
  };
  return short[id] ?? nameOf(id);
}

/**
 * Structural ties between two nations: shared alliances, shared blocs and
 * trade-partner listings. Facts, not a score: starting trust is computed from
 * these by the sim once docs/RULES.md section 6 is coded, so the map draws
 * ties until then rather than inventing trust numbers in the interface.
 */
export interface Ties {
  readonly alliances: readonly string[];
  readonly blocs: readonly string[];
  readonly aListsB: boolean;
  readonly bListsA: boolean;
  readonly count: number;
}

export function tiesBetween(aId: string, bId: string): Ties {
  const a = facts(aId);
  const b = facts(bId);
  const alliances = a.alliances.filter((x) => b.alliances.includes(x));
  const blocs = a.blocs.filter((x) => b.blocs.includes(x));
  const aListsB = a.partners.includes(bId);
  const bListsA = b.partners.includes(aId);
  return {
    alliances,
    blocs,
    aListsB,
    bListsA,
    count: alliances.length + blocs.length + (aListsB ? 1 : 0) + (bListsA ? 1 : 0),
  };
}

/** Tie labels are data ids; show them the way people write them. */
export function label(id: string): string {
  const special: Record<string, string> = {
    g7: 'G7',
    g20: 'G20',
    'us-japan': 'US-Japan',
    'us-korea': 'US-Korea',
    'opec-plus': 'OPEC+',
    'eu-customs-union': 'EU Customs Union',
    afcfta: 'AfCFTA',
  };
  if (special[id] !== undefined) return special[id];
  return id.length <= 6 ? id.toUpperCase() : id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Month and year for a tick. Tick 0 is January 2030; one tick is one month (RULES section 9). */
export function tickDate(tick: number): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[tick % 12]} ${2030 + Math.floor(tick / 12)}`;
}
