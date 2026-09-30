import { describe, expect, it } from 'vitest';
import type { Command, NationId, NationView } from '@nations/contracts';
import { createWorld, step, viewFor, type WorldState } from '@nations/sim';
import { personalityFor } from './personality.ts';
import { appraise, decideProjects, goodsValueMilli, hurdlePct, worldCoverBp } from './projects.ts';
import { fullRoster, play } from './testkit.test.helpers.ts';

/**
 * The AI's joint-project decisions (RULES 13, docs/AI_DESIGN.md "Joint
 * projects"), on the real roster. Everyone else is human and idle, so only the
 * AI under test decides.
 */
const roster = fullRoster();
const id = (raw: string): NationId => raw as NationId;
const endowmentOf = (n: string) => roster.find((r) => r.id === n)!.endowment!;
const worldGdp = roster.reduce((s, r) => s + (r.endowment?.gdpPppBn ?? 0), 0);

function idleWorld(): WorldState {
  return createWorld({ seed: 3, roster, controllers: Object.fromEntries(roster.map((r) => [r.id, 'human' as const])) });
}

function advance(s: WorldState, commands: Command[] = []): WorldState {
  return step(s, commands).state;
}

function inputs(view: NationView, nation: string, think = true) {
  return {
    view,
    p: personalityFor(endowmentOf(nation), worldGdp, view.rules),
    endowment: endowmentOf(nation),
    memory: new Map(),
    creditFree: view.self.private.stocks.credit,
    think,
  };
}

describe('what goods are worth (RULES 2.7 and 13)', () => {
  it('a unit that closes a shortfall is worth more than one that replaces a purchase, and a surplus unit least', () => {
    const view = viewFor(advance(idleWorld()), id('japan'));
    const deficit = view.self.public.energy.demand - view.self.public.energy.production;
    expect(deficit).toBeGreaterThan(100);
    const first = goodsValueMilli(view, 'energy', 1);
    expect(first).toBeGreaterThan(view.prices.energy);
    // Past the deficit, each extra unit is a surplus worth half its price.
    const atDeficit = goodsValueMilli(view, 'energy', deficit);
    expect(goodsValueMilli(view, 'energy', deficit + 10) - atDeficit).toBe(Math.floor((10 * view.prices.energy) / 2));
  });

  it('world cover is read from public flows only, and is below full in the 2030 world', () => {
    const view = viewFor(idleWorld(), id('japan'));
    expect(worldCoverBp(view, 'energy')).toBeGreaterThan(0);
    expect(worldCoverBp(view, 'energy')).toBeLessThan(10_000);
  });

  it('the hurdle never lets a nation join at a loss', () => {
    const rules = viewFor(idleWorld(), id('japan')).rules;
    for (const r of roster.filter((x) => x.endowment?.kind === 'playable')) expect(hurdlePct(personalityFor(r.endowment!, worldGdp, rules))).toBeGreaterThanOrEqual(100);
  });
});

describe('answering invitations', () => {
  it('an importer invited early to an energy project it is short of joins, with its numbers', () => {
    // Saudi Arabia hosts a solar belt and invites three energy importers.
    let s = advance(idleWorld());
    s = advance(s, [{ nationId: id('saudi-arabia'), tick: s.tick, type: 'proposeProject', payload: { template: 'solar', invite: [id('japan'), id('korea'), id('germany')] } }]);
    const view = viewFor(s, id('japan'));
    const project = view.projects.projects[0]!;
    const a = appraise(view, endowmentOf('japan'), project);
    const decisions = decideProjects(inputs(view, 'japan', false));
    expect(decisions).toHaveLength(1);
    const d = decisions[0]!;
    expect(d.command.type).toBe(a.returnPct >= hurdlePct(personalityFor(endowmentOf('japan'), worldGdp, view.rules)) ? 'joinProject' : 'declineProject');
    expect(d.text).toMatch(/\d/);
    expect(d.audience).toEqual([id('japan'), id('saudi-arabia')]);
  });

  it('a project that would start too late to pay back is declined', () => {
    let s = idleWorld();
    while (s.tick < 50) s = advance(s);
    s = advance(s, [{ nationId: id('saudi-arabia'), tick: s.tick, type: 'proposeProject', payload: { template: 'solar', invite: [id('japan'), id('korea'), id('germany')] } }]);
    expect(s.projects).toHaveLength(1);
    for (const n of ['japan', 'korea', 'germany']) {
      const d = decideProjects(inputs(viewFor(s, id(n)), n, false));
      expect(d.map((x) => x.command.type)).toEqual(['declineProject']);
    }
  });

  it('never answers an invitation it did not get', () => {
    let s = advance(idleWorld());
    s = advance(s, [{ nationId: id('saudi-arabia'), tick: s.tick, type: 'proposeProject', payload: { template: 'solar', invite: [id('japan'), id('korea'), id('germany')] } }]);
    expect(decideProjects(inputs(viewFor(s, id('india')), 'india', false))).toEqual([]);
  });
});

describe('founding', () => {
  it('a surplus host founds a project for partners short of that good, inviting at most the free seats', () => {
    const s = advance(idleWorld());
    const view = viewFor(s, id('russia'));
    const d = decideProjects(inputs(view, 'russia')).find((x) => x.command.type === 'proposeProject');
    expect(d).toBeDefined();
    const payload = d!.command.payload as { template: string; invite: NationId[] };
    expect(payload.invite.length).toBeLessThanOrEqual(view.rules.projectSlots! - 1);
    const template = view.projects.catalogue.find((t) => t.id === payload.template)!;
    if (template.sharedTieRequired) for (const n of payload.invite) expect(view.projects.tiedTo).toContain(n);
    if (template.kind === 'energy' || template.kind === 'food') {
      for (const n of payload.invite) {
        const o = view.others.find((x) => x.id === n)!;
        expect(o.public[template.kind].demand).toBeGreaterThan(o.public[template.kind].production);
      }
    }
    expect(d!.text).toMatch(/\d/);
  });

  it('does not found on a non-think tick', () => {
    const s = advance(idleWorld());
    expect(decideProjects(inputs(viewFor(s, id('russia')), 'russia', false))).toEqual([]);
  });
});

describe('a whole AI game', () => {
  const game = play({ seed: 2, ticks: 60, roster });
  const types = (t: string) => game.events.filter((e) => e.type === t);

  it('builds several projects of several kinds, every project command accepted', () => {
    expect(game.events.filter((e) => e.type === 'commandRejected')).toEqual([]);
    const built = types('projectCompleted').map((e) => (e.payload as { project: { template: string } }).project.template);
    expect(built.length).toBeGreaterThanOrEqual(5);
    expect(new Set(built).size).toBeGreaterThanOrEqual(3);
  });

  it('invitations are a real choice: some are accepted, some declined, and some projects lapse', () => {
    expect(types('projectJoined').length).toBeGreaterThan(0);
    expect(types('projectDeclined').length).toBeGreaterThan(0);
    expect(types('projectLapsed').length).toBeGreaterThan(0);
  });

  it('every project decision is explained with a number to the nations it concerns', () => {
    const projectExplanations = game.explanations.filter((e) => /Project$/.test(e.payload.decision));
    expect(projectExplanations.length).toBeGreaterThan(0);
    for (const e of projectExplanations) {
      expect(e.payload.text).toMatch(/\d/);
      expect(e.audience).toContain(e.payload.nationId);
    }
  });
});
