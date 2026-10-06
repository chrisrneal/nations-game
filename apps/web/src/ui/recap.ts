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
    r.shipments === 0 ? 'No trucks left while you were away.' : `It earned ${formatCash(r.earned)} from ${plural(r.shipments, 'shipment', 'shipments')}, ${fullShare}% of them full.`;
  const expresses = r.expresses > 0 ? `${plural(r.expresses, 'express', 'expresses')} landed at double pay. ` : '';
  const missedShare = r.orders + r.missed === 0 ? 0 : r.missed / (r.orders + r.missed);
  const fix = `${r.bottleneck.text}${r.fixName === '' ? '' : ` Try ${r.fixName}.`}`;
  // People turn back at the door when the picking line is too long (RULES 3): too few lanes, or a full staging holding it.
  const hint =
    missedShare < 0.02
      ? fix
      : r.bottleneck.kind === 'picking'
        ? `${plural(r.missed, 'passenger', 'passengers')} turned back at the picking backlog: more ${r.fixName} would have let them through.`
        : `${plural(r.missed, 'passenger', 'passengers')} turned back at the door. ${fix}`;
  return [first, second, `${expresses}${hint}`];
}
