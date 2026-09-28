import { describe, expect, it } from 'vitest';
import type { Command, Event, NationId } from '@nations/contracts';
import { NEUTRAL_ENDOWMENT, Session, createWorld, viewFor, type RosterEntry } from '@nations/sim';
import { greedyDecide } from './greedy.ts';

const base = { ...NEUTRAL_ENDOWMENT, gdpPppBn: 1_200 };
const ROSTER: RosterEntry[] = [
  { id: 'farm', name: 'Farm', endowment: { ...base, foodSelfSufficiency: 100, energySelfSufficiency: 20 } },
  { id: 'well', name: 'Well', endowment: { ...base, foodSelfSufficiency: 20, energySelfSufficiency: 100 } },
  { id: 'rich', name: 'Rich', endowment: { ...base, foodSelfSufficiency: 80, energySelfSufficiency: 80 } },
  { id: 'poor', name: 'Poor', endowment: { ...base, foodSelfSufficiency: 30, energySelfSufficiency: 30 } },
  { id: 'region', name: 'Region', endowment: { ...base, kind: 'aggregate', foodSelfSufficiency: 30, energySelfSufficiency: 60 } },
];

function play(ticks: number, seed: number, only?: NationId): { session: Session; events: Event[]; reasons: string[]; submitted: number } {
  const session = new Session(createWorld({ seed, roster: ROSTER }));
  const events: Event[] = [];
  const reasons: string[] = [];
  let submitted = 0;
  for (let t = 0; t < ticks; t++) {
    for (const id of session.state.nationOrder) {
      if (only !== undefined && id !== only) continue;
      const decision = greedyDecide(viewFor(session.state, id), seed);
      expect(decision.reasons).toHaveLength(decision.commands.length);
      reasons.push(...decision.reasons);
      for (const command of decision.commands) {
        expect(session.submit(command)).toEqual({ ok: true });
        submitted++;
      }
    }
    events.push(...session.advance(1));
  }
  return { session, events, reasons, submitted };
}

describe('greedy trader', () => {
  it('is deterministic for the same View and seed', () => {
    const state = createWorld({ seed: 3, roster: ROSTER });
    const view = viewFor(state, state.nationOrder[0]!);
    expect(greedyDecide(view, 9)).toEqual(greedyDecide(view, 9));
  });

  it('swaps surplus for deficit: trades settle, the short nations end with less unmet demand', () => {
    const traded = play(24, 1);
    const alone = play(24, 1, 'nobody' as NationId);
    const settled = traded.events.filter((e) => e.type === 'offerSettled').length;
    expect(settled).toBeGreaterThan(20);
    const unmet = (s: Session): number =>
      s.state.nationOrder.reduce((sum, id) => sum + (s.state.nations[id]!.private.last.unmetFood + s.state.nations[id]!.private.last.unmetEnergy), 0);
    expect(unmet(traded.session)).toBeLessThan(unmet(alone.session));
    for (const id of ['farm', 'well'] as NationId[]) {
      const n = traded.session.state.nations[id]!;
      expect(n.private.capacityE4).toBeGreaterThan(alone.session.state.nations[id]!.private.capacityE4);
    }
  });

  it('every command it sends is accepted by the sim, and every reason contains a number', () => {
    for (const seed of [1, 2, 3]) {
      const { events, reasons, submitted } = play(40, seed);
      expect(submitted).toBeGreaterThan(0);
      expect(events.filter((e) => e.type === 'commandRejected')).toEqual([]);
      for (const reason of reasons) expect(reason).toMatch(/\d/);
    }
  });

  it('never acts for a background region and stays inside the per-tick command limit', () => {
    const state = createWorld({ seed: 1, roster: ROSTER });
    expect(greedyDecide(viewFor(state, 'region' as NationId), 1).commands).toEqual([]);
    const limit = viewFor(state, 'farm' as NationId).rules.maxCommandsPerNationPerTick ?? 0;
    const session = play(10, 5).session;
    for (const id of session.state.nationOrder) {
      const cmds: readonly Command[] = greedyDecide(viewFor(session.state, id), 5).commands;
      expect(cmds.length).toBeLessThanOrEqual(limit);
    }
  });
});
