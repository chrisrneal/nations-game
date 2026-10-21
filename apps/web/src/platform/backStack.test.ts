import { describe, expect, it } from 'vitest';
import { createBackStack, type BackEnv } from './backStack.ts';

/**
 * A stand-in for the browser's history: `back()` queues a pop that happens a
 * moment later, as the real one does, and a person's Back press pops at once.
 */
function fakeHistory(): { env: BackEnv; entries: () => number; press: () => void; flush: () => void } {
  let entries = 1;
  let queued = 0;
  const timers: (() => void)[] = [];
  let listener: () => void = () => {};
  return {
    env: {
      push: () => void (entries += 1),
      back: () => void (queued += 1),
      onPop: (l) => void (listener = l),
      later: (fn) => void timers.push(fn),
    },
    entries: () => entries,
    press: () => {
      if (entries > 1) {
        entries -= 1;
        listener();
      }
    },
    flush: () => {
      while (timers.length > 0) timers.shift()!();
      while (queued > 0) {
        queued -= 1;
        if (entries > 1) {
          entries -= 1;
          listener();
        }
      }
    },
  };
}

describe('the Back button (K13)', () => {
  it('closes the open sheet instead of leaving the game', () => {
    const h = fakeHistory();
    const stack = createBackStack(h.env);
    let closed = 0;
    stack.open(() => (closed += 1));
    expect(h.entries()).toBe(2);
    h.press();
    expect(closed).toBe(1);
    expect(stack.depth).toBe(0);
  });

  it('closes the top sheet first, then the one under it, and only then is Back the browser’s', () => {
    const h = fakeHistory();
    const stack = createBackStack(h.env);
    const order: string[] = [];
    stack.open(() => order.push('menu'));
    stack.open(() => order.push('clue'));
    h.press();
    h.press();
    expect(order).toEqual(['clue', 'menu']);
    expect(h.entries()).toBe(1);
    // Nothing open: a Back press is not ours, and nothing is called.
    h.press();
    expect(order).toHaveLength(2);
  });

  it('a sheet closed by its own button takes its history entry with it, without closing anything twice', () => {
    const h = fakeHistory();
    const stack = createBackStack(h.env);
    let closed = 0;
    const release = stack.open(() => (closed += 1));
    release();
    h.flush();
    expect(closed).toBe(0);
    expect(h.entries()).toBe(1);
    expect(stack.depth).toBe(0);
    release();
    h.flush();
    expect(h.entries()).toBe(1);
  });

  it('closing the lower sheet by hand leaves the upper one open and still closable by Back', () => {
    const h = fakeHistory();
    const stack = createBackStack(h.env);
    const order: string[] = [];
    const lower = stack.open(() => order.push('lower'));
    stack.open(() => order.push('upper'));
    lower();
    h.flush();
    expect(stack.depth).toBe(1);
    h.press();
    expect(order).toEqual(['upper']);
    expect(h.entries()).toBe(1);
  });

  it('a sheet opened right after another one closed (the same moment) still gets its own Back', () => {
    const h = fakeHistory();
    const stack = createBackStack(h.env);
    const first = stack.open(() => {});
    first();
    let second = 0;
    stack.open(() => (second += 1));
    h.flush();
    // The queued pop belongs to the first sheet; the second is still open.
    expect(stack.depth).toBe(1);
    expect(second).toBe(0);
    h.press();
    expect(second).toBe(1);
  });

  it('a sheet swapped for another in the same moment keeps its one history entry', () => {
    const h = fakeHistory();
    const stack = createBackStack(h.env);
    const closed: string[] = [];
    const old = stack.open(() => closed.push('old'));
    old();
    stack.open(() => closed.push('new'));
    h.flush();
    expect(h.entries()).toBe(2);
    expect(stack.depth).toBe(1);
    expect(closed).toEqual([]);
    h.press();
    expect(closed).toEqual(['new']);
  });

  it('never throws where there is no history to use', () => {
    const stack = createBackStack({
      push: () => {
        throw new Error('no history');
      },
      back: () => {
        throw new Error('no history');
      },
      onPop: () => {},
    });
    const release = stack.open(() => {});
    expect(() => release()).not.toThrow();
  });
});
