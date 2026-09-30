import { describe, expect, it } from 'vitest';
import type { Event, NationId } from '@nations/contracts';
import { createWorld, viewFor } from '@nations/sim';
import { AiDirector, endowmentsOf } from './director.ts';
import { EXPLANATION_EVENT, hasNumber } from './explain.ts';
import { fullRoster, play } from './testkit.test.helpers.ts';

const roster = fullRoster();
const game = play({ seed: 1, ticks: 60, roster });

describe('AI director on the full roster (17 nations, 6 regions, 60 months)', () => {
  it('every command it sends is accepted by the sim', () => {
    expect(game.commands.length).toBeGreaterThan(500);
    expect(game.events.filter((e) => e.type === 'commandRejected')).toEqual([]);
  });

  it('trades: offers settle between AI nations every month', () => {
    const settled = game.events.filter((e) => e.type === 'offerSettled').length;
    expect(settled).toBeGreaterThan(300);
  });

  it('every visible decision carries exactly one explanation, with a number, for the nations that see it', () => {
    // Commands and explanations are emitted pairwise per decision; announcements have no command.
    const decisions = game.explanations.filter((e) => !['suspend', 'forgive', 'resume'].includes(e.payload.decision));
    expect(decisions).toHaveLength(game.commands.length);
    const kindOf: Record<string, string> = {
      acceptOffer: 'accept',
      rejectOffer: 'reject',
      counterOffer: 'counter',
      makeOffer: 'offer',
      withdrawOffer: 'withdraw',
      setPolicy: 'policy',
      contribute: 'pledge',
      declineAppeal: 'skipPledge',
    };
    game.commands.forEach((command, i) => {
      const e = decisions[i]!;
      expect(e.type).toBe(EXPLANATION_EVENT);
      expect(e.payload.nationId).toBe(command.nationId);
      expect(e.payload.decision).toBe(kindOf[command.type]);
      expect(e.tick).toBe(command.tick);
      expect(hasNumber(e.payload.text), e.payload.text).toBe(true);
      for (const reason of e.payload.reasons) expect(hasNumber(reason), reason).toBe(true);
      expect(e.payload.text.length).toBeLessThanOrEqual(140);
      // A trade decision is seen by both parties and nobody else.
      if (e.payload.partner !== null) expect([...e.audience].sort()).toEqual([command.nationId, e.payload.partner].sort());
      // The same sentences ride on the command, and the sim relays them to the same nations.
      expect(command.why?.[0]).toBe(e.payload.text);
    });
    const relayed = game.events.filter((e) => e.type === 'explanation' && (e.payload as { by: string }).by === 'command');
    expect(relayed).toHaveLength(game.commands.length);
  });

  it('answers every crisis appeal itself, by paying or declining', () => {
    const opened = game.events.filter((e) => e.type === 'crisisOpened').length;
    expect(opened).toBeGreaterThan(3);
    const answered = game.events.filter((e) => e.type === 'appealAnswered' && (e.payload as { by: string }).by === 'command').length;
    expect(answered).toBe(opened * 17);
  });

  it('stays inside the per-tick compute budget, with thinking staggered across ticks', () => {
    for (const u of game.usage) expect(u.units).toBeLessThanOrEqual(u.budget);
    const deferred = game.usage.reduce((s, u) => s + u.deferred.length, 0);
    expect(deferred).toBe(0);
    // With aiGoalRescoreTicks = 3, about a third of the 17 nations think each tick after the first.
    for (const u of game.usage.slice(1)) {
      expect(u.thought.length).toBeGreaterThanOrEqual(5);
      expect(u.thought.length).toBeLessThanOrEqual(6);
    }
  });

  it('is deterministic, and a save plus AI snapshot mid-game continues identically', () => {
    expect(play({ seed: 1, ticks: 60, roster }).hash).toBe(game.hash);
    expect(play({ seed: 1, ticks: 60, roster, reloadAt: 29 }).hash).toBe(game.hash);
    expect(play({ seed: 2, ticks: 60, roster }).hash).not.toBe(game.hash);
  });

  it('never acts for a human nation, and keeps its memory current for a caretaker hand-over', () => {
    const us = 'united-states' as NationId;
    const g = play({ seed: 3, ticks: 12, roster, controllers: { [us]: 'human' } });
    expect(g.commands.filter((c) => c.nationId === us)).toEqual([]);
    expect(g.director.mind(us)?.personalityOf(viewFor(g.session.state, us)).reciprocity).toBe('strict');
  });
});

describe('perception sees only what the nation may see', () => {
  it('an event addressed to two other nations never reaches a third mind', () => {
    const state = createWorld({ seed: 1, roster });
    const director = new AiDirector({ endowments: endowmentsOf(roster), seed: 1 });
    const [a, b, c] = state.nationOrder as NationId[];
    const offer = { id: 99, from: a!, to: b!, give: { resource: 'food', amount: 10 }, get: { resource: 'credit', amount: 1 }, createdTick: 0, expiryTick: 3, hardBargain: false, counterOf: null };
    const secret: Event = { tick: 0, type: 'offerFailed', payload: { offer, reneger: a, by: 'command' }, audience: [a!, b!] };
    director.observe([secret]);
    director.decide(0, () => 'ai', (id) => viewFor(state, id));
    expect(director.mind(c!)?.memoryOf(a!)).toBeUndefined();
    expect(director.mind(b!)?.memoryOf(a!)?.broken).toBe(1);
  });
});
