import type { Command } from '@nations/contracts';
import { validateCommandShape } from './commands.ts';
import { TUNABLES } from './tunables.ts';
import type { WorldState } from './world.ts';

export type SubmitResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Commands waiting for their tick. Lives on the host side of the step: the UI
 * and AI submit here, the host drains one tick's worth into `step`.
 *
 * Submission rejects what can never succeed (bad shape, unknown nation, a tick
 * already stepped, over the per-tick limit) so the sender hears at once. The
 * step validates again against the state it actually applies to.
 */
export class CommandQueue {
  private readonly items: Command[] = [];

  submit(state: WorldState, command: Command): SubmitResult {
    const reason = validateCommandShape(state, command);
    if (reason !== null) return { ok: false, reason };
    if (command.tick < state.tick) return { ok: false, reason: 'tick already stepped' };
    const sameSlot = this.items.filter(
      (item) => item.nationId === command.nationId && item.tick === command.tick,
    ).length;
    if (sameSlot >= TUNABLES.maxCommandsPerNationPerTick.value) {
      return { ok: false, reason: 'too many commands this tick' };
    }
    this.items.push(command);
    return { ok: true };
  }

  /** Removes and returns the commands stamped for `tick`, in submission order. */
  take(tick: number): Command[] {
    const taken: Command[] = [];
    let write = 0;
    for (const item of this.items) {
      if (item.tick === tick) taken.push(item);
      else this.items[write++] = item;
    }
    this.items.length = write;
    return taken;
  }

  /** Everything still waiting, in submission order. */
  pending(): readonly Command[] {
    return [...this.items];
  }
}
