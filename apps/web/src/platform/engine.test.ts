import { describe, expect, it } from 'vitest';
import type { Command, NationId } from '@nations/contracts';
import { GameEngine, playableRoster, type GameUpdate, type Timers } from './engine.ts';

/** Timers the test fires by hand, so pace is checked without waiting. */
function manualTimers(): Timers & { fire(): void; intervals: number[]; active: number } {
  const handlers = new Map<number, () => void>();
  let next = 1;
  const timers = {
    intervals: [] as number[],
    get active() {
      return handlers.size;
    },
    setInterval(handler: () => void, ms: number) {
      timers.intervals.push(ms);
      handlers.set(next, handler);
      return next++;
    },
    clearInterval(handle: unknown) {
      handlers.delete(handle as number);
    },
    fire() {
      for (const handler of handlers.values()) handler();
    },
  };
  return timers;
}

const ping = (from: string, to: string, tick: number): Command => ({
  nationId: from as NationId,
  tick,
  type: 'ping',
  payload: { target: to },
});

describe('GameEngine', () => {
  it('plays the 17 real nations plus the 6 background regions from the world file', () => {
    const roster = playableRoster();
    expect(roster).toHaveLength(17);
    expect(roster.map((n) => n.name)).toContain('Japan');
    const update = new GameEngine().newGame('japan', 1);
    expect(update.view.selfId).toBe('japan');
    expect(update.view.selfController).toBe('human');
    expect(update.view.others).toHaveLength(22);
    expect(update.view.others.filter((o) => o.public.kind === 'playable')).toHaveLength(16);
    // Real data, not the neutral placeholder: Japan produces a tenth of its energy.
    expect(update.view.self.public.energy.production * 5).toBeLessThan(update.view.self.public.energy.demand);
    expect(update.standing).toMatchObject({ gameLength: 60, over: false });
  });

  it('refuses a nation that is not playable', () => {
    expect(() => new GameEngine().newGame('rest-of-europe', 1)).toThrow(/not a playable/);
  });

  it('runs the AI traders through the same command API every tick, and they make offers to the player', () => {
    const engine = new GameEngine();
    // India holds a big food surplus, so AI buyers come to it (docs/GAPS.md, prompt 07: small importers get few AI offers).
    engine.newGame('india', 3);
    const seen: string[] = [];
    engine.subscribe((u) => seen.push(...u.events.map((e) => e.type)));
    const update = engine.advance(6);
    expect(update.view.tick).toBe(6);
    expect(seen).toContain('offerMade');
    // The player's nation never acts on its own; its standing policy may answer offers.
    expect(update.view.offers.every((o) => o.to === 'india')).toBe(true);
  });

  it('stops the clock at the end of the game', () => {
    const engine = new GameEngine();
    engine.newGame('canada', 2);
    const end = engine.advance(100);
    expect(end.view.tick).toBe(60);
    expect(end.standing.over).toBe(true);
    expect(end.pace).toBe('paused');
    expect(engine.setPace('x4').pace).toBe('paused');
    expect(engine.advance(1).view.tick).toBe(60);
  });

  it('applies the player\'s command and only shows events meant for the player', () => {
    const engine = new GameEngine();
    engine.newGame('brazil', 5);
    engine.submit(ping('brazil', 'mexico', 0));
    const update = engine.advance(1);
    expect(update.view.self.private.pingsSent).toBe(1);
    expect(update.events.some((e) => e.type === 'pinged')).toBe(true);
    for (const event of update.events) {
      expect(event.audience.length === 0 || event.audience.includes(update.view.selfId)).toBe(true);
    }
  });

  it('refuses commands for another nation or a past tick', () => {
    const engine = new GameEngine();
    engine.newGame('brazil', 5);
    expect(() => engine.submit(ping('mexico', 'brazil', 0))).toThrow(/your own nation/);
    engine.advance(2);
    expect(() => engine.submit(ping('brazil', 'mexico', 0))).toThrow(/already stepped/);
  });

  it('ticks on the clock at 1x and 4x and stops when paused', () => {
    const timers = manualTimers();
    const engine = new GameEngine(timers);
    const updates: GameUpdate[] = [];
    engine.subscribe((u) => updates.push(u));
    engine.newGame('egypt', 1);
    engine.setPace('x1');
    timers.fire();
    timers.fire();
    engine.setPace('x4');
    expect(timers.active).toBe(1);
    timers.fire();
    expect(timers.intervals).toEqual([10_000, 2_500]);
    engine.setPace('paused');
    expect(timers.active).toBe(0);
    timers.fire();
    expect(updates.at(-1)?.view.tick).toBe(3);
    expect(updates.at(-1)?.pace).toBe('paused');
    expect(() => engine.setPace('live')).toThrow(/not available/);
  });

  it('save, close and load continues the tick count and the same game', () => {
    const uninterrupted = new GameEngine();
    uninterrupted.newGame('germany', 42);
    uninterrupted.submit(ping('germany', 'turkiye', 3));
    const expected = uninterrupted.advance(30);

    const first = new GameEngine();
    first.newGame('germany', 42);
    first.submit(ping('germany', 'turkiye', 3));
    first.advance(12);
    const saved = structuredClone(first.exportGame());

    const reopened = new GameEngine();
    const loaded = reopened.importGame(saved);
    expect(loaded.view.tick).toBe(12);
    expect(loaded.pace).toBe('paused');
    const continued = reopened.advance(18);
    expect(continued.view).toEqual(expected.view);
    expect(continued.standing.fingerprint).toBe(expected.standing.fingerprint);
  });

  it('measures catch-up speed on a throwaway game', () => {
    let clock = 0;
    const engine = new GameEngine();
    expect(engine.benchmark(10, () => (clock += 5))).toBe(5);
    expect(engine.current()).toBeNull();
  });
});
