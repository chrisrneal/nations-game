import type { NationView } from '@nations/contracts';
import { nameOf } from '../world/nations.ts';
import { CRISIS_NAME, rule } from './econ.ts';
import { etaMonth, invitations, myProjects, templateOf } from './projects.ts';

/**
 * The home briefing (100x slice 7): where you stand, whether the world is
 * making the Accord (RULES 5.4), and what comes next. Pure, from the View.
 */

export interface Standing {
  readonly rank: number;
  readonly of: number;
  readonly score: number;
}

export function standingOf(view: NationView): Standing {
  const sorted = [...view.scores.nations].sort((a, b) => b.finalScore - a.finalScore);
  const rank = sorted.findIndex((n) => n.id === view.selfId) + 1;
  return { rank, of: sorted.length, score: sorted[rank - 1]?.finalScore ?? 0 };
}

export interface Accord {
  /** The four shared goals' mean now, whole percent. */
  readonly pct: number;
  /** What the Accord needs at the end, whole percent. */
  readonly needPct: number;
  readonly onTrack: boolean;
}

export function accordOf(view: NationView): Accord {
  const pct = Math.floor(view.scores.collectiveBp / 100);
  const needPct = Math.floor(rule(view, 'worldAccordBp') / 100);
  return { pct, needPct, onTrack: pct >= needPct };
}

/** The shared goal pulling the Accord down most, in plain words. */
export function weakestGoal(view: NationView): string {
  const g = view.scores.goals;
  const goals: [number, string][] = [
    [g.climateAvoidedBp, 'climate damage avoided (fund the adaptation pool)'],
    [g.pandemicAvoidedBp, 'pandemic damage avoided (fund the health pool)'],
    [g.atBaselineBp, 'nations at their baseline (help the ones falling behind)'],
    [g.deficitsMetBp, 'food and energy demand met (trade, and build supply)'],
  ];
  goals.sort((a, b) => a[0] - b[0]);
  const [bp, text] = goals[0]!;
  return `${Math.floor(bp / 100)}% ${text}`;
}

export interface Upcoming {
  readonly month: number;
  readonly text: string;
}

/** What comes next, soonest first: crisis deadlines, the next climate appeal, your projects, invitations closing. */
export function upcoming(view: NationView, max = 3): Upcoming[] {
  const out: Upcoming[] = [];
  const end = rule(view, 'gameLengthTicks');
  for (const c of view.crises.open) out.push({ month: c.deadlineTick, text: `${CRISIS_NAME[c.kind]} pool locks` });
  if (!view.crises.open.some((c) => c.kind === 'climate')) {
    const interval = rule(view, 'climateEventIntervalTicks');
    const first = rule(view, 'climateFirstOpenTick');
    let next = view.tick - (view.tick % interval) + first;
    if (next <= view.tick) next += interval;
    if (next < end) out.push({ month: next, text: 'Climate appeal opens' });
  }
  for (const p of myProjects(view)) {
    const name = templateOf(view, p.template).name;
    if (p.status === 'building') out.push({ month: etaMonth(view, p), text: `${name} ready` });
    else if (p.status === 'forming' && p.host === view.selfId) out.push({ month: p.formingDeadline, text: `${name}: partners must join` });
  }
  const invites = invitations(view);
  if (invites.length > 0) {
    const soonest = Math.min(...invites.map((p) => p.formingDeadline));
    out.push({ month: soonest, text: invites.length === 1 ? `${nameOf(invites[0]!.host)}'s invitation closes` : `${invites.length} invitations; first closes` });
  }
  if (end - view.tick <= 6) out.push({ month: end, text: 'Game ends' });
  return out
    .filter((u) => u.month >= view.tick && u.month <= end)
    .sort((a, b) => a.month - b.month || a.text.localeCompare(b.text))
    .slice(0, max);
}

export type Outcome = 'victory' | 'podium' | 'shared' | 'short';

/** The end of the game as co-opetition reads it (RULES 5.4): the shared threshold, then your rank. */
export function outcomeOf(view: NationView): { outcome: Outcome; headline: string; detail: string } {
  const s = standingOf(view);
  const a = accordOf(view);
  const accord = `The shared goals ended at ${a.pct}% against the ${a.needPct}% the Accord needs.`;
  if (!a.onTrack) {
    return {
      outcome: 'short',
      headline: 'The world fell short of the Accord',
      detail: `${accord} The weakest goal was ${weakestGoal(view)}.`,
    };
  }
  if (s.rank === 1) return { outcome: 'victory', headline: 'Victory: the world made it, and you led it', detail: accord };
  if (s.rank <= 3) return { outcome: 'podium', headline: `The world made it, and you finished #${s.rank}`, detail: accord };
  return { outcome: 'shared', headline: 'The world made it together', detail: accord };
}
