import type { NationId, NationView } from '@nations/contracts';
import type { Observation } from './perception.ts';
import type { Reciprocity } from './personality.ts';
import { balanceOf, GOODS, month, rule, type Good } from './util.ts';

/**
 * Layer 2, beliefs (docs/AI_DESIGN.md).
 *
 * Two halves. **Memory** is what the nation remembers about each partner:
 * deals kept and broken, pledges paid and skipped, a decaying grievance, and
 * any retaliation in force. It is plain integers, so it serialises with the
 * save and replays identically. **Beliefs** are re-derived from the View on
 * every think: each partner's needs and strength, and the nation's trust in
 * it (the sim's own trust ledger, which the View carries).
 */

export type OffenceKind = 'broken' | 'skipped';

export interface Offence {
  readonly kind: OffenceKind;
  readonly tick: number;
  /** "the deal in month 12 (30 energy for 12 credit)" or "the climate relief in month 24". */
  readonly what: string;
}

export interface PartnerMemory {
  kept: number;
  broken: number;
  ignored: number;
  rejected: number;
  pledged: number;
  skipped: number;
  /** Grievance x100, fading `aiMemoryDecayPct` a tick. */
  grudgeE2: number;
  /** Offences still inside memory (reset once the grievance has faded to nothing). */
  offences: number;
  lastOffence: Offence | null;
  /** Retaliation lasts while tick < punishUntil. */
  punishUntil: number;
  /** Tick the current retaliation started, -1 if none. */
  punishFrom: number;
  /** Announcements waiting to be explained to the partner on the next react. */
  pending: ('suspend' | 'forgive' | 'resume')[];
}

export function emptyMemory(): PartnerMemory {
  return { kept: 0, broken: 0, ignored: 0, rejected: 0, pledged: 0, skipped: 0, grudgeE2: 0, offences: 0, lastOffence: null, punishUntil: -1, punishFrom: -1, pending: [] };
}

/** What one partner looks like right now, from the View. Rebuilt on every think. */
export interface PartnerBelief {
  readonly id: NationId;
  readonly playable: boolean;
  /** Our trust in them, 5-90 (the sim's trust ledger). */
  readonly trust: number;
  /** Structural deficit per good (positive), 0 if none. */
  readonly need: Readonly<Record<Good, number>>;
  /** Structural surplus per good (positive), 0 if none. */
  readonly surplus: Readonly<Record<Good, number>>;
  /** Their output relative to ours, basis points (10,000 = same size). */
  readonly strengthBp: number;
  /** Their smoothed score against their own baseline, basis points. */
  readonly ownScoreBp: number;
}

export function describeOffer(o: { readonly createdTick: number; readonly give: { readonly amount: number; readonly resource: string }; readonly get: { readonly amount: number; readonly resource: string } }): string {
  return `the deal in month ${month(o.createdTick)} (${o.give.amount} ${o.give.resource} for ${o.get.amount} ${o.get.resource})`;
}

/** Derived beliefs about every other nation, in View order (stable). */
export function believe(view: NationView): PartnerBelief[] {
  const myOutput = Math.max(1, view.self.public.output);
  const scores = new Map(view.scores.nations.map((n) => [n.id, n.ownScoreBp]));
  return view.others.map((o) => {
    const need = { food: 0, energy: 0 };
    const surplus = { food: 0, energy: 0 };
    for (const good of GOODS) {
      const b = balanceOf(o, good);
      if (b < 0) need[good] = -b;
      else surplus[good] = b;
    }
    return {
      id: o.id,
      playable: o.public.kind === 'playable',
      trust: view.self.private.trust[o.id] ?? 0,
      need,
      surplus,
      strengthBp: Math.floor((o.public.output * 10_000) / myOutput),
      ownScoreBp: scores.get(o.id) ?? 10_000,
    };
  });
}

/** The grievance level, in whole points, that counts as one unforgiven offence. */
export function grudgePoints(m: PartnerMemory): number {
  return Math.floor(m.grudgeE2 / 100);
}

export function punishing(m: PartnerMemory | undefined, tick: number): boolean {
  return m !== undefined && tick < m.punishUntil;
}

/** One tick of fading memory. */
export function decayMemory(memory: Map<NationId, PartnerMemory>, view: Pick<NationView, 'rules'>): void {
  const pct = rule(view, 'aiMemoryDecayPct');
  for (const m of memory.values()) {
    if (m.grudgeE2 <= 0) continue;
    m.grudgeE2 = Math.floor((m.grudgeE2 * (100 - pct)) / 100);
    if (m.grudgeE2 < 100) {
      m.grudgeE2 = 0;
      m.offences = 0;
    }
  }
}

/**
 * Folds observations into memory and decides, by reciprocity style, whether an
 * offence starts a retaliation (docs/AI_DESIGN.md "Reciprocity"):
 *
 * - strict: every broken deal starts `aiPunishTicks` of refused trade at once;
 *   a skipped pledge it paid into starts half that. A second offence still in
 *   memory doubles the length, a third or later triples it.
 * - forgiving: lets `aiForgiveLimit` offences inside its memory pass (and says
 *   so), then retaliates like a strict one.
 * - exploiter: never refuses; it remembers, and charges the grievance as a
 *   price surcharge instead.
 *
 * `now` is the tick being decided; retaliation starts now, which is what keeps
 * it inside `aiRetaliationWindowTicks` of the offence.
 */
export function remember(
  memory: Map<NationId, PartnerMemory>,
  observations: readonly Observation[],
  style: Reciprocity,
  view: Pick<NationView, 'rules' | 'others'>,
  now: number,
): void {
  const playable = new Set(view.others.filter((o) => o.public.kind === 'playable').map((o) => o.id));
  const punishTicks = rule(view, 'aiPunishTicks');
  const forgiveLimit = rule(view, 'aiForgiveLimit');
  for (const obs of observations) {
    if (!playable.has(obs.partner)) continue;
    let m = memory.get(obs.partner);
    if (m === undefined) {
      m = emptyMemory();
      memory.set(obs.partner, m);
    }
    let offence: Offence | null = null;
    let grudge = 0;
    let length = 0;
    switch (obs.kind) {
      case 'kept':
        m.kept++;
        break;
      case 'ignored':
        m.ignored++;
        break;
      case 'rejected':
        m.rejected++;
        break;
      case 'pledged':
        m.pledged++;
        break;
      case 'broken':
        m.broken++;
        grudge = rule(view, 'aiGrudgePerBreak');
        offence = { kind: 'broken', tick: obs.tick, what: describeOffer(obs.offer) };
        length = punishTicks;
        break;
      case 'skipped':
        m.skipped++;
        // Only a pledge this nation paid into makes skipping it a grievance.
        if (!obs.iPaid) break;
        grudge = rule(view, 'aiGrudgePerSkip');
        if (grudge > 0) {
          offence = { kind: 'skipped', tick: obs.tick, what: `the ${obs.crisis.label} in month ${month(obs.crisis.openedTick)}` };
          length = Math.max(1, Math.floor(punishTicks / 2));
        }
        break;
    }
    if (offence === null) continue;
    m.grudgeE2 += grudge * 100;
    m.offences++;
    m.lastOffence = offence;
    if (style === 'exploiter') continue;
    const retaliate = style === 'strict' || m.offences > forgiveLimit;
    if (retaliate) {
      // Repeat offences inside memory escalate: two in memory cost twice as long, three or more three times.
      const unforgiven = style === 'strict' ? m.offences : m.offences - forgiveLimit;
      if (now >= m.punishUntil) m.punishFrom = now;
      m.punishUntil = Math.max(m.punishUntil, now + length * Math.min(3, Math.max(1, unforgiven)));
      m.pending.push('suspend');
    } else {
      m.pending.push('forgive');
    }
  }
}
