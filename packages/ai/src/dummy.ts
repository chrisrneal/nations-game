import type { Command } from '@nations/contracts';
import type { NationView } from '@nations/sim';

/**
 * Phase 0 dummy AI: proves the AI plays through the same command API as the
 * UI, sees only its own View, and is deterministic. It has no strategy.
 *
 * Randomness is its own counter-based generator keyed on (seed, tick, self),
 * so it needs no mutable state and never touches the sim's RNG in State
 * (which it cannot see) or Math.random (which would break replays, D5).
 */

/** MurmurHash3 finaliser; integer-only, identical in every JS engine. */
function mix(input: number): number {
  let z = input | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  z ^= z >>> 16;
  return z >>> 0;
}

function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The n-th draw for this seed, tick and nation. */
function draw(seed: number, view: NationView, n: number): number {
  return mix(mix(seed ^ hashText(view.selfId)) + Math.imul(view.tick, 0x9e3779b9) + n);
}

/** Out of 4: how often the dummy stays idle. Placeholder behaviour, not balance. */
const IDLE_CHANCE_IN_4 = 1;

/**
 * Decide this tick's commands from a View alone. Returns at most one command:
 * either nothing, or a ping to a nation the View says exists.
 */
export function dummyDecide(view: NationView, seed: number): Command[] {
  if (view.knownNations.length === 0) return [];
  if (draw(seed, view, 0) % 4 < IDLE_CHANCE_IN_4) return [];
  const target = view.knownNations[draw(seed, view, 1) % view.knownNations.length];
  if (target === undefined) return [];
  return [{ nationId: view.selfId, tick: view.tick, type: 'ping', payload: { target } }];
}
