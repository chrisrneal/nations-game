import type { AwayRecap } from '../platform/index.ts';
import { formatCash, formatDuration, short } from './format.ts';

const plural = (n: number, one: string, many: string): string => `${short(n)} ${n === 1 ? one : many}`;

/**
 * The away recap in three lines (RULES 11): how long, what it shipped and
 * earned, and what came in or went wrong. Short enough to read in a few seconds.
 */
export function recapLines(r: AwayRecap): [string, string, string] {
  const away = formatDuration(r.awayMs / 1000);
  const ran = formatDuration(r.ranMs / 1000);
  const days = r.days > 0 ? ` (${plural(r.days, 'warehouse day', 'warehouse days')} went by)` : '';
  const first = r.skipped
    ? `You skipped ${ran} ahead${days}.`
    : r.ranMs < r.awayMs
      ? `You were away ${away}. The warehouse ran for ${ran}${days}, then stopped: it runs at most ${formatDuration(r.capMinutes * 60)} while the app is closed.`
      : `You were away ${away}, and the warehouse kept running${days}.`;
  const otif = r.shipped === 0 ? 0 : Math.floor((r.otif * 100) / r.shipped);
  const second = r.shipped === 0 ? 'No orders shipped while you were away.' : `It shipped ${plural(r.shipped, 'order', 'orders')}, ${otif}% on time and in full, for ${formatCash(r.earned)}.`;
  const pos = r.pos === 0 ? 'No purchase orders came in' : `${plural(r.pos, 'PO', 'POs')} came in (${short(r.received)} units)`;
  const third = r.missed === 0 ? `${pos}, and every order made its cutoff.` : `${pos}. ${plural(r.missed, 'order', 'orders')} missed ${r.missed === 1 ? 'its' : 'their'} cutoff: the Plan tab can change how the crew works.`;
  return [first, second, third];
}
