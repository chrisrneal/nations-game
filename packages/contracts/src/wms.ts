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
  | 'EXPEDITE'
  // Inbound (W6): `order` holds the PO number, `picker` the receiver.
  | 'PO CRT'
  | 'ARRIVE'
  | 'PO LATE'
  | 'DOCK'
  | 'RCV'
  | 'RCV SHORT'
  | 'DAMAGE'
  | 'PUTAWAY'
  | 'PO CLOSE'
  // Inventory (W6).
  | 'CYCLE CNT'
  | 'ADJUST'
  // The operating plan (W7): `line` is the setting (1 pick order, 2 release, 3 crew), `qty` its new value.
  | 'PLAN';

/**
 * How idle pickers choose their next line (W7): best priority then earliest
 * ship-by (the WMS's own rule), earliest ship-by then priority, or the
 * nearest bin to where the picker stands.
 */
export type WmsPickRule = 'priority' | 'cutoff' | 'nearest';

/** How NEW orders are released to the floor (W7): in timed waves, each as it arrives, or only by hand. */
export type WmsReleaseMode = 'waves' | 'continuous' | 'manual';

/** The operating plan the player sets (W7): decisions the WMS otherwise makes itself. */
export interface WmsPolicy {
  readonly pick: WmsPickRule;
  readonly release: WmsReleaseMode;
  /** Pickers out of the crew; the rest of the crew receive. */
  readonly pickers: number;
}

/** Purchase order statuses (W6): on the road, in the yard waiting for a door, at a door being received, being put away, done. */
export type WmsPoStatus = 'IN TRANSIT' | 'ARRIVED' | 'RECEIVING' | 'PUTAWAY' | 'CLOSED';

/** A PO line: not yet received, under a receiver, received and waiting for put-away, in its bin. */
export type WmsPoLineStatus = 'OPEN' | 'RECEIVING' | 'RECEIVED' | 'STORED';

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
  /** Units picked out of the bin since the warehouse opened (W6): how fast it moves. */
  readonly picked: number;
  /** Tick of its last cycle count; -1 if never counted (W6). */
  readonly counted: number;
  /** Net units cycle counts have added (+) or written off (-) since opening (W6). */
  readonly variance: number;
}

/** One line of a purchase order (W6): one SKU, put away into its bin. */
export interface WmsPoLine {
  /** 1-based within its PO. */
  readonly no: number;
  readonly sku: number;
  readonly bin: number;
  /** Units ordered from the supplier. */
  readonly expected: number;
  /** Good units counted in at the dock (live while a receiver works the line). */
  readonly received: number;
  /** Units that arrived damaged: written off, never put away. */
  readonly damaged: number;
  /** Units the supplier did not send. */
  readonly short: number;
  readonly status: WmsPoLineStatus;
  /** Tick the received units reach the bin; 0 while not received. */
  readonly putAt: number;
}

/** A purchase order to a supplier (W6), raised by the WMS's reorder planning. */
export interface WmsPo {
  /** Sequential PO number (shown PO-50001). */
  readonly no: number;
  /** Index into the supplier catalog. */
  readonly supplier: number;
  readonly status: WmsPoStatus;
  readonly lines: readonly WmsPoLine[];
  readonly created: number;
  /** The tick the supplier promised. */
  readonly eta: number;
  /** The tick the truck really arrives (drawn when the PO is raised; the screens show only `eta`). */
  readonly arrive: number;
  /** Tick it arrived; 0 while in transit. */
  readonly arrived: number;
  /** Dock door it was received at (1-based); 0 before it docks. */
  readonly door: number;
  /** Tick its last line was put away; 0 while open. */
  readonly closed: number;
  /** Its ETA passed before it arrived (PO LATE was logged). */
  readonly late: boolean;
}

export interface WmsReceiver {
  /** 1-based (shown Rcvr 01). */
  readonly id: number;
  /** PO number and line it is receiving; both 0 while idle. */
  readonly po: number;
  readonly line: number;
  /** Milli-units counted so far on the current line. */
  readonly progress: number;
}

/** Inbound and inventory totals since the warehouse opened (W6). */
export interface WmsInboundStats {
  readonly posClosed: number;
  readonly posLate: number;
  readonly unitsReceived: number;
  readonly unitsDamaged: number;
  readonly unitsShort: number;
  readonly counts: number;
  /** Cycle counts that matched the system. */
  readonly countsAccurate: number;
}

export interface WmsPicker {
  /** 1-based (shown Picker 01). */
  readonly id: number;
  /** Order number and line number being picked; both 0 while idle. */
  readonly order: number;
  readonly line: number;
  /** Milli-units picked so far on the current line. */
  readonly progress: number;
  /** The bin it stands at, or walks to (W7); -1 at the pick-and-drop point by the conveyor. */
  readonly at: number;
  /** Ticks of walking left before it reaches `at` and starts picking (W7). */
  readonly walk: number;
}

/** One line of the activity log. The message is built by the View from these fields. */
export interface WmsEvent {
  readonly tick: number;
  readonly code: WmsEventCode;
  /** Order (or, for an inbound code, PO) and line numbers it refers to; 0 for none. */
  readonly order: number;
  readonly line: number;
  /** SKU index it refers to; -1 for none. */
  readonly sku: number;
  /** Units involved (picked, allocated, short, replenished), or the wave or priority it names; 0 for none. */
  readonly qty: number;
  /** Out of how many (PICK CONF 24/24); 0 for none. */
  readonly of: number;
  /** Picker id (receiver id for an inbound code); 0 for none. */
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
  /** Inbound (W6): purchase orders, open first then the latest closed, and the receiving crew. */
  readonly nextPoNo: number;
  readonly pos: readonly WmsPo[];
  readonly receivers: readonly WmsReceiver[];
  /** Inventory (W6): the next cycle count's tick and the SKU it counts. */
  readonly nextCountAt: number;
  readonly countCursor: number;
  readonly inbound: WmsInboundStats;
  /** Units received in each rate bucket, like `recent`. */
  readonly recentIn: readonly number[];
  /** The player's operating plan (W7). */
  readonly policy: WmsPolicy;
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
  | { readonly action: 'expedite'; readonly order: number }
  | { readonly action: 'policy'; readonly policy: WmsPolicy };

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
  /** PO number to open on a tap (W6); 0 for none. */
  readonly po: number;
  /** e.g. O-10234/L3, PO-50001/L2, or a SKU for REPLEN and counts, or '' */
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
  /** Bin index it stands at or walks to; -1 at the pick-and-drop point (W7). */
  readonly at: number;
  /** Where that is on the floor (W7): aisle (0 = A) and bay (1-20; 0 the front cross aisle). */
  readonly aisle: number;
  readonly bay: number;
  /** Ticks of walking left (W7). */
  readonly walk: number;
  /** Units picked so far and units to pick on its line; 0 when idle. */
  readonly picked: number;
  readonly units: number;
  /** Its order's priority; 0 when idle. */
  readonly priority: number;
}

/** A receiver on the floor (W7): the PO line it counts in, at which dock door. */
export interface WmsReceiverView {
  readonly id: number;
  /** PO and line; both 0 while idle. */
  readonly po: number;
  readonly line: number;
  /** Dock door (1-based) of its PO; 0 while idle. */
  readonly door: number;
  readonly received: number;
  readonly expected: number;
}

/** A destination country's record (slice 8). */
export interface WmsCountryView extends WmsDestView {
  readonly shipped: number;
  readonly otif: number;
  readonly otifPct: number | null;
  readonly goodwill: number;
}

/** One PO line, ready to show (W6). */
export interface WmsPoLineView {
  readonly no: number;
  readonly sku: string;
  readonly desc: string;
  readonly bin: string;
  readonly expected: number;
  readonly received: number;
  readonly damaged: number;
  readonly short: number;
  readonly status: WmsPoLineStatus;
  /** The receiver on it now; 0 for none. */
  readonly receiver: number;
  /** Where its bin is on the floor (W7), and the tick its units reach the bin (0 while not received). */
  readonly aisle: number;
  readonly bay: number;
  readonly putAt: number;
}

/** One row of the inbound grid (W6), with its lines for the PO detail. */
export interface WmsPoView {
  readonly no: number;
  /** e.g. PO-50001. */
  readonly code: string;
  readonly supplier: string;
  readonly status: WmsPoStatus;
  readonly created: number;
  readonly eta: number;
  readonly arrived: number;
  readonly closed: number;
  readonly late: boolean;
  readonly door: number;
  readonly linesTotal: number;
  /** Lines counted in (received or stored). */
  readonly linesReceived: number;
  readonly unitsExpected: number;
  readonly unitsReceived: number;
  readonly unitsDamaged: number;
  readonly unitsShort: number;
  /** Units received as a whole percentage of units expected, rounded down. */
  readonly pct: number;
  /** Late, short or damaged, while open. */
  readonly exception: boolean;
  readonly open: boolean;
  readonly lines: readonly WmsPoLineView[];
}

/** OK, LOW under the reorder point, OUT with nothing free, SHORT when order lines waiting for it need more than is free. */
export type WmsStockStatus = 'OK' | 'LOW' | 'OUT' | 'SHORT';

/** One SKU's row of the inventory grid (W6). */
export interface WmsStockView {
  /** SKU index. */
  readonly index: number;
  readonly sku: string;
  readonly desc: string;
  readonly bin: string;
  /** Where its bin is on the floor (W7): aisle (0 = A) and bay (1-20). */
  readonly aisle: number;
  readonly bay: number;
  readonly onHand: number;
  readonly allocated: number;
  readonly available: number;
  /** Units on open PO lines not yet counted in. */
  readonly onOrder: number;
  /** Units counted in at the dock, waiting for put-away. */
  readonly dock: number;
  /** Units order lines are waiting for (not yet allocated; NEW orders included). */
  readonly demand: number;
  readonly picked: number;
  readonly counted: number;
  readonly variance: number;
  readonly status: WmsStockStatus;
}

/** The inbound KPI strip (W6). */
export interface WmsInboundKpis {
  readonly open: number;
  readonly inTransit: number;
  /** In the yard or at a door. */
  readonly atDock: number;
  readonly doorsBusy: number;
  readonly doorsTotal: number;
  readonly receiversBusy: number;
  readonly receiversTotal: number;
  /** Good units counted in an hour, measured over the last few minutes. */
  readonly unitsPerHour: number;
  readonly exceptions: number;
  /** POs closed that arrived on time, as a whole %; null before any closes. */
  readonly onTimePct: number | null;
}

/** The inventory KPI strip (W6). */
export interface WmsInventoryKpis {
  readonly skus: number;
  readonly onHand: number;
  readonly available: number;
  readonly onOrder: number;
  /** SKUs LOW, OUT or SHORT. */
  readonly low: number;
  readonly short: number;
  /** Cycle counts that matched, as a whole %; null before the first count. */
  readonly accuracyPct: number | null;
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
  /** Inbound (W6): open POs first, oldest first, then closed ones, newest first. */
  readonly pos: readonly WmsPoView[];
  readonly inboundKpis: WmsInboundKpis;
  /** Inventory (W6): one row per SKU, in catalog order. */
  readonly stock: readonly WmsStockView[];
  readonly inventoryKpis: WmsInventoryKpis;
  /** The operating plan (W7), and the crew it splits between picking and receiving. */
  readonly policy: WmsPolicy;
  readonly crew: number;
  readonly receivers: readonly WmsReceiverView[];
  /** The floor's shape (W7): aisles, bays down each, bays of walking from one aisle to the next, dock doors. */
  readonly layout: { readonly aisles: number; readonly bays: number; readonly aisleGap: number; readonly doors: number };
}
