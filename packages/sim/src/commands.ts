import type { AirportCommand } from '@airport/contracts';
import { BOOST_IDS, UPGRADE_IDS } from './catalog.ts';

const TYPES = new Set(['tap', 'tapSecurity', 'buy', 'boost', 'sell']);

/**
 * Shape check for a command from outside (the interface, a save file, a bot).
 * Returns null if well formed, else the reason. Whether it can succeed is the
 * step's decision, against the state it actually applies to.
 */
export function airportCommandProblem(command: unknown): string | null {
  if (typeof command !== 'object' || command === null) return 'not an object';
  const c = command as Partial<AirportCommand> & { payload?: unknown };
  if (typeof c.tick !== 'number' || !Number.isSafeInteger(c.tick) || c.tick < 0) return 'bad tick';
  if (typeof c.type !== 'string' || !TYPES.has(c.type)) return 'unknown command';
  if (typeof c.payload !== 'object' || c.payload === null) return 'missing payload';
  const p = c.payload as Record<string, unknown>;
  if (c.type === 'tap' && (typeof p.gate !== 'number' || !Number.isSafeInteger(p.gate) || p.gate < 0)) return 'bad gate';
  if (c.type === 'buy' && !UPGRADE_IDS.includes(p.upgrade as never)) return 'unknown upgrade';
  if (c.type === 'boost' && !BOOST_IDS.includes(p.boost as never)) return 'unknown boost';
  return null;
}
