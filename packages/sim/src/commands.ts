import type { WarehouseCommand } from '@warehouse/contracts';
import { BOOST_IDS, UPGRADE_IDS } from './catalog.ts';

const TYPES = new Set(['tap', 'tapPick', 'tapReceive', 'buy', 'boost', 'sell', 'wms']);

function id(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Shape check for a `wms` command's payload (slice 7). */
function wmsProblem(p: Record<string, unknown>): string | null {
  switch (p.action) {
    case 'release':
      return Array.isArray(p.orders) && p.orders.length > 0 && p.orders.length <= 500 && p.orders.every(id) ? null : 'bad orders';
    case 'priority':
      return id(p.order) && (p.priority === 1 || p.priority === 2 || p.priority === 3) ? null : 'bad priority';
    case 'hold':
    case 'unhold':
    case 'expedite':
      return id(p.order) ? null : 'bad order';
    case 'assign':
      return id(p.order) && id(p.line) && id(p.picker) ? null : 'bad assignment';
    case 'cancelLine':
      return id(p.order) && id(p.line) ? null : 'bad line';
    case 'policy': {
      const plan = p.policy as Record<string, unknown> | null | undefined;
      return typeof plan === 'object' && plan !== null && typeof plan.pick === 'string' && typeof plan.release === 'string' && id(plan.pickers) ? null : 'bad plan';
    }
    default:
      return 'unknown WMS action';
  }
}

/**
 * Shape check for a command from outside (the interface, a save file, a bot).
 * Returns null if well formed, else the reason. Whether it can succeed is the
 * step's decision, against the state it actually applies to.
 */
export function warehouseCommandProblem(command: unknown): string | null {
  if (typeof command !== 'object' || command === null) return 'not an object';
  const c = command as Partial<WarehouseCommand> & { payload?: unknown };
  if (typeof c.tick !== 'number' || !Number.isSafeInteger(c.tick) || c.tick < 0) return 'bad tick';
  if (typeof c.type !== 'string' || !TYPES.has(c.type)) return 'unknown command';
  if (typeof c.payload !== 'object' || c.payload === null) return 'missing payload';
  const p = c.payload as Record<string, unknown>;
  if (c.type === 'tap' && (typeof p.dock !== 'number' || !Number.isSafeInteger(p.dock) || p.dock < 0)) return 'bad dock';
  if (c.type === 'buy' && !UPGRADE_IDS.includes(p.upgrade as never)) return 'unknown upgrade';
  if (c.type === 'boost' && !BOOST_IDS.includes(p.boost as never)) return 'unknown boost';
  if (c.type === 'wms') return wmsProblem(p);
  return null;
}
