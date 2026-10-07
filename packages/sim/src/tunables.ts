import type { Tunable } from '@warehouse/contracts';

/**
 * Every balance number in the warehouse game, with the band it may move inside
 * (docs/RULES.md section 12; packages/harness/src/rules.test.ts keeps the two
 * identical).
 *
 * - No balance number lives anywhere else: not inline, not in the interface.
 * - Each entry has a note saying what it is and why the band is what it is.
 * - The harness may sweep inside [min, max]; leaving the band is a design change.
 * - All values are integers in code units (P3): cents, whole units of stock,
 *   ticks, basis points (10000 = x1).
 */
export const WAREHOUSE_TUNABLES = {
  tickMs: { value: 250, min: 100, max: 1000, note: 'Wall ms per tick. Short enough that a tap feels immediate, long enough that 8 h of catch-up is 115,200 cheap steps.' },
  maxCommandsPerTick: { value: 16, min: 4, max: 64, note: 'Engine limit: commands one tick accepts. A frantic thumb taps 10 times a second at most.' },
  cashCapCents: { value: 9_000_000_000_000_000, min: 9_000_000_000_000_000, max: 9_000_000_000_000_000, note: 'Engine limit: the safe-integer ceiling. The safe is full.' },
  startingCashCents: { value: 0, min: 0, max: 100_000, note: 'Cash a new warehouse opens with: nothing; the first shipments pay for the first hire.' },
  offlineCapMinutes: { value: 480, min: 30, max: 1440, note: 'The warehouse runs while the app is closed for at most this long (8 h, a shift and a night): the catch-up is the same sim stepped fast (P4), so the cap bounds how long reopening takes.' },
  wmsMinuteTicks: { value: 4, min: 1, max: 60, note: 'WMS clock (W8): ticks to a warehouse minute (one a real second at 1x, five at the default 5x, W9), so a warehouse day is 24 real minutes at 1x and the dock schedule, cutoffs and appointments read as times of day.' },
  wmsDayStartMinute: { value: 360, min: 0, max: 1439, note: 'WMS clock: the minute of the day a new warehouse opens at (06:00, day 1).' },
  wmsSampleOrdersMin: { value: 20, min: 5, max: 30, note: 'WMS: fewest sample orders a new warehouse opens with (docs/wms-plan.md slice 1; 20 since W10, the busier warehouse).' },
  wmsSampleOrdersMax: { value: 30, min: 5, max: 40, note: 'WMS: most sample orders a new warehouse opens with: a morning\'s backlog for a crew of twenty (W10).' },
  wmsLinesMax: { value: 5, min: 1, max: 12, note: 'WMS: most lines an order has (1 to this many, each a different SKU).' },
  wmsQtyMin: { value: 4, min: 1, max: 50, note: 'WMS: fewest units on an order line.' },
  wmsQtyMax: { value: 48, min: 2, max: 500, note: 'WMS: most units on an order line.' },
  wmsCutoffMinTicks: { value: 720, min: 240, max: 14_400, note: 'WMS: shortest time to ship-by of a Standard (P3) order (3 warehouse hours, 3 real minutes); High (P2) gets 3/4 of that, Expedite (P1) half. With 3-8 h an untouched WMS ships about 96% on time and 82% OTIF (W8 report, seeds 1-8, 2 h): misses happen, and priorities and expedites can save them.' },
  wmsCutoffMaxTicks: { value: 1920, min: 480, max: 28_800, note: 'WMS: longest time to ship-by of a Standard order (8 warehouse hours).' },
  wmsExpediteChanceBp: { value: 1000, min: 0, max: 5000, note: 'WMS: chance a new order is P1 Expedite (10%).' },
  wmsHighChanceBp: { value: 2500, min: 0, max: 5000, note: 'WMS: chance a new order is P2 High (25%); the rest are P3 Standard.' },
  wmsStockCoverMinPct: { value: 60, min: 0, max: 100, note: 'WMS: least stock a SKU opens with, as % of the units ordered of it: under 100 some lines will be short.' },
  wmsStockCoverMaxPct: { value: 180, min: 100, max: 400, note: 'WMS: most stock a SKU opens with, as % of the units ordered of it.' },
  wmsEventsKept: { value: 400, min: 50, max: 1000, note: 'WMS: activity events kept in State (the oldest drop off); bounds the save and the feed. 400 since W10: three times the orders log three times the events.' },
  wmsStepTicks: { value: 4, min: 1, max: 8, note: 'WMS: it steps once every this many ticks (1 s, a warehouse minute): the clock moves a minute a step, and 8 h of catch-up stays cheap.' },
  wmsPickMilliPerSec: { value: 1100, min: 200, max: 4000, note: 'WMS: milli-units a picker picks a second once at the bin (1.1). 0.75 until W10; raised with three times the orders so fourteen pickers keep up with a little to spare: an untouched warehouse ships about 82% OTIF with pickers working about 61% of the time (W10 report, seeds 1-8, 2 h).' },
  wmsFirstWaveTicks: { value: 120, min: 0, max: 1200, note: 'WMS: ticks from opening to the first automatic wave (30 warehouse minutes): long enough to see NEW orders and release them by hand.' },
  wmsWaveTicks: { value: 240, min: 40, max: 2400, note: 'WMS: ticks between automatic waves (a warehouse hour): every NEW order not on hold is released.' },
  wmsWaveMinTicks: { value: 120, min: 40, max: 1200, note: 'WMS plan (W9): the shortest wave interval the Plan offers (30 warehouse minutes): orders reach the floor sooner, in smaller waves, so a P1 has less company to beat to the stock.' },
  wmsWaveMaxTicks: { value: 480, min: 240, max: 4800, note: 'WMS plan (W9): the longest wave interval the Plan offers (2 warehouse hours): big waves let the most urgent take the stock first, but orders wait longer to start.' },
  wmsBalanceTicks: { value: 60, min: 20, max: 960, note: 'WMS labour (W9): under the balance plan the WMS looks at the work waiting every this many ticks (15 warehouse minutes) and moves at most one person, so the crew does not churn.' },
  wmsBalanceGap: { value: 3, min: 1, max: 20, note: 'WMS labour (W9): the balance moves a person when one side has at least this many more tasks waiting a head than the other. At 3 a full queue on every picker (2 waiting a head) does not pull receivers off an empty dock by itself.' },
  wmsOrderMinTicks: { value: 24, min: 20, max: 1200, note: 'WMS: shortest gap before the next order arrives (6 warehouse minutes; 20 before W10, the busier warehouse).' },
  wmsOrderMaxTicks: { value: 40, min: 40, max: 2400, note: 'WMS: longest gap before the next order arrives (10 warehouse minutes; an order every 8 minutes on average, about 7 an hour, three times W9\'s).' },
  wmsMaxOpenOrders: { value: 80, min: 10, max: 300, note: 'WMS: no new order arrives while this many are open, so a long absence cannot swamp the floor (80 since W10: about 11 warehouse hours of orders; it also bounds the backlog a catch-up plans, so 8 hours away with half the pickers stays under a second in Node).' },
  wmsKeepClosedOrders: { value: 40, min: 0, max: 300, note: 'WMS: shipped and cancelled orders kept on the grid; older ones drop off.' },
  wmsPackTicks: { value: 20, min: 0, max: 240, note: 'WMS: ticks from PICKED (or SHORT) to PACKED (5 s).' },
  wmsStageTicks: { value: 20, min: 0, max: 240, note: 'WMS: ticks from PACKED to STAGED (5 s).' },
  wmsLoadMilliPerSec: { value: 8000, min: 1000, max: 40_000, note: 'WMS outbound (W10): milli-units a dock hand loads onto a trailer a second (8): an order of 80 units takes 10 warehouse minutes.' },
  wmsShortPickChanceBp: { value: 300, min: 0, max: 2000, note: 'WMS: chance a picker finds a bin short of what was allocated (3%): a SHORT PICK of 1 unit up to the whole line.' },
  wmsWalkTicksPerBay: { value: 1, min: 0, max: 8, note: 'WMS (W7): ticks a picker takes to walk past one bay (4 bays a second). A line across the warehouse is about 30 bays (8 s); between bins in one aisle a few seconds. Walking is why the nearest-bin pick order picks more lines an hour.' },
  wmsReplenTicks: { value: 240, min: 40, max: 2400, note: 'WMS: ticks between reorder planning runs (a warehouse hour, W6); the first runs at opening.' },
  wmsReorderUnits: { value: 180, min: 0, max: 500, note: 'WMS: reorder point: a SKU whose position (available + inbound - units waiting) is under this gets a PO line (W6). 80 until W10; raised with three times the orders, so fill stays at 96% (at 160 it fell to 95%).' },
  wmsReplenUnits: { value: 240, min: 10, max: 1000, note: 'WMS: a PO line orders the SKU up to the reorder point plus this many units (W6; 120 until W10).' },
  wmsGoodwillStart: { value: 50, min: 0, max: 100, note: 'WMS: goodwill (0-100) every destination country starts at.' },
  wmsExpediteLeadTicks: { value: 1200, min: 0, max: 7200, note: 'WMS: an expedited order goes P1 and onto a later, faster truck: this much is added to its ship-by (5 warehouse hours).' },
  wmsGoodwillGain: { value: 3, min: 0, max: 20, note: 'WMS: goodwill a country gains when its order ships on time and in full.' },
  wmsGoodwillLatePerHour: { value: 4, min: 0, max: 50, note: 'WMS: goodwill lost for each started warehouse hour (a real minute) an order ships after its cutoff.' },
  wmsGoodwillLateMax: { value: 20, min: 0, max: 100, note: 'WMS: most goodwill one late order can cost.' },
  wmsGoodwillShortMax: { value: 15, min: 0, max: 100, note: 'WMS: goodwill an order shipped with nothing would cost; a short order costs this times its share of units short.' },
  wmsReceiveMilliPerSec: { value: 6000, min: 500, max: 20_000, note: 'WMS inbound: milli-units a receiver counts in a second (6): a 200-unit line takes about 33 s.' },
  wmsRcvShortChanceBp: { value: 500, min: 0, max: 5000, note: 'WMS inbound: chance a supplier sends a line short (5%): 1 unit up to a quarter of it is missing.' },
  wmsDamageChanceBp: { value: 300, min: 0, max: 5000, note: 'WMS inbound: chance some of a line arrives damaged (3%): written off, never put away.' },
  wmsDamageMaxUnits: { value: 4, min: 1, max: 50, note: 'WMS inbound: most units of a line that arrive damaged.' },
  wmsKeepClosedPos: { value: 20, min: 0, max: 200, note: 'WMS inbound: closed POs kept on the inbound grid; older ones drop off.' },
  wmsCountTicks: { value: 120, min: 20, max: 2400, note: 'WMS inventory (W6): ticks between cycle counts (30 s); each counts the next SKU in turn, so every SKU is counted every 8 min.' },
  wmsCountVarianceBp: { value: 1000, min: 0, max: 5000, note: 'WMS inventory: chance a cycle count finds the bin differs from the system (10%); two in three are losses.' },
  wmsCountVarianceMax: { value: 3, min: 1, max: 50, note: 'WMS inventory: most units a cycle count adjusts by; a loss never takes allocated units.' },
  wmsStartPickers: { value: 14, min: 1, max: 30, note: 'WMS crew (W8): workers a new warehouse opens with on picking (W01..W14 since W10). Fourteen keep up with an order every 8 minutes with a little to spare.' },
  wmsStartReceivers: { value: 6, min: 1, max: 20, note: 'WMS crew: workers a new warehouse opens with on the dock (W15..W20 since W10): they receive, put away and load the outbound trailers.' },
  wmsMaxCrew: { value: 40, min: 20, max: 60, note: 'WMS crew: the most workers the warehouse can hire (40 since W10); the floor draws them all and the Crew page lists them.' },
  wmsHireCostCents: { value: 200_000, min: 5000, max: 500_000, note: 'WMS crew: cents for the first worker hired ($2,000, about three warehouse hours of shipments at W10\'s volume; $500 before).' },
  wmsHireCostGrowthBp: { value: 11_500, min: 10_500, max: 30_000, note: 'WMS crew: each further hire costs this much more (x1.15 since W10, x1.5 before: a crew of 40 is 20 hires).' },
  wmsTaskQueue: { value: 3, min: 1, max: 8, note: 'WMS tasks (W8): tasks the WMS lines up for each worker, the one it works on included. The plan is redone every second, so a new urgent task still goes to the front; at 1 a worker only gets its next task when it finishes.' },
  wmsTasksKept: { value: 400, min: 20, max: 1000, note: 'WMS tasks: finished and cancelled tasks kept in State (the oldest drop off), so each worker shows its latest work; bounds the save. 400 since W10, for a crew of 20-40.' },
  wmsPutawayDropTicks: { value: 12, min: 0, max: 240, note: 'WMS inbound (W8): ticks a worker takes to set a received line down in its bin after walking it there (3 s).' },
  wmsDoors: { value: 2, min: 1, max: 8, note: 'WMS inbound: dock doors a new warehouse opens with; each appointment slot books at most one truck a door.' },
  wmsMaxDoors: { value: 4, min: 2, max: 8, note: 'WMS inbound: the most dock doors; four fit the floor on a 360 px phone.' },
  wmsDoorCostCents: { value: 200_000, min: 20_000, max: 2_000_000, note: 'WMS inbound: cents for the third dock door ($2,000).' },
  wmsDoorCostGrowthBp: { value: 20_000, min: 11_000, max: 40_000, note: 'WMS inbound: each further door costs this much more (x2).' },
  wmsShipDoors: { value: 3, min: 1, max: 6, note: 'WMS outbound (W10): outbound dock doors a new warehouse opens with, each with a trailer on a schedule; staggered, so with 3 a trailer leaves every 20 warehouse minutes.' },
  wmsMaxShipDoors: { value: 6, min: 2, max: 8, note: 'WMS outbound (W10): the most outbound doors; six fit the floor on a 360 px phone.' },
  wmsShipDoorCostCents: { value: 150_000, min: 20_000, max: 2_000_000, note: 'WMS outbound (W10): cents for the first outbound door bought ($1,500).' },
  wmsShipDoorCostGrowthBp: { value: 20_000, min: 11_000, max: 40_000, note: 'WMS outbound (W10): each further outbound door costs this much more (x2).' },
  wmsTrailerTicks: { value: 240, min: 60, max: 960, note: 'WMS outbound (W10): a trailer leaves each outbound door this often (a warehouse hour), with whatever is loaded on it; the doors are staggered.' },
  wmsTrailerUnits: { value: 300, min: 100, max: 2000, note: 'WMS outbound (W10): units a trailer holds. Three doors carry 900 units a warehouse hour against about 560 ordered: room for a wave. With two doors an untouched warehouse falls to about 74% OTIF; with one, orders pile up at the dock.' },
  wmsApptSlotTicks: { value: 120, min: 40, max: 960, note: 'WMS inbound (W8): a dock appointment slot (30 warehouse minutes); reorder planning books each PO into the first slot after its lead time with a door free.' },
  wmsPoLeadMinTicks: { value: 120, min: 40, max: 4800, note: 'WMS inbound: shortest lead time from raising a PO to the earliest appointment it may book (30 warehouse minutes).' },
  wmsPoLeadMaxTicks: { value: 360, min: 40, max: 9600, note: 'WMS inbound: longest lead time (90 warehouse minutes). With 30-90 min an idle WMS keeps its SKUs stocked.' },
  wmsPoEarlyMaxTicks: { value: 40, min: 0, max: 240, note: 'WMS inbound: an on-time truck arrives up to this early for its appointment (10 min).' },
  wmsPoLateChanceBp: { value: 1500, min: 0, max: 5000, note: 'WMS inbound: chance a supplier\'s truck misses its appointment (15%).' },
  wmsPoLateMaxTicks: { value: 360, min: 40, max: 4800, note: 'WMS inbound: most a late truck is late (90 min); it is at least 10 min late.' },
  wmsUnitPayCents: { value: 100, min: 10, max: 1000, note: 'WMS pay (W8): cents a shipped unit pays at goodwill 50 ($1), times (50 + goodwill)%: an order of about 80 units pays about $80.' },
  wmsExpediteCostCents: { value: 4000, min: 500, max: 50_000, note: 'WMS: an expedite costs this ($40): real money, about half an order\'s pay.' },
} as const satisfies Readonly<Record<string, Tunable>>;

export type WarehouseTunableId = keyof typeof WAREHOUSE_TUNABLES;

/** The value of a tunable. A function, so the harness can override values for a sweep. */
export function tun(id: WarehouseTunableId): number {
  return WAREHOUSE_TUNABLES[id].value;
}
