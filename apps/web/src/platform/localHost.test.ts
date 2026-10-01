import { describe, expect, it } from 'vitest';
import { AirportEngine, type AirportUpdate } from './engine.ts';
import { AUTOSAVE_EVERY_TICKS, AUTOSAVE_SLOT, LocalHost } from './localHost.ts';
import { MemorySaveStore } from './saves.ts';
import { FakeClock } from './testClock.ts';

function setup(store = new MemorySaveStore(), clock = new FakeClock()) {
  const engine = new AirportEngine(clock);
  const host = new LocalHost({ engine, store, now: () => clock.time, newSeed: () => 9 });
  const seen: AirportUpdate[] = [];
  host.subscribe((u) => seen.push(u));
  return { clock, engine, host, store, seen };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('LocalHost (S3)', () => {
  it('opens a new airport when there is no autosave, and autosaves it', async () => {
    const { host, store } = setup();
    expect(await host.start()).toBe('new');
    expect((await store.get(AUTOSAVE_SLOT))?.tick).toBe(0);
  });

  it('autosaves every 10 seconds of play', async () => {
    const { host, store, clock } = setup();
    await host.start();
    for (let i = 0; i < AUTOSAVE_EVERY_TICKS; i++) clock.advance(250);
    await settle();
    expect((await store.get(AUTOSAVE_SLOT))?.tick).toBe(AUTOSAVE_EVERY_TICKS);
  });

  it('a reopened app continues the autosave, caught up by the wall clock', async () => {
    const store = new MemorySaveStore();
    const clock = new FakeClock();
    const first = setup(store, clock);
    await first.host.start();
    await first.host.buy('boarding');
    for (let i = 0; i < 40; i++) clock.advance(250);
    await first.host.away();
    const saved = first.seen.at(-1);
    clock.time += 30_000;
    const second = setup(store, clock);
    expect(await second.host.start()).toBe('continued');
    const resumed = second.seen.at(-1);
    expect(resumed?.view.tick).toBe((saved?.view.tick ?? 0) + 120);
    expect(resumed?.view.run.flights).toBeGreaterThan(saved?.view.run.flights ?? 0);
  });

  it('exports a file that resumes the same airport on a device with no saves', async () => {
    const first = setup();
    await first.host.start();
    first.clock.advance(5_000);
    const file = await first.host.exportFile();
    expect(file.name).toMatch(/^airport-tick-\d+\.json$/);
    const fingerprint = first.seen.at(-1)?.fingerprint;
    const second = setup(new MemorySaveStore(), first.clock);
    await second.host.importFile(file.text);
    expect(second.seen.at(-1)?.fingerprint).toBe(fingerprint);
    expect((await second.store.get(AUTOSAVE_SLOT))?.tick).toBe(first.seen.at(-1)?.view.tick);
  });

  it('refuses files that are not airport saves', async () => {
    const { host } = setup();
    await expect(host.importFile('not json')).rejects.toThrow(/not a saved airport/);
    await expect(host.importFile('{"format":"nations-game-save","version":1,"game":{}}')).rejects.toThrow(/not a saved airport/);
    await expect(host.importFile('{"format":"airport-idle-save","version":99,"game":{}}')).rejects.toThrow(/newer version/);
  });

  it('starts over with a new airport', async () => {
    const { host, seen, clock } = setup();
    await host.start();
    clock.advance(10_000);
    await host.newGame();
    expect(seen.at(-1)?.view.tick).toBe(0);
  });
});
