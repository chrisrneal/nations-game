import { describe, expect, it } from 'vitest';
import type { FriendView } from '@snacks/contracts';
import { clearPlan, undoChange, undoFor } from './history.ts';

const friend = (id: number, cell: number, facing = 0, type: FriendView['type'] = 'straight'): FriendView => ({ id, type, cell, facing, target: -1, picker: false });

describe('undo (setup only)', () => {
  it('undoes a placement from the tray by sending the friend back, facing as it was', () => {
    expect(undoFor([friend(1, -1, 0)], { type: 'place', friend: 1, cell: 7, facing: 0 })).toEqual([{ type: 'toTray', friend: 1 }]);
    expect(undoFor([friend(1, -1, 0)], { type: 'place', friend: 1, cell: 7, facing: 2 })).toEqual([
      { type: 'toTray', friend: 1 },
      { type: 'turn', friend: 1, facing: 0 },
    ]);
  });

  it('undoes a move by putting the friend back where it stood, facing the same way', () => {
    expect(undoFor([friend(1, 3, 4)], { type: 'place', friend: 1, cell: 9, facing: 4 })).toEqual([{ type: 'place', friend: 1, cell: 3, facing: 4 }]);
  });

  it('undoes an aim change by turning back', () => {
    expect(undoFor([friend(1, 3, 4)], { type: 'turn', friend: 1, facing: 2 })).toEqual([{ type: 'turn', friend: 1, facing: 4 }]);
  });

  it('undoes sending a friend to the tray by placing it again', () => {
    expect(undoFor([friend(1, 3, 6)], { type: 'toTray', friend: 1 })).toEqual([{ type: 'place', friend: 1, cell: 3, facing: 6 }]);
  });

  it('has nothing to undo when the command changes nothing', () => {
    expect(undoFor([friend(1, 3, 4)], { type: 'turn', friend: 1, facing: 4 })).toBeNull();
    expect(undoFor([friend(1, 3, 4)], { type: 'place', friend: 1, cell: 3, facing: 4 })).toBeNull();
    expect(undoFor([friend(1, -1, 4)], { type: 'toTray', friend: 1 })).toBeNull();
  });

  it('never undoes Go, a retry or a purchase: the rules lock those in', () => {
    expect(undoFor([friend(1, 3)], { type: 'go' })).toBeNull();
    expect(undoFor([friend(1, 3)], { type: 'retry' })).toBeNull();
    expect(undoFor([friend(1, 3)], { type: 'buy', friend: 'short' })).toBeNull();
  });
});

describe('clear board', () => {
  it('sends back only the friends placed in this setup, and can be undone', () => {
    const friends = [friend(1, 3, 2), friend(2, 8, 4), friend(3, -1), friend(4, 12, 6, 'bouncer')];
    // Friend 2 was on the board when this setup began (an earlier wave): it stays.
    const plan = clearPlan(friends, new Set([2]));
    expect(plan.commands).toEqual([
      { type: 'toTray', friend: 1 },
      { type: 'toTray', friend: 4 },
    ]);
    expect(plan.undo).toEqual([
      { type: 'place', friend: 1, cell: 3, facing: 2 },
      { type: 'place', friend: 4, cell: 12, facing: 6 },
    ]);
  });

  it('has nothing to do when nothing was placed in this setup', () => {
    expect(clearPlan([friend(2, 8)], new Set([2])).commands).toEqual([]);
  });
});

describe('undoing what a hint did (RULES 8b)', () => {
  it('a friend the hint placed from the tray goes back to the tray, facing as it was', () => {
    expect(undoChange([friend(1, -1, 0)], [friend(1, 7, 2)])).toEqual([
      { type: 'toTray', friend: 1 },
      { type: 'turn', friend: 1, facing: 0 },
    ]);
  });

  it('a friend the hint moved or turned goes back where it stood; one in the way it sent to the tray comes back after', () => {
    expect(undoChange([friend(1, 3, 4), friend(2, 7, 0, 'short')], [friend(1, 7, 2), friend(2, -1, 0, 'short')])).toEqual([
      { type: 'place', friend: 1, cell: 3, facing: 4 },
      { type: 'place', friend: 2, cell: 7, facing: 0 },
    ]);
  });

  it('a friend the hint bought goes to the tray (points spent stay spent); nothing changed, nothing to undo', () => {
    expect(undoChange([], [friend(5, 9, 2)])).toEqual([{ type: 'toTray', friend: 5 }]);
    expect(undoChange([friend(1, 3, 4)], [friend(1, 3, 4)])).toBeNull();
  });
});
