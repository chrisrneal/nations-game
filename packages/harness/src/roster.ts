import type { RosterEntry } from '@nations/sim';
import world2030 from '../../../data/world-2030.json' with { type: 'json' };

/**
 * The playable roster from data/world-2030.json, sorted by id so the order is
 * the same on every machine regardless of how the JSON was written.
 *
 * Today's data file is a 6-nation placeholder keyed by country name (lane D
 * owns it); the key is used as the nation id.
 */
export function loadRoster(data: unknown = world2030): RosterEntry[] {
  if (typeof data !== 'object' || data === null) throw new Error('world data is not an object');
  return Object.keys(data)
    .sort()
    .map((key) => ({ id: key, name: key }));
}
