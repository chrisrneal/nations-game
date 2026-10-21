import { describe, expect, it } from 'vitest';
import type { GameCommand, GameState, HomeView, Mode, Round } from '@snacks/contracts';
import { AVATARS, SNACK_TUNABLES, generatePuzzle, hashState, solveWave, startGame, step, witnessCommands } from '@snacks/sim';
import { GameEngine } from './engine.ts';
import { LocalHost, dayNumber, slotFor, type GameUpdate, type LegacySlot } from './localHost.ts';
import { MemorySaveStore } from './saves.ts';

const DAY = 20_400;
const HOUR = 3_600_000;
const DAY_MS = 86_400_000;

/** A device: one store, one clock, the old active-slot key. Hosts made on it are app launches. */
function device(start = DAY * DAY_MS + HOUR) {
  const clock = { now: start, offset: 0 };
  const store = new MemorySaveStore();
  let legacy: string | null = null;
  const legacyActive: LegacySlot = { get: () => legacy, clear: () => void (legacy = null) };
  return { clock, store, legacyActive, setLegacy: (slot: string | null) => void (legacy = slot) };
}

type Device = ReturnType<typeof device>;

/** Opens the app on a device, as a fresh launch does. */
function launch(d: Device, seed = 5) {
  const h = new LocalHost({ engine: new GameEngine(), store: d.store, legacyActive: d.legacyActive, now: () => d.clock.now, timezoneOffset: () => d.clock.offset, newSeed: () => seed });
  let latest: GameUpdate | null = null;
  let home: HomeView | null = null;
  h.subscribe((u) => (latest = u));
  h.subscribeHome((v) => (home = v));
  return { h, latest: () => latest, home: () => home! };
}

type App = ReturnType<typeof launch>;

const profile = (app: App, id: string) => app.home().profiles.find((p) => p.id === id)!;

/** The game a profile is playing, tracked alongside the host so the witness can be played through it. */
function track(mode: Mode, round: Round, day: number, seed = 0): { state: GameState } {
  return { state: startGame(generatePuzzle(mode, round, day, seed)) };
}

async function send(app: App, game: { state: GameState }, command: GameCommand): Promise<void> {
  expect(await app.h.submit(command)).toBeNull();
  game.state = step(game.state, command).state;
}

/** Plays waves `from` to `to` (1-based) of the puzzle's witness through the host. */
async function playWaves(app: App, game: { state: GameState }, from: number, to: number): Promise<void> {
  for (const layout of game.state.puzzle.witness.slice(from - 1, to)) {
    for (const command of witnessCommands(game.state, layout)) await send(app, game, command);
  }
  expect(app.latest()!.fingerprint).toBe(hashState(game.state));
}

/** An empty square a friend can stand on with any facing: on the playground, away from lunchboxes. */
function openSquare(app: App): number {
  const v = app.latest()!.view;
  return v.squares.findIndex(
    (s, c) => s === 'open' && v.friends.every((f) => f.cell !== c) && v.lunchboxes.every((l) => Math.abs((l.cell % v.width) - (c % v.width)) + Math.abs(Math.floor(l.cell / v.width) - Math.floor(c / v.width)) > 1),
  );
}

/**
 * Commands that play a daily badly enough to lose it, retry the failed wave
 * and then win: waves 1-3 by the witness, nobody fed until the day is lost,
 * a retry, then the solver's setup for every wave left. Searched in the sim
 * from `from`, for the first day where the solver wins after the retry.
 */
function loseRetryWin(from: number): { day: number; commands: GameCommand[] } {
  for (let day = from; day < from + 30; day++) {
    let state = startGame(generatePuzzle('main', 'daily', day, 0));
    const commands: GameCommand[] = [];
    const apply = (command: GameCommand): boolean => {
      const r = step(state, command);
      if (r.error !== null) return false;
      state = r.state;
      commands.push(command);
      return true;
    };
    for (const layout of state.puzzle.witness.slice(0, 3)) for (const c of witnessCommands(state, layout)) apply(c);
    for (const f of state.friends) if (f.cell >= 0) apply({ type: 'toTray', friend: f.id });
    while (state.phase === 'setup') apply({ type: 'go' });
    apply({ type: 'retry' });
    // Read through a function: the loop above narrowed `state.phase`, but the retry changed it.
    const phase = (): GameState['phase'] => state.phase;
    while (phase() === 'setup') {
      const owned: Partial<Record<string, number>> = {};
      for (const f of state.friends) owned[f.type] = (owned[f.type] ?? 0) + 1;
      const kids = state.kids.map((k) => ({ id: k.id, cell: k.cell, wants: state.puzzle.kids.find((p) => p.id === k.id)!.wants }));
      const plan = solveWave(state.puzzle.board, kids, 'main', { owned, points: state.points, shop: state.puzzle.shop });
      if (plan === null) break;
      for (const c of witnessCommands(state, { wave: state.wave, buys: plan.buys, friends: plan.friends })) apply(c);
    }
    if (phase() === 'won') return { day, commands };
  }
  throw new Error('No day near this one can be won after a retry');
}

async function placeOne(app: App): Promise<void> {
  const v = app.latest()!.view;
  const friend = v.friends.find((f) => f.cell < 0)!;
  expect(await app.h.submit({ type: 'place', friend: friend.id, cell: openSquare(app), facing: v.facings[friend.type][0]! })).toBeNull();
}

async function twoProfiles(d: Device): Promise<App> {
  const app = launch(d);
  await app.h.start();
  expect(await app.h.addProfile({ name: 'Sam', avatar: AVATARS[1]!, mode: 'main' })).toBeNull();
  return app;
}

describe('the local host: days (D18)', () => {
  it('counts days on the device calendar: the daily changes at local midnight', () => {
    expect(dayNumber(DAY_MS * 10 + 1000, 0)).toBe(10);
    // 23:30 local time on day 10 in a zone 5 hours behind UTC is already day 11 in UTC.
    expect(dayNumber(DAY_MS * 11 + 4 * HOUR + 1_800_000, 300)).toBe(10);
  });

  it('counts down to local midnight', () => {
    const d = device(DAY * DAY_MS + 22 * HOUR);
    expect(launch(d).h.msToNextDay()).toBe(2 * HOUR);
    d.clock.offset = 300; // 17:00 local, five hours behind UTC
    expect(launch(d).h.msToNextDay()).toBe(7 * HOUR);
  });
});

describe('the local host: profiles (RULES 12)', () => {
  it('a new device gets one profile and goes straight to today’s daily, saved in that profile’s slot', async () => {
    const d = device();
    const app = launch(d);
    await app.h.start();
    expect(app.home().profiles.map((p) => [p.id, p.mode, p.streak])).toEqual([['p1', 'main', 0]]);
    expect(app.home().avatars).toEqual(AVATARS);
    expect(app.home().current).toBe('p1');
    expect(app.latest()).toMatchObject({ profile: 'p1', view: { round: 'daily', day: DAY, wave: 1 } });
    expect(await d.store.get(`p1/${slotFor('main', 'daily', DAY)}`)).toBeDefined();
  });

  it('tells the screen how far a Nurse heals, from the sim’s tunable', async () => {
    const app = launch(device());
    await app.h.start();
    expect(app.latest()!.healRange).toBe(SNACK_TUNABLES.nurseRange.value);
  });

  it('with more than one profile, a launch opens the picker and no game', async () => {
    const d = device();
    await twoProfiles(d);
    const again = launch(d);
    await again.h.start();
    expect(again.home().current).toBeNull();
    expect(again.home().profiles.map((p) => p.name)).toEqual(['', 'Sam']);
    expect(again.latest()).toBeNull();
  });

  it('each profile keeps its own game: switching away and back finds it untouched', async () => {
    const d = device();
    const app = await twoProfiles(d);
    await placeOne(app);
    const first = app.latest()!.fingerprint;
    await app.h.choose('p2');
    expect(app.home().current).toBe('p2');
    expect(app.latest()).toMatchObject({ profile: 'p2', view: { wave: 1 } });
    expect(app.latest()!.view.friends.every((f) => f.cell < 0)).toBe(true);
    await placeOne(app);
    await placeOne(app);
    const second = app.latest()!.fingerprint;
    await app.h.choose('p1');
    expect(app.latest()).toMatchObject({ profile: 'p1', fingerprint: first });
    // And after closing the app.
    const again = launch(d);
    await again.h.start();
    await again.h.choose('p2');
    expect(again.latest()!.fingerprint).toBe(second);
    expect((await d.store.list()).map((s) => s.slot)).toEqual([`p1/daily-main-${DAY}`, `p2/daily-main-${DAY}`]);
  });

  it('a failed daily keeps its retry state per profile: it retries from the failed wave (D10)', async () => {
    const d = device();
    const app = await twoProfiles(d);
    // Nobody fed: one more hungry kid than allowed loses the day.
    while (app.latest()!.view.phase === 'setup') expect(await app.h.submit({ type: 'go' })).toBeNull();
    const failed = app.latest()!.view;
    expect(failed.phase).toBe('lost');
    await app.h.choose('p2');
    expect(app.latest()!.view.phase).toBe('setup');
    await app.h.choose('p1');
    expect(app.latest()!.view).toMatchObject({ phase: 'lost', wave: failed.wave });
    expect(await app.h.submit({ type: 'retry' })).toBeNull();
    expect(app.latest()!.view).toMatchObject({ phase: 'setup', wave: failed.wave });
  });

  it('makes, edits and deletes profiles; deleting removes that profile’s saves and never the last profile', async () => {
    const d = device();
    const app = await twoProfiles(d);
    expect(await app.h.addProfile({ name: 'Pip', avatar: AVATARS[1]!, mode: 'kindy' })).toMatch(/picture/);
    expect(await app.h.editProfile('p2', { name: 'Sammy', avatar: AVATARS[3]! })).toBeNull();
    expect(profile(app, 'p2')).toMatchObject({ name: 'Sammy', avatar: AVATARS[3], mode: 'main' });
    await app.h.choose('p2');
    await placeOne(app);
    expect(await app.h.deleteProfile('p2')).toBeNull();
    expect(app.home()).toMatchObject({ current: null, profiles: [{ id: 'p1' }] });
    expect((await d.store.list()).map((s) => s.slot)).toEqual([`p1/daily-main-${DAY}`]);
    expect(await app.h.deleteProfile('p1')).toMatch(/last/);
    await app.h.choose('p1');
    expect(app.latest()!.profile).toBe('p1');
  });

  it('tells the screen how long a Kindy child may sit before a hint shows itself, from the sim’s tunable', async () => {
    const app = launch(device());
    await app.h.start();
    expect(app.latest()!.hintIdle).toBe(SNACK_TUNABLES.kindyHintIdle.value);
  });
});

describe('the local host: Kindy profiles (RULES 11, 12)', () => {
  async function withKindy(d: Device): Promise<App> {
    const app = await twoProfiles(d);
    expect(await app.h.addProfile({ name: 'Pip', avatar: AVATARS[2]!, mode: 'kindy' })).toBeNull();
    await app.h.choose('p3');
    return app;
  }

  it('a Kindy profile opens its own Kindy daily, from the date seed with the Kindy salt, saved in its own slot', async () => {
    const d = device();
    const app = await withKindy(d);
    expect(app.home().current).toBe('p3');
    const update = app.latest()!;
    expect(update.profile).toBe('p3');
    expect(update.view).toMatchObject({ mode: 'kindy', round: 'daily', day: DAY, width: 4, height: 4 });
    expect(update.fingerprint).toBe(hashState(track('kindy', 'daily', DAY).state));
    expect(update.view.hint?.kind).toBe('place');
    expect(await d.store.get(`p3/${slotFor('kindy', 'daily', DAY)}`)).toBeDefined();
    expect(profile(app, 'p3')).toMatchObject({ streak: 0, today: null });
  });

  it('a won Kindy daily is on that child’s record only, and reopens finished; there is no bonus round', async () => {
    const d = device();
    const app = await withKindy(d);
    await playWaves(app, track('kindy', 'daily', DAY), 1, 5);
    expect(app.latest()!.view.phase).toBe('won');
    expect(profile(app, 'p3')).toMatchObject({ streak: 1, today: { day: DAY, fed: 5, hungry: 0, retries: 0 } });
    expect(profile(app, 'p1').today).toBeNull();
    expect(profile(app, 'p2').today).toBeNull();
    await app.h.bonus();
    expect(app.latest()!.view).toMatchObject({ mode: 'kindy', round: 'daily', phase: 'won' });
    const again = launch(d);
    await again.h.start();
    await again.h.choose('p3');
    expect(again.latest()!.view).toMatchObject({ mode: 'kindy', round: 'daily', phase: 'won' });
  });

  it('a Kindy child’s missed waves and wrong snacks never lose the day, and never touch the other children’s games', async () => {
    const d = device();
    const app = await withKindy(d);
    for (let i = 0; i < 3; i++) expect(await app.h.submit({ type: 'go' })).toBeNull();
    expect(app.latest()!.view).toMatchObject({ phase: 'setup', wave: 4, hungry: 0 });
    expect(app.latest()!.view.kids).toHaveLength(4);
    await app.h.choose('p1');
    expect(app.latest()!.view).toMatchObject({ mode: 'main', wave: 1 });
    await app.h.choose('p3');
    expect(app.latest()!.view).toMatchObject({ mode: 'kindy', wave: 4 });
  });

  it('Kindy practice is a Kindy board, and today’s daily comes back after it', async () => {
    const d = device();
    const app = await withKindy(d);
    await app.h.practice();
    expect(app.latest()!.view).toMatchObject({ mode: 'kindy', round: 'practice', width: 4 });
    await app.h.daily();
    expect(app.latest()!.view).toMatchObject({ mode: 'kindy', round: 'daily', day: DAY });
  });
});

describe('the local host: finishing the daily, the streak and the bonus round (RULES 9)', () => {
  it('a finished daily is recorded for its profile only, shows as done today, and opens the bonus round', async () => {
    const d = device();
    const app = await twoProfiles(d);
    await app.h.choose('p2');
    await app.h.bonus();
    expect(app.latest()!.view.round).toBe('daily');
    await playWaves(app, track('main', 'daily', DAY), 1, 10);
    expect(app.latest()!.view.phase).toBe('won');
    expect(profile(app, 'p2')).toMatchObject({ streak: 1, best: 1, today: { day: DAY, retries: 0, bonus: false } });
    expect(profile(app, 'p1')).toMatchObject({ streak: 0, today: null });
    // Reopening shows the finished daily again, still won.
    await app.h.choose('p1');
    await app.h.choose('p2');
    expect(app.latest()!.view).toMatchObject({ round: 'daily', phase: 'won' });
    await app.h.bonus();
    const bonus = track('main', 'bonus', DAY);
    expect(app.latest()!.fingerprint).toBe(hashState(bonus.state));
    await playWaves(app, bonus, 1, 10);
    expect(profile(app, 'p2')).toMatchObject({ streak: 1, today: { bonus: true } });
  });

  it('the streak counts days in a row, and a missed day resets it', async () => {
    const d = device();
    for (const day of [DAY, DAY + 1]) {
      d.clock.now = day * DAY_MS + HOUR;
      const app = launch(d);
      await app.h.start();
      await playWaves(app, track('main', 'daily', day), 1, 10);
      expect(profile(app, 'p1').streak).toBe(day - DAY + 1);
    }
    d.clock.now = (DAY + 2) * DAY_MS + HOUR;
    let app = launch(d);
    await app.h.start();
    expect(profile(app, 'p1')).toMatchObject({ streak: 2, today: null });
    d.clock.now = (DAY + 3) * DAY_MS + HOUR;
    app = launch(d);
    await app.h.start();
    expect(profile(app, 'p1')).toMatchObject({ streak: 0, best: 2 });
  });

  it('a day finished after a failed wave and a retry still counts', async () => {
    const { day, commands } = loseRetryWin(DAY);
    const app = launch(device(day * DAY_MS + HOUR));
    await app.h.start();
    const game = track('main', 'daily', day);
    for (const command of commands) await send(app, game, command);
    expect(app.latest()!.view.phase).toBe('won');
    expect(profile(app, 'p1')).toMatchObject({ streak: 1, today: { retries: 1 } });
  });

  it('a daily won with hints records how many, and still counts for the streak (RULES 8b)', async () => {
    const app = launch(device());
    await app.h.start();
    const game = track('main', 'daily', DAY);
    let used = 0;
    while (game.state.phase === 'setup') {
      await send(app, game, { type: game.state.hint?.tier === 0 ? 'go' : 'hint' });
      if (game.state.hint !== null) used += 1;
    }
    expect(app.latest()!.view.phase).toBe('won');
    expect(app.latest()!.fingerprint).toBe(hashState(game.state));
    expect(used).toBeGreaterThan(10);
    expect(app.latest()!.view.hints.reduce((a, b) => a + b, 0)).toBe(used);
    expect(profile(app, 'p1')).toMatchObject({ streak: 1, today: { day: DAY, hints: used, hungry: 0 } });
  });

  it('practice never touches the streak or the day’s record', async () => {
    const app = launch(device());
    await app.h.start();
    await app.h.practice();
    const practice = track('main', 'practice', 0, 5);
    expect(app.latest()!.fingerprint).toBe(hashState(practice.state));
    await playWaves(app, practice, 1, 10);
    expect(app.latest()!.view).toMatchObject({ round: 'practice', phase: 'won' });
    expect(profile(app, 'p1')).toMatchObject({ streak: 0, best: 0, today: null, recent: [] });
  });

  it('practice is per profile and reopens where it was left', async () => {
    const d = device();
    const app = await twoProfiles(d);
    await app.h.practice();
    await placeOne(app);
    const practice = app.latest()!.fingerprint;
    await app.h.choose('p2');
    expect(app.latest()!.view.round).toBe('daily');
    await app.h.choose('p1');
    expect(app.latest()).toMatchObject({ fingerprint: practice, view: { round: 'practice' } });
  });
});

describe('the local host: dates that misbehave (K7)', () => {
  it('a run going past midnight finishes on the day it started; the next launch opens the new day', async () => {
    const d = device(DAY * DAY_MS + 23 * HOUR + 50 * 60_000);
    const app = launch(d);
    await app.h.start();
    const game = track('main', 'daily', DAY);
    await playWaves(app, game, 1, 9);
    d.clock.now = (DAY + 1) * DAY_MS + 10 * 60_000;
    await playWaves(app, game, 10, 10);
    expect(app.latest()!.view).toMatchObject({ day: DAY, phase: 'won' });
    expect(profile(app, 'p1')).toMatchObject({ streak: 1, today: null, recent: [{ day: DAY }] });
    expect(app.home().day).toBe(DAY + 1);
    const next = launch(d);
    await next.h.start();
    expect(next.latest()!.view).toMatchObject({ day: DAY + 1, wave: 1, phase: 'setup' });
    expect(profile(next, 'p1').streak).toBe(1);
  });

  it('a run left unfinished at midnight stays saved; the next launch opens the new day', async () => {
    const d = device(DAY * DAY_MS + 23 * HOUR);
    const app = launch(d);
    await app.h.start();
    await placeOne(app);
    d.clock.now = (DAY + 1) * DAY_MS + HOUR;
    const next = launch(d);
    await next.h.start();
    expect(next.latest()!.view.day).toBe(DAY + 1);
    expect(await d.store.get(`p1/daily-main-${DAY}`)).toBeDefined();
  });

  it('a timezone change that turns today back a day opens that day’s daily, then returns to the finished one', async () => {
    const d = device(DAY * DAY_MS + 5 * HOUR);
    let app = launch(d);
    await app.h.start();
    await playWaves(app, track('main', 'daily', DAY), 1, 10);
    // Flown west: ten hours behind UTC, it is 19:00 the day before.
    d.clock.offset = 600;
    app = launch(d);
    await app.h.start();
    expect(app.home().day).toBe(DAY - 1);
    expect(app.latest()!.view).toMatchObject({ day: DAY - 1, phase: 'setup' });
    expect(profile(app, 'p1')).toMatchObject({ today: null, best: 1 });
    // Home again: the finished daily, done for today, streak intact.
    d.clock.offset = 0;
    app = launch(d);
    await app.h.start();
    expect(app.latest()!.view).toMatchObject({ day: DAY, phase: 'won' });
    expect(profile(app, 'p1')).toMatchObject({ streak: 1, today: { day: DAY } });
  });

  it('a clock set far backwards opens that day’s puzzle and leaves the saves and history alone', async () => {
    const d = device();
    let app = launch(d);
    await app.h.start();
    await playWaves(app, track('main', 'daily', DAY), 1, 10);
    for (const back of [DAY - 400, 3, -2]) {
      d.clock.now = back * DAY_MS + HOUR;
      app = launch(d);
      await app.h.start();
      expect(app.latest()!.view.day).toBe(back);
      expect(profile(app, 'p1')).toMatchObject({ streak: 0, best: 1 });
    }
    d.clock.now = DAY * DAY_MS + HOUR;
    app = launch(d);
    await app.h.start();
    expect(app.latest()!.view).toMatchObject({ day: DAY, phase: 'won' });
    expect(profile(app, 'p1').streak).toBe(1);
  });
});

describe('the local host: saves from before profiles (K7, version 0)', () => {
  /** The old layout: slots named without a profile, the active slot in localStorage. */
  async function legacyDevice(): Promise<{ d: Device; inProgress: string }> {
    const d = device();
    const engine = new GameEngine();
    const put = async (slot: string) => d.store.put({ slot, savedAt: 0, game: engine.exportGame() });
    // Yesterday: daily won, bonus won.
    for (const round of ['daily', 'bonus'] as const) {
      const game = track('main', round, DAY - 1);
      engine.newGame({ mode: 'main', round, day: DAY - 1, seed: 0 });
      for (const layout of game.state.puzzle.witness) {
        for (const command of witnessCommands(game.state, layout)) {
          engine.submit(command);
          game.state = step(game.state, command).state;
        }
      }
      await put(slotFor('main', round, DAY - 1));
    }
    // The day before that: lost, not finished.
    engine.newGame({ mode: 'main', round: 'daily', day: DAY - 2, seed: 0 });
    while (engine.current()!.view.phase === 'setup') engine.submit({ type: 'go' });
    await put(slotFor('main', 'daily', DAY - 2));
    // Today: wave 1 played.
    const today = track('main', 'daily', DAY);
    engine.newGame({ mode: 'main', round: 'daily', day: DAY, seed: 0 });
    for (const command of witnessCommands(today.state, today.state.puzzle.witness[0]!)) engine.submit(command);
    await put(slotFor('main', 'daily', DAY));
    engine.newGame({ mode: 'main', round: 'practice', day: 0, seed: 9 });
    await put(slotFor('main', 'practice', 0));
    d.setLegacy(slotFor('main', 'daily', DAY));
    return { d, inProgress: engine.importGame((await d.store.get(slotFor('main', 'daily', DAY)))!.game).fingerprint };
  }

  it('folds the old save into a first profile: the same game continues, finished days count', async () => {
    const { d, inProgress } = await legacyDevice();
    const app = launch(d);
    await app.h.start();
    expect(app.home().current).toBe('p1');
    expect(app.latest()).toMatchObject({ profile: 'p1', fingerprint: inProgress, view: { wave: 2 } });
    expect(profile(app, 'p1')).toMatchObject({ streak: 1, best: 1, recent: [{ day: DAY - 1, bonus: true }] });
    expect((await d.store.list()).map((s) => s.slot)).toEqual([`p1/bonus-main-${DAY - 1}`, `p1/daily-main-${DAY - 2}`, `p1/daily-main-${DAY - 1}`, `p1/daily-main-${DAY}`, 'p1/practice-main']);
    expect(d.legacyActive.get()).toBeNull();
    expect(await d.store.getMeta('profiles')).toMatchObject({ format: 'snack-attack-profiles', version: 2 });
  });

  it('migrates once: a second launch reads the book and changes nothing', async () => {
    const { d } = await legacyDevice();
    await launch(d).h.start();
    const book = await d.store.getMeta('profiles');
    const app = launch(d);
    await app.h.start();
    expect(await d.store.getMeta('profiles')).toEqual(book);
    expect(profile(app, 'p1').streak).toBe(1);
  });

  it('a damaged profile book is kept aside, never crashes the app, and the first profile’s saves are found again', async () => {
    const d = device();
    const app = await twoProfiles(d);
    await placeOne(app);
    const fingerprint = app.latest()!.fingerprint;
    await d.store.putMeta('profiles', { format: 'snack-attack-profiles', version: 99, profiles: 'garbage' });
    const again = launch(d);
    await again.h.start();
    expect(again.home().profiles.map((p) => p.id)).toEqual(['p1']);
    expect(again.latest()!.fingerprint).toBe(fingerprint);
    expect(await d.store.getMeta('profiles-unread')).toMatchObject({ version: 99 });
  });
});

describe('the local host: the sticker book and outfits (RULES 9a, K12)', () => {
  /** Plays today's daily to the end as the current profile. */
  async function finishToday(app: App, day = DAY): Promise<void> {
    await playWaves(app, track('main', 'daily', day), 1, 10);
    expect(app.latest()!.view.phase).toBe('won');
  }

  it('a finished daily gives that profile a sticker to reveal, and nobody else', async () => {
    const d = device();
    const app = await twoProfiles(d);
    await app.h.choose('p2');
    expect(profile(app, 'p2').stickers).toEqual([]);
    await finishToday(app);
    expect(profile(app, 'p2').stickers).toHaveLength(1);
    expect(profile(app, 'p2').unseen.stickers).toHaveLength(1);
    expect(profile(app, 'p1').stickers).toEqual([]);
    expect(profile(app, 'p1').cosmetics).toEqual([]);
  });

  it('the reveal is kept until it has been seen, across launches, and seeing it clears it', async () => {
    const d = device();
    const app = launch(d);
    await app.h.start();
    await finishToday(app);
    const id = profile(app, 'p1').stickers[0]!.id;
    const again = launch(d);
    await again.h.start();
    expect(profile(again, 'p1').unseen.stickers.map((s) => s.id)).toEqual([id]);
    await again.h.seeStickers();
    expect(profile(again, 'p1').unseen).toEqual({ stickers: [], cosmetics: [] });
    const third = launch(d);
    await third.h.start();
    expect(profile(third, 'p1').unseen.stickers).toEqual([]);
    expect(profile(third, 'p1').stickers.map((s) => s.id)).toEqual([id]);
  });

  it('opening a finished day again, or recording it twice, gives no second sticker', async () => {
    const d = device();
    const app = launch(d);
    await app.h.start();
    await finishToday(app);
    await app.h.daily();
    const again = launch(d);
    await again.h.start();
    expect(profile(again, 'p1').stickers).toHaveLength(1);
  });

  it('a won bonus round gives a bonus sticker', async () => {
    const app = launch(device());
    await app.h.start();
    await finishToday(app);
    await app.h.bonus();
    await playWaves(app, track('main', 'bonus', DAY), 1, 10);
    expect(profile(app, 'p1').stickers.map((s) => s.kind)).toEqual(['daily', 'bonus']);
  });

  it('practice earns nothing: no sticker, no hat', async () => {
    const app = launch(device());
    await app.h.start();
    await app.h.practice();
    await playWaves(app, track('main', 'practice', 0, 5), 1, 10);
    expect(app.latest()!.view).toMatchObject({ round: 'practice', phase: 'won' });
    expect(profile(app, 'p1')).toMatchObject({ stickers: [], cosmetics: [], worn: { hat: null, outfit: null } });
  });

  it('a Kindy daily earns a sticker too', async () => {
    const d = device();
    const app = launch(d);
    await app.h.start();
    expect(await app.h.addProfile({ name: 'Pip', avatar: AVATARS[2]!, mode: 'kindy' })).toBeNull();
    await app.h.choose('p2');
    const game = track('kindy', 'daily', DAY);
    for (const layout of game.state.puzzle.witness) for (const command of witnessCommands(game.state, layout)) await send(app, game, command);
    expect(app.latest()!.view.phase).toBe('won');
    expect(profile(app, 'p2').stickers).toHaveLength(1);
  });

  it('the third day in a row gives a hat, which can be worn and taken off, and is kept across launches', async () => {
    const d = device();
    const app = launch(d);
    await app.h.start();
    for (let i = 0; i < 3; i++) {
      d.clock.now = (DAY + i) * DAY_MS + HOUR;
      await app.h.daily();
      await finishToday(app, DAY + i);
    }
    expect(profile(app, 'p1').streak).toBe(3);
    expect(profile(app, 'p1').cosmetics.map((c) => c.id)).toEqual(['party-hat']);
    expect(await app.h.equip('hat', 'party-hat')).toBeNull();
    const again = launch(d);
    await again.h.start();
    expect(profile(again, 'p1').worn).toEqual({ hat: 'party-hat', outfit: null });
    expect(await again.h.equip('hat', null)).toBeNull();
    expect(profile(again, 'p1').worn.hat).toBeNull();
  });

  it('refuses a hat that has not been earned, and wearing for one child never dresses another', async () => {
    const d = device();
    const app = await twoProfiles(d);
    expect(await app.h.equip('hat', 'crown')).not.toBeNull();
    expect(await app.h.equip('outfit', 'party-hat')).not.toBeNull();
    expect(profile(app, 'p1').worn).toEqual({ hat: null, outfit: null });
    expect(profile(app, 'p2').worn).toEqual({ hat: null, outfit: null });
  });

  it('deleting a profile leaves the other profiles’ books exactly as they were', async () => {
    const d = device();
    const app = await twoProfiles(d);
    await finishToday(app);
    await app.h.choose('p2');
    await finishToday(app);
    const keep = JSON.stringify(profile(app, 'p2'));
    await app.h.choose('p1');
    await app.h.addProfile({ name: 'Third', avatar: AVATARS[2]!, mode: 'kindy' });
    expect(await app.h.deleteProfile('p3')).toBeNull();
    expect(JSON.stringify(profile(app, 'p2'))).toBe(keep);
    expect(await app.h.deleteProfile('p1')).toBeNull();
    expect(JSON.stringify(profile(app, 'p2'))).toBe(keep);
    const again = launch(d);
    await again.h.start();
    expect(JSON.stringify(profile(again, 'p2'))).toBe(keep);
  });

  it('a profile book written by the last version is migrated on launch, keeping every profile and day', async () => {
    const d = device();
    const day = (n: number, bonus = false) => ({ day: n, fed: 14, hungry: 0, retries: 0, hints: 0, bonus });
    await d.store.putMeta('profiles', {
      format: 'snack-attack-profiles',
      version: 1,
      nextId: 3,
      profiles: [
        { id: 'p1', name: 'Sam', avatar: AVATARS[0], mode: 'main', history: [day(DAY - 3), day(DAY - 2, true), day(DAY - 1)], best: 3, active: null },
        { id: 'p2', name: '', avatar: AVATARS[1], mode: 'kindy', history: [day(DAY - 1)], best: 1, active: null },
      ],
    });
    const app = launch(d);
    await app.h.start();
    expect(await d.store.getMeta('profiles')).toMatchObject({ version: 2 });
    expect(app.home().profiles.map((p) => [p.id, p.name, p.mode, p.best, p.stickers.length, p.unseen.stickers.length])).toEqual([
      ['p1', 'Sam', 'main', 3, 4, 0],
      ['p2', '', 'kindy', 1, 1, 0],
    ]);
    expect(profile(app, 'p1').cosmetics.map((c) => c.id)).toEqual(['party-hat']);
    expect(profile(app, 'p1')).toMatchObject({ streak: 3 });
  });
});
