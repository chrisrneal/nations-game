import type { Cue } from '../platform/index.ts';
import type { Timeline } from './timeline.ts';

/**
 * What the wave replay sounds like (decision record K12): each moment of the
 * timeline (timeline.ts) gets a cue at the moment it happens. Pure numbers,
 * like the timeline, so the sounds match what the sim decided. replay.ts
 * schedules the plan beside the animations; the platform plays it.
 */
export type ReplayCue = Extract<Cue, 'throw' | 'catch' | 'fed' | 'dance' | 'ache' | 'heal' | 'hungry'>;

export interface Sound {
  readonly at: number;
  readonly cue: ReplayCue;
}

/** Two of one cue closer than this are one sound: three kids fed together is one chime, not a smear of three. */
const SAME_CUE_GAP_MS = 80;

/** A fed kid starts dancing just after the chime. */
const DANCE_AFTER_MS = 120;

export function soundPlan(timeline: Timeline, beatMs: number): Sound[] {
  const all: Sound[] = [];
  for (const flight of timeline.flights) {
    // The picker catches what the lunchbox threw, a beat later.
    if (flight.picker >= 0) all.push({ at: beatMs, cue: 'catch' });
  }
  for (const event of timeline.events) {
    switch (event.kind) {
      case 'pickup':
        all.push({ at: event.at, cue: 'throw' });
        break;
      case 'catch':
        all.push({ at: event.at, cue: 'catch' });
        break;
      case 'react':
        if (event.mood === 'yum') {
          all.push({ at: event.at, cue: 'fed' }, { at: event.at + DANCE_AFTER_MS, cue: 'dance' });
        } else {
          all.push({ at: event.at, cue: 'ache' });
        }
        break;
      case 'heal':
        all.push({ at: event.at, cue: 'heal' });
        break;
      case 'walk':
        if (event.mood === 'sad') all.push({ at: event.at, cue: 'hungry' });
        break;
    }
  }
  all.sort((a, b) => a.at - b.at);
  const last = new Map<ReplayCue, number>();
  const kept: Sound[] = [];
  for (const s of all) {
    const before = last.get(s.cue);
    if (before !== undefined && s.at - before < SAME_CUE_GAP_MS) continue;
    last.set(s.cue, s.at);
    kept.push(s);
  }
  return kept.filter((s) => s.at <= timeline.duration);
}
