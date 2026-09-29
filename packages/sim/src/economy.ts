import type {
  EconomyReport,
  Flow,
  NationEndowment,
  NationId,
  NationRecord,
  Prices,
  Resource,
  WorldLedger,
} from '@nations/contracts';
import { TUNABLES } from './tunables.ts';

/**
 * The economy of docs/RULES.md section 2, in integers (S5).
 *
 * Output is carried as `capacityE4` (output x 10,000) so a small nation's
 * monthly growth of a few basis points is not rounded away. Everything a
 * player sees is a whole number of units.
 */

/**
 * floor(a * b / c) for non-negative integers without overflowing 2^53, as long
 * as b * c stays below it (true for every rate in tunables.ts).
 */
export function mulDiv(a: number, b: number, c: number): number {
  return Math.floor(a / c) * b + Math.floor(((a % c) * b) / c);
}

/**
 * Numeric safety ceiling on capacity (output x 10,000), not a balance number:
 * a stress run of 1,000+ ticks of compounding growth must stay inside safe
 * integers. A 60-tick game never comes near it.
 */
export const CAPACITY_CEILING_E4 = 1_000_000_000_000_000;

/** Grows a capacity by `bp` basis points (may be negative), floored at 1 and capped at the ceiling. */
export function growCapacity(capacityE4: number, bp: number): number {
  const delta = bp >= 0 ? mulDiv(capacityE4, bp, 10_000) : -mulDiv(capacityE4, -bp, 10_000);
  return Math.max(1, Math.min(CAPACITY_CEILING_E4, capacityE4 + delta));
}

/** Starting capacity: annual PPP GDP x outputScaleBp, i.e. monthly output x 10,000 (RULES 2.1). */
export function startingCapacityE4(gdpPppBn: number): number {
  return gdpPppBn * TUNABLES.outputScaleBp.value;
}

/** Monthly baseline growth in whole basis points (RULES 2.1). Negative growth truncates towards zero. */
export function growthBpPerTick(annualBp: number): number {
  return Math.trunc(annualBp / 12);
}

/** Output bonus from refining leverage in basis points (RULES 2.5). */
function mineralsOutputBp(e: Pick<NationEndowment, 'mineralsRefining'>): number {
  return Math.floor((e.mineralsRefining * TUNABLES.mineralsOutputBonusBpPer10.value) / 10);
}

/** Energy production bonus from mineral endowment in basis points (RULES 2.5). */
function mineralsEnergyBp(e: Pick<NationEndowment, 'mineralsEndowment'>): number {
  return Math.floor((e.mineralsEndowment * TUNABLES.mineralsEnergyBonusBpPer10.value) / 10);
}

/** Output before shortfalls: capacity with the refining bonus, in whole units. */
export function potentialOutput(e: Pick<NationEndowment, 'mineralsRefining'>, capacityE4: number): number {
  return mulDiv(Math.floor(capacityE4 / 10_000), 10_000 + mineralsOutputBp(e), 10_000);
}

/** Population in whole millions, rounded half up. */
function populationMillions(population: number): number {
  return Math.floor((population + 500_000) / 1_000_000);
}

/**
 * Structural demand and production per tick (RULES 2.2 and 2.3). Energy
 * demand follows potential output, so shortfalls do not feed back into it.
 */
export function flowsFor(e: NationEndowment, capacityE4: number): { food: Flow; energy: Flow } {
  const pivot = TUNABLES.selfSufficiencyPivot.value;
  const foodDemand = populationMillions(e.population) * TUNABLES.foodDemandPerMillionPeople.value;
  const foodProduction = Math.floor((foodDemand * e.foodSelfSufficiency) / pivot);
  const energyDemand = mulDiv(potentialOutput(e, capacityE4), TUNABLES.energyDemandPerOutput.value, 100);
  const energyRaw = mulDiv(energyDemand, e.energySelfSufficiency, pivot);
  const energyProduction = mulDiv(energyRaw, 10_000 + mineralsEnergyBp(e), 10_000);
  return {
    food: { demand: foodDemand, production: foodProduction },
    energy: { demand: energyDemand, production: energyProduction },
  };
}

/** Structural surplus (positive) or deficit (negative) of one resource. Credit has none. */
export function structuralBalance(nation: Pick<NationRecord, 'public'>, resource: Resource): number {
  if (resource === 'credit') return 0;
  const flow = nation.public[resource];
  return flow.production - flow.demand;
}

/**
 * Reference prices (RULES 3.2): the base price times world demand over world
 * production, so a world short of energy pays more for it. Clamped to
 * [base / 4, base x 4] so an empty column can never divide by zero.
 */
export function referencePrices(state: {
  readonly nationOrder: readonly NationId[];
  readonly nations: Readonly<Record<NationId, NationRecord>>;
}): Prices {
  let foodD = 0;
  let foodP = 0;
  let energyD = 0;
  let energyP = 0;
  for (const id of state.nationOrder) {
    const n = state.nations[id] as NationRecord;
    foodD += n.public.food.demand;
    foodP += n.public.food.production;
    energyD += n.public.energy.demand;
    energyP += n.public.energy.production;
  }
  const price = (base: number, demand: number, production: number): number => {
    const raw = production <= 0 ? base * 4 : mulDiv(demand, base, production);
    return Math.max(Math.max(1, Math.floor(base / 4)), Math.min(base * 4, raw));
  };
  return {
    food: price(TUNABLES.foodBasePriceMilli.value, foodD, foodP),
    energy: price(TUNABLES.energyBasePriceMilli.value, energyD, energyP),
    credit: 1000,
  };
}

/** Value of an amount at reference prices, in thousandths of a Credit. */
export function valueMilli(prices: Prices, resource: Resource, amount: number): number {
  return prices[resource] * amount;
}

/**
 * Fair when what the maker asks is within priceBandPct of what it gives, at
 * reference prices (RULES 3.2). Anything else is a hard bargain, either way.
 */
export function isFair(
  prices: Prices,
  give: { resource: Resource; amount: number },
  get: { resource: Resource; amount: number },
): boolean {
  const band = TUNABLES.priceBandPct.value;
  const vGive = valueMilli(prices, give.resource, give.amount);
  const vGet = valueMilli(prices, get.resource, get.amount);
  return vGet * 100 <= vGive * (100 + band) && vGet * 100 >= vGive * (100 - band);
}

/** Shortfall penalty in basis points of output, both resources together (RULES 2.7). */
export function shortfallPenaltyBp(unmetFood: number, food: Flow, unmetEnergy: number, energy: Flow): number {
  const unmetBp = (unmet: number, demand: number): number =>
    demand <= 0 ? 0 : Math.floor((unmet * 10_000) / demand);
  const raw = Math.floor(
    ((unmetBp(unmetFood, food.demand) + unmetBp(unmetEnergy, energy.demand)) *
      TUNABLES.shortfallPenaltyBpPerPct.value) /
      100,
  );
  return Math.min(TUNABLES.maxShortfallPenaltyPct.value * 100, raw);
}

/**
 * The structural world (RULES 2.8): every nation on its own baseline path,
 * with no trade gains and no play. For each good, the share of the world's
 * structural deficit that the world's structural surplus could cover, in
 * basis points, scaled by `structuralCoverSharePct`. Background regions count
 * on both sides: their surpluses and deficits are part of the world. A pure
 * function of the data and the tick, so nothing any player does moves it.
 */
export interface StructuralCover {
  readonly food: number;
  readonly energy: number;
}

export function structuralCover(state: {
  readonly nationOrder: readonly NationId[];
  readonly nations: Readonly<Record<NationId, NationRecord>>;
  readonly endowments: Readonly<Record<NationId, NationEndowment>>;
}): StructuralCover {
  let foodSurplus = 0;
  let foodDeficit = 0;
  let energySurplus = 0;
  let energyDeficit = 0;
  for (const id of state.nationOrder) {
    const e = state.endowments[id] as NationEndowment;
    const flows = flowsFor(e, (state.nations[id] as NationRecord).private.baselineE4);
    const food = flows.food.production - flows.food.demand;
    const energy = flows.energy.production - flows.energy.demand;
    if (food > 0) foodSurplus += food;
    else foodDeficit -= food;
    if (energy > 0) energySurplus += energy;
    else energyDeficit -= energy;
  }
  const share = TUNABLES.structuralCoverSharePct.value;
  const cover = (surplus: number, deficit: number): number =>
    deficit <= 0 ? 10_000 : Math.min(10_000, Math.floor((mulDiv(surplus, share, 100) * 10_000) / deficit));
  return { food: cover(foodSurplus, foodDeficit), energy: cover(energySurplus, energyDeficit) };
}

/** A nation's fair share of what the world can supply: the part of its structural deficit the cover reaches (RULES 2.8). */
export function fairShareDeficit(flow: Flow, coverBp: number): number {
  const deficit = flow.demand - flow.production;
  return deficit <= 0 ? 0 : mulDiv(deficit, coverBp, 10_000);
}

/**
 * The shortfall penalty a nation on its baseline path pays in the structural
 * world: the penalty on the part of each deficit its fair share cannot cover
 * (RULES 2.8). Exporters and balanced nations expect none.
 */
export function structuralPenaltyBp(e: NationEndowment, baselineE4: number, cover: StructuralCover): number {
  const flows = flowsFor(e, baselineE4);
  const unmet = (flow: Flow, coverBp: number): number => Math.max(0, flow.demand - flow.production) - fairShareDeficit(flow, coverBp);
  return shortfallPenaltyBp(unmet(flows.food, cover.food), flows.food, unmet(flows.energy, cover.energy), flows.energy);
}

/**
 * Baseline output (RULES 5.1): baseline potential less the structural
 * shortfall penalty. The baseline already expects a nation's usual deficit,
 * so ownScore measures play, not geography.
 */
export function baselineOutputFor(e: NationEndowment, baselineE4: number, cover: StructuralCover): number {
  return mulDiv(potentialOutput(e, baselineE4), 10_000 - structuralPenaltyBp(e, baselineE4, cover), 10_000);
}

export interface EconomyTickResult {
  readonly nation: NationRecord;
  readonly ledger: WorldLedger;
  /** Output after shortfalls and before crisis damage: what crisis losses are measured against. */
  readonly preCrisisOutput: number;
}

/**
 * One nation's month, after trade: produce, consume, pay the shortfall
 * penalty, earn Credit, let resilience decay and fund it to the policy floor,
 * then grow capacity and baseline at the baseline rate and refresh the public
 * flows for the next tick. Every unit is accounted for in the ledger.
 * `cover` is this month's structural cover, for the baseline (RULES 2.8).
 * `crisisBp` is this month's crisis damage (RULES 4), an output penalty on
 * top of the shortfall penalty; the baseline never expects it.
 */
export function economyTick(
  nation: NationRecord,
  e: NationEndowment,
  ledger: WorldLedger,
  tradeGainCbp: number,
  cover: StructuralCover,
  crisisBp = 0,
): EconomyTickResult {
  const pub = nation.public;
  const priv = nation.private;

  const foodAvail = priv.stocks.food + pub.food.production;
  const energyAvail = priv.stocks.energy + pub.energy.production;
  const consumedFood = Math.min(pub.food.demand, foodAvail);
  const consumedEnergy = Math.min(pub.energy.demand, energyAvail);
  const unmetFood = pub.food.demand - consumedFood;
  const unmetEnergy = pub.energy.demand - consumedEnergy;
  const penaltyBp = shortfallPenaltyBp(unmetFood, pub.food, unmetEnergy, pub.energy);

  const potential = potentialOutput(e, priv.capacityE4);
  const preCrisisOutput = mulDiv(potential, 10_000 - penaltyBp, 10_000);
  const crisis = Math.max(0, Math.min(10_000, crisisBp));
  const output = mulDiv(preCrisisOutput, 10_000 - crisis, 10_000);
  let credit = priv.stocks.credit + output;

  const max = TUNABLES.resilienceMax.value;
  let resilience = Math.max(0, priv.resilience - TUNABLES.resilienceDecayPerTick.value);
  const floor = Math.min(max, priv.policy.resilienceFloor);
  const cost = TUNABLES.resilienceCostPerPoint.value;
  let resilienceSpent = 0;
  if (resilience < floor) {
    const points = Math.min(floor - resilience, Math.floor(credit / cost));
    resilience += points;
    resilienceSpent = points * cost;
    credit -= resilienceSpent;
  }

  const growth = growthBpPerTick(e.baselineGrowthBp);
  const capacityE4 = growCapacity(priv.capacityE4, growth);
  const baselineE4 = growCapacity(priv.baselineE4, growth);
  const flows = flowsFor(e, capacityE4);

  const report: EconomyReport = {
    consumedFood,
    consumedEnergy,
    unmetFood,
    unmetEnergy,
    penaltyPct: Math.floor(penaltyBp / 100),
    income: output,
    resilienceSpent,
    tradeGainCbp,
    crisisPct: Math.floor(crisis / 100),
    contributed: 0,
  };

  return {
    preCrisisOutput,
    nation: {
      ...nation,
      public: {
        ...pub,
        // Both measured on this tick's capacity, before growth, so ownScore compares like with like.
        output,
        baselineOutput: baselineOutputFor(e, priv.baselineE4, cover),
        food: flows.food,
        energy: flows.energy,
      },
      private: {
        ...priv,
        stocks: { food: foodAvail - consumedFood, energy: energyAvail - consumedEnergy, credit },
        resilience,
        capacityE4,
        baselineE4,
        last: report,
      },
    },
    ledger: {
      ...ledger,
      foodProduced: ledger.foodProduced + pub.food.production,
      foodConsumed: ledger.foodConsumed + consumedFood,
      foodUnmet: ledger.foodUnmet + unmetFood,
      energyProduced: ledger.energyProduced + pub.energy.production,
      energyConsumed: ledger.energyConsumed + consumedEnergy,
      energyUnmet: ledger.energyUnmet + unmetEnergy,
      creditIncome: ledger.creditIncome + output,
      creditSpentResilience: ledger.creditSpentResilience + resilienceSpent,
    },
  };
}
