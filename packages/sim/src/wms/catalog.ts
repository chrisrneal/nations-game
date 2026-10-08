/**
 * Design data for the WMS (docs/wms-plan.md): the SKUs it stocks, the
 * countries its customers ship to, and how numbers in State are shown as
 * codes (O-10234, GRN-0042, A-03-2B). Not balance numbers: those are the
 * `wms*` tunables.
 */

export interface WmsSku {
  /** Shown code, e.g. GRN-0042. */
  readonly code: string;
  readonly desc: string;
}

export interface WmsDestination {
  /** ISO 3166-1 alpha-3. */
  readonly iso: string;
  readonly flag: string;
  readonly name: string;
}

/**
 * A product family: five sizes or kinds of one product, each its own SKU (W11).
 * The first is the SKU the warehouse stocked before W11; the rest number on
 * from it in hundreds (GRN-0042, GRN-0142, ...).
 */
interface WmsFamily {
  readonly prefix: string;
  readonly no: number;
  readonly kinds: readonly [string, string, string, string, string];
}

/** What the warehouse ships in 2030: food, energy, health and tech, sixteen families of five. */
const WMS_FAMILIES: readonly WmsFamily[] = [
  { prefix: 'GRN', no: 42, kinds: ['Wheat grain 25 kg', 'Wheat grain 50 kg', 'Barley 25 kg', 'Maize 25 kg', 'Oats 25 kg'] },
  { prefix: 'RCE', no: 25, kinds: ['Rice 25 kg', 'Rice 10 kg', 'Basmati rice 25 kg', 'Jasmine rice 10 kg', 'Rice flour 25 kg'] },
  { prefix: 'FRT', no: 91, kinds: ['Fertiliser 50 kg', 'Fertiliser 25 kg', 'Potash 50 kg', 'Urea 50 kg', 'Compost 40 L'] },
  { prefix: 'CFE', no: 60, kinds: ['Coffee beans 60 kg', 'Coffee beans 10 kg', 'Ground coffee 5 kg', 'Cocoa beans 60 kg', 'Tea chest 40 kg'] },
  { prefix: 'STL', no: 310, kinds: ['Steel rebar bundle', 'Steel beam 6 m', 'Steel mesh sheet', 'Steel pipe 3 m', 'Fixings box, steel'] },
  { prefix: 'CPR', no: 64, kinds: ['Copper cable drum', 'Copper pipe 3 m', 'Copper sheet', 'Copper wire coil', 'Busbar set'] },
  { prefix: 'LIT', no: 119, kinds: ['Lithium carbonate drum', 'Lithium hydroxide drum', 'Cathode powder drum', 'Electrolyte drum', 'Graphite bag 25 kg'] },
  { prefix: 'LNG', no: 7, kinds: ['LNG valve assembly', 'LNG hose 10 m', 'Pressure gauge set', 'Flange gasket kit', 'Regulator unit'] },
  { prefix: 'SOL', no: 450, kinds: ['Solar panel 450 W', 'Solar panel 300 W', 'Solar inverter 5 kW', 'Panel mounting kit', 'Solar cable 50 m'] },
  { prefix: 'BAT', no: 880, kinds: ['Battery module 5 kWh', 'Battery module 10 kWh', 'Battery rack', 'Charge controller', 'Battery cable set'] },
  { prefix: 'CHP', no: 2030, kinds: ['AI accelerator chips', 'Memory modules, tray', 'Network cards, box', 'Server board', 'Fibre transceivers'] },
  { prefix: 'MED', no: 1187, kinds: ['Medical supply kit', 'Surgical gloves, case', 'Face masks, case', 'Wound dressings, box', 'Syringes, case'] },
  { prefix: 'VAC', no: 12, kinds: ['Vaccine cold box', 'Vaccine carrier', 'Ice pack set', 'Cold chain logger', 'Vial tray, box'] },
  { prefix: 'PHM', no: 442, kinds: ['Insulin pens, box', 'Antibiotics, box', 'Pain relief, case', 'Rehydration salts, case', 'Test strips, box'] },
  { prefix: 'H2O', no: 200, kinds: ['Water filter cartridge', 'Water filter unit', 'Purification tablets', 'Water tank 1000 L', 'Water pump'] },
  { prefix: 'TXT', no: 315, kinds: ['Cotton textile roll', 'Polyester roll', 'Canvas roll', 'Wool bale', 'Thread cones, box'] },
];

/**
 * Every SKU the warehouse stocks (W11: 80, one per bay; 16 before). SKU `i`
 * is kind `floor(i / 16)` of family `i % 16`, so SKUs 0-15 are the sixteen
 * the warehouse stocked before W11, and every aisle holds some of each kind.
 */
export const WMS_SKUS: readonly WmsSku[] = Array.from({ length: WMS_FAMILIES.length * 5 }, (_, i) => {
  const family = WMS_FAMILIES[i % WMS_FAMILIES.length] as WmsFamily;
  const kind = Math.floor(i / WMS_FAMILIES.length);
  return { code: `${family.prefix}-${String(family.no + 100 * kind).padStart(4, '0')}`, desc: family.kinds[kind] as string };
});

/** The family a SKU belongs to (W11): 0-15. */
export function familyOf(sku: number): number {
  return sku % WMS_FAMILIES.length;
}

/** Countries the customers ship to. */
export const WMS_DESTINATIONS: readonly WmsDestination[] = [
  { iso: 'DEU', flag: '🇩🇪', name: 'Germany' },
  { iso: 'FRA', flag: '🇫🇷', name: 'France' },
  { iso: 'GBR', flag: '🇬🇧', name: 'United Kingdom' },
  { iso: 'USA', flag: '🇺🇸', name: 'United States' },
  { iso: 'CAN', flag: '🇨🇦', name: 'Canada' },
  { iso: 'MEX', flag: '🇲🇽', name: 'Mexico' },
  { iso: 'BRA', flag: '🇧🇷', name: 'Brazil' },
  { iso: 'JPN', flag: '🇯🇵', name: 'Japan' },
  { iso: 'KOR', flag: '🇰🇷', name: 'South Korea' },
  { iso: 'IND', flag: '🇮🇳', name: 'India' },
  { iso: 'IDN', flag: '🇮🇩', name: 'Indonesia' },
  { iso: 'NGA', flag: '🇳🇬', name: 'Nigeria' },
  { iso: 'KEN', flag: '🇰🇪', name: 'Kenya' },
  { iso: 'ZAF', flag: '🇿🇦', name: 'South Africa' },
  { iso: 'AUS', flag: '🇦🇺', name: 'Australia' },
];

/** A supplier the WMS buys from (W6), and the SKUs it supplies. */
export interface WmsSupplier {
  readonly name: string;
  readonly skus: readonly number[];
}

/** The families each supplier makes (W6): a supplier supplies every SKU of its families (W11). */
const WMS_SUPPLIER_FAMILIES: readonly (readonly [string, readonly number[]])[] = [
  ['Prairie Grain', [0, 1, 2, 3]],
  ['Nordic Steel', [4, 5]],
  ['Andes Energy', [6, 7]],
  ['SunGrid', [8, 9]],
  ['Silicon Fdry', [10]],
  ['MedLine', [11, 12, 13]],
  ['ClearFlow', [14]],
  ['Delta Cotton', [15]],
];

/** Every SKU has exactly one supplier; a planning run raises at most one PO per supplier. */
export const WMS_SUPPLIERS: readonly WmsSupplier[] = WMS_SUPPLIER_FAMILIES.map(([name, families]) => ({
  name,
  skus: WMS_SKUS.map((_, sku) => sku).filter((sku) => families.includes(familyOf(sku))),
}));

export function supplierAt(index: number): WmsSupplier {
  return WMS_SUPPLIERS[index % WMS_SUPPLIERS.length] as WmsSupplier;
}

/** The customers who order (W8): each order names one. */
export const WMS_CUSTOMERS: readonly string[] = ['Local shops', 'City grocer', 'Regional chain', 'Health network', 'Solar installers', 'Export broker', 'Online market', 'Everything store'];

export function customerAt(index: number): string {
  return WMS_CUSTOMERS[index % WMS_CUSTOMERS.length] as string;
}

/** The first PO number a warehouse issues (W6). */
export const WMS_FIRST_PO_NO = 50_001;

export function poCode(no: number): string {
  return `PO-${no}`;
}

/** The first order number a warehouse issues. */
export const WMS_FIRST_ORDER_NO = 10_234;

/** Bins in a bay (two positions on four levels): bin `8b + k` is position `k` of bay `b` counted across the aisles (W11: a SKU a bay). */
export const WMS_BINS_PER_BAY = 8;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function orderCode(no: number): string {
  return `O-${no}`;
}

export function skuAt(index: number): WmsSku {
  return WMS_SKUS[index % WMS_SKUS.length] as WmsSku;
}

export function destinationAt(index: number): WmsDestination {
  return WMS_DESTINATIONS[index % WMS_DESTINATIONS.length] as WmsDestination;
}

/** Bin index as aisle-bay-level+position: 0 is A-01-1A, 1 A-01-1B, 2 A-01-2A, 8 A-02-1A, 160 B-01-1A. */
export function binCode(index: number): string {
  const position = LETTERS[index % 2];
  const level = (Math.floor(index / 2) % 4) + 1;
  const bay = (Math.floor(index / 8) % 20) + 1;
  const aisle = LETTERS[Math.floor(index / 160) % LETTERS.length];
  return `${aisle}-${String(bay).padStart(2, '0')}-${level}${position}`;
}

/** Aisles of bins (A-D): bin 160a-160a+159 is in aisle a. */
export const WMS_AISLES = 4;
export const WMS_BINS_PER_AISLE = 160;
/** Bays down each aisle (01-20). */
export const WMS_BAYS = 20;
/** Bays' worth of walking from one aisle's walkway to the next along the front cross aisle (W7). */
export const WMS_AISLE_GAP_BAYS = 3;

/** Bays' worth of walking from one outbound door to the next along the shipping dock (W10). */
export const WMS_SHIP_DOOR_BAYS = 2;

/** Where a worker stands at outbound door `door` (W10): -10 - door, so -11 is S1. */
export function shipDoorAt(door: number): number {
  return -10 - door;
}

/** The outbound door a spot is at (W10), or 0 if it is not one. */
export function shipDoorOf(at: number): number {
  return at <= -11 ? -10 - at : 0;
}

/**
 * Where a bin is (W7): its aisle (0 = A) and bay (1-20); -1, the pick-and-drop
 * point, is at the front of aisle A (bay 0); an outbound door (W10) is past
 * the front of the last aisle.
 */
export function binPlace(bin: number): { readonly aisle: number; readonly bay: number } {
  if (shipDoorOf(bin) > 0) return { aisle: WMS_AISLES - 1, bay: 0 };
  if (bin < 0) return { aisle: 0, bay: 0 };
  return { aisle: Math.floor(bin / WMS_BINS_PER_AISLE) % WMS_AISLES, bay: (Math.floor(bin / 8) % WMS_BAYS) + 1 };
}

/**
 * Bays a picker walks between two bins (RULES 16, W7): along the aisle if
 * both are in it, else out to the front cross aisle, across, and in again.
 * -1 is the pick-and-drop point at the front of aisle A. The outbound doors
 * (W10) are down the front cross aisle past the last aisle, then along the
 * shipping dock, `WMS_SHIP_DOOR_BAYS` a door.
 */
export function travelBays(from: number, to: number): number {
  const da = shipDoorOf(from);
  const db = shipDoorOf(to);
  if (da > 0 && db > 0) return Math.abs(da - db) * WMS_SHIP_DOOR_BAYS;
  if (da > 0 || db > 0) {
    const bin = da > 0 ? to : from;
    return bayOf(bin) + WMS_AISLE_GAP_BAYS * (WMS_AISLES - aisleOf(bin)) + (da > 0 ? da : db) * WMS_SHIP_DOOR_BAYS;
  }
  const aa = aisleOf(from);
  const ab = aisleOf(to);
  if (aa === ab) return Math.abs(bayOf(from) - bayOf(to));
  return bayOf(from) + bayOf(to) + WMS_AISLE_GAP_BAYS * Math.abs(aa - ab);
}

/** `binPlace` without the object (W10: the nearest-bin plan measures hundreds of walks a step). The pick-and-drop point (-1) is aisle A, bay 0. */
function aisleOf(bin: number): number {
  return bin < 0 ? 0 : Math.floor(bin / WMS_BINS_PER_AISLE) % WMS_AISLES;
}

function bayOf(bin: number): number {
  return bin < 0 ? 0 : (Math.floor(bin / 8) % WMS_BAYS) + 1;
}

/** An outbound door's name (W10): S1, S2, ... */
export function shipDoorCode(door: number): string {
  return `S${door}`;
}

/** A trailer's number as shown (W10): TR-0042. */
export function trailerCode(no: number): string {
  return `TR-${String(no).padStart(4, '0')}`;
}

/**
 * Finds a record by its number in an array kept in ascending number order
 * (orders, POs and tasks are only ever appended in number order and filtered),
 * by halving (W10: a busy warehouse holds hundreds of tasks).
 */
export function byNo<V extends { readonly no: number }>(list: readonly V[], no: number): V | undefined {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = list[mid] as V;
    if (v.no === no) return v;
    if (v.no < no) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/** A worker's name (W8): W01, W02, ... */
export function workerCode(id: number): string {
  return `W${String(id).padStart(2, '0')}`;
}

/** A task's number as shown (W8): T-00042. */
export function taskCode(no: number): string {
  return `T-${String(no).padStart(5, '0')}`;
}

/** Lines per hour is measured over this many buckets of `WMS_RATE_BUCKET_TICKS` (16 x 15 s = 4 minutes). */
export const WMS_RATE_BUCKETS = 16;
export const WMS_RATE_BUCKET_TICKS = 60;

/** Statuses after which nothing more happens to an order. */
export function isClosed(status: string): boolean {
  return status === 'SHIPPED' || status === 'CANCELLED';
}
