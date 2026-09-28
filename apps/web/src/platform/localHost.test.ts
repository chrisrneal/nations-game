import { describe, expect, it } from 'vitest';
import type { NationId } from '@nations/contracts';
import { GameEngine, type GameUpdate } from './engine.ts';
import { AUTOSAVE_EVERY_TICKS, AUTOSAVE_SLOT, LocalHost } from './localHost.ts';
import { MemorySaveStore } from './saves.ts';

function host(store = new MemorySaveStore(), engine = new GameEngine()) {
  return { engine, store, host: new LocalHost({ engine, store, now: () => 1000, newSeed: () => 9 }) };
}

describe('LocalHost', () => {
  it('implements the contracts Host: submit, subscribe, setPace', async () => {
    const { host: h, engine } = host();
    const seen: GameUpdate[] = [];
    const unsubscribe = h.subscribe((u) => seen.push(u));
    await h.newGame('nigeria');
    await h.submit({ nationId: 'nigeria' as NationId, tick: 0, type: 'ping', payload: { target: 'egypt' } });
    engine.advance(1);
    expect(seen.at(-1)?.view.self.private.pingsSent).toBe(1);
    unsubscribe();
    engine.advance(1);
    expect(seen.at(-1)?.view.tick).toBe(1);
    await expect(h.submit({ nationId: 'egypt' as NationId, tick: 2, type: 'ping', payload: { target: 'nigeria' } })).rejects.toThrow();
  });

  it('saves to a slot and a reopened app loads it and continues', async () => {
    const store = new MemorySaveStore();
    const first = host(store);
    await first.host.newGame('korea');
    first.engine.advance(7);
    const summary = await first.host.saveTo('slot-2');
    expect(summary).toMatchObject({ slot: 'slot-2', tick: 7, humanId: 'korea' });

    // "Close and reopen": a new engine and host over the same store.
    const second = host(store);
    const seen: GameUpdate[] = [];
    second.host.subscribe((u) => seen.push(u));
    await second.host.loadFrom('slot-2');
    expect(seen.at(-1)?.view.tick).toBe(7);
    second.engine.advance(1);
    expect(seen.at(-1)?.view.tick).toBe(8);
    expect((await second.host.listSaves()).map((s) => s.slot)).toEqual([AUTOSAVE_SLOT, 'slot-2']);
  });

  it('autosaves on a new game and every few ticks', async () => {
    const { host: h, engine, store } = host();
    await h.newGame('australia');
    expect((await store.get(AUTOSAVE_SLOT))?.tick).toBe(0);
    engine.advance(AUTOSAVE_EVERY_TICKS);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await store.get(AUTOSAVE_SLOT))?.tick).toBe(AUTOSAVE_EVERY_TICKS);
  });

  it('loading an empty slot fails loudly', async () => {
    await expect(host().host.loadFrom('slot-3')).rejects.toThrow(/empty/);
  });
});
