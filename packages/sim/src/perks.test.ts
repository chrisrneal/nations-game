import type { WarehouseCommand, WarehouseState, PerkId } from '@warehouse/contracts';
import { describe, expect, it } from 'vitest';
import { PERK_IDS, expressChanceBp, hasPerk, perkStars } from './perks.ts';
import { boostTicks, offlineCapTicks, offlineMinutesAt, offlineMinutesFor } from './rules.ts';
import { createWarehouse } from './state.ts';
import { step } from './step.ts';
import { warehouseView, estimate } from './view.ts';
import { WAREHOUSE_TUNABLES as T } from './tunables.ts';

/** The star perks of RULES 10a: permanent bonuses that unlock with stars owned, never spent. */

const sellCommand = (s: WarehouseState): WarehouseCommand => ({ tick: s.tick, type: 'sell', payload: {} });
/** A warehouse that has earned enough for `stars` stars (tests only; play changes state only by commands). */
function worth(stars: number, owned = 0): WarehouseState {
  const s = createWarehouse({ seed: 1, stars: owned });
  const earned = stars * stars * T.starUnitCents.value;
  return { ...s, run: { ...s.run, earned }, life: { ...s.life, earned } };
}

describe('star perks (RULES 10a)', () => {
  it('unlock in order, each at more stars than the one before', () => {
    const thresholds = PERK_IDS.map(perkStars);
    expect(thresholds).toEqual([...thresholds].sort((a, b) => a - b));
    expect(new Set(thresholds).size).toBe(PERK_IDS.length);
    for (const id of PERK_IDS) {
      expect(hasPerk(id, perkStars(id) - 1)).toBe(false);
      expect(hasPerk(id, perkStars(id))).toBe(true);
    }
  });

  it('a first warehouse has none, and opens as it always did', () => {
    const s = createWarehouse({ seed: 1 });
    for (const id of PERK_IDS) expect(hasPerk(id, s.stars)).toBe(false);
    expect(s.cash).toBe(T.startingCashCents.value);
    expect(s.docks).toHaveLength(1);
  });

  it('Head start: a new warehouse opens with extra cash', () => {
    const stars = T.perkHeadStartStars.value;
    const { state } = step(worth(stars), [sellCommand(worth(stars))]);
    expect(state.stars).toBe(stars);
    expect(state.cash).toBe(T.startingCashCents.value + T.perkHeadStartCents.value);
  });

  it('Second dock: a new warehouse opens with two docks, both with a truck loading', () => {
    const stars = T.perkSecondDockStars.value;
    const { state } = step(worth(stars), [sellCommand(worth(stars))]);
    expect(state.levels.docks).toBe(1);
    expect(state.docks).toHaveLength(2);
    expect(new Set(state.docks.map((d) => d.truck)).size).toBe(2);
    expect(state.nextTruck).toBeGreaterThan(Math.max(...state.docks.map((d) => d.truck)));
    // The next dock costs what a third dock always costs.
    const docks = warehouseView(state).upgrades.find((u) => u.id === 'docks');
    expect(docks?.cost).toBe(Math.floor((T.docksCostBase.value * T.docksCostGrowthBp.value) / 10_000));
  });

  it('Quick charge: boosts recharge faster, never shorter than they run', () => {
    const below = boostTicks('flashSale', T.perkQuickChargeStars.value - 1);
    const at = boostTicks('flashSale', T.perkQuickChargeStars.value);
    expect(below.recharge).toBe(T.flashSaleRechargeTicks.value);
    expect(at.recharge).toBe(Math.floor((T.flashSaleRechargeTicks.value * T.perkQuickChargeBp.value) / 10_000));
    expect(at.length).toBe(below.length);
    for (const id of ['flashSale', 'allHands', 'surge'] as const) {
      const t = boostTicks(id, 99);
      expect(t.recharge).toBeGreaterThanOrEqual(t.length);
    }
    const s = createWarehouse({ seed: 1, stars: T.perkQuickChargeStars.value });
    const used = step(s, [{ tick: 0, type: 'boost', payload: { boost: 'flashSale' } }]).state;
    expect(used.boosts.flashSale.recharge).toBe(at.recharge - 1);
    expect(warehouseView(s).boosts.find((b) => b.id === 'flashSale')?.rechargeLength).toBe(at.recharge);
  });

  it('Express lane: express trucks come more often, and the estimate counts them', () => {
    expect(expressChanceBp(T.perkExpressStars.value - 1)).toBe(T.expressChanceBp.value);
    expect(expressChanceBp(T.perkExpressStars.value)).toBe(Math.floor((T.expressChanceBp.value * T.perkExpressBp.value) / 10_000));
    // Same pay multiplier from stars on both sides, so only the express odds differ.
    const base = createWarehouse({ seed: 1, stars: T.perkExpressStars.value - 1 });
    const withPerk = { ...base, stars: T.perkExpressStars.value };
    const ratio = estimate(withPerk).incomePerSec / estimate(base).incomePerSec;
    const starRatio = (10_000 + withPerk.stars * T.starBonusBp.value) / (10_000 + base.stars * T.starBonusBp.value);
    expect(ratio).toBeGreaterThan(starRatio);
    // Over many arrivals, the share of expresses is about the perk's chance.
    const count = (stars: number): number => {
      let s = createWarehouse({ seed: 7, stars });
      for (let i = 0; i < 20_000; i++) s = step(s, []).state;
      return s.run.expresses / Math.max(1, s.run.shipments);
    };
    expect(count(T.perkExpressStars.value)).toBeGreaterThan(count(T.perkExpressStars.value - 1) * 1.4);
  });

  it('Long shift: the offline cap is longer, up to the longest offline run', () => {
    const stars = T.perkLongShiftStars.value;
    expect(offlineMinutesFor(0, stars - 1)).toBe(offlineMinutesAt(0));
    expect(offlineMinutesFor(0, stars)).toBe(Math.floor((T.offlineBaseMinutes.value * T.perkLongShiftBp.value) / 10_000));
    expect(offlineMinutesFor(T.maxNightLevel.value, stars)).toBeLessThanOrEqual(T.offlineMaxMinutes.value);
    const s = createWarehouse({ seed: 1, stars });
    expect(offlineCapTicks(s)).toBe((offlineMinutesFor(0, stars) * 60_000) / T.tickMs.value);
    expect(warehouseView(s).offlineCapMinutes).toBe(offlineMinutesFor(0, stars));
    const night = warehouseView(s).upgrades.find((u) => u.id === 'night');
    expect(night?.now).toBe(offlineMinutesFor(0, stars) * 1000);
  });

  it('the view lists every perk, what owning it needs, and which the sale would unlock', () => {
    const owned = T.perkHeadStartStars.value;
    const view = warehouseView(worth(T.perkSecondDockStars.value - owned, owned));
    const perks = view.stars.perks;
    expect(perks.map((p) => p.id)).toEqual(PERK_IDS);
    const byId = (id: PerkId) => perks.find((p) => p.id === id);
    expect(byId('headStart')).toMatchObject({ unlocked: true, unlocksOnSale: false, stars: T.perkHeadStartStars.value });
    expect(byId('secondDock')).toMatchObject({ unlocked: false, unlocksOnSale: true });
    expect(byId('quickCharge')).toMatchObject({ unlocked: false, unlocksOnSale: false });
    for (const p of perks) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.effect.length).toBeLessThanOrEqual(40);
    }
    expect(byId('headStart')?.effect).toContain('$250');
  });
});
