import type { RngState } from './state.ts';

/**
 * The warehouse management system: the whole game since W8 (docs/RULES.md).
 * Customer orders with lines, bins, a crew of workers doing the tasks the WMS
 * creates for them, purchase orders booked into dock appointments, and an
 * activity log.
 *
 * Integers only (P3). Quantities are whole units; codes and names (O-10234,
 * GRN-0042, A-03-2B, T-00042, a country's ISO code) are formatted from these
 * numbers by the sim's WMS catalog, so State stays small and hashable. Line
 * counts, units and % complete are derived in the View, never stored.
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

/** CANCELLED: the player cancelled the line; it no longer counts towards the order. */
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
  | 'PRIO'
  | 'ASSIGN'
  | 'CANCEL'
  | 'EXPEDITE'
  // Inbound (W6): `order` holds the PO number, `picker` the worker.
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
  | 'PLAN'
  // The crew and the dock (W8): `qty` is the new crew or door count, `line` the role hired (1 pick, 2 receive).
  | 'HIRE'
  | 'DOOR'
  // Labour (W9): `picker` moved to `line`'s role (1 pick, 2 receive), `qty` tasks waiting there, `of` 1 when the WMS's balance moved them.
  | 'MOVE';

/**
 * How the WMS orders the pick tasks it hands out (W7): best priority then
 * earliest ship-by, earliest ship-by then priority, or the nearest bin to
 * where the picker will stand.
 */
export type WmsPickRule = 'priority' | 'cutoff' | 'nearest';

/** How NEW orders are released to the floor (W7): in timed waves, each as it arrives, or only by hand. */
export type WmsReleaseMode = 'waves' | 'continuous' | 'manual';

/**
 * How the crew is split between picking and receiving (W9): fixed where the
 * player puts people, or balanced by the WMS towards the work waiting.
 */
export type WmsLaborMode = 'fixed' | 'balance';

/** The operating plan the player sets (W7): decisions the WMS otherwise makes itself. */
export interface WmsPolicy {
  readonly pick: WmsPickRule;
  readonly release: WmsReleaseMode;
  /** Workers on picking; the rest of the crew receive and put away. */
  readonly pickers: number;
  /** Ticks between timed waves (W9). */
  readonly waveTicks: number;
  /** Whether the WMS moves people between picking and receiving by need (W9). */
  readonly labor: WmsLaborMode;
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
  /** Index into the customer catalog: who placed it (W8). */
  readonly customer: number;
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
  /** The player paid to expedite it; an order is expedited at most once. */
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
  /** Good units counted in at the dock (live while a worker counts the line). */
  readonly received: number;
  /** Units that arrived damaged: written off, never put away. */
  readonly damaged: number;
  /** Units the supplier did not send. */
  readonly short: number;
  readonly status: WmsPoLineStatus;
}

/** A purchase order to a supplier (W6), raised by the WMS's reorder planning and booked into a dock appointment (W8). */
export interface WmsPo {
  /** Sequential PO number (shown PO-50001). */
  readonly no: number;
  /** Index into the supplier catalog. */
  readonly supplier: number;
  readonly status: WmsPoStatus;
  readonly lines: readonly WmsPoLine[];
  readonly created: number;
  /** The dock appointment it was booked into (W8): the tick its slot starts. */
  readonly appt: number;
  /** The tick the truck really arrives (drawn when the PO is raised; the screens show only `appt`). */
  readonly arrive: number;
  /** Tick it arrived; 0 while in transit. */
  readonly arrived: number;
  /** Dock door it was received at (1-based); 0 before it docks. */
  readonly door: number;
  /** Tick its last line was put away; 0 while open. */
  readonly closed: number;
  /** Its appointment passed before it arrived (PO LATE was logged). */
  readonly late: boolean;
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

/** What a worker does (W8): pick orders, or receive trucks and put their stock away. */
export type WmsRole = 'pick' | 'receive';

/**
 * A task the WMS creates (W8): pick one order line from its bin, count one
 * PO line in at the dock, or take one received PO line to its bin.
 */
export type WmsTaskKind = 'PICK' | 'RECEIVE' | 'PUTAWAY';

/** OPEN waiting for a worker, QUEUED in a worker's plan, ACTIVE being worked, then DONE or CANCELLED. */
export type WmsTaskStatus = 'OPEN' | 'QUEUED' | 'ACTIVE' | 'DONE' | 'CANCELLED';

export interface WmsTask {
  /** Sequential task number (shown T-00042). */
  readonly no: number;
  readonly kind: WmsTaskKind;
  /** The order (PICK) or PO (RECEIVE, PUTAWAY) number, and its line. */
  readonly ref: number;
  readonly line: number;
  readonly sku: number;
  /** Where the work is: the line's bin; -1 for the dock (RECEIVE). */
  readonly bin: number;
  /** Units to pick, count in or put away. */
  readonly qty: number;
  /** Units done so far (picked, counted in, put away). */
  readonly done: number;
  readonly status: WmsTaskStatus;
  /** The worker it is queued for or worked by; 0 for none. */
  readonly worker: number;
  readonly created: number;
  /** Tick it went ACTIVE (0 before), and tick it was DONE or CANCELLED (0 before). */
  readonly started: number;
  readonly finished: number;
}

/** A worker's record since it was hired (W8), in ticks and things. */
export interface WmsWorkerStats {
  readonly tasks: number;
  readonly units: number;
  /** Ticks working at a bin or the dock, walking, and with no task. */
  readonly busy: number;
  readonly walking: number;
  readonly idle: number;
}

export interface WmsWorker {
  /** 1-based (shown W01). */
  readonly id: number;
  readonly role: WmsRole;
  /** Number of the task it is working on; 0 when it has none. */
  readonly task: number;
  /** Numbers of the tasks the WMS has lined up for it next, in order (W8). */
  readonly queue: readonly number[];
  /** Progress on the active task: milli-units picked or counted, or ticks spent putting away. */
  readonly progress: number;
  /** The bin it stands at or walks to; -1 at the dock and pick-and-drop point by the conveyor (W7). */
  readonly at: number;
  /** Ticks of walking left before it reaches `at` and starts work (W7). */
  readonly walk: number;
  readonly stats: WmsWorkerStats;
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
  /** Units involved (picked, allocated, short, received), or the wave or priority it names; 0 for none. */
  readonly qty: number;
  /** Out of how many (PICK CONF 24/24); 0 for none. */
  readonly of: number;
  /** Worker id; 0 for none. */
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
  /** Cents shipments have paid, and cents spent (expedites, hires, doors) (W8). */
  readonly earned: number;
  readonly spent: number;
}

/** One warehouse day's totals (W8): the day number (1 = the opening day) and what it did. */
export interface WmsDayStats {
  readonly day: number;
  readonly shipped: number;
  readonly otif: number;
  readonly earned: number;
  readonly linesPicked: number;
  readonly posReceived: number;
  readonly unitsReceived: number;
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
  /** Its seeded stream: every draw the warehouse makes. */
  readonly rng: RngState;
  readonly nextOrderNo: number;
  readonly nextWave: number;
  /** Ticks of the next automatic wave, new order and reorder planning run. */
  readonly nextWaveAt: number;
  readonly nextOrderAt: number;
  readonly nextReplenAt: number;
  readonly orders: readonly WmsOrder[];
  readonly inventory: readonly WmsStock[];
  /** The crew (W8): pickers and receivers, in id order. */
  readonly workers: readonly WmsWorker[];
  /** Open, queued and active tasks, then the latest done and cancelled (W8). */
  readonly tasks: readonly WmsTask[];
  readonly nextTaskNo: number;
  /** The latest events, oldest first, at most `wmsEventsKept`. */
  readonly events: readonly WmsEvent[];
  readonly stats: WmsStats;
  /** Today's totals, and yesterday's once a day has ended (W8). */
  readonly today: WmsDayStats;
  readonly yesterday: WmsDayStats | null;
  readonly dests: readonly WmsDestStats[];
  /** Lines confirmed in each of the last few rate buckets (a ring indexed by tick), for lines per hour. */
  readonly recent: readonly number[];
  /** Inbound (W6): purchase orders, open first then the latest closed. */
  readonly nextPoNo: number;
  readonly pos: readonly WmsPo[];
  /** Dock doors trucks are received at (W8: more can be bought). */
  readonly doors: number;
  /** Inventory (W6): the next cycle count's tick and the SKU it counts. */
  readonly nextCountAt: number;
  readonly countCursor: number;
  readonly inbound: WmsInboundStats;
  /** Units received in each rate bucket, like `recent`. */
  readonly recentIn: readonly number[];
  /** Cents earned in each rate bucket, like `recent` (W8). */
  readonly recentPay: readonly number[];
  /** The player's operating plan (W7). */
  readonly policy: WmsPolicy;
}

/**
 * What the player can do, the payload of a `wms` command. Orders are named
 * by number, workers by id, lines by number.
 */
export type WmsAction =
  | { readonly action: 'release'; readonly orders: readonly number[] }
  | { readonly action: 'priority'; readonly order: number; readonly priority: WmsPriority }
  | { readonly action: 'hold'; readonly order: number }
  | { readonly action: 'unhold'; readonly order: number }
  | { readonly action: 'assign'; readonly picker: number; readonly order: number; readonly line: number }
  | { readonly action: 'cancelLine'; readonly order: number; readonly line: number }
  | { readonly action: 'expedite'; readonly order: number }
  /** A plan change; settings left out keep their value (W9: saves from before the wave and labour settings replay unchanged). */
  | { readonly action: 'policy'; readonly policy: Pick<WmsPolicy, 'pick' | 'release' | 'pickers'> & Partial<WmsPolicy> }
  /** Move a worker to a role (W9); worker 0 lets the WMS choose who: the one with least in hand. */
  | { readonly action: 'role'; readonly worker: number; readonly role: WmsRole }
  | { readonly action: 'hire'; readonly role: WmsRole }
  | { readonly action: 'door' };

export type WmsActionName = WmsAction['action'];

/** A destination country as the screens show it. */
export interface WmsDestView {
  /** ISO 3166-1 alpha-3, e.g. DEU. */
  readonly iso: string;
  readonly flag: string;
  readonly name: string;
}

/** One order line, ready to show. */
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
  /** The worker picking it now; 0 for none. */
  readonly picker: number;
  /** Its pick task's number; 0 before it has one (W8). */
  readonly task: number;
}

/** One row of the order grid, with its lines for the detail screen. */
export interface WmsOrderView {
  readonly no: number;
  /** e.g. O-10234. */
  readonly code: string;
  readonly dest: WmsDestView;
  /** The customer that placed it. */
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

/** One line of the activity feed, newest first. */
export interface WmsEventView {
  /** Unique within the feed: tick, fields and a count. */
  readonly key: string;
  readonly tick: number;
  readonly code: WmsEventCode;
  /** Order number to open on a tap; 0 for none. */
  readonly order: number;
  /** PO number to open on a tap (W6); 0 for none. */
  readonly po: number;
  /** Worker to open on a tap (W8); 0 for none. */
  readonly worker: number;
  /** e.g. O-10234/L3, PO-50001/L2, or a SKU for counts, or '' */
  readonly ref: string;
  /** e.g. "GRN-0042  24/24  W07". */
  readonly detail: string;
  /** Shown in red: shorts, cutoff misses, holds and cancellations. */
  readonly exception: boolean;
}

/** The outbound KPI strip. Percentages are whole numbers; null when nothing has shipped yet. */
export interface WmsKpis {
  readonly open: number;
  /** Lines confirmed a warehouse hour (W8: a real minute), measured over the last few real minutes. */
  readonly linesPerHour: number;
  /** Units shipped as a % of units ordered on shipped orders. */
  readonly fillRatePct: number | null;
  readonly otifPct: number | null;
  readonly exceptions: number;
  readonly pickersBusy: number;
  readonly pickersTotal: number;
  readonly shipped: number;
  /** Cents earned a warehouse hour, measured over the last few minutes (W8). */
  readonly earnedPerHour: number;
}

/** A task, ready to show (W8). */
export interface WmsTaskView {
  readonly no: number;
  /** e.g. T-00042. */
  readonly code: string;
  readonly kind: WmsTaskKind;
  readonly status: WmsTaskStatus;
  /** The order (PICK) or PO (RECEIVE, PUTAWAY) it belongs to: its number to open and its code with the line (O-10234/L2). */
  readonly order: number;
  readonly po: number;
  readonly ref: string;
  readonly sku: string;
  readonly desc: string;
  /** Where: a bin code, or "Dock D2" for a receive task. */
  readonly where: string;
  readonly qty: number;
  readonly done: number;
  /** The order's priority for a pick task; 0 otherwise. */
  readonly priority: number;
  readonly worker: number;
  readonly created: number;
  readonly started: number;
  readonly finished: number;
}

/** What a worker is doing this second (W8). */
export type WmsWorkerState = 'idle' | 'walking' | 'working';

/** A worker on the floor and on the Crew page (W8). */
export interface WmsWorkerView {
  readonly id: number;
  /** e.g. W07. */
  readonly name: string;
  readonly role: WmsRole;
  readonly state: WmsWorkerState;
  /** The active task, and the ones lined up after it. */
  readonly task: WmsTaskView | null;
  readonly queue: readonly WmsTaskView[];
  /** The latest tasks it finished, newest first. */
  readonly done: readonly WmsTaskView[];
  /** Bin index it stands at or walks to; -1 at the dock (W7). */
  readonly at: number;
  /** Where that is on the floor: aisle (0 = A) and bay (1-20; 0 the front cross aisle). */
  readonly aisle: number;
  readonly bay: number;
  /** Ticks of walking left. */
  readonly walk: number;
  /** The dock door of its receive task; 0 otherwise. */
  readonly door: number;
  /** Share of the active task done, 0-100. */
  readonly pct: number;
  readonly stats: WmsWorkerStats;
  /** Share of its time working at a bin or door since hired, whole %; null before any time. */
  readonly utilPct: number | null;
}

/** A destination country's record. */
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
  /** The worker counting it in or putting it away now; 0 for none. */
  readonly receiver: number;
  /** Where its bin is on the floor (W7). */
  readonly aisle: number;
  readonly bay: number;
}

/** One row of the inbound grid (W6), with its lines for the PO detail. */
export interface WmsPoView {
  readonly no: number;
  /** e.g. PO-50001. */
  readonly code: string;
  readonly supplier: string;
  readonly status: WmsPoStatus;
  readonly created: number;
  /** Its dock appointment's tick (W8). */
  readonly appt: number;
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

/** One appointment slot of the dock schedule (W8): when it starts and the POs booked into it. */
export interface WmsSlotView {
  readonly at: number;
  readonly pos: readonly { readonly no: number; readonly code: string; readonly supplier: string; readonly status: WmsPoStatus; readonly late: boolean; readonly door: number }[];
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
  /** Good units counted in a warehouse hour, measured over the last few real minutes. */
  readonly unitsPerHour: number;
  readonly exceptions: number;
  /** POs closed that arrived by their appointment, as a whole %; null before any closes. */
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

/** The crew KPI strip (W8). */
export interface WmsCrewKpis {
  readonly crew: number;
  readonly working: number;
  readonly walking: number;
  readonly idle: number;
  /** Tasks waiting for a worker, by kind of worker. */
  readonly pickOpen: number;
  readonly receiveOpen: number;
  /** The crew's share of time working since opening, whole %; null before any time. */
  readonly utilPct: number | null;
}

/** One side of the crew and the work waiting for it (W9). */
export interface WmsNeed {
  readonly people: number;
  /** People on it with no task. */
  readonly idle: number;
  /** Tasks waiting for it: lined up but not started, or open and ready. */
  readonly waiting: number;
}

/** Where the work is (W9): both sides of the crew, and the side that needs one more person, if any. */
export interface WmsNeeds {
  readonly pick: WmsNeed;
  readonly receive: WmsNeed;
  /** The side the WMS's balance would move a person to now; null when the work is even. */
  readonly short: WmsRole | null;
  /** Ticks until the balance next looks (it moves at most one person a look). */
  readonly nextBalanceIn: number;
}

/** What hiring and building cost, and how far they can go (W8). */
export interface WmsGrowthView {
  /** Cents the next worker costs; null at the most workers. */
  readonly hireCost: number | null;
  readonly maxCrew: number;
  /** Cents the next dock door costs; null at the most doors. */
  readonly doorCost: number | null;
  readonly maxDoors: number;
}

/** Everything the WMS screens read. */
export interface WmsView {
  /** Changes whenever the WMS steps, so the screens re-render only then. */
  readonly rev: number;
  /** Open orders first in order number, then closed ones, newest first. */
  readonly orders: readonly WmsOrderView[];
  readonly events: readonly WmsEventView[];
  readonly kpis: WmsKpis;
  readonly workers: readonly WmsWorkerView[];
  readonly crewKpis: WmsCrewKpis;
  readonly countries: readonly WmsCountryView[];
  /** Ticks until the next automatic wave. */
  readonly nextWaveIn: number;
  /** Cents an expedite costs. */
  readonly expediteCost: number;
  /** Inbound (W6): open POs first, by appointment, then closed ones, newest first. */
  readonly pos: readonly WmsPoView[];
  readonly inboundKpis: WmsInboundKpis;
  /** The dock schedule (W8): today's appointment slots from the current one on, with the POs booked. */
  readonly schedule: readonly WmsSlotView[];
  /** Inventory (W6): one row per SKU, in catalog order. */
  readonly stock: readonly WmsStockView[];
  readonly inventoryKpis: WmsInventoryKpis;
  /** The operating plan (W7), and the crew it splits between picking and receiving. */
  readonly policy: WmsPolicy;
  readonly crew: number;
  /** The work waiting for each side of the crew (W9). */
  readonly needs: WmsNeeds;
  /** The wave intervals the Plan offers, in ticks: shortest, the default, longest (W9). */
  readonly waveChoices: readonly number[];
  readonly growth: WmsGrowthView;
  /** The floor's shape (W7): aisles, bays down each, bays of walking from one aisle to the next, dock doors. */
  readonly layout: { readonly aisles: number; readonly bays: number; readonly aisleGap: number; readonly doors: number };
  readonly stats: WmsStats;
  readonly today: WmsDayStats;
  readonly yesterday: WmsDayStats | null;
}
