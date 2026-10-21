import { useEffect, useRef } from 'react';
import { backStack } from '../platform/index.ts';

/**
 * While `active`, the phone's Back button (and the iOS swipe back) calls
 * `onClose` instead of leaving the game (K12). Every sheet uses it, and so do
 * the other overlays a child could be stuck behind.
 */
export function useBackClose(active: boolean, onClose: () => void): void {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  useEffect(() => {
    if (!active) return;
    return backStack().open(() => latest.current());
  }, [active]);
}
