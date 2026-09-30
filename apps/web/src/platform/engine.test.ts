import { describe, expect, it } from 'vitest';
import type { Command, NationId } from '@nations/contracts';
import { GameEngine, deliverable, playableRoster, type GameUpdate, type Timers } from './engine.ts';
import { PACE_INTERVAL_MS } from './pace.ts';

/** Timers the test fires by hand, so pace is checked without waiting. */
function manualTimers(): Timers & { fire(): void; intervals: number[]; active: number; clock: number } {
  const handlers = new Map<number, () => void>();
  let next = 1;
  const timers = {
    clock: 1_000_000,
    now() {
      return timers.clock;
    },
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
    // The player's nation acts only through its standing policies: it answers offers, and
    // "keep us supplied" (on for a new phone game, RULES 3.4) sends fair offers to buy its shortfall.
    expect(update.view.self.private.policy.autoImport).toBe(true);
    for (const o of update.view.offers.filter((x) => x.from === 'india')) {
      expect(o.give.resource).toBe('credit');
      expect(o.hardBargain).toBe(false);
    }
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

const HOUR = 60 * 60 * 1000;

describe('GameEngine live clock (prompt 11)', () => {
  it('live pace steps one month per 30 minutes of wall clock, whatever the poll timer does', () => {
    const timers = manualTimers();
    const engine = new GameEngine(timers);
    engine.newGame('japan', 3);
    const started = engine.setPace('live');
    expect(started.pace).toBe('live');
    expect(started.live).toEqual({ nextTickAt: timers.clock + PACE_INTERVAL_MS.live, intervalMs: 30 * 60 * 1000 });
    timers.fire();
    expect(engine.current()?.view.tick).toBe(0);
    timers.clock += 95 * 60 * 1000; // 1 h 35 min: three months due
    timers.fire();
    expect(engine.current()?.view.tick).toBe(3);
    timers.clock += 25 * 60 * 1000; // 5 minutes carried over + 25 = one more
    timers.fire();
    expect(engine.current()?.view.tick).toBe(4);
  });

  it('24 hours closed: reopening steps the 48 months owed within the Gate 0 budget and writes a short ranked recap', () => {
    const timers = manualTimers();
    const first = new GameEngine(timers);
    first.newGame('egypt', 11);
    first.setPace('live');
    const saved = structuredClone(first.exportGame());
    expect(saved.live?.anchor).toBe(timers.clock);
    expect(saved.ai?.version).toBe(1);

    const later = manualTimers();
    later.clock = timers.clock + 24 * HOUR;
    const reopened = new GameEngine(later);
    const started = performance.now();
    const update = reopened.importGame(saved, { resumeLive: true });
    const ms = performance.now() - started;
    expect(update.view.tick).toBe(48);
    expect(update.pace).toBe('live');
    expect(ms).toBeLessThan(2000);
    const recap = update.recap!;
    expect(recap).toMatchObject({ fromTick: 0, toTick: 48 });
    expect(recap.lines.length).toBeGreaterThan(0);
    expect(recap.lines.length).toBeLessThanOrEqual(6);
    // Under a minute at 200 words a minute (docs/GAPS.md P2-09).
    expect(recap.words).toBeLessThanOrEqual(150);
    const weights = recap.lines.map((l) => l.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    expect(reopened.dismissRecap().recap).toBeNull();
  });

  it('a live game reopened after 24 hours equals one that ran the 48 months without closing', () => {
    const timers = manualTimers();
    const open = new GameEngine(timers);
    open.newGame('brazil', 21);
    open.setPace('live');
    const saved = structuredClone(open.exportGame());
    timers.clock += 24 * HOUR;
    timers.fire();
    const later = manualTimers();
    later.clock = timers.clock;
    const reopened = new GameEngine(later).importGame(saved, { resumeLive: true });
    expect(reopened.standing.fingerprint).toBe(open.current()?.standing.fingerprint);
  });

  it('a manual slot or a paused game resumes paused, with nothing stepped', () => {
    const timers = manualTimers();
    const first = new GameEngine(timers);
    first.newGame('india', 2);
    first.setPace('live');
    const saved = structuredClone(first.exportGame());
    const later = manualTimers();
    later.clock = timers.clock + 24 * HOUR;
    const bookmark = new GameEngine(later).importGame(saved);
    expect(bookmark).toMatchObject({ pace: 'paused', recap: null });
    expect(bookmark.view.tick).toBe(0);
  });

  it('hiding the app and coming back after live months passed writes a recap', () => {
    const timers = manualTimers();
    const engine = new GameEngine(timers);
    engine.newGame('germany', 5);
    engine.setPace('live');
    engine.markAway();
    timers.clock += 3 * HOUR;
    const back = engine.markBack()!;
    expect(back.view.tick).toBe(6);
    expect(back.recap?.toTick).toBe(6);
    // No time passed: no recap.
    engine.dismissRecap();
    engine.markAway();
    expect(engine.markBack()?.recap).toBeNull();
  });

  it('the clock stops at the end of the game in live pace too', () => {
    const timers = manualTimers();
    const engine = new GameEngine(timers);
    engine.newGame('canada', 2);
    engine.setPace('live');
    timers.clock += 100 * HOUR;
    timers.fire();
    const end = engine.current()!;
    expect(end.view.tick).toBe(60);
    expect(end.pace).toBe('paused');
    expect(end.live).toBeNull();
  });
});

describe('GameEngine AI, journal and predictions (prompt 11)', () => {
  it('turns AI announcements and crisis answers into explanation events; command explanations are left to the sim', () => {
    const at = (decision: string, audience: string[], crisisId: number | null = null) =>
      ({
        tick: 4,
        type: 'aiExplained',
        payload: { nationId: 'japan', decision, partner: null, offerId: null, crisisId, text: `${decision}: month 2`, reasons: ['1 broken deal'] },
        audience,
      }) as never;
    const out = deliverable([at('suspend', ['japan', 'egypt']), at('reject', ['japan', 'egypt']), at('pledge', [], 7), at('skipPledge', [], 8)]);
    expect(out.map((e) => (e.payload as { decision: string }).decision)).toEqual(['suspend', 'contribute', 'declineAppeal']);
    expect(out[0]).toMatchObject({ type: 'explanation', audience: ['japan', 'egypt'], payload: { reasons: ['suspend: month 2', '1 broken deal'], by: 'command' } });
    expect(out[1]).toMatchObject({ audience: [], payload: { subject: 7 } });
  });

  it('keeps the player\'s settled trades and the explanations they saw in the journal, and saves it', () => {
    const engine = new GameEngine();
    engine.newGame('india', 3);
    let update = engine.advance(1);
    for (let i = 0; i < 12 && update.journal.trades.length === 0; i++) update = engine.advance(1);
    expect(update.journal.trades.length).toBeGreaterThan(0);
    const trade = update.journal.trades[0]!;
    expect(update.journal.causes[trade.partner]?.trades).toBeGreaterThan(0);
    expect(update.journal.explanations.length).toBeGreaterThan(0);
    expect(update.journal.startTrust.japan).toBeTypeOf('number');
    const saved = structuredClone(engine.exportGame());
    const reopened = new GameEngine().importGame(saved);
    expect(reopened.journal).toEqual(update.journal);
  });

  it('prediction mode holds back AI answers to the player\'s offers until guessed, and stores guess and outcome in the save', () => {
    const engine = new GameEngine();
    let update = engine.newGame('japan', 4);
    expect(update.predictions.mode).toBe(false);
    update = engine.setPredictionMode(true);
    expect(update.predictions.mode).toBe(true);
    // Japan asks every nation with spare energy for some, each month, until an AI answers.
    const offerQuestion = (): (typeof update.predictions.pending)[number] | undefined => update.predictions.pending.find((p) => p.kind === 'offer');
    for (let i = 0; i < 8 && offerQuestion() === undefined; i++) {
      for (const other of update.view.others) {
        if (other.public.kind !== 'playable' || other.public.energy.production <= other.public.energy.demand) continue;
        if (update.view.offers.some((o) => o.from === 'japan' && o.to === other.id)) continue;
        const credit = Math.round((update.view.prices.energy * 300) / update.view.prices.credit);
        try {
          engine.submit({ nationId: 'japan' as NationId, tick: update.view.tick, type: 'makeOffer', payload: { to: other.id, give: { resource: 'credit', amount: credit }, get: { resource: 'energy', amount: 300 } } });
        } catch {
          // Not enough credit or a closed partner: try the next.
        }
      }
      update = engine.advance(1);
    }
    const question = offerQuestion();
    expect(question).toBeDefined();
    expect(question).not.toHaveProperty('outcome');
    expect(question!.choices).toEqual(['accept', 'reject', 'counter']);
    const answer = engine.predict(question!.id, 'accept');
    expect(['accept', 'reject', 'counter']).toContain(answer.outcome);
    expect(answer.correct).toBe(answer.outcome === 'accept');
    expect(() => engine.predict(question!.id, 'reject')).toThrow(/already/);
    const after = engine.current()!.predictions;
    expect(after.guessed).toBe(1);
    expect(after.pending.map((p) => p.id)).not.toContain(question!.id);
    const saved = structuredClone(engine.exportGame());
    const record = saved.predictions?.records.find((r) => r.id === question!.id);
    expect(record).toMatchObject({ guess: 'accept', outcome: answer.outcome, status: 'guessed', nationId: question!.nationId });
    expect(new GameEngine().importGame(saved).predictions).toMatchObject({ mode: true, guessed: 1 });
  });

  it('prediction mode off records nothing', () => {
    const engine = new GameEngine();
    engine.newGame('india', 3);
    const update = engine.advance(12);
    expect(update.predictions).toMatchObject({ mode: false, pending: [], guessed: 0 });
    expect(engine.exportGame().predictions?.records).toEqual([]);
  });
});
