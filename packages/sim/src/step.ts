import type { Command, ControllerSlot, Event, NationId } from '@nations/contracts';
import type { PingCommand, SetControllerCommand } from './commands.ts';
import { validateCommand } from './commands.ts';
import { randomInt } from './rng.ts';
import { TUNABLES } from './tunables.ts';
import type { NationRecord, WorldState } from './world.ts';

export interface StepResult {
  readonly state: WorldState;
  readonly events: readonly Event[];
}

/**
 * Puts commands in the one order every machine agrees on: by the nation's
 * position in `nationOrder`, then by the order that nation submitted them.
 * Arrival order across nations (which differs between a phone and a server)
 * therefore never affects the result. Unknown nations sort last and are
 * rejected by validation.
 */
export function canonicalOrder(state: WorldState, commands: readonly Command[]): Command[] {
  const rank = new Map<string, number>();
  state.nationOrder.forEach((id, index) => rank.set(id, index));
  return commands
    .map((command, index) => ({ command, index }))
    .sort((a, b) => {
      const ra = rank.get(a.command.nationId) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.command.nationId) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.index - b.index;
    })
    .map((entry) => entry.command);
}

/**
 * The whole simulation surface (seam 1). Applies the commands stamped for
 * `state.tick`, then advances the tick by one. Pure: never mutates `state` or
 * `commands`, reads no clock and draws randomness only from `state.rng`.
 *
 * Invalid commands are not errors: they become a `commandRejected` event seen
 * only by the sender, so a bad client cannot stop the world.
 */
export function step(state: WorldState, commands: readonly Command[]): StepResult {
  const events: Event[] = [];
  const nations: Record<NationId, NationRecord> = { ...state.nations };
  const controllers: Record<NationId, ControllerSlot> = { ...state.controllers };
  let rng = state.rng;
  const perNation = new Map<string, number>();
  const draft: WorldState = { ...state, nations, controllers };

  const reject = (command: Command, reason: string): void => {
    events.push({
      tick: state.tick,
      type: 'commandRejected',
      payload: { commandType: String(command.type), reason },
      audience: typeof command.nationId === 'string' ? [command.nationId] : [],
    });
  };

  for (const command of canonicalOrder(state, commands)) {
    const reason = validateCommand(draft, command);
    if (reason !== null) {
      reject(command, reason);
      continue;
    }
    const count = (perNation.get(command.nationId) ?? 0) + 1;
    perNation.set(command.nationId, count);
    if (count > TUNABLES.maxCommandsPerNationPerTick.value) {
      reject(command, 'too many commands this tick');
      continue;
    }

    const typed = command as PingCommand | SetControllerCommand;
    switch (typed.type) {
      case 'ping': {
        const sender = nations[typed.nationId] as NationRecord;
        const target = nations[typed.payload.target] as NationRecord;
        const roll = randomInt(rng, 1, TUNABLES.placeholderRollSides.value);
        rng = roll.rng;
        nations[sender.id] = {
          ...sender,
          private: { ...sender.private, pingsSent: sender.private.pingsSent + 1, lastRoll: roll.value },
        };
        const freshTarget = nations[target.id] as NationRecord;
        nations[target.id] = {
          ...freshTarget,
          public: { ...freshTarget.public, pingsReceived: freshTarget.public.pingsReceived + 1 },
        };
        events.push({
          tick: state.tick,
          type: 'pinged',
          payload: { from: sender.id, to: target.id },
          audience: [sender.id, target.id],
        });
        break;
      }
      case 'setController': {
        const from = controllers[typed.nationId];
        controllers[typed.nationId] = typed.payload.controller;
        events.push({
          tick: state.tick,
          type: 'controllerChanged',
          payload: { nationId: typed.nationId, from, to: typed.payload.controller },
          audience: [],
        });
        break;
      }
    }
  }

  return { state: { ...draft, rng, tick: state.tick + 1 }, events };
}
