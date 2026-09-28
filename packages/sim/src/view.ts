import type { ForeignNation, NationId, NationRecord, NationView } from '@nations/contracts';
import { scoreboard } from './score.ts';
import { TUNABLES } from './tunables.ts';
import type { WorldState } from './world.ts';

export type { ForeignNation, NationView } from '@nations/contracts';

/** Every tunable's value, by id: the public rules, the same for every nation. */
const RULES: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(Object.entries(TUNABLES).map(([id, tunable]) => [id, tunable.value])),
);

/**
 * Builds a nation's View (seam 6). Other nations are built by copying the
 * allowed fields one by one, never by deleting private ones from a copy, so a
 * field added to State later stays hidden until someone deliberately exposes
 * it. Offers between two other nations never appear.
 */
export function viewFor(state: WorldState, selfId: NationId): NationView {
  const self = state.nations[selfId];
  const selfController = state.controllers[selfId];
  if (self === undefined || selfController === undefined) {
    throw new Error(`No nation "${selfId}" in this world`);
  }
  const others: ForeignNation[] = [];
  for (const id of state.nationOrder) {
    if (id === selfId) continue;
    const other = state.nations[id] as NationRecord;
    const p = other.public;
    others.push({
      id: other.id,
      name: other.name,
      public: {
        kind: p.kind,
        pingsReceived: p.pingsReceived,
        output: p.output,
        baselineOutput: p.baselineOutput,
        food: { demand: p.food.demand, production: p.food.production },
        energy: { demand: p.energy.demand, production: p.energy.production },
      },
    });
  }
  const priv = self.private;
  // The sim's own scoreboard: public, identical for every viewer (RULES 5).
  const board = scoreboard(state);
  return {
    schemaVersion: state.schemaVersion,
    selfId,
    tick: state.tick,
    selfController,
    knownNations: others.map((other) => other.id),
    self: {
      id: self.id,
      name: self.name,
      public: {
        ...self.public,
        food: { ...self.public.food },
        energy: { ...self.public.energy },
      },
      private: {
        ...priv,
        stocks: { ...priv.stocks },
        policy: { ...priv.policy },
        trust: { ...priv.trust },
        last: { ...priv.last },
      },
    },
    others,
    offers: state.offers
      .filter((o) => o.from === selfId || o.to === selfId)
      .map((o) => ({ ...o, give: { ...o.give }, get: { ...o.get } })),
    prices: { ...state.prices },
    scores: {
      multiplierBp: board.multiplierBp,
      nations: board.nations.map((n) => ({ id: n.id, ownScoreBp: n.ownScoreBp, finalScore: n.finalScore })),
    },
    rules: RULES,
  };
}
