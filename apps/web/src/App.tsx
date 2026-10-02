import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { AirportView, BoostId, UpgradeId } from '@airport/contracts';
import type { AirportHost, Feedback, InstallPrompt } from './platform/index.ts';
import { BottomBar } from './ui/BottomBar.tsx';
import { GateCard, NextGateCard } from './ui/GateCard.tsx';
import { InstallBanner } from './ui/Install.tsx';
import { Recap } from './ui/Recap.tsx';
import { CityIntro } from './ui/CityIntro.tsx';
import { Concourse } from './ui/Concourse.tsx';
import { SellSheet } from './ui/SellSheet.tsx';
import { SettingsSheet } from './ui/SettingsSheet.tsx';
import { AirportStore } from './ui/store.ts';
import { TopBar } from './ui/TopBar.tsx';
import { UpgradeSheet } from './ui/UpgradeSheet.tsx';

/** Names of the checkpoints on the passenger journey (RULES 14). */
function checkpointNames(view: AirportView): Set<string> {
  return new Set([...view.journey.departures, ...view.journey.arrivals].map((c) => c.name));
}

/** A toast for the purchases that open something new: a gate, a plane, a route (and any checkpoint it adds). */
function unlockText(upgrade: UpgradeId, level: number, view: AirportView, before: ReadonlySet<string>): string | null {
  switch (upgrade) {
    case 'gates':
      return `Gate ${level + 1} is open`;
    case 'plane':
      return `New plane: ${view.planeModel}`;
    case 'route': {
      const opened = [...checkpointNames(view)].filter((name) => !before.has(name));
      return opened.length === 0 ? `New route: ${view.route}` : `New route: ${view.route}. ${opened.join(' and ')} open.`;
    }
    default:
      return null;
  }
}

type SheetName = 'upgrades' | 'settings' | 'sell' | null;

/** The airport screen (docs/ROADMAP.md, phone UX): money on top, the passenger flow (the security line at its heart) and the gates in the middle, actions under the thumb. */
export function App(props: { host: AirportHost; install?: InstallPrompt; feedback?: Feedback }): ReactElement {
  const { host, install, feedback } = props;
  const store = useMemo(() => new AirportStore(), []);
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
            feedback?.cue(e.payload.charter ? 'charter' : e.payload.full ? 'full' : 'depart');
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
    (gate: number) => {
      feedback?.cue('tap');
      void host.tap(gate);
    },
    [host, feedback],
  );
  const tapSecurity = useCallback(() => {
    feedback?.cue('tap');
    void host.submit({ type: 'tapSecurity', payload: {} });
  }, [host, feedback]);
  const buy = useCallback((upgrade: UpgradeId) => void host.buy(upgrade), [host]);
  const boost = useCallback((id: BoostId) => void host.boost(id), [host]);
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
      <Concourse journey={view.journey} securityLevel={view.upgrades.find((u) => u.id === 'security')?.level ?? 0} tickMs={view.tickMs} store={store} onTapSecurity={tapSecurity}>
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
      </Concourse>
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
