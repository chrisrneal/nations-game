import { rosterFromWorldData, type RosterEntry } from '@nations/sim';
import world2030 from '../../../data/world-2030.json' with { type: 'json' };

/**
 * The full roster from data/world-2030.json: the 17 playable nations, then the
 * 6 background regions, each group sorted by id so the order is the same on
 * every machine however the JSON was written. (Fixes Gate 0 finding F1: the
 * roster used to be the file's top-level keys.)
 */
export function loadRoster(data: unknown = world2030, options: { includeAggregates?: boolean } = {}): RosterEntry[] {
  return rosterFromWorldData(data, options);
}
