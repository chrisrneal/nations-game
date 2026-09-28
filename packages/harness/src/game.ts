/**
 * One headless game with the dummy AI. Browser-safe on purpose (no Node
 * imports): the determinism check runs this exact module in Node and in
 * Chromium and compares the hashes.
 */
import type { Command, Event } from '@nations/contracts';
import { dummyDecide } from '@nations/ai';
import { Session, createWorld, hashState, mix32, viewFor, type RosterEntry } from '@nations/sim';

export interface GameOptions {
  readonly seed: number;
  readonly ticks: number;
  readonly roster: readonly RosterEntry[];
}

export interface GameMetrics {
  readonly seed: number;
  readonly ticks: number;
  readonly nations: number;
  readonly submitted: number;
  readonly rejectedAtSubmit: number;
  readonly rejectedAtStep: number;
  readonly pings: number;
  readonly controllerSwitches: number;
  readonly finalHash: string;
}

/**
 * Plays `ticks` ticks at full speed. Every nation in an `ai` or `caretaker`
 * slot is played by the dummy AI through its View. The first nation starts
 * `human` (idle, as if the player is away), hands itself to the caretaker a
 * third of the way in and takes itself back at two thirds (seam 7).
 */
export function runGame(options: GameOptions): GameMetrics {
  const { seed, ticks, roster } = options;
  const firstId = roster[0]?.id;
  const state0 = createWorld({
    seed,
    roster,
    ...(firstId === undefined ? {} : { controllers: { [firstId]: 'human' as const } }),
  });
  const session = new Session(state0);
  const aiSeed = mix32(seed ^ 0x2545f491);
  const human = state0.nationOrder[0];
  const handOff = Math.floor(ticks / 3);
  const takeBack = Math.floor((2 * ticks) / 3);

  let submitted = 0;
  let rejectedAtSubmit = 0;
  const submit = (command: Command): void => {
    submitted++;
    if (!session.submit(command).ok) rejectedAtSubmit++;
  };

  let rejectedAtStep = 0;
  let pings = 0;
  let controllerSwitches = 0;
  const count = (events: readonly Event[]): void => {
    for (const event of events) {
      if (event.type === 'commandRejected') rejectedAtStep++;
      else if (event.type === 'pinged') pings++;
      else if (event.type === 'controllerChanged') controllerSwitches++;
    }
  };

  for (let t = 0; t < ticks; t++) {
    const state = session.state;
    if (human !== undefined && (t === handOff || t === takeBack)) {
      const controller = t === handOff ? 'caretaker' : 'human';
      submit({ nationId: human, tick: t, type: 'setController', payload: { controller } });
    }
    for (const id of state.nationOrder) {
      if (state.controllers[id] === 'human') continue;
      for (const command of dummyDecide(viewFor(state, id), aiSeed)) submit(command);
    }
    count(session.advance(1));
  }

  return {
    seed,
    ticks,
    nations: roster.length,
    submitted,
    rejectedAtSubmit,
    rejectedAtStep,
    pings,
    controllerSwitches,
    finalHash: hashState(session.state),
  };
}

/** Final hashes for seeds [firstSeed, firstSeed + count). */
export function hashSeeds(firstSeed: number, count: number, ticks: number, roster: readonly RosterEntry[]): string[] {
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) hashes.push(runGame({ seed: firstSeed + i, ticks, roster }).finalHash);
  return hashes;
}

/** Wall time of `runs` catch-ups of `ticks` ticks each, in ms, via the given clock. */
export function benchCatchUp(
  ticks: number,
  runs: number,
  roster: readonly RosterEntry[],
  now: () => number,
): number[] {
  const times: number[] = [];
  for (let run = 0; run < runs; run++) {
    const start = now();
    runGame({ seed: run + 1, ticks, roster });
    times.push(now() - start);
  }
  return times;
}
