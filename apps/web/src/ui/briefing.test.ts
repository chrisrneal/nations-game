import { describe, expect, it } from 'vitest';
import { GameEngine } from '../platform/engine.ts';
import { accordOf, outcomeOf, standingOf, upcoming } from './briefing.ts';
import { standings } from './econ.ts';

/** The home briefing and the end-of-game verdict (RULES 5.4), from the real engine's View. */
describe('briefing', () => {
  it('rank and score are the sim scoreboard\'s, as the final table ranks them', () => {
    const engine = new GameEngine();
    engine.newGame('mexico', 11);
    const view = engine.advance(8).view;
    const s = standingOf(view);
    const rows = standings(view);
    expect(rows[s.rank - 1]?.id).toBe('mexico');
    expect(s.of).toBe(17);
    expect(s.score).toBe(rows[s.rank - 1]?.score);
  });

  it('the Accord reads the sim\'s collective goals against worldAccordBp', () => {
    const engine = new GameEngine();
    engine.newGame('mexico', 11);
    const view = engine.advance(8).view;
    const a = accordOf(view);
    const g = view.scores.goals;
    expect(view.scores.collectiveBp).toBe(Math.floor((g.climateAvoidedBp + g.pandemicAvoidedBp + g.atBaselineBp + g.deficitsMetBp) / 4));
    expect(a.pct).toBe(Math.floor(view.scores.collectiveBp / 100));
    expect(a.needPct).toBe(Math.floor(view.rules.worldAccordBp! / 100));
    expect(a.onTrack).toBe(a.pct >= a.needPct);
  });

  it('what comes next is soonest first, at most three, never in the past', () => {
    const engine = new GameEngine();
    engine.newGame('japan', 5);
    let update = engine.advance(1);
    for (let m = 0; m < 20; m++) {
      const next = upcoming(update.view);
      expect(next.length).toBeLessThanOrEqual(3);
      for (let i = 0; i < next.length; i++) {
        expect(next[i]!.month).toBeGreaterThanOrEqual(update.view.tick);
        if (i > 0) expect(next[i]!.month).toBeGreaterThanOrEqual(next[i - 1]!.month);
      }
      update = engine.advance(1);
    }
  });

  it('the end reads as co-opetition: the shared threshold first, then the rank', () => {
    const engine = new GameEngine();
    engine.newGame('canada', 2);
    const end = engine.advance(100).view;
    const o = outcomeOf(end);
    const a = accordOf(end);
    const s = standingOf(end);
    if (!a.onTrack) expect(o.outcome).toBe('short');
    else expect(o.outcome).toBe(s.rank === 1 ? 'victory' : s.rank <= 3 ? 'podium' : 'shared');
    expect(o.detail).toMatch(/\d+%/);
  });
});
