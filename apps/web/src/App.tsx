import { useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { WarehouseHost, Feedback, InstallPrompt } from './platform/index.ts';
import { InstallBanner } from './ui/Install.tsx';
import { Recap } from './ui/Recap.tsx';
import { SettingsSheet } from './ui/SettingsSheet.tsx';
import { formatCash } from './ui/format.ts';
import { WarehouseStore } from './ui/store.ts';
import { HomeTop } from './ui/wms/Home.tsx';
import { WmsScreen } from './ui/wms/WmsScreen.tsx';

/**
 * The warehouse (docs/ROADMAP.md, phone UX; decision record W8): the WMS is
 * the whole game. The clock and money bar on top, the WMS's pages in the
 * middle, its tabs under the thumb; settings and the away recap open over it.
 */
export function App(props: { host: WarehouseHost; install?: InstallPrompt; feedback?: Feedback }): ReactElement {
  const { host, install, feedback } = props;
  const store = useMemo(() => new WarehouseStore(), []);
  const [settings, setSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => host.subscribe((update) => store.push(update)), [host, store]);
  useEffect(
    () =>
      store.onFrame((update) => {
        for (const e of update.events) {
          if (e.type === 'wmsShipped') {
            const p = e.payload;
            feedback?.cue(p.onTime && p.inFull ? 'full' : 'depart');
            if (p.priority === 1) {
              const how = p.onTime && p.inFull ? 'on time, in full' : !p.onTime ? 'late' : 'short';
              setToast(`O-${p.order} to ${p.iso} shipped ${how}${p.cents > 0 ? ` · +${formatCash(p.cents)}` : ''}`);
            }
          } else if (e.type === 'wmsMissed' && e.payload.priority <= 2) {
            setToast(`O-${e.payload.order} to ${e.payload.iso} (P${e.payload.priority}) missed its cutoff`);
          } else if (e.type === 'wms' && (e.payload.action === 'hire' || e.payload.action === 'door')) {
            feedback?.cue('unlock');
          } else if (e.type === 'newDay') {
            setToast(`Day ${e.payload.day} begins`);
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

  if (view === null) {
    return (
      <div className="app loading" aria-busy="true">
        <p>Opening the warehouse…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <WmsScreen
        store={store}
        host={host}
        top={
          <>
            <HomeTop store={store} onSettings={() => setSettings(true)} />
            <InstallBanner install={install} onToast={setToast} />
          </>
        }
      />
      {settings && <SettingsSheet view={store.current?.view ?? view} host={host} feedback={feedback} onClose={() => setSettings(false)} onToast={setToast} />}
      {structure !== null && structure.recap !== null && !settings && (
        <Recap
          recap={structure.recap}
          onCollect={() => {
            feedback?.cue('collect');
            void host.dismissRecap();
          }}
        />
      )}
      {toast !== null && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
