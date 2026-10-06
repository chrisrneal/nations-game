import type { BoostId, CheckpointView, JourneyView, UpgradeId } from '@warehouse/contracts';

/**
 * Design data: names and words, no balance numbers (those are tunables).
 * Lives in the sim, like the rules, so the interface shows what the rules say.
 */

/** The upgrade sheet's order. */
export const UPGRADE_IDS: readonly UpgradeId[] = ['docks', 'truck', 'loading', 'sales', 'picking', 'contract', 'crew', 'night'];

export const UPGRADE_TEXT: Readonly<Record<UpgradeId, { name: string; catch: string }>> = {
  docks: { name: 'More docks', catch: 'Docks share the same passengers: with a small sales, trucks leave emptier.' },
  truck: { name: 'Bigger trucks', catch: 'Slower to fill, longer turnaround; miss the timer and lose the full-shipment bonus.' },
  loading: { name: 'Faster loading', catch: 'Jet bridges and agents. Only pays while passengers are staged.' },
  sales: { name: 'Bigger sales', catch: 'More arrivals and staging parcels. Only pays if picking and the docks keep up.' },
  picking: { name: 'Picking lanes', catch: 'A faster, longer line. Only pays while people are queuing.' },
  contract: { name: 'Better contracts', catch: 'Higher pays; needs trucks as big as its level. Passport control slows picking.' },
  crew: { name: 'Ground crew', catch: 'Shorter turnaround. Worth most with small trucks that fill fast.' },
  night: { name: 'Night shift', catch: 'Keeps the warehouse running longer while you are away. Earns nothing while you play.' },
};

/** The boost bar's order (RULES 15). What each does, with its numbers: rules.ts `boostEffect`. */
export const BOOST_IDS: readonly BoostId[] = ['flashSale', 'allHands', 'surge'];

export const BOOST_NAMES: Readonly<Record<BoostId, string>> = {
  flashSale: 'Rush hour',
  allHands: 'All hands',
  surge: 'Pay surge',
};

/** Truck models by truck level. */
export const TRUCK_MODELS: readonly string[] = [
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

/** Contracts by contract level. */
export const CONTRACTS: readonly string[] = [
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
 * shown from the contract level that needs it: international contracts (Continental
 * on) add passport control and customs, transoceanic ones (Transatlantic on)
 * add preclearance. Picking is the real queue (RULES 3); the departure
 * checkpoints marked `slowsPicking` slow it by `exportCheckBp` each. The rest
 * are scenery.
 */
export const CHECKPOINTS: readonly { readonly way: 'departures' | 'arrivals'; readonly fromContract: number; readonly slowsPicking: boolean; readonly view: CheckpointView }[] = [
  { way: 'departures', fromContract: 0, slowsPicking: false, view: { id: 'checkin', name: 'Check-in', label: 'Check-in' } },
  { way: 'departures', fromContract: 0, slowsPicking: false, view: { id: 'picking', name: 'Picking', label: 'Picking' } },
  { way: 'departures', fromContract: 5, slowsPicking: true, view: { id: 'passport', name: 'Passport control', label: 'Passport' } },
  { way: 'departures', fromContract: 6, slowsPicking: true, view: { id: 'preclearance', name: 'Preclearance', label: 'Preclearance' } },
  { way: 'arrivals', fromContract: 5, slowsPicking: false, view: { id: 'passport', name: 'Passport control', label: 'Passport' } },
  { way: 'arrivals', fromContract: 0, slowsPicking: false, view: { id: 'baggage', name: 'Baggage claim', label: 'Baggage' } },
  { way: 'arrivals', fromContract: 5, slowsPicking: false, view: { id: 'customs', name: 'Customs', label: 'Customs' } },
];

/** The journey at this contract level. */
export function journeyAt(contract: number): JourneyView {
  const on = (way: 'departures' | 'arrivals'): CheckpointView[] => CHECKPOINTS.filter((c) => c.way === way && contract >= c.fromContract).map((c) => c.view);
  return { departures: on('departures'), arrivals: on('arrivals') };
}

export type SiteTwist = 'none' | 'narrowYard' | 'crossdock' | 'waves';

export interface Site {
  readonly name: string;
  readonly twist: SiteTwist;
}

/** Cities in the order warehouses are opened (RULES 10); they repeat after the last. Twist words: rules.ts `twistText`. */
export const SITES: readonly Site[] = [
  { name: 'Millbrook', twist: 'none' },
  { name: 'Port Calder', twist: 'narrowYard' },
  { name: 'Highmoor Hub', twist: 'crossdock' },
  { name: 'Sunvale', twist: 'waves' },
];

const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

/** The site for the warehouse opened after `sold` sales. */
export function siteAt(sold: number): Site & { readonly label: string } {
  const site = SITES[sold % SITES.length] as Site;
  const round = Math.floor(sold / SITES.length);
  const suffix = ROMAN[round] ?? ` ${round + 1}`;
  return { ...site, label: `${site.name}${suffix}` };
}

export function nameAt(list: readonly string[], level: number): string {
  return list[Math.min(level, list.length - 1)] ?? '';
}
