import type { BoostId, CheckpointView, JourneyView, UpgradeId } from '@warehouse/contracts';

/**
 * Design data: names and words, no balance numbers (those are tunables).
 * Lives in the sim, like the rules, so the interface shows what the rules say.
 */

/** The upgrade sheet's order. */
export const UPGRADE_IDS: readonly UpgradeId[] = ['docks', 'truck', 'loading', 'sales', 'picking', 'receiving', 'contract', 'crew', 'night'];

export const UPGRADE_TEXT: Readonly<Record<UpgradeId, { name: string; catch: string }>> = {
  docks: { name: 'More docks', catch: 'Docks share the same orders: with few sales, trucks leave emptier.' },
  truck: { name: 'Bigger trucks', catch: 'Slower to fill, longer swaps; miss the timer and lose the full-truck bonus.' },
  loading: { name: 'Faster loading', catch: 'Forklifts and loaders. Only pays while packed orders wait at the docks.' },
  sales: { name: 'More sales', catch: 'More orders and packing space. Only pays if picking, stock and the docks keep up.' },
  picking: { name: 'More pickers', catch: 'Faster picking, and customers wait behind a longer backlog. Only pays while orders queue.' },
  receiving: { name: 'Receiving bay', catch: 'Faster put-away and more shelves. Only pays while the shelves run low.' },
  contract: { name: 'Better contracts', catch: 'More pay per order; needs trucks as big as its level. Export paperwork slows picking.' },
  crew: { name: 'Yard crew', catch: 'Faster truck swaps. Worth most with small trucks that fill fast.' },
  night: { name: 'Night shift', catch: 'Keeps the warehouse running longer while you are away. Earns nothing while you play.' },
};

/** The boost bar's order (RULES 15). What each does, with its numbers: rules.ts `boostEffect`. */
export const BOOST_IDS: readonly BoostId[] = ['flashSale', 'allHands', 'surge'];

export const BOOST_NAMES: Readonly<Record<BoostId, string>> = {
  flashSale: 'Flash sale',
  allHands: 'All hands',
  surge: 'Peak rates',
};

/** Truck models by truck level. */
export const TRUCK_MODELS: readonly string[] = [
  'Cargo bike',
  'Courier van',
  'Panel van',
  'Box truck',
  'Rigid truck',
  'Semi-trailer',
  'Double trailer',
  'Road train',
  'Mega road train',
  'Freight train',
  'Freight train II',
  'Freight train III',
  'Freight train IV',
];

/** Customer contracts by contract level. */
export const CONTRACTS: readonly string[] = [
  'Local shops',
  'Web shop',
  'Regional chain',
  'Supermarket group',
  'National retailer',
  'Cross-border',
  'Overseas',
  'Global brand',
  'Megastore',
  'Everything store',
  'Everything store+',
  'Everything store++',
  'Everything store+++',
];

/**
 * The stations goods pass through (RULES 14), in order, each shown from the
 * contract level that needs it: cross-border contracts (level 5 on) add export
 * paperwork, overseas ones (6 on) customs checks; each slows picking by
 * `exportCheckBp`. Picking is the real backlog (RULES 3) and receiving the real
 * inbound dock (RULES 3a); the order desk and quality check are scenery.
 */
export const CHECKPOINTS: readonly { readonly way: 'outbound' | 'inbound'; readonly fromContract: number; readonly slowsPicking: boolean; readonly view: CheckpointView }[] = [
  { way: 'outbound', fromContract: 0, slowsPicking: false, view: { id: 'desk', name: 'Order desk', label: 'Orders' } },
  { way: 'outbound', fromContract: 0, slowsPicking: false, view: { id: 'picking', name: 'Picking', label: 'Picking' } },
  { way: 'outbound', fromContract: 5, slowsPicking: true, view: { id: 'export', name: 'Export paperwork', label: 'Export' } },
  { way: 'outbound', fromContract: 6, slowsPicking: true, view: { id: 'customs', name: 'Customs checks', label: 'Customs' } },
  { way: 'inbound', fromContract: 0, slowsPicking: false, view: { id: 'receiving', name: 'Receiving', label: 'Receiving' } },
  { way: 'inbound', fromContract: 0, slowsPicking: false, view: { id: 'qc', name: 'Quality check', label: 'QC' } },
];

/** The stations at this contract level. */
export function journeyAt(contract: number): JourneyView {
  const on = (way: 'outbound' | 'inbound'): CheckpointView[] => CHECKPOINTS.filter((c) => c.way === way && contract >= c.fromContract).map((c) => c.view);
  return { outbound: on('outbound'), inbound: on('inbound') };
}

export type SiteTwist = 'none' | 'narrowYard' | 'crossdock' | 'waves';

export interface Site {
  readonly name: string;
  readonly twist: SiteTwist;
}

/** Sites in the order warehouses are opened (RULES 10); they repeat after the last. Twist words: rules.ts `twistText`. */
export const SITES: readonly Site[] = [
  { name: 'Millbrook Depot', twist: 'none' },
  { name: 'Port Calder Docks', twist: 'narrowYard' },
  { name: 'Highmoor Crossdock', twist: 'crossdock' },
  { name: 'Sunvale Outlet', twist: 'waves' },
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
