import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { UpgradeId } from '@nations/contracts';
import type { AirportHost, InstallPrompt } from './platform/index.ts';
import { BottomBar } from './ui/BottomBar.tsx';
import { GateCard, NextGateCard } from './ui/GateCard.tsx';
import { InstallBanner } from './ui/Install.tsx';
import { SettingsSheet } from './ui/SettingsSheet.tsx';
import { AirportStore } from './ui/store.ts';
import { TerminalStrip } from './ui/TerminalStrip.tsx';
import { TopBar } from './ui/TopBar.tsx';
import { UpgradeSheet } from './ui/UpgradeSheet.tsx';

type SheetName = 'upgrades' | 'settings' | null;

/** The airport screen (docs/ROADMAP.md, phone UX): money on top, gates in the middle, actions under the thumb. */
export function App(props: { host: AirportHost; install?: InstallPrompt }): ReactElement {
  const { host, install } = props;
  const store = useMemo(() => new AirportStore(), []);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => host.subscribe((update) => store.push(update)), [host, store]);
  useEffect(() => {
    void host.start();
  }, [host]);
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  const view = useSyncExternalStore(store.subscribeStructure, store.getStructure);
  const tap = useCallback((gate: number) => void host.tap(gate), [host]);
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
      <BottomBar view={view} store={store} onUpgrades={() => setSheet('upgrades')} />
      {sheet === 'upgrades' && <UpgradeSheet view={view} store={store} onBuy={buy} onClose={close} />}
      {sheet === 'settings' && <SettingsSheet view={view} host={host} onClose={close} onToast={setToast} />}
      {toast !== null && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
