import { useEffect, useState, type ReactElement } from 'react';
import type { HomeView } from '@snacks/contracts';
import type { Feedback, GameHost, GameUpdate, InstallPrompt } from './platform/index.ts';
import { Game } from './ui/Game.tsx';
import { InstallBanner } from './ui/Install.tsx';
import { KindySoon } from './ui/KindySoon.tsx';
import { MenuSheet } from './ui/MenuSheet.tsx';
import { Picker } from './ui/Picker.tsx';

/**
 * Snack Attack (docs/ROADMAP.md; decision record K1). Who is playing comes
 * first (K7): the picker when there is more than one profile, then that
 * child's game. The game re-renders only when the player does something:
 * there is no clock (K3). The wave replay animates outside React (P7).
 */
export function App(props: { host: GameHost; install?: InstallPrompt; feedback?: Feedback }): ReactElement {
  const { host, install, feedback } = props;
  const [home, setHome] = useState<HomeView | null>(null);
  const [update, setUpdate] = useState<GameUpdate | null>(null);
  const [picking, setPicking] = useState(false);
  // The child just tapped: their screen, or loading, until the host has opened their game.
  const [wanted, setWanted] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => host.subscribeHome(setHome), [host]);
  useEffect(() => host.subscribe(setUpdate), [host]);
  useEffect(() => {
    void host.start();
  }, [host]);
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  // Once the host has opened that child's game, `wanted` is simply the current profile.
  const chosen = wanted !== null && home?.profiles.some((p) => p.id === wanted) === true ? wanted : (home?.current ?? null);
  const profile = home?.profiles.find((p) => p.id === chosen);
  const toastLayer = toast !== null && (
    <div className="toast" role="status">
      {toast}
    </div>
  );

  if (home === null) return <Loading />;

  if (profile === undefined || picking) {
    return (
      <div className="app">
        <Picker
          home={home}
          host={host}
          onToast={setToast}
          onClose={profile === undefined ? undefined : () => setPicking(false)}
          onPick={(id) => {
            setPicking(false);
            setMenu(false);
            if (id === home.current) return;
            setWanted(id);
            void host.choose(id);
          }}
        />
        {toastLayer}
      </div>
    );
  }

  if (profile.mode === 'kindy') {
    return (
      <div className="app">
        <KindySoon profile={profile} onBack={() => setPicking(true)} />
      </div>
    );
  }

  // The game on screen must be this child's: while a switch loads, nobody else's shows.
  if (update === null || update.profile !== profile.id || home.current !== profile.id) return <Loading />;

  return (
    <div className="app">
      <InstallBanner install={install} onToast={setToast} />
      <Game
        host={host}
        view={update.view}
        wave={update.wave}
        healRange={update.healRange}
        profile={profile}
        feedback={feedback}
        onToast={setToast}
        onMenu={() => setMenu(true)}
        onProfiles={() => setPicking(true)}
      />
      {menu && <MenuSheet host={host} view={update.view} feedback={feedback} onClose={() => setMenu(false)} onProfiles={() => setPicking(true)} />}
      {toastLayer}
    </div>
  );
}

function Loading(): ReactElement {
  return (
    <div className="app loading" aria-busy="true">
      <p>Packing the lunchboxes…</p>
    </div>
  );
}
