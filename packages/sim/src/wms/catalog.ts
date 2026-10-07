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
