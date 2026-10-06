import type { PerkId } from '@warehouse/contracts';
import { mulDiv } from './math.ts';
import { WAREHOUSE_TUNABLES as T, type WarehouseTunableId } from './tunables.ts';

/**
 * The star perks (RULES 10a): permanent bonuses that unlock as the stars owned
 * reach each threshold. Stars are never spent, so the pay bonus per star
 * (RULES 10) is unchanged. Every perk is a pure function of `stars`, which
 * State already holds: no new State, no save migration.
 */

const BP = 10_000;

/** Unlock order, which is also the order the stars sheet lists them. */
export const PERK_IDS: readonly PerkId[] = ['headStart', 'secondDock', 'quickCharge', 'express', 'longShift'];

export const PERK_NAMES: Readonly<Record<PerkId, string>> = {
  headStart: 'Head start',
  secondDock: 'Second dock',
  quickCharge: 'Quick charge',
  express: 'Express lane',
  longShift: 'Long shift',
};

const THRESHOLD: Readonly<Record<PerkId, WarehouseTunableId>> = {
  headStart: 'perkHeadStartStars',
  secondDock: 'perkSecondDockStars',
  quickCharge: 'perkQuickChargeStars',
  express: 'perkExpressStars',
  longShift: 'perkLongShiftStars',
};

/** Stars owned that unlock a perk. */
export function perkStars(id: PerkId): number {
  return T[THRESHOLD[id]].value;
}

export function hasPerk(id: PerkId, stars: number): boolean {
  return stars >= perkStars(id);
}

/** Cash a new warehouse opens with (RULES 9, 10a). */
export function startingCashFor(stars: number): number {
  return T.startingCashCents.value + (hasPerk('headStart', stars) ? T.perkHeadStartCents.value : 0);
}

/** Docks a new warehouse opens with, as a docks level (0: one dock). */
export function startingDockLevelFor(stars: number): number {
  return hasPerk('secondDock', stars) ? 1 : 0;
}

/** A boost's recharge in ticks with Quick charge, never shorter than the boost runs. */
export function rechargeFor(recharge: number, length: number, stars: number): number {
  return hasPerk('quickCharge', stars) ? Math.max(length, mulDiv(recharge, T.perkQuickChargeBp.value, BP)) : recharge;
}

/** Chance an arriving truck is an express, basis points (RULES 4, 10a). */
export function expressChanceBp(stars: number): number {
  return hasPerk('express', stars) ? Math.min(BP, mulDiv(T.expressChanceBp.value, T.perkExpressBp.value, BP)) : T.expressChanceBp.value;
}

/** An offline cap in minutes with Long shift, still at most the longest offline run (RULES 9, 10a). */
export function longShiftMinutes(base: number, stars: number): number {
  const minutes = hasPerk('longShift', stars) ? mulDiv(base, T.perkLongShiftBp.value, BP) : base;
  return Math.min(T.offlineMaxMinutes.value, minutes);
}

/** A perk in one short line, numbers from the tunables. */
export function perkEffect(id: PerkId): string {
  const pct = (bp: number): number => Math.round(Math.abs(bp - BP) / 100);
  switch (id) {
    case 'headStart':
      return `Open each warehouse with $${Math.round(T.perkHeadStartCents.value / 100)}`;
    case 'secondDock':
      return 'Open each warehouse with 2 docks';
    case 'quickCharge':
      return `Boosts recharge ${pct(T.perkQuickChargeBp.value)}% faster`;
    case 'express':
      return `Express trucks ${T.perkExpressBp.value / BP}x as often`;
    case 'longShift':
      return `Offline cap +${pct(T.perkLongShiftBp.value)}%`;
  }
}
