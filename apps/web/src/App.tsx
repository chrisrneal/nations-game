import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { Command, Event, Pace, StandingPolicy, TradeOffer } from '@nations/contracts';
import type { GameHost, GameUpdate } from './platform/index.ts';
import { nameOf } from './world/nations.ts';
import type { CardAction } from './ui/cards.ts';
import { amountText, commands, type TradeDraft } from './ui/econ.ts';
import { Inbox } from './ui/Inbox.tsx';
import { PaceBar } from './ui/PaceBar.tsx';
import { Policies } from './ui/Policies.tsx';
import { OutputLine, ResourceStrip } from './ui/ResourceStrip.tsx';
import { Saves } from './ui/Saves.tsx';
import { StartScreen } from './ui/StartScreen.tsx';
import { TradeSheet } from './ui/TradeSheet.tsx';
import { WorldMap } from './ui/WorldMap.tsx';
import { WhyProvider } from './ui/why.tsx';

type Tab = 'inbox' | 'world' | 'game';
const TABS: readonly { tab: Tab; label: string; icon: string }[] = [
  { tab: 'inbox', label: 'Decisions', icon: '📥' },
  { tab: 'world', label: 'World', icon: '🌍' },
  { tab: 'game', label: 'Game', icon: '⚙️' },
];

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One line for a trade event the player should hear about, or null. */
function tradeNews(event: Event, selfId: string): string | null {
  const p = event.payload as { offer?: TradeOffer; reneger?: string; by?: string; reason?: string };
  const offer = p.offer;
  if (event.type === 'commandRejected') return `Not sent: ${p.reason ?? 'rejected'}`;
  if (offer === undefined) return null;
  const other = nameOf(offer.from === selfId ? offer.to : offer.from);
  const mine = offer.from === selfId;
  switch (event.type) {
    case 'offerSettled':
      return mine
        ? `${other} accepted: ${amountText(offer.give)} for ${amountText(offer.get)}`
        : `Trade done with ${other}: you got ${amountText(offer.give)}${p.by === 'policy' ? ' (your policy answered)' : ''}`;
    case 'offerRejected':
      return mine ? `${other} declined your offer` : null;
    case 'offerExpired':
      return mine ? `${other} let your offer expire` : `${other}'s offer expired unanswered`;
    case 'offerFailed':
      return p.reneger === selfId ? `Deal with ${other} failed: you could not pay` : `Deal with ${other} failed: they could not deliver`;
    case 'offerCountered':
      return mine ? null : `${other} sent a counter-offer`;
    default:
      return null;
  }
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
  const [trade, setTrade] = useState<{ draft: TradeDraft; counterOf: number | null } | null>(null);
  const latest = useRef<GameUpdate | null>(null);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(
    () =>
      host.subscribe((next) => {
        latest.current = next;
        setUpdate(next);
        const news = next.events.map((e) => tradeNews(e, next.view.selfId)).filter((line): line is string => line !== null);
        if (news.length > 0) setToast(news.length === 1 ? (news[0] as string) : `${news[0] as string} (+${news.length - 1} more)`);
      }),
    [host],
  );

  const run = useCallback((work: Promise<void>, after?: () => void) => {
    work.then(after, (error: unknown) => setToast(message(error)));
  }, []);

  /** Sends a command stamped with the current month; if the clock moved mid-tap, stamps the new month once. */
  const send = useCallback(
    async (build: (tick: number) => Command): Promise<void> => {
      const tick = latest.current?.view.tick ?? 0;
      try {
        await host.submit(build(tick));
      } catch (error) {
        const now = latest.current?.view.tick ?? tick;
        if (now === tick) throw error;
        await host.submit(build(now));
      }
    },
    [host],
  );

  const act = useCallback(
    async (action: CardAction): Promise<void> => {
      if (action.kind === 'compose') {
        setTrade({ draft: action.draft, counterOf: action.counterOf });
        return;
      }
      if (action.kind !== 'send') return;
      try {
        await send(action.command);
        setToast(`${action.done}. It happens at the end of this month.`);
      } catch (error) {
        setToast(message(error));
      }
    },
    [send],
  );

  const sendTrade = useCallback(
    async (draft: TradeDraft): Promise<void> => {
      const view = latest.current?.view;
      if (view === undefined || trade === null) return;
      try {
        await send(trade.counterOf === null ? commands.offer(view, draft) : commands.counter(view, trade.counterOf, draft));
        setToast(`${trade.counterOf === null ? 'Offer' : 'Counter-offer'} sent to ${nameOf(draft.to)}`);
        setTrade(null);
      } catch (error) {
        setToast(message(error));
      }
    },
    [send, trade],
  );

  const setPolicy = useCallback(
    (policy: Partial<StandingPolicy>) => {
      const view = latest.current?.view;
      if (view === undefined) return;
      run(send(commands.policy(view, policy)), () => setToast('Policy changes at the end of this month.'));
    },
    [run, send],
  );

  const setPace = useCallback((pace: Pace) => run(host.setPace(pace)), [host, run]);
  const newGame = useCallback(() => run(host.setPace('paused'), () => setStarting(true)), [host, run]);

  if (starting || update === null) {
    return (
      <WhyProvider>
        <StartScreen
          host={host}
          onToast={setToast}
          onStart={(id) => run(host.newGame(id), () => setStarting(false))}
          onLoad={(slot) => run(host.loadFrom(slot), () => setStarting(false))}
          onImported={() => setStarting(false)}
        />
        {toast !== null && <div className="toast" role="status">{toast}</div>}
      </WhyProvider>
    );
  }

  const { view, pace, standing } = update;
  return (
    <WhyProvider>
      <div className="app">
        <header className="top">
          <div className="nation">
            <span>{nameOf(view.selfId)}</span>
            <OutputLine view={view} />
          </div>
          <ResourceStrip view={view} />
        </header>
        <main className="content">
          {tab === 'inbox' && <Inbox update={update} onAction={act} onNewGame={newGame} />}
          {tab === 'world' && <WorldMap view={view} onTrade={(draft) => setTrade({ draft, counterOf: null })} />}
          {tab === 'game' && (
            <>
              <Policies view={view} onChange={setPolicy} />
              <Saves
                host={host}
                inGame
                fingerprint={standing.fingerprint}
                onToast={setToast}
                onLoad={(slot) => run(host.loadFrom(slot), () => setToast('Loaded. Paused - press 1× to continue.'))}
                onImported={() => setTab('inbox')}
                onNewGame={newGame}
              />
            </>
          )}
        </main>
        <footer className="bottom">
          <PaceBar
            tick={view.tick}
            gameLength={standing.gameLength}
            over={standing.over}
            pace={pace}
            onPace={setPace}
            onNextMonth={() => run(host.nextMonth())}
          />
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
        {trade !== null && (
          <TradeSheet view={view} draft={trade.draft} counterOf={trade.counterOf} onSend={sendTrade} onClose={() => setTrade(null)} />
        )}
        {toast !== null && <div className="toast" role="status">{toast}</div>}
      </div>
    </WhyProvider>
  );
}
