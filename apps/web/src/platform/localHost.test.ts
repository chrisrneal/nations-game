import { describe, expect, it } from 'vitest';
import type { GameUpdate } from './engine.ts';
import { GameEngine } from './engine.ts';
import { LocalHost, dayNumber, slotFor, type ActiveSlot } from './localHost.ts';
import { MemorySaveStore } from './saves.ts';

const DAY = 20_400;

function memoryActive(): ActiveSlot {
  let slot: string | null = null;
  return { get: () => slot, set: (s) => void (slot = s) };
}

function host(store = new MemorySaveStore(), active = memoryActive(), day = DAY, seed = 5) {
  const h = new LocalHost({ engine: new GameEngine(), store, active, now: () => day * 86_400_000 + 3_600_000, timezoneOffset: () => 0, newSeed: () => seed });
  let latest: GameUpdate | null = null;
  h.subscribe((u) => (latest = u));
  return { h, store, active, latest: () => latest! };
}

describe('the local host', () => {
  it('counts days on the device calendar: the daily changes at local midnight (D18)', () => {
    expect(dayNumber(86_400_000 * 10 + 1000, 0)).toBe(10);
    // 23:30 local time on day 10 in a zone 5 hours behind UTC is already day 11 in UTC.
    expect(dayNumber(86_400_000 * 11 + 4 * 3_600_000 + 1_800_000, 300)).toBe(10);
  });

  it('opens today’s daily the first time, and saves it in its own slot', async () => {
    const { h, store, latest } = host();
    expect(await h.start()).toBe('new');
    expect(latest().view).toMatchObject({ round: 'daily', day: DAY, wave: 1 });
    expect(await store.get(slotFor('main', 'daily', DAY))).toBeDefined();
  });

  it('autosaves after every command and reopens where the player left off', async () => {
    const first = host();
    await first.h.start();
    const friend = first.latest().view.friends[0]!;
    const facing = first.latest().view.facings[friend.type][0]!;
    const open = first.latest().view.squares.findIndex((s, c) => s === 'open' && first.latest().view.lunchboxes.every((l) => Math.abs((l.cell % 6) - (c % 6)) + Math.abs(Math.floor(l.cell / 6) - Math.floor(c / 6)) > 1));
    expect(await first.h.submit({ type: 'place', friend: friend.id, cell: open, facing })).toBeNull();
    const again = host(first.store, first.active);
    expect(await again.h.start()).toBe('continued');
    expect(again.latest().fingerprint).toBe(first.latest().fingerprint);
  });

  it('says why a command was refused, and does not save it', async () => {
    const { h, latest } = host();
    await h.start();
    expect(await h.submit({ type: 'retry' })).toMatch(/lost/);
    expect(latest().error).toMatch(/lost/);
  });

  it('a daily from an earlier day is over: the app opens today’s', async () => {
    const yesterday = host(new MemorySaveStore(), memoryActive(), DAY - 1);
    await yesterday.h.start();
    const today = host(yesterday.store, yesterday.active, DAY);
    expect(await today.h.start()).toBe('new');
    expect(today.latest().view.day).toBe(DAY);
  });

  it('practice boards come from a new seed and keep their own slot; the daily continues after', async () => {
    const { h, store, latest } = host();
    await h.start();
    const daily = latest().fingerprint;
    await h.practice();
    expect(latest().view.round).toBe('practice');
    expect(await store.get(slotFor('main', 'practice', 0))).toBeDefined();
    await h.daily();
    expect(latest().fingerprint).toBe(daily);
  });
});
