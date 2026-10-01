import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { AirportView, UpgradeId } from '@nations/contracts';
import type { AirportHost, Feedback, InstallPrompt } from './platform/index.ts';
import { BottomBar } from './ui/BottomBar.tsx';
import { GateCard, NextGateCard } from './ui/GateCard.tsx';
import { InstallBanner } from './ui/Install.tsx';
import { Recap } from './ui/Recap.tsx';
import { CityIntro } from './ui/CityIntro.tsx';
import { SellSheet } from './ui/SellSheet.tsx';
import { SettingsSheet } from './ui/SettingsSheet.tsx';
import { AirportStore } from './ui/store.ts';
import { TerminalStrip } from './ui/TerminalStrip.tsx';
import { TopBar } from './ui/TopBar.tsx';
import { UpgradeSheet } from './ui/UpgradeSheet.tsx';

/** A toast for the purchases that open something new: a gate, a plane, a route. */
function unlockText(upgrade: UpgradeId, level: number, view: AirportView): string | null {
  switch (upgrade) {
    case 'gates':
      return `Gate ${level + 1} is open`;
    case 'plane':
      return `New plane: ${view.planeModel}`;
    case 'route':
      return `New route: ${view.route}`;
    default:
      return null;
  }
}

type SheetName = 'upgrades' | 'settings' | 'sell' | null;

/** The airport screen (docs/ROADMAP.md, phone UX): money on top, gates in the middle, actions under the thumb. */
export function App(props: { host: AirportHost; install?: InstallPrompt; feedback?: Feedback }): ReactElement {
  const { host, install, feedback } = props;
  const store = useMemo(() => new AirportStore(), []);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [intro, setIntro] = useState(false);

  useEffect(() => host.subscribe((update) => store.push(update)), [host, store]);
  useEffect(
    () =>
      store.onFrame((update) => {
        for (const e of update.events) {
          if (e.type === 'sold') {
            setIntro(true);
            feedback?.cue('unlock');
          } else if (e.type === 'departed') {
            feedback?.cue(e.payload.charter ? 'charter' : e.payload.full ? 'full' : 'depart');
          } else if (e.type === 'bought') {
            const text = unlockText(e.payload.upgrade, e.payload.level, update.view);
            feedback?.cue(text === null ? 'buy' : 'unlock');
            if (text !== null) setToast(text);
          }
        }
      }),
    [store, feedback],
  );
  useEffect(() => {
    void host.start();
  }, [host]);
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const structure = useSyncExternalStore(store.subscribeStructure, store.getStructure);
  const view = structure?.view ?? null;
  const tap = useCallback(
    (gate: number) => {
      feedback?.cue('tap');
      void host.tap(gate);
    },
    [host, feedback],
  );
  const buy = useCallback((upgrade: UpgradeId) => void host.buy(upgrade), [host]);
  const close = useCallback(() => setSheet(null), []);

  const nextGate = view?.upgrades.find((u) => u.id === 'gates');

  if (view === null) {
    return (
      <div className="app loading" aria-busy="true">
        <p>Opening the airport…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar view={view} store={store} onSettings={() => setSheet('settings')} />
      <InstallBanner install={install} onToast={setToast} />
      <TerminalStrip store={store} tickMs={view.tickMs} />
      <main className="gates" data-testid="gates">
        {view.gates.map((g) => (
          <GateCard
            key={g.index}
            index={g.index}
            plane={g.plane}
            turning={g.turn > 0}
            charter={g.charter}
            seats={g.seats}
            model={g.model}
            tickMs={view.tickMs}
            store={store}
            onTap={tap}
          />
        ))}
        {nextGate !== undefined && nextGate.cost !== null && (
          <NextGateCard number={view.gates.length + 1} cost={nextGate.cost} affordable={nextGate.affordable} onOpen={() => setSheet('upgrades')} />
        )}
      </main>
      <BottomBar view={view} store={store} onUpgrades={() => setSheet('upgrades')} onSell={() => setSheet('sell')} />
      {sheet === 'upgrades' && <UpgradeSheet view={view} store={store} onBuy={buy} onSell={() => setSheet('sell')} onClose={close} />}
      {sheet === 'sell' && (
        <SellSheet
          view={view}
          store={store}
          onSell={() => {
            void host.sell();
            setSheet(null);
          }}
          onClose={close}
        />
      )}
      {intro && sheet === null && <CityIntro view={view} onClose={() => setIntro(false)} />}
      {sheet === 'settings' && <SettingsSheet view={view} host={host} feedback={feedback} onClose={close} onToast={setToast} />}
      {structure !== null && structure.recap !== null && sheet === null && <Recap
          recap={structure.recap}
          onCollect={() => {
            feedback?.cue('collect');
            void host.dismissRecap();
          }}
        />}
      {toast !== null && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
