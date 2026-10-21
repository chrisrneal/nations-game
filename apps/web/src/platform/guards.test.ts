import { describe, expect, it } from 'vitest';
import { installGuards } from './guards.ts';
import { savesProtected, protectSaves, type StorageLike } from './storage.ts';

function fire(target: EventTarget, type: string, on: object): boolean {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'target', { value: on });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('touch guards (K12)', () => {
  const window = new EventTarget();
  installGuards(window);

  it('no long-press menu or text selection on the game, and no dragging a picture out of it', () => {
    const piece = { tagName: 'DIV' };
    expect(fire(window, 'contextmenu', piece)).toBe(true);
    expect(fire(window, 'selectstart', piece)).toBe(true);
    expect(fire(window, 'dragstart', { tagName: 'IMG' })).toBe(true);
  });

  it('no pinch-zoom gesture (iOS Safari ignores user-scalable)', () => {
    expect(fire(window, 'gesturestart', { tagName: 'DIV' })).toBe(true);
    expect(fire(window, 'gesturechange', { tagName: 'DIV' })).toBe(true);
  });

  it('but a text box keeps its menu, selection and cursor', () => {
    const input = { tagName: 'INPUT' };
    expect(fire(window, 'contextmenu', input)).toBe(false);
    expect(fire(window, 'selectstart', input)).toBe(false);
    expect(fire(window, 'contextmenu', { tagName: 'TEXTAREA' })).toBe(false);
  });
});

describe('keeping saves (K12)', () => {
  const store = (persisted: boolean, grants: boolean): StorageLike => ({
    persisted: () => Promise.resolve(persisted),
    persist: () => Promise.resolve(grants),
  });

  it('asks the browser to keep the saves, and says whether it will', async () => {
    expect(await protectSaves(store(false, true))).toBe(true);
    expect(await protectSaves(store(false, false))).toBe(false);
    expect(await protectSaves(store(true, false))).toBe(true);
  });

  it('reports "not known" where the browser cannot say, and never throws', async () => {
    expect(await protectSaves(undefined)).toBeNull();
    expect(await savesProtected(undefined)).toBeNull();
    const broken: StorageLike = {
      persisted: () => Promise.reject(new Error('no')),
      persist: () => Promise.reject(new Error('no')),
    };
    expect(await protectSaves(broken)).toBeNull();
    expect(await savesProtected(store(true, true))).toBe(true);
    expect(await savesProtected(store(false, true))).toBe(false);
  });
});
