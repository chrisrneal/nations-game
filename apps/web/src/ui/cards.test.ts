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

  it('final standings list the 17 nations from public View data', () => {
    const engine = new GameEngine();
    engine.newGame('egypt', 2);
    const end = engine.advance(60);
    const rows = standings(end.view, end.standing.multiplierBp);
    expect(rows).toHaveLength(17);
    expect(rows.map((r) => r.id)).toContain('egypt');
    expect(rows[0]!.score).toBeGreaterThanOrEqual(rows[16]!.score);
  });
});
