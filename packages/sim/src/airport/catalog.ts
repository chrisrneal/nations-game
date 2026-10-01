import type { UpgradeId } from '@nations/contracts';

/**
 * Design data: names and words, no balance numbers (those are tunables).
 * Lives in the sim, like the rules, so the interface shows what the rules say.
 */

/** The upgrade sheet's order. */
export const UPGRADE_IDS: readonly UpgradeId[] = ['gates', 'plane', 'boarding', 'terminal', 'route', 'crew', 'night'];

export const UPGRADE_TEXT: Readonly<Record<UpgradeId, { name: string; catch: string }>> = {
  gates: { name: 'More gates', catch: 'Gates share the same passengers: with a small terminal, planes leave emptier.' },
  plane: { name: 'Bigger planes', catch: 'Slower to fill, longer turnaround; miss the timer and lose the full-flight bonus.' },
  boarding: { name: 'Faster boarding', catch: 'Jet bridges and agents. Only pays while passengers are waiting.' },
  terminal: { name: 'Bigger terminal', catch: 'More arrivals and waiting room. Only pays if the gates can board them.' },
  route: { name: 'Better routes', catch: 'Higher fares, but each route needs planes at least as big as its level.' },
  crew: { name: 'Ground crew', catch: 'Shorter turnaround. Worth most with small planes that fill fast.' },
  night: { name: 'Night shift', catch: 'Keeps the airport running longer while you are away. Earns nothing while you play.' },
};

/** Plane models by plane level. */
export const PLANE_MODELS: readonly string[] = [
  'Puddle Jumper',
  'Commuter',
  'Regional Jet',
  'Narrowbody',
  'Stretch Narrowbody',
  'Midsize Twin',
  'Widebody',
  'Jumbo',
  'Superjumbo',
  'Sky Whale',
  'Sky Whale II',
  'Sky Whale III',
  'Sky Whale IV',
];

/** Routes by route level. */
export const ROUTES: readonly string[] = [
  'Island hops',
  'Regional',
  'Domestic',
  'Coastal',
  'Cross-country',
  'Continental',
  'Transatlantic',
  'Transpacific',
  'Polar',
  'Round the world',
  'Round the world+',
  'Round the world++',
  'Round the world+++',
];

export type CityTwist = 'none' | 'shortRunway' | 'hub' | 'waves';

export interface City {
  readonly name: string;
  readonly twist: CityTwist;
}

/** Cities in the order airports are opened (RULES 10); they repeat after the last. Twist words: rules.ts `twistText`. */
export const CITIES: readonly City[] = [
  { name: 'Millbrook', twist: 'none' },
  { name: 'Port Calder', twist: 'shortRunway' },
  { name: 'Highmoor Hub', twist: 'hub' },
  { name: 'Sunvale', twist: 'waves' },
];

const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

/** The city for the airport opened after `sold` sales. */
export function cityAt(sold: number): City & { readonly label: string } {
  const city = CITIES[sold % CITIES.length] as City;
  const round = Math.floor(sold / CITIES.length);
  const suffix = ROMAN[round] ?? ` ${round + 1}`;
  return { ...city, label: `${city.name}${suffix}` };
}

export function nameAt(list: readonly string[], level: number): string {
  return list[Math.min(level, list.length - 1)] ?? '';
}
