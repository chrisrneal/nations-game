/**
 * Test helpers for packages/ai. The file name contains ".test." so the purity
 * check treats it as test code (it imports the sim to drive games), and it does
 * not end in ".test.ts" so Vitest does not run it as a suite.
 */
import type { Command, ControllerSlot, Event, NationId } from '@nations/contracts';
import { Session, createWorld, hashState, mix32, rosterFromWorldData, viewFor, type RosterEntry } from '@nations/sim';
import world2030 from '../../../data/world-2030.json' with { type: 'json' };
import { AiDirector, endowmentsOf, type TickUsage } from './director.ts';
import type { ExplanationEvent } from './explain.ts';

export function fullRoster(): RosterEntry[] {
  return rosterFromWorldData(world2030);
}

export interface PlayOptions {
  readonly seed: number;
  readonly ticks: number;
  readonly roster: readonly RosterEntry[];
  readonly controllers?: Readonly<Record<string, ControllerSlot>>;
  /** Commands for human nations, by tick. */
  readonly script?: (tick: number, session: Session) => readonly Command[];
  /** Replace the director after this many ticks with one restored from a JSON snapshot (and reload the sim save). */
  readonly reloadAt?: number;
}

export interface Played {
  readonly session: Session;
  readonly director: AiDirector;
  readonly events: Event[];
  readonly explanations: ExplanationEvent[];
  readonly commands: Command[];
  readonly usage: TickUsage[];
  readonly hash: string;
}

export function play(options: PlayOptions): Played {
  const { seed, ticks, roster } = options;
  let session = new Session(createWorld({ seed, roster, ...(options.controllers ? { controllers: options.controllers } : {}) }));
  const directorOptions = { endowments: endowmentsOf(roster), seed: mix32(seed ^ 0x2545f491) };
  let director = new AiDirector(directorOptions);
  const events: Event[] = [];
  const explanations: ExplanationEvent[] = [];
  const commands: Command[] = [];
  const usage: TickUsage[] = [];
  for (let t = 0; t < ticks; t++) {
    if (options.reloadAt === t) {
      const snapshot = JSON.parse(JSON.stringify(director.snapshot()));
      director = AiDirector.restore(directorOptions, snapshot);
      session = Session.load(JSON.parse(JSON.stringify(session.save())));
    }
    const state = session.state;
    for (const command of options.script?.(t, session) ?? []) {
      const r = session.submit(command);
      if (!r.ok) throw new Error(`script command rejected: ${JSON.stringify(r)}`);
    }
    const out = director.decide(state.tick, (id) => state.controllers[id], (id) => viewFor(state, id));
    for (const command of out.commands) {
      const r = session.submit(command);
      if (!r.ok) throw new Error(`AI command rejected at submit: ${JSON.stringify(r)} ${JSON.stringify(command)}`);
      commands.push(command);
    }
    explanations.push(...out.explanations);
    usage.push(out.usage);
    const stepped = session.advance(1);
    events.push(...stepped);
    director.observe(stepped);
  }
  return { session, director, events, explanations, commands, usage, hash: hashState(session.state) };
}

export const id = (s: string): NationId => s as NationId;
