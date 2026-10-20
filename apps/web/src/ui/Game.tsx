import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { FriendType, GameView, WaveResult } from '@snacks/contracts';
import type { Feedback, GameHost } from '../platform/index.ts';
import { Board } from './Board.tsx';
import { FRIEND_GLYPH, FRIEND_HOW, FRIEND_NAME, FRIEND_ORDER, SHIRTS, SNACK_EMOJI, kidBadges, kidLine, snackEndWords, waveSummary } from './labels.ts';
import { playWave } from './replay.ts';
import { Sheet } from './Sheet.tsx';
import { short } from './format.ts';

const BEAT_MS = 220;

type Selection = { readonly kind: 'tray'; readonly type: FriendType } | { readonly kind: 'friend'; readonly id: number } | null;

/** A wave being played back: the board as it stood at Go, and what happened. */
interface Playback {
  readonly before: GameView;
  readonly wave: WaveResult;
}

/**
 * The grey-squares screen (build step 6): set up friends between waves, press
 * Go, watch the wave, read what happened. Everything the player does is a
 * command to the host; everything shown comes from the View.
 */
export function Game(props: { host: GameHost; view: GameView; wave: WaveResult | null; feedback?: Feedback | undefined; onToast: (text: string) => void; onMenu: () => void }): ReactElement {
  const { host, view, feedback, onToast } = props;
  const [selection, setSelection] = useState<Selection>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [result, setResult] = useState<Playback | null>(null);
  const [shop, setShop] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const beforeGo = useRef<GameView | null>(null);
  const lastFacing = useRef<Partial<Record<FriendType, number>>>({});

  // A new wave result: play it over the board as it stood when Go was pressed.
  useEffect(() => {
    if (props.wave === null || beforeGo.current === null) return;
    setPlayback({ before: beforeGo.current, wave: props.wave });
    beforeGo.current = null;
  }, [props.wave]);

  useEffect(() => {
    if (playback === null || overlayRef.current === null || boardRef.current === null) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const r = playWave(overlayRef.current, boardRef.current, playback.before, playback.wave, reduce ? 40 : BEAT_MS);
    let live = true;
    void r.done.then(() => {
      if (!live) return;
      setPlayback(null);
      setResult(playback);
      if (playback.wave.kids.some((k) => k.end === 'happy')) feedback?.cue('fed');
      if (playback.wave.kids.some((k) => k.ache)) feedback?.cue('ache');
    });
    return () => {
      live = false;
      r.cancel();
    };
  }, [playback, feedback]);

  useEffect(() => {
    if (view.phase === 'won') feedback?.cue('win');
    if (view.phase === 'lost') feedback?.cue('lose');
  }, [view.phase, feedback]);

  const shown = playback?.before ?? view;
  const setup = view.phase === 'setup' && playback === null;
  const trayCounts = FRIEND_ORDER.map((type) => ({ type, count: view.friends.filter((f) => f.type === type && f.cell < 0).length })).filter((t) => t.count > 0);
  const selectedFriend = selection?.kind === 'friend' ? view.friends.find((f) => f.id === selection.id) : undefined;

  const submit = async (command: Parameters<GameHost['submit']>[0]): Promise<boolean> => {
    const error = await host.submit(command);
    if (error !== null) onToast(error);
    return error === null;
  };

  const onCell = async (cell: number): Promise<void> => {
    if (!setup) return;
    const friendHere = view.friends.find((f) => f.cell === cell);
    if (friendHere !== undefined) {
      setSelection(selection?.kind === 'friend' && selection.id === friendHere.id ? null : { kind: 'friend', id: friendHere.id });
      feedback?.cue('tap');
      return;
    }
    const kid = view.kids.find((k) => k.cell === cell);
    if (kid !== undefined) {
      if (kid.clue !== null) onToast(`${kid.label}: “${kid.clue}”`);
      return;
    }
    if (selection === null) return;
    const friend = selection.kind === 'friend' ? selectedFriend : view.friends.find((f) => f.type === selection.type && f.cell < 0);
    if (friend === undefined) return;
    const facing = selection.kind === 'friend' ? friend.facing : (lastFacing.current[friend.type] ?? view.facings[friend.type][0] ?? 0);
    if (await submit({ type: 'place', friend: friend.id, cell, facing })) {
      feedback?.cue('tap');
      setSelection({ kind: 'friend', id: friend.id });
    }
  };

  const turn = async (by: 1 | -1): Promise<void> => {
    if (selectedFriend === undefined) return;
    const facings = view.facings[selectedFriend.type];
    const at = facings.indexOf(selectedFriend.facing);
    const facing = facings[(at + by + facings.length) % facings.length] ?? facings[0]!;
    lastFacing.current[selectedFriend.type] = facing;
    if (await submit({ type: 'turn', friend: selectedFriend.id, facing })) feedback?.cue('tap');
  };

  const go = async (): Promise<void> => {
    setSelection(null);
    setResult(null);
    beforeGo.current = view;
    if (!(await submit({ type: 'go' }))) beforeGo.current = null;
  };

  return (
    <div className="game">
      <header className="bar">
        <div className="bar-title">
          <strong>Snack Attack</strong>
          <span className="muted">{view.round === 'daily' ? 'Today' : view.round === 'bonus' ? 'Bonus round' : 'Practice'}</span>
        </div>
        <div className="bar-stats" aria-live="polite">
          <span title="Wave">
            🌊 {Math.min(view.wave, view.waves)}/{view.waves}
          </span>
          {view.mode === 'main' && <span title="Kids who went home hungry">😢 {view.hungry}/{view.hungryAllowed}</span>}
          {view.mode === 'main' && <span title="Points">⭐ {short(view.points)}</span>}
        </div>
        <button type="button" className="icon-btn" aria-label="Menu" onClick={props.onMenu}>
          ☰
        </button>
      </header>

      <main className="scroll">
        <Board view={shown} selected={selection?.kind === 'friend' ? selection.id : null} onCell={(cell) => void onCell(cell)} overlayRef={overlayRef} boardRef={boardRef} />

        {view.loopWarning && setup && <p className="warn">A snack would go round in circles. Turn a friend so it can get out.</p>}

        {result !== null && playback === null && (
          <section className="panel result" aria-label="What happened">
            <h2>{waveSummary(result.wave)}</h2>
            <ul className="lines">
              {result.wave.kids.map((k) => (
                <li key={k.kid}>{kidLine(k, result.before.kids.find((kid) => kid.id === k.kid)?.label ?? '?')}</li>
              ))}
            </ul>
            <details>
              <summary>Where every snack went</summary>
              <ul className="lines">
                {result.wave.snacks.map((s, i) => (
                  <li key={i}>
                    {SNACK_EMOJI[s.snack]} {snackEndWords(s.end)}
                  </li>
                ))}
              </ul>
            </details>
            {view.phase === 'setup' && (
              <button type="button" className="btn btn-wide" onClick={() => setResult(null)}>
                Set up wave {view.wave}
              </button>
            )}
          </section>
        )}

        {view.phase === 'won' && playback === null && (
          <section className="panel done" aria-label="Day won">
            <h2>🎉 Everyone got a snack today!</h2>
            <p>
              {view.fed} kids fed{view.mode === 'main' ? `, ${view.hungry} went home hungry` : ''}.
            </p>
            {view.round === 'daily' && view.mode === 'main' && (
              <button type="button" className="btn btn-primary btn-wide" onClick={() => void host.bonus()}>
                Play today’s bonus round
              </button>
            )}
            <button type="button" className="btn btn-wide" onClick={() => void host.practice()}>
              New practice board
            </button>
          </section>
        )}

        {view.phase === 'lost' && playback === null && (
          <section className="panel done" aria-label="Day lost">
            <h2>Too many kids went home hungry</h2>
            <p>Try wave {view.wave} again: the board goes back to how it was before you pressed Go.</p>
            <button type="button" className="btn btn-primary btn-wide" onClick={() => void submit({ type: 'retry' })}>
              Try wave {view.wave} again
            </button>
          </section>
        )}

        {view.mode === 'main' && view.kids.length > 0 && (
          <section className="panel" aria-label="What the kids say">
            <h2>Hungry kids</h2>
            <ul className="clues">
              {shown.kids.map((k) => (
                <li key={k.id}>
                  <span className="clue-kid" style={{ background: SHIRTS[k.look.shirt % SHIRTS.length] }}>
                    {k.label}
                  </span>
                  <span className="clue-badges">{kidBadges(k)}</span>
                  <span className="clue-text">{k.clue}</span>
                  {k.healed && <span className="muted"> (healed once)</span>}
                </li>
              ))}
            </ul>
            {shown.kids.some((k) => k.look.sister > 0) && <p className="muted small">Sisters wear the same colour.</p>}
          </section>
        )}

        {view.mode === 'main' && (
          <section className="panel" aria-label="Today’s snacks">
            <h2>Today’s snacks</h2>
            <ul className="snacks">
              {view.snacks.map((s) => (
                <li key={s.id}>
                  <span className="snack-emoji">{SNACK_EMOJI[s.id]}</span>
                  <strong>{s.name}</strong>
                  <span className="muted">
                    {s.colour} · {s.feel} · {s.taste} · {s.shape}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="dock">
        {setup && selectedFriend !== undefined ? (
          <div className="dock-row">
            <span className="dock-what">
              {FRIEND_GLYPH[selectedFriend.type]} {FRIEND_NAME[selectedFriend.type]}
            </span>
            {selectedFriend.type !== 'nurse' && (
              <>
                <button type="button" className="btn" aria-label="Turn left" onClick={() => void turn(-1)}>
                  ↺
                </button>
                <button type="button" className="btn" aria-label="Turn right" onClick={() => void turn(1)}>
                  ↻
                </button>
              </>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => {
                void submit({ type: 'toTray', friend: selectedFriend.id });
                setSelection(null);
              }}
            >
              To tray
            </button>
            <button type="button" className="btn btn-quiet" aria-label="Done" onClick={() => setSelection(null)}>
              ✓
            </button>
          </div>
        ) : (
          <div className="dock-row tray" role="group" aria-label="Tray">
            {trayCounts.length === 0 && <span className="muted">Tray empty</span>}
            {trayCounts.map(({ type, count }) => (
              <button
                key={type}
                type="button"
                className={`btn tray-btn${selection?.kind === 'tray' && selection.type === type ? ' on' : ''}`}
                disabled={!setup}
                aria-label={`${FRIEND_NAME[type]}, ${count} in the tray`}
                onClick={() => setSelection(selection?.kind === 'tray' && selection.type === type ? null : { kind: 'tray', type })}
              >
                <span className="tray-glyph">{FRIEND_GLYPH[type]}</span>
                <span className="tray-count">×{count}</span>
              </button>
            ))}
            {view.shop.length > 0 && (
              <button type="button" className="btn tray-btn" disabled={!setup} onClick={() => setShop(true)}>
                Shop
              </button>
            )}
          </div>
        )}
        <p className={`dock-hint${result !== null && playback === null ? ' dock-summary' : ' muted'}`}>
          {result !== null && playback === null && setup
            ? `${waveSummary(result.wave)}. Details below the board.`
            : !setup
            ? playback !== null
              ? 'Watch the snacks fly…'
              : ' '
            : selection?.kind === 'tray'
              ? `Tap a grey square for the ${FRIEND_NAME[selection.type]}: it ${FRIEND_HOW[selection.type]}.`
              : selectedFriend !== undefined
                ? `It ${FRIEND_HOW[selectedFriend.type]}. Tap a grey square to move it.`
                : 'Pick a friend from the tray, then tap a grey square. Tap a kid to read their card.'}
        </p>
        <button type="button" className="btn btn-primary btn-go" disabled={!setup} onClick={() => void go()}>
          Go! Wave {Math.min(view.wave, view.waves)}
        </button>
      </footer>

      {shop && (
        <Sheet title={`Shop · ⭐ ${view.points}`} onClose={() => setShop(false)}>
          <p className="sheet-note">Points come from fed kids. What you buy is yours for today only.</p>
          <ul className="shop">
            {view.shop.map((item) => (
              <li key={item.type}>
                <span className="tray-glyph">{FRIEND_GLYPH[item.type]}</span>
                <span className="shop-what">
                  <strong>{FRIEND_NAME[item.type]}</strong>
                  <span className="muted small">{FRIEND_HOW[item.type]}</span>
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={!item.canBuy}
                  onClick={() =>
                    void submit({ type: 'buy', friend: item.type }).then((ok) => {
                      if (ok) feedback?.cue('buy');
                    })
                  }
                >
                  ⭐ {item.price}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  );
}
