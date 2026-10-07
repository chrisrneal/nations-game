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

export type WmsLineStatus = 'OPEN' | 'ALLOCATED' | 'PICKING' | 'PICKED' | 'SHORT';

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
  | 'CUTOFF MISS';

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
  /** Units involved (ordered, allocated, picked or short); 0 for none. */
  readonly qty: number;
  /** Picker id; 0 for none. */
  readonly picker: number;
}

/** The WMS inside State: hashed, saved and replayed like everything else (S5, S9). */
export interface WmsState {
  /** Its own seeded stream, so the WMS never shifts the idle game's draws. */
  readonly rng: RngState;
  readonly nextOrderNo: number;
  readonly nextWave: number;
  readonly orders: readonly WmsOrder[];
  readonly inventory: readonly WmsStock[];
  readonly pickers: readonly WmsPicker[];
  /** The latest events, oldest first, at most `wmsEventsKept`. */
  readonly events: readonly WmsEvent[];
}

/** Debug counts for the WMS (slice 1); the grid screens replace it with richer views. */
export interface WmsSummaryView {
  readonly orders: number;
  readonly lines: number;
  readonly units: number;
  readonly skus: number;
  readonly pickers: number;
  readonly events: number;
}
