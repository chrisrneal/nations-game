import { createContext, useContext, useSyncExternalStore, type ReactElement } from 'react';
import type { Updates } from '../platform/index.ts';
import { Icon } from './art/Icons.tsx';

/**
 * "A new version is ready" (decision record K13). The app never reloads on its
 * own; this is the one gentle button, shown only where nothing is happening:
 * between waves (inside the result card, which appears after the replay ends),
 * on the done-for-today screen, in the menu and on the picker. It is never
 * on the board, so a wave in progress can't be interrupted by it.
 */
export const UpdatesContext = createContext<Updates | undefined>(undefined);

export function UpdateNotice(): ReactElement | null {
  const updates = useContext(UpdatesContext);
  const state = useSyncExternalStore(
    (onChange) => updates?.subscribe(onChange) ?? (() => {}),
    () => updates?.state() ?? 'none',
  );
  if (updates === undefined || state !== 'ready') return null;
  return (
    <aside className="update-notice" aria-label="Update ready" data-testid="update">
      <Icon className="update-icon" name="sparkle" />
      <span className="update-text">A new version is ready.</span>
      <button type="button" className="btn btn-small btn-primary" onClick={() => updates.apply()}>
        Update
      </button>
    </aside>
  );
}
