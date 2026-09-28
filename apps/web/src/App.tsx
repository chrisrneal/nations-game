import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { Command, Pace } from '@nations/contracts';
import type { GameHost, GameUpdate } from './platform/index.ts';
import { nameOf, tickDate } from './world/nations.ts';
import type { CardOption, DecisionCard } from './ui/cards.ts';
import { Inbox } from './ui/Inbox.tsx';
import { PaceBar } from './ui/PaceBar.tsx';
import { ResourceStrip } from './ui/ResourceStrip.tsx';
import { Saves } from './ui/Saves.tsx';
import { StartScreen } from './ui/StartScreen.tsx';
import { WorldMap } from './ui/WorldMap.tsx';
import { WhyProvider } from './ui/why.tsx';

type Tab = 'inbox' | 'world' | 'game';
const TABS: readonly { tab: Tab; label: string; icon: string }[] = [
  { tab: 'inbox', label: 'Decisions', icon: '📥' },
  { tab: 'world', label: 'World', icon: '🌍' },
  { tab: 'game', label: 'Saves', icon: '💾' },
];

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The whole interface. It holds no game state of its own: it renders the
 * latest View pushed by the Host and turns taps into Commands (seams 2, 3, 6).
 */
export function App(props: { host: GameHost }): ReactElement {
  const { host } = props;
  const [update, setUpdate] = useState<GameUpdate | null>(null);
  const [starting, setStarting] = useState(true);
  const [tab, setTab] = useState<Tab>('inbox');
  const [toast, setToast] = useState<string | null>(null);
  const latest = useRef<GameUpdate | null>(null);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(
    () =>
      host.subscribe((next) => {
        latest.current = next;
        setUpdate(next);
        for (const event of next.events) {
          const payload = event.payload as { from?: string; to?: string; reason?: string };
          if (event.type === 'pinged' && payload.from === next.view.selfId && payload.to !== undefined) {
            setToast(`${nameOf(payload.to)} received your answer · ${tickDate(event.tick)}`);
          } else if (event.type === 'commandRejected') {
            setToast(`Not sent: ${payload.reason ?? 'rejected'}`);
          }
        }
      }),
    [host],
  );

  const run = useCallback(
    (work: Promise<void>, after?: () => void) => {
      work.then(after, (error: unknown) => setToast(message(error)));
    },
    [],
  );

  const choose = useCallback(
    async (card: DecisionCard, option: CardOption): Promise<void> => {
      const current = latest.current;
      if (current === null) return;
      if (option.target === null) {
        setToast(option.consequence);
        return;
      }
      const command = (tick: number): Command => ({
        nationId: current.view.selfId,
        tick,
        type: 'ping',
        payload: { target: option.target, card: card.id, option: option.id },
      });
      try {
        await host.submit(command(current.view.tick));
      } catch {
        // The clock may have moved between render and tap; stamp the new tick once.
        await host.submit(command(latest.current?.view.tick ?? current.view.tick));
      }
      setToast(`Sent to ${nameOf(option.target)}: ${option.label.toLowerCase()}`);
    },
    [host],
  );

  const setPace = useCallback((pace: Pace) => run(host.setPace(pace)), [host, run]);

  if (starting || update === null) {
    return (
      <WhyProvider>
        <StartScreen
          host={host}
          onToast={setToast}
          onStart={(id) => run(host.newGame(id), () => setStarting(false))}
          onLoad={(slot) => run(host.loadFrom(slot), () => setStarting(false))}
        />
        {toast !== null && <div className="toast" role="status">{toast}</div>}
      </WhyProvider>
    );
  }

  const { view, pace } = update;
  return (
    <WhyProvider>
      <div className="app">
        <header className="top">
          <div className="nation">{nameOf(view.selfId)}</div>
          <ResourceStrip selfId={view.selfId} />
        </header>
        <main className="content">
          {tab === 'inbox' && <Inbox selfId={view.selfId} tick={view.tick} onChoose={choose} />}
          {tab === 'world' && <WorldMap view={view} />}
          {tab === 'game' && (
            <Saves
              host={host}
              inGame
              onToast={setToast}
              onLoad={(slot) => run(host.loadFrom(slot), () => setToast('Loaded. Paused - press 1× to continue.'))}
              onNewGame={() => run(host.setPace('paused'), () => setStarting(true))}
            />
          )}
        </main>
        <footer className="bottom">
          <PaceBar tick={view.tick} pace={pace} onPace={setPace} />
          <nav className="tabs" aria-label="Screens">
            {TABS.map((t) => (
              <button
                key={t.tab}
                type="button"
                className={tab === t.tab ? 'tab on' : 'tab'}
                aria-current={tab === t.tab ? 'page' : undefined}
                onClick={() => setTab(t.tab)}
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </footer>
        {toast !== null && <div className="toast" role="status">{toast}</div>}
      </div>
    </WhyProvider>
  );
}
