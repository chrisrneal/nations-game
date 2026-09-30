/**
 * One headless game. Browser-safe on purpose (no Node imports): the
 * determinism check runs this exact module in Node and in Chromium and
 * compares the hashes.
 */
import type { Command, ControllerSlot, Event, NationId, NationView } from '@nations/contracts';
import { AiDirector, endowmentsOf } from '@nations/ai';
import { Session, createWorld, hashState, mix32, scoreboard, viewFor, type RosterEntry, type Scoreboard, type WorldState } from '@nations/sim';
import { aiDecide, botDecide, investRateOf, playedByAi, type Strategy } from './bots.ts';

export interface GameOptions {
  readonly seed: number;
  readonly ticks: number;
  readonly roster: readonly RosterEntry[];
  /** Strategy per nation id; nations not listed play `trader` (the shipped AI). */
  readonly strategies?: Readonly<Record<string, Strategy>>;
  /**
   * First nation starts `human` (idle, as if away), hands itself to the
   * caretaker a third of the way in and takes itself back at two thirds
   * (seam 7). On by default; the balance suite turns it off.
   */
  readonly humanSwitch?: boolean;
  /** Called after every tick, e.g. for invariant checks. */
  readonly onTick?: (state: WorldState, events: readonly Event[]) => void;
  /**
   * Mid-game changes of strategy: from `tick` on, `nation` plays `strategy` (the
   * Gate 2 spoiler scenarios). Not to `freeRider` or a fixed-rate investor: the
   * AI's free-riders and investment rates are fixed when the director is built.
   */
  readonly switches?: readonly { readonly tick: number; readonly nation: string; readonly strategy: Strategy }[];
  /**
   * Players who walk away: `nation` is handed to a human who sends nothing for
   * ticks [from, to), then back to its bot. Before leaving it may send
   * `leaving` (e.g. a pledge). The Gate 2 absence test.
   */
  readonly away?: readonly { readonly nation: string; readonly from: number; readonly to: number; readonly leaving?: readonly Command[] }[];
}

export interface GameMetrics {
  readonly seed: number;
  readonly ticks: number;
  readonly nations: number;
  readonly submitted: number;
  readonly rejectedAtSubmit: number;
  /** Refused at step for a reason other than a same-month race. */
  readonly rejectedAtStep: number;
  /** Refused at step because the other side answered or withdrew earlier in the same month (the AI's races, prompt 10 gap). */
  readonly racedAtStep: number;
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
  // The same seed derivation as the app (apps/web/src/platform/engine.ts).
  const aiSeed = mix32(seed ^ 0x2545f491);
  const human: NationId | undefined = humanSwitch ? state0.nationOrder[0] : undefined;
  const handOff = Math.floor(ticks / 3);
  const takeBack = Math.floor((2 * ticks) / 3);

  const strategyAt = (id: string, t: number): Strategy => {
    let strategy: Strategy = options.strategies?.[id] ?? 'trader';
    for (const sw of options.switches ?? []) if (sw.nation === id && sw.tick <= t) strategy = sw.strategy;
    return strategy;
  };
  if ((options.switches ?? []).some((sw) => sw.strategy === 'freeRider' || investRateOf(sw.strategy) !== null)) throw new Error('freeRider and the fixed-rate investors are fixed for the whole game: they cannot be switched to');
  // One director per game, for every nation the AI plays; it perceives every tick's events.
  const freeRiders = state0.nationOrder.filter((id) => strategyAt(id, 0) === 'freeRider');
  const investRates: Record<string, number> = {};
  for (const id of state0.nationOrder) {
    const rate = investRateOf(strategyAt(id, 0));
    if (rate !== null) investRates[id] = rate;
  }
  const director = new AiDirector({ endowments: endowmentsOf(roster), seed: aiSeed, freeRiders, investRates });

  let submitted = 0;
  let rejectedAtSubmit = 0;
  const submit = (command: Command): void => {
    submitted++;
    if (!session.submit(command).ok) rejectedAtSubmit++;
  };

  let rejectedAtStep = 0;
  let racedAtStep = 0;
  let controllerSwitches = 0;
  for (let t = 0; t < ticks; t++) {
    const state = session.state;
    if (human !== undefined && (t === handOff || t === takeBack)) {
      const controller = t === handOff ? 'caretaker' : 'human';
      submit({ nationId: human, tick: t, type: 'setController', payload: { controller } });
    }
    for (const a of options.away ?? []) {
      if (t === a.from) {
        for (const command of a.leaving ?? []) submit({ ...command, tick: t });
        submit({ nationId: a.nation as NationId, tick: t, type: 'setController', payload: { controller: 'human' } });
      }
      if (t === a.to) submit({ nationId: a.nation as NationId, tick: t, type: 'setController', payload: { controller: 'ai' } });
    }
    const idle = (id: NationId): boolean => state.controllers[id] === 'human' || (options.away ?? []).some((a) => a.nation === id && t === a.from);
    // The director acts for AI-played nations (as their `ai` or `caretaker`); a bot's nation counts as human to it.
    const controllerOf = (id: NationId): ControllerSlot => (idle(id) || !playedByAi(strategyAt(id, t)) ? 'human' : state.controllers[id]!);
    const views = new Map<NationId, NationView>();
    const viewOf = (id: NationId): NationView => {
      let view = views.get(id);
      if (view === undefined) views.set(id, (view = viewFor(state, id)));
      return view;
    };
    const ai = director.decide(t, controllerOf, viewOf);
    const aiByNation = new Map<string, Command[]>();
    for (const command of ai.commands) {
      const list = aiByNation.get(command.nationId) ?? [];
      list.push(command);
      aiByNation.set(command.nationId, list);
    }
    for (const id of state.nationOrder) {
      if (idle(id)) continue;
      const strategy = strategyAt(id, t);
      const commands = playedByAi(strategy) ? aiDecide(strategy, viewOf(id), aiByNation.get(id) ?? []) : botDecide(strategy, viewOf(id), aiSeed);
      for (const command of commands) submit(command);
    }
    const events = session.advance(1);
    for (const event of events) {
      if (event.type === 'commandRejected') {
        if (/no longer open/.test((event.payload as { reason?: string }).reason ?? '')) racedAtStep++;
        else rejectedAtStep++;
      } else if (event.type === 'controllerChanged') controllerSwitches++;
    }
    director.observe(events);
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
      racedAtStep,
      tradesSettled: final.ledger.tradesSettled,
      offersExpired: final.ledger.offersExpired,
      offersFailed: final.ledger.offersFailed,
      controllerSwitches,
      finalHash: hashState(final),
    },
  };
}

/** Plays a game; nations without a strategy play `trader`, the shipped AI. */
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
