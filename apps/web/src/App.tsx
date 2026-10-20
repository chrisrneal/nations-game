import { useEffect, useState, type ReactElement } from 'react';
import type { Feedback, GameHost, GameUpdate, InstallPrompt } from './platform/index.ts';
import { Game } from './ui/Game.tsx';
import { InstallBanner } from './ui/Install.tsx';
import { MenuSheet } from './ui/MenuSheet.tsx';

/**
 * Snack Attack (docs/ROADMAP.md; decision record K1). The game re-renders
 * only when the player does something: there is no clock (K3). The wave
 * replay animates outside React (P7).
 */
export function App(props: { host: GameHost; install?: InstallPrompt; feedback?: Feedback }): ReactElement {
  const { host, install, feedback } = props;
  const [update, setUpdate] = useState<GameUpdate | null>(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => host.subscribe(setUpdate), [host]);
  useEffect(() => {
    void host.start();
  }, [host]);
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  if (update === null) {
    return (
      <div className="app loading" aria-busy="true">
        <p>Packing the lunchboxes…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <InstallBanner install={install} onToast={setToast} />
      <Game host={host} view={update.view} wave={update.wave} healRange={update.healRange} feedback={feedback} onToast={setToast} onMenu={() => setMenu(true)} />
      {menu && <MenuSheet host={host} view={update.view} feedback={feedback} onClose={() => setMenu(false)} />}
      {toast !== null && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
