import type { RngState } from './state.ts';

/**
 * The warehouse management system (docs/wms-plan.md): key-account orders with
 * lines, bins, pickers and an activity log, managed by hand beside the idle
 * flow of RULES 3-5.
 *
 * Integers only (P3). Quantities are whole units; codes and names (O-10234,
 * GRN-0042, A-03-2B, a country's ISO code) are formatted from these numbers by
 * the sim's WMS catalog, so State stays small and hashable. Line counts,
 * units and % complete are derived in the View, never stored.
 */

/** Order statuses, in the order an order moves through them, then the exceptions. */
export type WmsOrderStatus =
  | 'NEW'
  | 'RELEASED'
  | 'ALLOCATED'
  | 'PICKING'
  | 'PICKED'
  | 'PACKED'
  | 'STAGED'
  | 'LOADED'
  | 'SHIPPED'
  | 'SHORT'
  | 'ON HOLD'
  | 'BACKORDER'
  | 'CANCELLED';

/** CANCELLED: the player cancelled the line (slice 7); it no longer counts towards the order. */
export type WmsLineStatus = 'OPEN' | 'ALLOCATED' | 'PICKING' | 'PICKED' | 'SHORT' | 'CANCELLED';

/** 1 Expedite, 2 High, 3 Standard. */
export type WmsPriority = 1 | 2 | 3;

export type WmsEventCode =
  | 'ORD CRT'
  | 'WAVE REL'
  | 'ALLOC'
  | 'ALLOC SHORT'
  | 'PICK START'
  | 'PICK CONF'
  | 'SHORT PICK'
  | 'PACK'
  | 'STAGE'
  | 'LOAD'
  | 'SHIP'
  | 'HOLD'
  | 'UNHOLD'
  | 'CUTOFF MISS'
  | 'REPLEN'
  | 'PRIO'
  | 'ASSIGN'
  | 'CANCEL'
  | 'EXPEDITE';

export interface WmsLine {
  /** 1-based within its order (shown L3). */
  readonly no: number;
  /** Index into the SKU catalog (shown GRN-0042). */
  readonly sku: number;
  /** Bin index (shown A-03-2B): where this line is picked from. */
  readonly bin: number;
  readonly ordered: number;
  readonly allocated: number;
  readonly picked: number;
  /** Units that could not be allocated or picked. */
  readonly short: number;
  readonly status: WmsLineStatus;
}

export interface WmsOrder {
  /** Sequential order number (shown O-10234). */
  readonly no: number;
  /** Index into the destination catalog: the customer's country. */
  readonly dest: number;
  /** The contract level of the customer account that placed it (Local shops = 0). */
  readonly source: number;
  readonly priority: WmsPriority;
  /** Wave it was released in; 0 while not released. */
  readonly wave: number;
  readonly status: WmsOrderStatus;
  readonly lines: readonly WmsLine[];
  /** Cutoff: the tick it must ship by. */
  readonly shipBy: number;
  readonly created: number;
  /** Tick of the next timed move (PICKED/SHORT to PACKED to STAGED to LOADED to SHIPPED); 0 for none. */
  readonly next: number;
  /** Its cutoff passed before it shipped (CUTOFF MISS was logged). */
  readonly late: boolean;
  /** The status it had before it was put ON HOLD; null when not held. */
  readonly held: WmsOrderStatus | null;
  /** Tick it shipped or was cancelled; 0 while open. */
  readonly closed: number;
  /** The player paid to expedite it (slice 7); an order is expedited at most once. */
  readonly expedited: boolean;
}

/** One SKU in one bin. Available = onHand - allocated. */
export interface WmsStock {
  readonly sku: number;
  readonly bin: number;
  readonly onHand: number;
  readonly allocated: number;
}

export interface WmsPicker {
  /** 1-based (shown Picker 01). */
  readonly id: number;
  /** Order number and line number being picked; both 0 while idle. */
  readonly order: number;
  readonly line: number;
  /** Milli-units picked so far on the current line. */
  readonly progress: number;
}

/** One line of the activity log. The message is built by the View from these fields. */
export interface WmsEvent {
  readonly tick: number;
  readonly code: WmsEventCode;
  /** Order and line numbers it refers to; 0 for none. */
  readonly order: number;
  readonly line: number;
  /** SKU index it refers to; -1 for none. */
  readonly sku: number;
  /** Units involved (picked, allocated, short, replenished), or the wave or priority it names; 0 for none. */
  readonly qty: number;
  /** Out of how many (PICK CONF 24/24); 0 for none. */
  readonly of: number;
  /** Picker id; 0 for none. */
  readonly picker: number;
}

/** Totals since the warehouse opened, for the KPI strip. */
export interface WmsStats {
  readonly shipped: number;
  readonly onTime: number;
  readonly inFull: number;
  /** Shipped on time and in full. */
  readonly otif: number;
  readonly linesPicked: number;
  readonly unitsOrdered: number;
  readonly unitsShipped: number;
  readonly cutoffMisses: number;
}

/** One destination country's record, in the order of the destination catalog. */
export interface WmsDestStats {
  readonly shipped: number;
  readonly otif: number;
  /** Customer goodwill, 0-100. */
  readonly goodwill: number;
}

/** The WMS inside State: hashed, saved and replayed like everything else (S5, S9). */
export interface WmsState {
  /** Its own seeded stream, so the WMS never shifts the idle game's draws. */
  readonly rng: RngState;
  readonly nextOrderNo: number;
  readonly nextWave: number;
  /** Ticks of the next automatic wave, new order and replenishment run. */
  readonly nextWaveAt: number;
  readonly nextOrderAt: number;
  readonly nextReplenAt: number;
  readonly orders: readonly WmsOrder[];
  readonly inventory: readonly WmsStock[];
  readonly pickers: readonly WmsPicker[];
  /** The latest events, oldest first, at most `wmsEventsKept`. */
  readonly events: readonly WmsEvent[];
  readonly stats: WmsStats;
  readonly dests: readonly WmsDestStats[];
  /** Lines confirmed in each of the last few rate buckets (a ring indexed by tick), for lines per hour. */
  readonly recent: readonly number[];
}

/**
 * What the player can do in the WMS (docs/wms-plan.md slice 7), the payload of
 * a `wms` command. Orders are named by number, pickers by id, lines by number.
 */
export type WmsAction =
  | { readonly action: 'release'; readonly orders: readonly number[] }
  | { readonly action: 'priority'; readonly order: number; readonly priority: WmsPriority }
  | { readonly action: 'hold'; readonly order: number }
  | { readonly action: 'unhold'; readonly order: number }
  | { readonly action: 'assign'; readonly picker: number; readonly order: number; readonly line: number }
  | { readonly action: 'cancelLine'; readonly order: number; readonly line: number }
  | { readonly action: 'expedite'; readonly order: number };

export type WmsActionName = WmsAction['action'];

/** A destination country as the screens show it. */
export interface WmsDestView {
  /** ISO 3166-1 alpha-3, e.g. DEU. */
  readonly iso: string;
  readonly flag: string;
  readonly name: string;
}

/** One order line, ready to show (slice 4). */
export interface WmsLineView {
  readonly no: number;
  /** e.g. GRN-0042. */
  readonly sku: string;
  readonly desc: string;
  /** e.g. A-03-2B. */
  readonly bin: string;
  readonly ordered: number;
  readonly allocated: number;
  readonly picked: number;
  readonly short: number;
  readonly status: WmsLineStatus;
  /** The picker on it now (shown Picker 07); 0 for none. */
  readonly picker: number;
}

/** One row of the order grid (slice 3), with its lines for the detail screen (slice 4). */
export interface WmsOrderView {
  readonly no: number;
  /** e.g. O-10234. */
  readonly code: string;
  readonly dest: WmsDestView;
  /** The customer account: the contract name it came from. */
  readonly source: string;
  readonly priority: WmsPriority;
  readonly wave: number;
  readonly status: WmsOrderStatus;
  readonly linesTotal: number;
  /** Lines done picking (picked, or confirmed short). */
  readonly linesPicked: number;
  readonly unitsOrdered: number;
  readonly unitsPicked: number;
  readonly shortUnits: number;
  /** Units picked as a whole percentage of units ordered, rounded down. */
  readonly pct: number;
  readonly shipBy: number;
  readonly created: number;
  readonly closed: number;
  readonly late: boolean;
  /** An exception: SHORT, ON HOLD, BACKORDER, short units, or late. */
  readonly exception: boolean;
  /** Not shipped or cancelled. */
  readonly open: boolean;
  readonly expedited: boolean;
  readonly lines: readonly WmsLineView[];
}

/** One line of the activity feed (slice 5), newest first. */
export interface WmsEventView {
  /** Unique within the feed: its position since the warehouse opened is not kept, so this is tick and index. */
  readonly key: string;
  readonly tick: number;
  readonly code: WmsEventCode;
  /** Order number to open on a tap; 0 for none. */
  readonly order: number;
  /** e.g. O-10234/L3, or a SKU for REPLEN, or '' */
  readonly ref: string;
  /** e.g. "GRN-0042  24/24  Picker 07". */
  readonly detail: string;
  /** Shown in red: shorts, cutoff misses, holds and cancellations. */
  readonly exception: boolean;
}

/** The KPI strip (slice 6). Percentages are whole numbers; null when nothing has shipped yet. */
export interface WmsKpis {
  readonly open: number;
  /** Lines confirmed an hour, measured over the last few minutes. */
  readonly linesPerHour: number;
  /** Units shipped as a % of units ordered on shipped orders. */
  readonly fillRatePct: number | null;
  readonly otifPct: number | null;
  readonly exceptions: number;
  readonly pickersBusy: number;
  readonly pickersTotal: number;
  readonly shipped: number;
}

export interface WmsPickerView {
  readonly id: number;
  /** Order and line it works; 0 when idle. */
  readonly order: number;
  readonly line: number;
}

/** A destination country's record (slice 8). */
export interface WmsCountryView extends WmsDestView {
  readonly shipped: number;
  readonly otif: number;
  readonly otifPct: number | null;
  readonly goodwill: number;
}

/** Everything the WMS screens read. */
export interface WmsView {
  /** Changes whenever the WMS steps, so the screens re-render only then. */
  readonly rev: number;
  /** Open orders first in order number, then closed ones, newest first. */
  readonly orders: readonly WmsOrderView[];
  readonly events: readonly WmsEventView[];
  readonly kpis: WmsKpis;
  readonly pickers: readonly WmsPickerView[];
  readonly countries: readonly WmsCountryView[];
  /** Ticks until the next automatic wave. */
  readonly nextWaveIn: number;
  /** Cents an expedite costs now (slice 7). */
  readonly expediteCost: number;
}
