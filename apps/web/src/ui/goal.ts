import type { AirportView, UpgradeView } from '@airport/contracts';

/**
 * The next thing worth saving for (RULES 11: something to aim for): the
 * cheapest upgrade that is not affordable yet and not locked, preferring one
 * that fixes the bottleneck when it costs at most twice as much.
 */
export function nextGoal(view: AirportView): UpgradeView | null {
  const open = view.upgrades.filter((u) => u.cost !== null && u.locked === null && !u.affordable && u.id !== 'night');
  if (open.length === 0) return null;
  const cheapest = open.reduce((a, b) => ((a.cost ?? 0) <= (b.cost ?? 0) ? a : b));
  const fixer = open.filter((u) => view.bottleneck.fix.includes(u.id)).reduce<UpgradeView | null>((a, b) => (a === null || (b.cost ?? 0) < (a.cost ?? 0) ? b : a), null);
  if (fixer !== null && (fixer.cost ?? 0) <= 2 * (cheapest.cost ?? 0)) return fixer;
  return cheapest;
}

/** Seconds until `cost` at this income, or null if there is no income. */
export function secondsUntil(cost: number, cash: number, incomePerSec: number): number | null {
  if (cash >= cost) return 0;
  if (incomePerSec <= 0) return null;
  return (cost - cash) / incomePerSec;
}
