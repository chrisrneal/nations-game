import type { Tunable } from '@airport/contracts';

/**
 * Every balance number in the airport game, with the band it may move inside
 * (docs/RULES.md section 12; packages/harness/src/rules.test.ts keeps the two
 * identical).
 *
 * - No balance number lives anywhere else: not inline, not in the interface.
 * - Each entry has a note saying what it is and why the band is what it is.
 * - The harness may sweep inside [min, max]; leaving the band is a design change.
 * - All values are integers in code units (P3): cents, milli-passengers, ticks,
 *   basis points (10000 = x1).
 */
export const AIRPORT_TUNABLES = {
  tickMs: { value: 250, min: 100, max: 1000, note: 'Wall ms per tick. Short enough that a tap feels immediate, long enough that 24 h of catch-up is 345,600 cheap steps.' },
  maxCommandsPerTick: { value: 16, min: 4, max: 64, note: 'Engine limit: commands one tick accepts. A frantic thumb taps 10 times a second at most.' },
  cashCapCents: { value: 9_000_000_000_000_000, min: 9_000_000_000_000_000, max: 9_000_000_000_000_000, note: 'Engine limit: the safe-integer ceiling. The vault is full.' },
  startingCashCents: { value: 0, min: 0, max: 10_000, note: 'Cash a new airport opens with.' },
  startingWaiting: { value: 10, min: 0, max: 40, note: 'Passengers waiting at opening, so the first plane fills at once.' },
  arrivalBaseMilliPerTick: { value: 400, min: 200, max: 1000, note: 'Milli-passengers a tick at terminal level 0 (1.6 a second).' },
  arrivalGrowthBp: { value: 13_500, min: 12_000, max: 15_000, note: 'Arrivals per terminal level (+35%).' },
  terminalCapBase: { value: 40, min: 20, max: 100, note: 'Passengers who can wait at terminal level 0.' },
  terminalCapGrowthBp: { value: 13_500, min: 12_000, max: 15_000, note: 'Waiting room per terminal level; matches arrivals so the room holds the same seconds of arrivals.' },
  maxGates: { value: 8, min: 4, max: 12, note: 'Most gates: 8 fit a phone screen in two columns.' },
  planeSeatsBase: { value: 10, min: 6, max: 20, note: 'Seats at plane level 0.' },
  planeSeatsGrowthBp: { value: 15_000, min: 13_000, max: 18_000, note: 'Seats per plane level (+50%).' },
  maxPlaneLevel: { value: 9, min: 5, max: 12, note: 'Biggest plane size (366 seats).' },
  departBaseTicks: { value: 40, min: 20, max: 120, note: 'Departure timer before seats are added (10 s).' },
  departTicksPerSeat: { value: 2, min: 1, max: 4, note: 'Extra departure timer per seat (0.5 s).' },
  boardBaseMilliPerTick: { value: 500, min: 250, max: 1000, note: 'Boarding rate per gate at level 0 (2 passengers a second).' },
  boardGrowthBp: { value: 12_500, min: 11_000, max: 14_000, note: 'Boarding rate per boarding level (+25%).' },
  turnBaseTicks: { value: 16, min: 8, max: 40, note: 'Turnaround before seats are added (4 s).' },
  turnSeatsPerTick: { value: 5, min: 2, max: 20, note: 'Seats cleared per tick of extra turnaround (0.05 s a seat).' },
  crewTurnBp: { value: 8800, min: 8000, max: 9500, note: 'Turnaround per crew level (-12%).' },
  turnMinTicks: { value: 4, min: 1, max: 8, note: 'Shortest turnaround (1 s).' },
  fareBaseCents: { value: 100, min: 50, max: 500, note: 'Fare per passenger at route level 0 ($1).' },
  fareGrowthBp: { value: 16_000, min: 13_000, max: 20_000, note: 'Fare per route level (+60%).' },
  fullBonusBp: { value: 2500, min: 0, max: 5000, note: 'Extra fare on a flight that leaves full (+25%). The reward for filling, and the cost of a too-big plane.' },
  charterChanceBp: { value: 500, min: 0, max: 2000, note: 'Chance an arriving plane is a charter (5%).' },
  charterFareBp: { value: 20_000, min: 10_000, max: 40_000, note: 'A charter\'s fare multiplier (2x).' },
  rushTicksPerTap: { value: 10, min: 4, max: 20, note: 'Rush added by one tap (2.5 s).' },
  rushMaxTicks: { value: 20, min: 8, max: 40, note: 'Most rush a gate can bank (5 s), so tapping ahead does not pay.' },
  rushBoardBp: { value: 25_000, min: 15_000, max: 50_000, note: 'Boarding speed while rushed (3x).' },
  rushTurnSpeed: { value: 3, min: 1, max: 5, note: 'Turnaround ticks cleared per tick while rushed.' },
  gatesCostBase: { value: 10_000, min: 5000, max: 50_000, note: 'Cents for the second gate ($100).' },
  gatesCostGrowthBp: { value: 40_000, min: 30_000, max: 80_000, note: 'Gate cost growth (x5).' },
  planeCostBase: { value: 30_000, min: 5000, max: 50_000, note: 'Cents for plane level 1 ($100).' },
  planeCostGrowthBp: { value: 35_000, min: 30_000, max: 70_000, note: 'Plane cost growth (x4.5).' },
  boardCostBase: { value: 1000, min: 500, max: 5000, note: 'Cents for boarding level 1 ($10): the first upgrade, affordable after the first flight.' },
  boardCostGrowthBp: { value: 19_000, min: 15_000, max: 25_000, note: 'Boarding cost growth (x1.9).' },
  terminalCostBase: { value: 3000, min: 1000, max: 10_000, note: 'Cents for terminal level 1 ($30).' },
  terminalCostGrowthBp: { value: 20_000, min: 15_000, max: 25_000, note: 'Terminal cost growth (x2.0).' },
  routeCostBase: { value: 75_000, min: 10_000, max: 200_000, note: 'Cents for route level 1 ($250).' },
  routeCostGrowthBp: { value: 40_000, min: 35_000, max: 80_000, note: 'Route cost growth (x5.5).' },
  crewCostBase: { value: 6000, min: 2000, max: 20_000, note: 'Cents for crew level 1 ($60).' },
  crewCostGrowthBp: { value: 22_000, min: 15_000, max: 30_000, note: 'Crew cost growth (x2.2).' },
  nightCostBase: { value: 50_000, min: 10_000, max: 200_000, note: 'Cents for night shift level 1 ($500).' },
  nightCostGrowthBp: { value: 100_000, min: 50_000, max: 200_000, note: 'Night shift cost growth (x10).' },
  maxBoardLevel: { value: 40, min: 20, max: 60, note: 'Boarding levels.' },
  maxTerminalLevel: { value: 40, min: 20, max: 60, note: 'Terminal levels.' },
  maxCrewLevel: { value: 20, min: 10, max: 30, note: 'Crew levels; turnaround hits its floor first.' },
  maxNightLevel: { value: 4, min: 2, max: 6, note: 'Night shift levels.' },
  offlineBaseMinutes: { value: 120, min: 30, max: 240, note: 'Offline cap with no night shift (2 h).' },
  offlineGrowthBp: { value: 20_000, min: 15_000, max: 30_000, note: 'Offline cap per night shift level (x2).' },
  offlineMaxMinutes: { value: 1440, min: 480, max: 2880, note: 'Longest offline run (24 h).' },
  slotUnitCents: { value: 60_000_000, min: 1_000_000, max: 400_000_000, note: 'Earnings for the first slot ($10K); n slots need n squared times this.' },
  slotBonusBp: { value: 2500, min: 1000, max: 5000, note: 'Fare per slot owned (+10%).' },
  shortRunwayMaxPlane: { value: 5, min: 3, max: 7, note: 'Port Calder\'s biggest plane level.' },
  shortRunwayFareBp: { value: 15_000, min: 11_000, max: 20_000, note: 'Port Calder\'s fare multiplier (1.5x).' },
  hubTransferBp: { value: 2000, min: 500, max: 4000, note: 'Highmoor Hub: share of a full flight\'s seats that come back as connecting passengers.' },
  wavePeriodTicks: { value: 1200, min: 480, max: 2400, note: 'Sunvale: one wave cycle (5 min).' },
  waveTicks: { value: 240, min: 60, max: 600, note: 'Sunvale: length of a wave (60 s).' },
  waveArrivalBp: { value: 30_000, min: 15_000, max: 50_000, note: 'Sunvale: arrivals during a wave (3x).' },
  offWaveArrivalBp: { value: 6000, min: 3000, max: 10_000, note: 'Sunvale: arrivals between waves (0.6x).' },
  rushHourTicks: { value: 240, min: 80, max: 480, note: 'Boost: how long Rush hour runs (60 s). Long enough to watch the lounge fill.' },
  rushHourRechargeTicks: { value: 1200, min: 480, max: 4800, note: 'Boost: Rush hour recharge, counted from use (5 min): about once per unlock.' },
  rushHourArrivalBp: { value: 30_000, min: 15_000, max: 50_000, note: 'Boost: arrivals during Rush hour (3x). Beyond the waiting room they are missed, so a big terminal stores more of it.' },
  allHandsTicks: { value: 240, min: 80, max: 480, note: 'Boost: how long All hands rushes every gate (60 s).' },
  allHandsRechargeTicks: { value: 1200, min: 480, max: 4800, note: 'Boost: All hands recharge (5 min): a minute of tapping for a one-handed or idle player.' },
  allHandsMinGates: { value: 3, min: 1, max: 4, note: 'Boost: gates before All hands opens (about minute 2), so the boost bar fills in one at a time.' },
  surgeTicks: { value: 240, min: 80, max: 480, note: 'Boost: how long Fare surge runs (60 s).' },
  surgeRechargeTicks: { value: 3600, min: 1200, max: 7200, note: 'Boost: Fare surge recharge (15 min): one per idle check-in.' },
  surgeFareBp: { value: 20_000, min: 15_000, max: 30_000, note: 'Boost: fare multiplier during Fare surge (2x).' },
  surgeMinRoute: { value: 1, min: 0, max: 3, note: 'Boost: route level before Fare surge opens (the first new route, about minute 4).' },
} as const satisfies Readonly<Record<string, Tunable>>;

export type AirportTunableId = keyof typeof AIRPORT_TUNABLES;

/** The value of a tunable. A function, so the harness can override values for a sweep. */
export function tun(id: AirportTunableId): number {
  return AIRPORT_TUNABLES[id].value;
}
