import type { FriendView, GameCommand } from '@snacks/contracts';

/**
 * Undo and Clear board for the setup screen. The screen keeps a stack of the
 * commands that put each change back, and sends them to the host like any
 * other command (S2): the sim knows nothing about undo. The stack is emptied
 * when Go is pressed, so nothing a played wave locked in can be undone.
 */

/** The commands that undo one change, in the order to send them. */
export type UndoStep = readonly GameCommand[];

/** What undoes `command`, given the friends before it; null when it changes nothing or cannot be undone (Go, retry, buying). */
export function undoFor(friends: readonly FriendView[], command: GameCommand): UndoStep | null {
  if (command.type !== 'place' && command.type !== 'turn' && command.type !== 'toTray') return null;
  const friend = friends.find((f) => f.id === command.friend);
  if (friend === undefined) return null;
  const putBack: GameCommand = { type: 'place', friend: friend.id, cell: friend.cell, facing: friend.facing };
  switch (command.type) {
    case 'place':
      if (friend.cell === command.cell && friend.facing === command.facing) return null;
      if (friend.cell >= 0) return [putBack];
      return friend.facing === command.facing ? [{ type: 'toTray', friend: friend.id }] : [{ type: 'toTray', friend: friend.id }, { type: 'turn', friend: friend.id, facing: friend.facing }];
    case 'turn':
      return friend.facing === command.facing ? null : [{ type: 'turn', friend: friend.id, facing: friend.facing }];
    case 'toTray':
      return friend.cell < 0 ? null : [putBack];
  }
}

/**
 * Clear board: every friend placed during this setup goes back to the tray.
 * `earlier` holds the friends already on the board when this setup began;
 * they stay where they are.
 */
export function clearPlan(friends: readonly FriendView[], earlier: ReadonlySet<number>): { commands: GameCommand[]; undo: UndoStep } {
  const placed = friends.filter((f) => f.cell >= 0 && !earlier.has(f.id));
  return {
    commands: placed.map((f) => ({ type: 'toTray', friend: f.id })),
    undo: placed.map((f) => ({ type: 'place', friend: f.id, cell: f.cell, facing: f.facing })),
  };
}

/**
 * A friend given back in the shop (K9) is gone: every undo step that names it
 * is dropped, since putting it back would be refused. Steps left empty go too.
 */
export function forgetFriend(history: readonly UndoStep[], friend: number): UndoStep[] {
  return history.map((step) => step.filter((c) => !('friend' in c) || c.friend !== friend)).filter((step) => step.length > 0);
}
