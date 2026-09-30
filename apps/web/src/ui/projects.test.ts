import { describe, expect, it } from 'vitest';
import type { NationView } from '@nations/contracts';
import { GameEngine } from '../platform/engine.ts';
import { cardsFor, type CardAction } from './cards.ts';
import { invitations, joinTerms, myProjects, suggestedPartners } from './projects.ts';

/** Joint projects on the phone (RULES 13): cards and helpers, driven through the real engine. */
function send(engine: GameEngine, view: NationView, action: CardAction): void {
  if (action.kind !== 'send') throw new Error(`expected a one-tap action, got ${action.kind}`);
  engine.submit(action.command(view.tick));
}

/** Plays months until the player has an invitation it can take. */
function untilInvited(engine: GameEngine, months = 12): NationView {
  let update = engine.advance(1);
  for (let i = 0; i < months && invitations(update.view).length === 0; i++) update = engine.advance(1);
  return update.view;
}

describe('project cards', () => {
  it('an AI host invites Japan; the card joins in two taps and Japan becomes a member', () => {
    const engine = new GameEngine();
    engine.newGame('japan', 5);
    const view = untilInvited(engine);
    const invite = invitations(view)[0]!;
    const card = cardsFor(view, new Set()).find((c) => c.id === `invite:${invite.id}`);
    expect(card?.kind).toBe('project');
    expect(card?.options.map((o) => o.id)).toEqual(['join', 'decline']);
    expect(card?.context).toMatch(/\d/);
    send(engine, view, card!.options[0]!.action);
    const after = engine.advance(1).view;
    expect(myProjects(after).some((p) => p.id === invite.id)).toBe(true);
  });

  it('join terms are the sim\'s numbers: an equal share of the yield and the cost when every seat fills', () => {
    const engine = new GameEngine();
    engine.newGame('japan', 5);
    const view = untilInvited(engine);
    const p = invitations(view)[0]!;
    const t = joinTerms(view, p);
    const seats = view.rules.projectSlots!;
    if (p.kind === 'food' || p.kind === 'energy') {
      expect(t.units).toBe(Math.floor(p.yield / seats));
      expect(t.due).toBe(Math.ceil(p.cost / seats));
    }
    expect(t.perMonth).toBe(Math.ceil(t.due / p.buildTicks));
    expect(t.ready).toBeGreaterThan(view.tick);
  });

  it('a surplus nation is offered to host, and one tap founds it with partners short of the good', () => {
    const engine = new GameEngine();
    engine.newGame('russia', 6);
    const view = engine.advance(1).view;
    const card = cardsFor(view, new Set()).find((c) => c.id.startsWith('host:'));
    expect(card).toBeDefined();
    send(engine, view, card!.options.find((o) => o.id === 'found')!.action);
    const after = engine.advance(1).view;
    const mine = after.projects.projects.find((p) => p.host === 'russia');
    expect(mine?.status).toBe('forming');
    for (const id of mine!.invited) {
      const o = after.others.find((x) => x.id === id)!;
      const good = mine!.kind as 'food' | 'energy';
      expect(o.public[good].demand).toBeGreaterThan(o.public[good].production);
    }
  });

  it('suggested partners never exceed the free seats, and a grid link only suggests tied nations', () => {
    const engine = new GameEngine();
    engine.newGame('russia', 6);
    const view = engine.advance(1).view;
    for (const h of view.projects.hostable.filter((x) => x.problem === null)) {
      const partners = suggestedPartners(view, h);
      expect(partners.length).toBeLessThanOrEqual(view.rules.projectSlots! - 1);
      if (h.template === 'grid') for (const id of partners) expect(view.projects.tiedTo).toContain(id);
    }
  });

  it('after joining one climate shield, other climate-shield invitations are hidden', () => {
    const engine = new GameEngine();
    engine.newGame('japan', 5);
    let view = untilInvited(engine);
    const shield = view.projects.projects.find((p) => p.kind === 'climateShield' && p.invited.includes(view.selfId));
    if (shield === undefined) return; // this seed never offered one; nothing to check
    engine.submit({ nationId: view.selfId, tick: view.tick, type: 'joinProject', payload: { projectId: shield.id } });
    view = engine.advance(1).view;
    expect(invitations(view).filter((p) => p.kind === 'climateShield')).toEqual([]);
  });
});
