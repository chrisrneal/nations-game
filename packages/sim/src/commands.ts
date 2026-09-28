import type { Command, ControllerSlot, NationId } from '@nations/contracts';
import type { WorldState } from './world.ts';

/**
 * Phase 0 placeholder command: nation A pings nation B. It has no game meaning;
 * it exists so the step, the RNG, the hash, private fields and events all have
 * something real to exercise.
 */
export type PingCommand = Command<'ping', { readonly target: NationId }>;

/**
 * Switch the issuing nation's controller slot mid-game (seam 7): a player hands
 * their nation to the caretaker AI, or takes it back.
 */
export type SetControllerCommand = Command<'setController', { readonly controller: ControllerSlot }>;

export type SimCommand = PingCommand | SetControllerCommand;

export const COMMAND_TYPES = ['ping', 'setController'] as const;
const CONTROLLER_SLOTS: readonly string[] = ['human', 'ai', 'caretaker'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Checks that do not depend on the tick being stepped: shape, known nation,
 * known type, payload. Everything arriving from a UI, an AI or a network is
 * treated as untrusted `unknown` here. Returns a reason, or null when valid.
 */
export function validateCommandShape(state: WorldState, command: unknown): string | null {
  if (!isRecord(command)) return 'command is not an object';
  const { nationId, tick, type, payload } = command;
  if (typeof nationId !== 'string' || !Object.hasOwn(state.nations, nationId)) {
    return 'unknown nation';
  }
  if (typeof tick !== 'number' || !Number.isSafeInteger(tick) || tick < 0) return 'bad tick';
  if (!isRecord(payload)) return 'payload is not an object';
  switch (type) {
    case 'ping': {
      const { target } = payload;
      if (typeof target !== 'string' || !Object.hasOwn(state.nations, target)) {
        return 'unknown target';
      }
      if (target === nationId) return 'cannot ping self';
      return null;
    }
    case 'setController': {
      const { controller } = payload;
      if (typeof controller !== 'string' || !CONTROLLER_SLOTS.includes(controller)) {
        return 'unknown controller slot';
      }
      return null;
    }
    default:
      return 'unknown command type';
  }
}

/** Full validation for a command about to be applied in the step for `state.tick`. */
export function validateCommand(state: WorldState, command: unknown): string | null {
  const shape = validateCommandShape(state, command);
  if (shape !== null) return shape;
  if ((command as Command).tick !== state.tick) return 'wrong tick';
  return null;
}
