import type { Tunable } from '@warehouse/contracts';

/**
 * Every balance number in the warehouse game, with the band it may move inside
 * (docs/RULES.md section 12; packages/harness/src/rules.test.ts keeps the two
 * identical).
 *
 * - No balance number lives anywhere else: not inline, not in the interface.
 * - Each entry has a note saying what it is and why the band is what it is.
 * - The harness may sweep inside [min, max]; leaving the band is a design change.
 * - All values are integers in code units (P3): cents, milli-orders (one order
 *   is one unit of stock), ticks, basis points (10000 = x1).
 */
export const WAREHOUSE_TUNABLES = {
  tickMs: { value: 250, min: 100, max: 1000, note: 'Wall ms per tick. Short enough that a tap feels immediate, long enough that 24 h of catch-up is 345,600 cheap steps.' },
  maxCommandsPerTick: { value: 16, min: 4, max: 64, note: 'Engine limit: commands one tick accepts. A frantic thumb taps 10 times a second at most.' },
  cashCapCents: { value: 9_000_000_000_000_000, min: 9_000_000_000_000_000, max: 9_000_000_000_000_000, note: 'Engine limit: the safe-integer ceiling. The safe is full.' },
  startingCashCents: { value: 0, min: 0, max: 10_000, note: 'Cash a new warehouse opens with.' },
  startingStaged: { value: 10, min: 0, max: 40, note: 'Orders packed and staged at opening, so the first truck fills at once.' },
  startingStock: { value: 60, min: 0, max: 200, note: 'Units on the shelves at opening: half the first shelves.' },
  orderBaseMilliPerTick: { value: 400, min: 200, max: 1000, note: 'Milli-orders a tick at sales level 0 (1.6 a second).' },
  orderGrowthBp: { value: 13_500, min: 12_000, max: 15_000, note: 'Orders per sales level (+35%).' },
  stagingCapBase: { value: 40, min: 20, max: 100, note: 'Packed orders the staging area holds at sales level 0.' },
  stagingCapGrowthBp: { value: 13_500, min: 12_000, max: 15_000, note: 'Staging space per sales level; matches orders so it holds the same seconds of them.' },
  pickingBaseMilliPerTick: { value: 600, min: 400, max: 1500, note: 'Milli-orders picked a tick at level 0 (2.4 a second): ahead of level-0 orders, so the first minutes have no backlog.' },
  pickingGrowthBp: { value: 15_000, min: 12_500, max: 16_000, note: 'Picking per pickers level (+50%): ahead of sales\'s +35%, so pickers hired keep up for a while.' },
  backlogWaitTicks: { value: 120, min: 40, max: 240, note: 'The longest wait customers accept (30 s of picking): the backlog holds this many ticks of picking; beyond it new orders are cancelled.' },
  exportCheckBp: { value: 9500, min: 6000, max: 10_000, note: 'Picking speed for each export station (export paperwork, customs): x0.95 each. The catch of the big contracts.' },
  receiveBaseMilliPerTick: { value: 500, min: 300, max: 1500, note: 'Milli-units put away a tick at receiving level 0 (2 a second): a little ahead of level-0 orders, so the shelves hold at first.' },
  receiveGrowthBp: { value: 15_000, min: 12_500, max: 16_000, note: 'Put-away per receiving level (+50%), like picking: ahead of sales, so a bay bought keeps up for a while.' },
  shelfCapBase: { value: 120, min: 40, max: 400, note: 'Units the shelves hold at receiving level 0 (about a minute of orders): a buffer for flash sales.' },
  shelfCapGrowthBp: { value: 15_000, min: 12_500, max: 16_000, note: 'Shelf space per receiving level; matches put-away so the shelves hold the same seconds of it.' },
  poTicks: { value: 80, min: 20, max: 240, note: 'A purchase order is this many ticks of put-away (20 s), so a new PO reaches the dock every 20 s or so.' },
  maxDocks: { value: 8, min: 4, max: 12, note: 'Most docks: 8 fit a phone screen in two rows of four.' },
  truckParcelsBase: { value: 10, min: 6, max: 20, note: 'Parcels a truck holds at truck level 0.' },
  truckParcelsGrowthBp: { value: 15_000, min: 13_000, max: 18_000, note: 'Parcels per truck level (+50%).' },
  maxTruckLevel: { value: 9, min: 5, max: 12, note: 'Biggest truck (366 parcels).' },
  departBaseTicks: { value: 40, min: 20, max: 120, note: 'Departure timer before parcels are added (10 s).' },
  departTicksPerParcel: { value: 2, min: 1, max: 4, note: 'Extra departure timer per parcel (0.5 s).' },
  loadBaseMilliPerTick: { value: 500, min: 250, max: 1000, note: 'Loading rate per dock at level 0 (2 orders a second).' },
  loadGrowthBp: { value: 12_500, min: 11_000, max: 14_000, note: 'Loading rate per loading level (+25%).' },
  turnBaseTicks: { value: 16, min: 8, max: 40, note: 'Truck swap before parcels are added (4 s).' },
  turnParcelsPerTick: { value: 5, min: 2, max: 20, note: 'Parcels of truck per tick of extra swap time (0.05 s a parcel).' },
  crewTurnBp: { value: 8800, min: 8000, max: 9500, note: 'Swap time per yard crew level (-12%).' },
  turnMinTicks: { value: 4, min: 1, max: 8, note: 'Shortest swap (1 s).' },
  payBaseCents: { value: 100, min: 50, max: 500, note: 'Pay per order at contract level 0 ($1).' },
  payGrowthBp: { value: 16_000, min: 13_000, max: 20_000, note: 'Pay per contract level (+60%).' },
  fullBonusBp: { value: 2500, min: 0, max: 5000, note: 'Extra pay on a truck that leaves full (+25%). The reward for filling, and the cost of a too-big truck.' },
  expressChanceBp: { value: 500, min: 0, max: 2000, note: 'Chance an arriving truck is an express (5%).' },
  expressPayBp: { value: 20_000, min: 10_000, max: 40_000, note: 'An express truck\'s pay multiplier (2x).' },
  rushTicksPerTap: { value: 10, min: 4, max: 20, note: 'Rush added by one tap (2.5 s).' },
  rushMaxTicks: { value: 20, min: 8, max: 40, note: 'Most rush a station can bank (5 s), so tapping ahead does not pay.' },
  rushLoadBp: { value: 25_000, min: 15_000, max: 50_000, note: 'Speed while rushed: loading, picking and receiving (2.5x).' },
  rushTurnSpeed: { value: 3, min: 1, max: 5, note: 'Swap ticks cleared per tick while rushed.' },
  docksCostBase: { value: 10_000, min: 5000, max: 50_000, note: 'Cents for the second dock ($100).' },
  docksCostGrowthBp: { value: 40_000, min: 30_000, max: 80_000, note: 'Dock cost growth (x4): the eighth dock around the first sale.' },
  truckCostBase: { value: 30_000, min: 5000, max: 50_000, note: 'Cents for truck level 1 ($300).' },
  truckCostGrowthBp: { value: 35_000, min: 30_000, max: 70_000, note: 'Truck cost growth (x3.5).' },
  loadCostBase: { value: 1000, min: 500, max: 5000, note: 'Cents for loading level 1 ($10): the first upgrade, affordable after the first truck.' },
  loadCostGrowthBp: { value: 19_000, min: 15_000, max: 25_000, note: 'Loading cost growth (x1.9).' },
  salesCostBase: { value: 3000, min: 1000, max: 10_000, note: 'Cents for sales level 1 ($30).' },
  salesCostGrowthBp: { value: 20_000, min: 15_000, max: 25_000, note: 'Sales cost growth (x2.0).' },
  pickingCostBase: { value: 2500, min: 1000, max: 20_000, note: 'Cents for pickers level 1 ($25).' },
  pickingCostGrowthBp: { value: 18_000, min: 15_000, max: 25_000, note: 'Pickers cost growth (x1.8), a little under the x2 of the sales it keeps up with.' },
  receivingCostBase: { value: 2000, min: 1000, max: 20_000, note: 'Cents for receiving level 1 ($20).' },
  receivingCostGrowthBp: { value: 18_000, min: 15_000, max: 25_000, note: 'Receiving cost growth (x1.8), like pickers.' },
  contractCostBase: { value: 75_000, min: 10_000, max: 200_000, note: 'Cents for contract level 1 ($750).' },
  contractCostGrowthBp: { value: 40_000, min: 35_000, max: 80_000, note: 'Contract cost growth (x4).' },
  crewCostBase: { value: 6000, min: 2000, max: 20_000, note: 'Cents for yard crew level 1 ($60).' },
  crewCostGrowthBp: { value: 22_000, min: 15_000, max: 30_000, note: 'Yard crew cost growth (x2.2).' },
  nightCostBase: { value: 50_000, min: 10_000, max: 200_000, note: 'Cents for night shift level 1 ($500).' },
  nightCostGrowthBp: { value: 100_000, min: 50_000, max: 200_000, note: 'Night shift cost growth (x10).' },
  maxLoadLevel: { value: 40, min: 20, max: 60, note: 'Loading levels.' },
  maxSalesLevel: { value: 40, min: 20, max: 60, note: 'Sales levels.' },
  maxPickingLevel: { value: 40, min: 20, max: 60, note: 'Pickers levels, as many as sales.' },
  maxReceivingLevel: { value: 40, min: 20, max: 60, note: 'Receiving levels, as many as sales.' },
  maxCrewLevel: { value: 20, min: 10, max: 30, note: 'Yard crew levels; the swap hits its floor first.' },
  maxNightLevel: { value: 4, min: 2, max: 6, note: 'Night shift levels.' },
  offlineBaseMinutes: { value: 120, min: 30, max: 240, note: 'Offline cap with no night shift (2 h).' },
  offlineGrowthBp: { value: 20_000, min: 15_000, max: 30_000, note: 'Offline cap per night shift level (x2).' },
  offlineMaxMinutes: { value: 1440, min: 480, max: 2880, note: 'Longest offline run (24 h).' },
  starUnitCents: { value: 60_000_000, min: 1_000_000, max: 400_000_000, note: 'Earnings for the first star ($600K); n stars need n squared times this.' },
  starBonusBp: { value: 2500, min: 1000, max: 5000, note: 'Pay per star owned (+25%): three stars at the first sale make the next warehouse 75% richer.' },
  narrowYardMaxTruck: { value: 5, min: 3, max: 7, note: 'Port Calder\'s biggest truck level.' },
  narrowYardPayBp: { value: 15_000, min: 11_000, max: 20_000, note: 'Port Calder\'s pay multiplier (1.5x).' },
  crossdockBp: { value: 2000, min: 500, max: 4000, note: 'Highmoor Crossdock: share of a full truck\'s parcels that come back as cross-dock orders, already packed.' },
  wavePeriodTicks: { value: 1200, min: 480, max: 2400, note: 'Sunvale: one sale-season cycle (5 min).' },
  waveTicks: { value: 240, min: 60, max: 600, note: 'Sunvale: length of a sale (60 s).' },
  waveOrderBp: { value: 30_000, min: 15_000, max: 50_000, note: 'Sunvale: orders during a sale (3x).' },
  offWaveOrderBp: { value: 6000, min: 3000, max: 10_000, note: 'Sunvale: orders between sales (0.6x).' },
  flashSaleTicks: { value: 240, min: 80, max: 480, note: 'Boost: how long Flash sale runs (60 s). Long enough to watch the backlog fill.' },
  flashSaleRechargeTicks: { value: 1200, min: 480, max: 4800, note: 'Boost: Flash sale recharge, counted from use (5 min): about once per unlock.' },
  flashSaleOrderBp: { value: 30_000, min: 15_000, max: 50_000, note: 'Boost: orders during Flash sale (3x). Past the backlog they are cancelled, and full shelves store more of it.' },
  allHandsTicks: { value: 240, min: 80, max: 480, note: 'Boost: how long All hands rushes every station (60 s).' },
  allHandsRechargeTicks: { value: 1200, min: 480, max: 4800, note: 'Boost: All hands recharge (5 min): a minute of tapping for a one-handed or idle player.' },
  allHandsMinDocks: { value: 3, min: 1, max: 4, note: 'Boost: docks before All hands opens (about minute 2), so the boost bar fills in one at a time.' },
  surgeTicks: { value: 240, min: 80, max: 480, note: 'Boost: how long Peak surcharge runs (60 s).' },
  surgeRechargeTicks: { value: 3600, min: 1200, max: 7200, note: 'Boost: Peak surcharge recharge (15 min): one per idle check-in.' },
  surgePayBp: { value: 20_000, min: 15_000, max: 30_000, note: 'Boost: pay multiplier during Peak surcharge (2x).' },
  surgeMinContract: { value: 1, min: 0, max: 3, note: 'Boost: contract level before Peak surcharge opens (the first new contract, about minute 4).' },
} as const satisfies Readonly<Record<string, Tunable>>;

export type WarehouseTunableId = keyof typeof WAREHOUSE_TUNABLES;

/** The value of a tunable. A function, so the harness can override values for a sweep. */
export function tun(id: WarehouseTunableId): number {
  return WAREHOUSE_TUNABLES[id].value;
}
