import type { AvatarId, DayRecord, ProfileView } from '@snacks/contracts';

/**
 * Pictures and words for profiles (RULES 12, K7). The avatars are
 * placeholders, an animal emoji on a coloured circle, until the art in
 * build step 8; a child who doesn't read finds theirs by the picture. Which
 * pictures there are, and their order, comes from the host (HomeView.avatars).
 */

export const AVATAR_LOOK: Readonly<Record<AvatarId, { readonly emoji: string; readonly colour: string; readonly name: string }>> = {
  dog: { emoji: '🐶', colour: '#f6d7a7', name: 'Dog' },
  cat: { emoji: '🐱', colour: '#f9c6d0', name: 'Cat' },
  fox: { emoji: '🦊', colour: '#ffd6b0', name: 'Fox' },
  panda: { emoji: '🐼', colour: '#d8e2ec', name: 'Panda' },
  frog: { emoji: '🐸', colour: '#c9eec0', name: 'Frog' },
  owl: { emoji: '🦉', colour: '#e3d3f5', name: 'Owl' },
  bunny: { emoji: '🐰', colour: '#fbe3ef', name: 'Bunny' },
  tiger: { emoji: '🐯', colour: '#fde8a6', name: 'Tiger' },
};

/** What to call a profile in words: its name, or its picture's when it has none. */
export function profileLabel(profile: Pick<ProfileView, 'name' | 'avatar'>): string {
  return profile.name !== '' ? profile.name : AVATAR_LOOK[profile.avatar].name;
}

/** Hours, minutes and seconds left, rounded up so it never shows 0:00:00 early: "5:03:09". */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${Math.floor(total / 3600)}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

export function streakText(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function retriesText(retries: number): string {
  return retries === 0 ? 'first go' : `${retries} ${retries === 1 ? 'retry' : 'retries'}`;
}

/** The seven days ending on `day`, each finished or not: the done screen's row of ticks. */
export function weekStrip(recent: readonly DayRecord[], day: number): { day: number; done: boolean }[] {
  const finished = new Set(recent.map((r) => r.day));
  return Array.from({ length: 7 }, (_, i) => ({ day: day - 6 + i, done: finished.has(day - 6 + i) }));
}
