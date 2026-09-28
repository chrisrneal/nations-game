/**
 * One headless game. Browser-safe on purpose (no Node imports): the
 * determinism check runs this exact module in Node and in Chromium and
 * compares the hashes.
 */
import type { Command, Event, NationId } from '@nations/contracts';
import { Session, createWorld, hashState, mix32, scoreboard, viewFor, type RosterEntry, type Scoreboard, type WorldState } from '@nations/sim';
import { botDecide, type Strategy } from './bots.ts';

export interface GameOptions {
  readonly seed: number;
  readonly ticks: number;
  readonly roster: readonly RosterEntry[];
  /** Strategy per nation id; nations not listed play the greedy trader. */
  readonly strategies?: Readonly<Record<string, Strategy>>;
  /**
   * First nation starts `human` (idle, as if away), hands itself to the
   * caretaker a third of the way in and takes itself back at two thirds
   * (seam 7). On by default; the balance suite turns it off.
   */
  readonly humanSwitch?: boolean;
  /** Called after every tick, e.g. for invariant checks. */
  readonly onTick?: (state: WorldState, events: readonly Event[]) => void;
}

export interface GameMetrics {
  readonly seed: number;
  readonly ticks: number;
  readonly nations: number;
  readonly submitted: number;
  readonly rejectedAtSubmit: number;
  readonly rejectedAtStep: number;
  readonly tradesSettled: number;
  readonly offersExpired: number;
  readonly offersFailed: number;
  readonly controllerSwitches: number;
  readonly finalHash: string;
}

export interface GameResult {
  readonly metrics: GameMetrics;
  readonly state: WorldState;
  readonly score: Scoreboard;
}

export function playGame(options: GameOptions): GameResult {
  const { seed, ticks, roster } = options;
  const humanSwitch = options.humanSwitch ?? true;
  const firstId = roster[0]?.id;
  const state0 = createWorld({
    seed,
    roster,
    ...(humanSwitch && firstId !== undefined ? { controllers: { [firstId]: 'human' as const } } : {}),
  });
  const session = new Session(state0);
  const aiSeed = mix32(seed ^ 0x2545f491);
  const human: NationId | undefined = humanSwitch ? state0.nationOrder[0] : undefined;
  const handOff = Math.floor(ticks / 3);
  const takeBack = Math.floor((2 * ticks) / 3);

  let submitted = 0;
  let rejectedAtSubmit = 0;
  const submit = (command: Command): void => {
    submitted++;
    if (!session.submit(command).ok) rejectedAtSubmit++;
  };

  let rejectedAtStep = 0;
  let controllerSwitches = 0;
  for (let t = 0; t < ticks; t++) {
    const state = session.state;
    if (human !== undefined && (t === handOff || t === takeBack)) {
      const controller = t === handOff ? 'caretaker' : 'human';
      submit({ nationId: human, tick: t, type: 'setController', payload: { controller } });
    }
    for (const id of state.nationOrder) {
      if (state.controllers[id] === 'human') continue;
      const strategy = options.strategies?.[id] ?? 'trader';
      for (const command of botDecide(strategy, viewFor(state, id), aiSeed)) submit(command);
    }
    const events = session.advance(1);
    for (const event of events) {
      if (event.type === 'commandRejected') rejectedAtStep++;
      else if (event.type === 'controllerChanged') controllerSwitches++;
    }
    options.onTick?.(session.state, events);
  }

  const final = session.state;
  return {
    state: final,
    score: scoreboard(final),
    metrics: {
      seed,
      ticks,
      nations: roster.length,
      submitted,
      rejectedAtSubmit,
      rejectedAtStep,
      tradesSettled: final.ledger.tradesSettled,
      offersExpired: final.ledger.offersExpired,
      offersFailed: final.ledger.offersFailed,
      controllerSwitches,
      finalHash: hashState(final),
    },
  };
}

/** Plays a game with every AI nation on the greedy trader. */
export function runGame(options: GameOptions): GameMetrics {
  return playGame(options).metrics;
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
