import type { BoostId, CheckpointView, JourneyView, UpgradeId } from '@airport/contracts';

/**
 * Design data: names and words, no balance numbers (those are tunables).
 * Lives in the sim, like the rules, so the interface shows what the rules say.
 */

/** The upgrade sheet's order. */
export const UPGRADE_IDS: readonly UpgradeId[] = ['gates', 'plane', 'boarding', 'terminal', 'security', 'route', 'crew', 'night'];

export const UPGRADE_TEXT: Readonly<Record<UpgradeId, { name: string; catch: string }>> = {
  gates: { name: 'More gates', catch: 'Gates share the same passengers: with a small terminal, planes leave emptier.' },
  plane: { name: 'Bigger planes', catch: 'Slower to fill, longer turnaround; miss the timer and lose the full-flight bonus.' },
  boarding: { name: 'Faster boarding', catch: 'Jet bridges and agents. Only pays while passengers are waiting.' },
  terminal: { name: 'Bigger terminal', catch: 'More arrivals and lounge seats. Only pays if security and the gates keep up.' },
  security: { name: 'Security lanes', catch: 'A faster, longer line. Only pays while people are queuing.' },
  route: { name: 'Better routes', catch: 'Higher fares; needs planes as big as its level. Passport control slows security.' },
  crew: { name: 'Ground crew', catch: 'Shorter turnaround. Worth most with small planes that fill fast.' },
  night: { name: 'Night shift', catch: 'Keeps the airport running longer while you are away. Earns nothing while you play.' },
};

/** The boost bar's order (RULES 15). What each does, with its numbers: rules.ts `boostEffect`. */
export const BOOST_IDS: readonly BoostId[] = ['rushHour', 'allHands', 'surge'];

export const BOOST_NAMES: Readonly<Record<BoostId, string>> = {
  rushHour: 'Rush hour',
  allHands: 'All hands',
  surge: 'Fare surge',
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

/**
 * The checkpoints on the passenger journey (RULES 14), in walking order, each
 * shown from the route level that needs it: international routes (Continental
 * on) add passport control and customs, transoceanic ones (Transatlantic on)
 * add preclearance. Security is the real queue (RULES 3); the departure
 * checkpoints marked `slowsSecurity` slow it by `intlCheckBp` each. The rest
 * are scenery.
 */
export const CHECKPOINTS: readonly { readonly way: 'departures' | 'arrivals'; readonly fromRoute: number; readonly slowsSecurity: boolean; readonly view: CheckpointView }[] = [
  { way: 'departures', fromRoute: 0, slowsSecurity: false, view: { id: 'checkin', name: 'Check-in', label: 'Check-in' } },
  { way: 'departures', fromRoute: 0, slowsSecurity: false, view: { id: 'security', name: 'Security', label: 'Security' } },
  { way: 'departures', fromRoute: 5, slowsSecurity: true, view: { id: 'passport', name: 'Passport control', label: 'Passport' } },
  { way: 'departures', fromRoute: 6, slowsSecurity: true, view: { id: 'preclearance', name: 'Preclearance', label: 'Preclearance' } },
  { way: 'arrivals', fromRoute: 5, slowsSecurity: false, view: { id: 'passport', name: 'Passport control', label: 'Passport' } },
  { way: 'arrivals', fromRoute: 0, slowsSecurity: false, view: { id: 'baggage', name: 'Baggage claim', label: 'Baggage' } },
  { way: 'arrivals', fromRoute: 5, slowsSecurity: false, view: { id: 'customs', name: 'Customs', label: 'Customs' } },
];

/** The journey at this route level. */
export function journeyAt(route: number): JourneyView {
  const on = (way: 'departures' | 'arrivals'): CheckpointView[] => CHECKPOINTS.filter((c) => c.way === way && route >= c.fromRoute).map((c) => c.view);
  return { departures: on('departures'), arrivals: on('arrivals') };
}

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
