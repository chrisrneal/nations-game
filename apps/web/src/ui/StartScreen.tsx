import { useEffect, useState, type ReactElement } from 'react';
import { AUTOSAVE_SLOT, type GameHost, type InstallPrompt, type SlotSummary } from '../platform/index.ts';
import { NATIONS, nameOf, tickDate } from '../world/nations.ts';
import { InstallBanner } from './Install.tsx';
import { Saves } from './Saves.tsx';

/** First screen: continue the autosave, load a slot, or pick a nation for a new game. */
export function StartScreen(props: {
  host: GameHost;
  install?: InstallPrompt | undefined;
  onStart: (nationId: string) => void;
  onLoad: (slot: string) => void;
  onImported: () => void;
  onToast: (text: string) => void;
}): ReactElement {
  const { host } = props;
  const [autosave, setAutosave] = useState<SlotSummary | null>(null);
  const [mode, setMode] = useState<'menu' | 'choose' | 'load'>('menu');

  useEffect(() => {
    void host.listSaves().then((list) => setAutosave(list.find((s) => s.slot === AUTOSAVE_SLOT) ?? null));
  }, [host]);

  const playable = NATIONS.filter((n) => n.playable).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="start">
      <header className="start-head">
        <h1>Nations</h1>
        <p className="lede">Run a real nation in 2030. Cooperation beats conquest.</p>
      </header>
      <InstallBanner install={props.install} onToast={props.onToast} />
      {mode === 'menu' && (
        <div className="start-actions">
          {autosave !== null && (
            <button type="button" className="btn btn-primary" onClick={() => props.onLoad(AUTOSAVE_SLOT)}>
              Continue as {nameOf(autosave.humanId)} · {tickDate(autosave.tick)}
            </button>
          )}
          <button type="button" className={autosave === null ? 'btn btn-primary' : 'btn'} onClick={() => setMode('choose')}>
            New game
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setMode('load')}>
            Load a save
          </button>
        </div>
      )}
      {mode === 'choose' && (
        <section aria-label="Choose your nation">
          <h2 className="section-title">Choose your nation</h2>
          <ul className="rows">
            {playable.map((n) => (
              <li key={n.id}>
                <button type="button" className="row" onClick={() => props.onStart(n.id)}>
                  <span className="row-name">{n.name}</span>
                  <span className="row-meta">{n.region}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {mode === 'load' && <Saves host={host} inGame={false} onLoad={props.onLoad} onImported={props.onImported} onNewGame={() => setMode('choose')} onToast={props.onToast} />}
    </main>
  );
}
