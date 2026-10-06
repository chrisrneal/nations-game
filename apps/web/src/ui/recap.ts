import type { AwayRecap } from '../platform/index.ts';
import { formatCash, formatDuration, short } from './format.ts';

const plural = (n: number, one: string, many: string): string => `${short(n)} ${n === 1 ? one : many}`;

/**
 * The away recap in three lines (RULES 9): how long, what it earned, and what
 * happened with a hint. Short enough to read in a few seconds.
 */
export function recapLines(r: AwayRecap): [string, string, string] {
  const away = formatDuration(r.awayMs / 1000);
  const ran = formatDuration(r.ranMs / 1000);
  const first = r.skipped
    ? `You skipped ${ran} ahead.`
    : r.ranMs < r.awayMs
      ? `You were away ${away}. The warehouse ran for ${ran}, then closed for the night: Night shift keeps it open longer.`
      : `You were away ${away}, and the warehouse kept running.`;
  const fullShare = r.shipments === 0 ? 0 : Math.round((r.fullShipments / r.shipments) * 100);
  const second =
    r.shipments === 0
      ? 'No trucks left while you were away.'
      : `It earned ${formatCash(r.earned)} from ${plural(r.shipments, 'truck', 'trucks')}, ${fullShare}% of them full${r.pos === 0 ? '' : `, and took in ${plural(r.pos, 'PO', 'POs')}`}.`;
  const expresses = r.expresses > 0 ? `${plural(r.expresses, 'express truck', 'express trucks')} paid double. ` : '';
  const missedShare = r.orders + r.missed === 0 ? 0 : r.missed / (r.orders + r.missed);
  const fix = `${r.bottleneck.text}${r.fixName === '' ? '' : ` Try ${r.fixName}.`}`;
  // Customers cancel when the backlog is too long (RULES 3): too few pickers, empty shelves, or a full staging area holding it.
  const hint =
    missedShare < 0.02
      ? fix
      : r.bottleneck.kind === 'picking' || r.bottleneck.kind === 'stock'
        ? `${plural(r.missed, 'order was', 'orders were')} cancelled while the backlog waited: ${r.bottleneck.kind === 'stock' ? 'a bigger Receiving bay' : 'more pickers'} would have shipped them.`
        : `${plural(r.missed, 'order was', 'orders were')} cancelled. ${fix}`;
  return [first, second, `${expresses}${hint}`];
}
