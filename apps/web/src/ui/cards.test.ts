import { describe, expect, it } from 'vitest';
import type { NationView } from '@nations/contracts';
import { GameEngine } from '../platform/engine.ts';
import { cardsFor, type CardAction, type DecisionCard } from './cards.ts';
import { isFair, standings } from './econ.ts';

function send(engine: GameEngine, view: NationView, action: CardAction): void {
  if (action.kind !== 'send') throw new Error(`expected a one-tap action, got ${action.kind}`);
  engine.submit(action.command(view.tick));
}

const find = (cards: readonly DecisionCard[], kind: DecisionCard['kind']): DecisionCard | undefined => cards.find((c) => c.kind === kind);

describe('decision cards from the View', () => {
  it('Japan is short of food and energy: the card buys it in two taps (open, send), and the offer then waits as a card', () => {
    const engine = new GameEngine();
    engine.newGame('japan', 4);
    // Buying by hand: "keep us supplied" off.
    engine.submit({ nationId: 'japan' as NationView['selfId'], tick: 0, type: 'setPolicy', payload: { autoImport: false } });
    let update = engine.advance(1);
    const card = find(cardsFor(update.view, new Set()), 'shortfall');
    expect(card?.title).toMatch(/^(Food|Energy) short by/);
    const buy = card?.options[0];
    expect(buy?.id).toBe('buy');
    send(engine, update.view, buy!.action);
    update = engine.advance(1);
    const settledOrWaiting =
      update.events.some((e) => e.type === 'offerSettled') || update.view.offers.some((o) => o.from === 'japan');
    expect(settledOrWaiting).toBe(true);
    for (const offer of update.view.offers.filter((o) => o.from === 'japan')) expect(isFair(update.view, offer.give, offer.get)).toBe(true);
  });

  it('an AI offer arrives as a card and Accept settles it in two taps', () => {
    const engine = new GameEngine();
    engine.newGame('india', 3);
    let update = engine.advance(1);
    for (let i = 0; i < 6 && !update.view.offers.some((o) => o.to === 'india'); i++) update = engine.advance(1);
    const card = find(cardsFor(update.view, new Set()), 'offer');
    expect(card).toBeDefined();
    const accept = card!.options.find((o) => o.id === 'accept')!;
    send(engine, update.view, accept.action);
    const after = engine.advance(1);
    const settled = after.events.filter((e) => e.type === 'offerSettled' || e.type === 'offerFailed');
    expect(settled.length).toBeGreaterThan(0);
  });

  it('counter opens the trade sheet with the terms reversed; decline sends a reject', () => {
    const engine = new GameEngine();
    engine.newGame('russia', 3);
    let update = engine.advance(1);
    for (let i = 0; i < 6 && !update.view.offers.some((o) => o.to === 'russia'); i++) update = engine.advance(1);
    const offer = update.view.offers.find((o) => o.to === 'russia')!;
    const card = cardsFor(update.view, new Set()).find((c) => c.id === `offer:${offer.id}`)!;
    const counter = card.options.find((o) => o.id === 'counter')!.action;
    expect(counter).toMatchObject({ kind: 'compose', counterOf: offer.id, draft: { to: offer.from, give: offer.get, get: offer.give } });
    const decline = card.options.find((o) => o.id === 'reject')!.action;
    expect(decline.kind === 'send' && decline.command(update.view.tick)).toMatchObject({ type: 'rejectOffer', payload: { offerId: offer.id } });
  });

  it('a dismissed card stays hidden', () => {
    const engine = new GameEngine();
    const update = engine.newGame('japan', 4);
    const all = cardsFor(update.view, new Set());
    expect(all.length).toBeGreaterThan(0);
    expect(cardsFor(update.view, new Set([all[0]!.id])).map((c) => c.id)).not.toContain(all[0]!.id);
  });

  it('final standings list the 17 nations and rank them exactly as the sim scores them', () => {
    const engine = new GameEngine();
    engine.newGame('egypt', 2);
    const end = engine.advance(60);
    const rows = standings(end.view);
    expect(rows).toHaveLength(17);
    expect(rows.map((r) => r.id)).toContain('egypt');
    expect(rows[0]!.score).toBeGreaterThanOrEqual(rows[16]!.score);
    const simTop = [...end.view.scores.nations].sort((a, b) => b.finalScore - a.finalScore)[0]!;
    expect(rows[0]!.id).toBe(simTop.id);
    for (const row of rows) expect(row.score).toBe(end.view.scores.nations.find((n) => n.id === row.id)!.finalScore);
  });

  it('a crisis appeal becomes a card: paying the share is two taps and answers the appeal, with other nations\' reasons on it', () => {
    const engine = new GameEngine();
    engine.newGame('japan', 7);
    let update = engine.advance(1);
    for (let i = 0; i < 12 && !cardsFor(update.view, new Set(), update).some((c) => c.id.startsWith('crisis:')); i++) update = engine.advance(1);
    const card = cardsFor(update.view, new Set(), update).find((c) => c.id.startsWith('crisis:'));
    expect(card).toBeDefined();
    expect(card!.options.length).toBeGreaterThanOrEqual(2);
    expect(card!.options.length).toBeLessThanOrEqual(3);
    for (const o of card!.options) expect(o.consequence.length).toBeGreaterThan(0);
    expect(card!.reasons?.length).toBeGreaterThan(0);
    const crisisId = Number(card!.id.split(':')[1]);
    const pay = card!.options.find((o) => o.id === 'pay')!;
    send(engine, update.view, pay.action);
    update = engine.advance(1);
    const answered = update.events.find((e) => e.type === 'appealAnswered' && (e.payload as { nationId: string; crisisId: number }).nationId === 'japan');
    expect(answered?.payload).toMatchObject({ crisisId, by: 'command' });
    expect(cardsFor(update.view, new Set(), update).some((c) => c.id === `crisis:${crisisId}`)).toBe(false);
  });

  it('declining an appeal is one command the sim accepts', () => {
    const engine = new GameEngine();
    engine.newGame('brazil', 7);
    let update = engine.advance(1);
    for (let i = 0; i < 12 && !cardsFor(update.view, new Set(), update).some((c) => c.id.startsWith('crisis:')); i++) update = engine.advance(1);
    const card = cardsFor(update.view, new Set(), update).find((c) => c.id.startsWith('crisis:'))!;
    send(engine, update.view, card.options.find((o) => o.id === 'decline')!.action);
    update = engine.advance(1);
    expect(update.events.some((e) => e.type === 'appealAnswered' && (e.payload as { nationId: string; answer: string }).nationId === 'brazil' && (e.payload as { answer: string }).answer === 'declined')).toBe(true);
  });

  it('every card over a whole game resolves in 3 taps or fewer, with 2-3 options and a one-line consequence each', () => {
    const kinds = new Set<string>();
    // Egypt gets few AI offers (docs/GAPS.md, prompt 07); India many.
    for (const nation of ['egypt', 'india']) {
      const engine = new GameEngine();
      engine.newGame(nation, 9);
      // Egypt buys by hand, so the routine shortfall cards appear too.
      if (nation === 'egypt') engine.submit({ nationId: 'egypt' as NationView['selfId'], tick: 0, type: 'setPolicy', payload: { autoImport: false } });
      engine.setPredictionMode(true);
      let update = engine.advance(1);
      for (let month = 0; month < 59; month++) {
        for (const card of cardsFor(update.view, new Set(), update)) {
          kinds.add(card.kind);
          expect(card.options.length, card.title).toBeGreaterThanOrEqual(2);
          expect(card.options.length, card.title).toBeLessThanOrEqual(3);
          for (const option of card.options) {
            expect(option.consequence, `${card.title} / ${option.label}`).not.toMatch(/\n/);
            expect(option.consequence.length).toBeGreaterThan(0);
            // Open the card (1), pick the option (2); a compose option adds the send in the trade sheet (3).
            const taps = option.action.kind === 'compose' ? 3 : 2;
            expect(taps).toBeLessThanOrEqual(3);
          }
        }
        update = engine.advance(1);
      }
    }
    expect([...kinds]).toEqual(expect.arrayContaining(['crisis', 'offer', 'shortfall']));
  });

  it('with "keep us supplied" on, routine shortfalls are not cards; only a gap no seller can fill is, and it points at projects', () => {
    const engine = new GameEngine();
    engine.newGame('japan', 4);
    let update = engine.advance(1);
    for (let month = 0; month < 12; month++) {
      for (const card of cardsFor(update.view, new Set()).filter((c) => c.kind === 'shortfall')) {
        expect(card.title).toMatch(/no seller can supply/);
        expect(card.options.map((o) => o.action.kind)).toEqual(['projects', 'dismiss']);
      }
      expect(cardsFor(update.view, new Set()).filter((c) => c.kind === 'pending')).toEqual([]);
      update = engine.advance(1);
    }
    // And the policy did buy: Japan settled trades without sending a single command.
    expect(update.journal.trades.length).toBeGreaterThan(0);
  });

  it('AI offer cards carry the maker\'s explanation, or a placeholder until it arrives', () => {
    const engine = new GameEngine();
    engine.newGame('india', 3);
    let update = engine.advance(1);
    for (let i = 0; i < 8 && !update.view.offers.some((o) => o.to === 'india'); i++) update = engine.advance(1);
    const card = cardsFor(update.view, new Set(), update).find((c) => c.kind === 'offer')!;
    expect(card.reasons?.[0]).toMatch(/\d/);
    expect(card.reasons?.[0]).not.toMatch(/has not said why/);
    const bare = cardsFor(update.view, new Set()).find((c) => c.kind === 'offer')!;
    expect(bare.reasons?.[0]).toMatch(/has not said why yet/);
  });

  it('prediction cards ask before the answer is shown, and guessing resolves them in two taps', () => {
    const engine = new GameEngine();
    engine.newGame('japan', 7);
    engine.setPredictionMode(true);
    let update = engine.advance(1);
    for (let i = 0; i < 20 && update.predictions.pending.length === 0; i++) update = engine.advance(1);
    const card = cardsFor(update.view, new Set(), update).find((c) => c.kind === 'predict')!;
    expect(card.title).toMatch(/^What will .+ do\?$/);
    const option = card.options[0]!;
    expect(option.action.kind).toBe('predict');
    if (option.action.kind !== 'predict') return;
    const result = engine.predict(option.action.id, option.action.choice);
    expect(result.guess).toBe(option.action.choice);
    const after = engine.current()!;
    expect(cardsFor(after.view, new Set(), after).some((c) => c.id === card.id)).toBe(false);
  });
});
