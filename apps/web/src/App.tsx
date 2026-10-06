import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { WarehouseView, BoostId, UpgradeId } from '@warehouse/contracts';
import type { WarehouseHost, Feedback, InstallPrompt } from './platform/index.ts';
import { BottomBar } from './ui/BottomBar.tsx';
import { EmptyStand, DockCard, NextDockCard, Pier, STANDS_PER_ROW } from './ui/DockCard.tsx';
import { InstallBanner } from './ui/Install.tsx';
import { Recap } from './ui/Recap.tsx';
import { SiteIntro } from './ui/SiteIntro.tsx';
import { Floor } from './ui/Floor.tsx';
import { SellSheet } from './ui/SellSheet.tsx';
import { SettingsSheet } from './ui/SettingsSheet.tsx';
import { StarsSheet } from './ui/StarsSheet.tsx';
import { WarehouseStore } from './ui/store.ts';
import { TopBar } from './ui/TopBar.tsx';
import { UpgradeSheet } from './ui/UpgradeSheet.tsx';

/** Names of the stations on the floor (RULES 14). */
function checkpointNames(view: WarehouseView): Set<string> {
  return new Set([...view.journey.outbound, ...view.journey.inbound].map((c) => c.name));
}

/** A toast for the purchases that open something new: a dock, a truck, a contract (and any station it adds). */
function unlockText(upgrade: UpgradeId, level: number, view: WarehouseView, before: ReadonlySet<string>): string | null {
  switch (upgrade) {
    case 'docks':
      return `Dock ${level + 1} is open`;
    case 'truck':
      return `New truck: ${view.truckModel}`;
    case 'contract': {
      const opened = [...checkpointNames(view)].filter((name) => !before.has(name));
      return opened.length === 0 ? `New contract: ${view.contract}` : `New contract: ${view.contract}. ${opened.join(' and ')} needed.`;
    }
    default:
      return null;
  }
}

type SheetName = 'upgrades' | 'settings' | 'sell' | 'stars' | null;

/** The warehouse screen (docs/ROADMAP.md, phone UX): money and the dashboard on top, the floor (receiving, the picking backlog at its heart, packing) and the docks in the middle, actions under the thumb. */
export function App(props: { host: WarehouseHost; install?: InstallPrompt; feedback?: Feedback }): ReactElement {
  const { host, install, feedback } = props;
  const store = useMemo(() => new WarehouseStore(), []);
  const [sheet, setSheet] = useState<SheetName>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [intro, setIntro] = useState(false);
  const checkpoints = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => host.subscribe((update) => store.push(update)), [host, store]);
  useEffect(
    () =>
      store.onFrame((update) => {
        for (const e of update.events) {
          if (e.type === 'sold') {
            setIntro(true);
            feedback?.cue('unlock');
          } else if (e.type === 'departed') {
            feedback?.cue(e.payload.express ? 'express' : e.payload.full ? 'full' : 'depart');
          } else if (e.type === 'boosted') {
            const b = update.view.boosts.find((x) => x.id === e.payload.boost);
            feedback?.cue('boost');
            if (b !== undefined) setToast(`${b.name}! ${b.effect}`);
          } else if (e.type === 'bought') {
            const text = unlockText(e.payload.upgrade, e.payload.level, update.view, checkpoints.current);
            feedback?.cue(text === null ? 'buy' : 'unlock');
            if (text !== null) setToast(text);
          }
        }
        checkpoints.current = checkpointNames(update.view);
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
    (dock: number) => {
      feedback?.cue('tap');
      void host.tap(dock);
    },
    [host, feedback],
  );
  const tapPick = useCallback(() => {
    feedback?.cue('tap');
    void host.submit({ type: 'tapPick', payload: {} });
  }, [host, feedback]);
  const tapReceive = useCallback(() => {
    feedback?.cue('tap');
    void host.submit({ type: 'tapReceive', payload: {} });
  }, [host, feedback]);
  const buy = useCallback((upgrade: UpgradeId) => void host.buy(upgrade), [host]);
  const boost = useCallback((id: BoostId) => void host.boost(id), [host]);
  const close = useCallback(() => setSheet(null), []);

  const nextDock = view?.upgrades.find((u) => u.id === 'docks');

  if (view === null) {
    return (
      <div className="app loading" aria-busy="true">
        <p>Opening the warehouse…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar view={view} store={store} onSettings={() => setSheet('settings')} onStars={() => setSheet('stars')} />
      <InstallBanner install={install} onToast={setToast} />
      <Floor journey={view.journey} pickingLevel={view.upgrades.find((u) => u.id === 'picking')?.level ?? 0} tickMs={view.tickMs} store={store} onTapPick={tapPick} onTapReceive={tapReceive}>
        <Pier model={view.truckModel}>
          {view.docks.map((g) => (
            <DockCard
              key={g.index}
              index={g.index}
              truck={g.truck}
              turning={g.turn > 0}
              express={g.express}
              parcels={g.parcels}
              model={g.model}
              tickMs={view.tickMs}
              store={store}
              onTap={tap}
            />
          ))}
          {nextDock !== undefined && nextDock.cost !== null && (
            <NextDockCard number={view.docks.length + 1} cost={nextDock.cost} affordable={nextDock.affordable} onOpen={() => setSheet('upgrades')} />
          )}
          {nextDock !== undefined &&
            nextDock.cost !== null &&
            Array.from({ length: Math.max(0, 2 * STANDS_PER_ROW - view.docks.length - 1) }, (_, i) => <EmptyStand key={i} number={view.docks.length + 2 + i} />)}
        </Pier>
      </Floor>
      <BottomBar view={view} store={store} onUpgrades={() => setSheet('upgrades')} onSell={() => setSheet('sell')} onBoost={boost} />
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
      {sheet === 'stars' && <StarsSheet view={view} onSell={() => setSheet('sell')} onClose={close} />}
      {intro && sheet === null && <SiteIntro view={view} onClose={() => setIntro(false)} />}
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
