import type { NationId, View } from '@nations/contracts';
import type { NationPublic, NationRecord, WorldState } from './world.ts';

/** Another nation as seen from outside: identity and public fields only. */
export interface ForeignNation {
  readonly id: NationId;
  readonly name: string;
  readonly public: NationPublic;
}

/**
 * One nation's picture of the world (seam 6). Extends the contracts `View`
 * with this nation's own full record and every other nation's public face.
 */
export interface NationView extends View {
  readonly self: NationRecord;
  readonly others: readonly ForeignNation[];
}

/**
 * Builds a nation's View. Other nations are built by copying the allowed
 * fields one by one, never by deleting private ones from a copy, so a field
 * added to State later stays hidden until someone deliberately exposes it.
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
    others.push({ id: other.id, name: other.name, public: { pingsReceived: other.public.pingsReceived } });
  }
  return {
    schemaVersion: state.schemaVersion,
    selfId,
    tick: state.tick,
    selfController,
    knownNations: others.map((other) => other.id),
    self: {
      id: self.id,
      name: self.name,
      public: { ...self.public },
      private: { ...self.private },
    },
    others,
  };
}
