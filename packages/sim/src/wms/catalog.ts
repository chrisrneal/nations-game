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

/** What the warehouse ships in 2030: food, energy, health and tech. */
export const WMS_SKUS: readonly WmsSku[] = [
  { code: 'GRN-0042', desc: 'Wheat grain 25 kg' },
  { code: 'RCE-0025', desc: 'Rice 25 kg' },
  { code: 'FRT-0091', desc: 'Fertiliser 50 kg' },
  { code: 'CFE-0060', desc: 'Coffee beans 60 kg' },
  { code: 'STL-0310', desc: 'Steel rebar bundle' },
  { code: 'CPR-0064', desc: 'Copper cable drum' },
  { code: 'LIT-0119', desc: 'Lithium carbonate drum' },
  { code: 'LNG-0007', desc: 'LNG valve assembly' },
  { code: 'SOL-0450', desc: 'Solar panel 450 W' },
  { code: 'BAT-0880', desc: 'Battery module 5 kWh' },
  { code: 'CHP-2030', desc: 'AI accelerator chips' },
  { code: 'MED-1187', desc: 'Medical supply kit' },
  { code: 'VAC-0012', desc: 'Vaccine cold box' },
  { code: 'PHM-0442', desc: 'Insulin pens, box' },
  { code: 'H2O-0200', desc: 'Water filter cartridge' },
  { code: 'TXT-0315', desc: 'Cotton textile roll' },
];

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

/** Every SKU has exactly one supplier; a planning run raises at most one PO per supplier. */
export const WMS_SUPPLIERS: readonly WmsSupplier[] = [
  { name: 'Prairie Grain', skus: [0, 1, 2, 3] },
  { name: 'Nordic Steel', skus: [4, 5] },
  { name: 'Andes Energy', skus: [6, 7] },
  { name: 'SunGrid', skus: [8, 9] },
  { name: 'Silicon Fdry', skus: [10] },
  { name: 'MedLine', skus: [11, 12, 13] },
  { name: 'ClearFlow', skus: [14] },
  { name: 'Delta Cotton', skus: [15] },
];

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

/** Bins reserved for each SKU's range, so SKUs spread over aisles A-D. */
export const WMS_BIN_SPREAD = 37;

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
    const p = binPlace(da > 0 ? to : from);
    return p.bay + WMS_AISLE_GAP_BAYS * (WMS_AISLES - p.aisle) + (da > 0 ? da : db) * WMS_SHIP_DOOR_BAYS;
  }
  const a = binPlace(from);
  const b = binPlace(to);
  if (a.aisle === b.aisle) return Math.abs(a.bay - b.bay);
  return a.bay + b.bay + WMS_AISLE_GAP_BAYS * Math.abs(a.aisle - b.aisle);
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
