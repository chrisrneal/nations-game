import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpdates, type Register, type RegisterOptions } from './updates.ts';

/** A stand-in for vite-plugin-pwa's registerSW: records what the app handed it, and what the page does. */
function setup(env: { hidden?: () => boolean } = {}) {
  let options: RegisterOptions | null = null;
  const reg = { update: vi.fn(() => Promise.resolve()) };
  const apply = vi.fn(() => Promise.resolve());
  const register: Register = (o) => {
    options = o;
    return apply;
  };
  const target = new EventTarget();
  const updates = createUpdates(register, { target, hidden: env.hidden ?? (() => false), everyMs: 60 * 60 * 1000 });
  const registered = (): void => options!.onRegisteredSW?.('/sw.js', reg as unknown as ServiceWorkerRegistration);
  const found = (): void => options!.onNeedRefresh?.();
  return { updates, reg, apply, target, registered, found };
}

describe('updates (K12)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts with nothing to say, and says "ready" once a new version is waiting', () => {
    const s = setup();
    const seen: string[] = [];
    s.updates.subscribe((state) => seen.push(state));
    expect(s.updates.state()).toBe('none');
    s.found();
    expect(s.updates.state()).toBe('ready');
    expect(seen).toEqual(['ready']);
    s.found();
    expect(seen).toEqual(['ready']);
  });

  it('never reloads by itself: only apply() does, and only when a version is waiting', () => {
    const s = setup();
    s.updates.apply();
    expect(s.apply).not.toHaveBeenCalled();
    s.found();
    expect(s.apply).not.toHaveBeenCalled();
    s.updates.apply();
    expect(s.apply).toHaveBeenCalledOnce();
    expect(s.apply).toHaveBeenCalledWith(true);
  });

  it('looks for a new version when the app comes back to the front, and every hour', () => {
    const s = setup();
    s.registered();
    s.target.dispatchEvent(new Event('visibilitychange'));
    expect(s.reg.update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(s.reg.update).toHaveBeenCalledTimes(2);
  });

  it('does not look while the app is in the background', () => {
    const s = setup({ hidden: () => true });
    s.registered();
    s.target.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(s.reg.update).not.toHaveBeenCalled();
  });

  it('survives being offline (the check just fails)', async () => {
    const s = setup();
    s.reg.update.mockRejectedValue(new Error('offline'));
    s.registered();
    expect(() => s.target.dispatchEvent(new Event('visibilitychange'))).not.toThrow();
    await vi.advanceTimersByTimeAsync(10);
    expect(s.updates.state()).toBe('none');
  });

  it('survives a browser with no service worker', () => {
    const updates = createUpdates(() => {
      throw new Error('no service worker');
    }, { target: new EventTarget(), hidden: () => false, everyMs: 1000 });
    expect(updates.state()).toBe('none');
    expect(() => updates.apply()).not.toThrow();
  });
});
