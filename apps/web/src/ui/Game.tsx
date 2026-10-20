import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import type { FriendType, GameCommand, GameView, WaveResult } from '@snacks/contracts';
import type { Feedback, GameHost } from '../platform/index.ts';
import { aimSquares, healSquares } from './aim.ts';
import { Board } from './Board.tsx';
import { ClueCard } from './ClueCard.tsx';
import { PatternDiagram } from './Diagram.tsx';
import { DragController, type DragSource } from './drag.ts';
import { clearPlan, undoFor, type UndoStep } from './history.ts';
import { FRIEND_HOW, FRIEND_NAME, FRIEND_ORDER, SHIRTS, kidBadges, kidLetter, shortClue } from './labels.ts';
import { playWave } from './replay.ts';
import { ResultOverlay } from './ResultOverlay.tsx';
import { Sheet } from './Sheet.tsx';
import { short } from './format.ts';

const BEAT_MS = 220;

type Selection = { readonly kind: 'tray'; readonly type: FriendType } | { readonly kind: 'friend'; readonly id: number } | null;

/** A wave being played back: the board as it stood at Go, and what happened. */
interface Playback {
  readonly before: GameView;
  readonly wave: WaveResult;
}

/** Which game this is: a new one starts with a daily, a bonus round or a practice board. */
function gameKey(view: GameView): string {
  return `${view.mode}-${view.round}-${view.day}-${view.seed}`;
}

/** One setup phase: a wave's setup in one game, started afresh by Go and by a retry. */
function phaseKey(view: GameView): string {
  return `${gameKey(view)}-${view.wave}-${view.phase}`;
}

const onBoardIds = (view: GameView): ReadonlySet<number> => new Set(view.friends.filter((f) => f.cell >= 0).map((f) => f.id));

/**
 * The setup screen (build step 6, the controls pass): the board, the kids'
 * cards, the tray, the selected friend's controls and Go all on one phone
 * screen. Place by tap or drag, aim by tapping a lit square, undo, clear,
 * press Go, watch the wave, read what happened over the board. Everything
 * the player does is a command to the host; everything shown comes from the
 * View.
 */
export function Game(props: {
  host: GameHost;
  view: GameView;
  wave: WaveResult | null;
  healRange: number;
  feedback?: Feedback | undefined;
  onToast: (text: string) => void;
  onMenu: () => void;
}): ReactElement {
  const { host, view, feedback, onToast } = props;
  const [selection, setSelection] = useState<Selection>(null);
  const [moving, setMoving] = useState(false);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [result, setResult] = useState<Playback | null>(null);
  const [shop, setShop] = useState(false);
  const [clueKid, setClueKid] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [history, setHistory] = useState<readonly UndoStep[]>([]);
  // Friends already on the board when this setup began (earlier waves): Clear board leaves them.
  const [phase, setPhase] = useState(() => ({ key: phaseKey(view), earlier: onBoardIds(view) }));
  const overlayRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const beforeGo = useRef<GameView | null>(null);
  const lastFacing = useRef<Partial<Record<FriendType, number>>>({});

  // A new setup phase (after Go, a retry or a new game): nothing to undo, nothing selected.
  if (phase.key !== phaseKey(view)) {
    // A different game: the last wave's result belongs to the old one.
    if (!phase.key.startsWith(`${gameKey(view)}-`)) setResult(null);
    setPhase({ key: phaseKey(view), earlier: onBoardIds(view) });
    setHistory([]);
    setSelection(null);
    setMoving(false);
  }

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
  const selectedFriend = selection?.kind === 'friend' ? view.friends.find((f) => f.id === selection.id && f.cell >= 0) : undefined;
  const aims = useMemo(() => (setup && selectedFriend !== undefined && !moving ? aimSquares(view, selectedFriend) : new Map<number, number>()), [setup, selectedFriend, moving, view]);
  const heals = useMemo(
    () => (setup && selectedFriend?.type === 'nurse' && !moving ? healSquares(view.width, view.height, selectedFriend.cell, props.healRange) : new Set<number>()),
    [setup, selectedFriend, moving, view, props.healRange],
  );
  const owned = FRIEND_ORDER.map((type) => ({ type, left: view.friends.filter((f) => f.type === type && f.cell < 0).length, all: view.friends.filter((f) => f.type === type).length })).filter((t) => t.all > 0);
  const toClear = clearPlan(view.friends, phase.earlier);
  const clueOf = shown.kids.find((k) => k.id === clueKid);
  // Three or four kids at once: their cards share one row, in short form, so the board keeps its size.
  const crowded = shown.kids.length > 2;

  const submit = async (command: GameCommand): Promise<boolean> => {
    const error = await host.submit(command);
    if (error !== null) onToast(error);
    return error === null;
  };

  /** A setup change the player can undo: sent to the host, and its undo kept. */
  const change = async (command: GameCommand): Promise<boolean> => {
    const undo = undoFor(view.friends, command);
    const ok = await submit(command);
    if (ok && undo !== null) setHistory((h) => [...h, undo]);
    if (ok) feedback?.cue('tap');
    return ok;
  };

  const facingFor = (type: FriendType): number => lastFacing.current[type] ?? view.facings[type][0] ?? 0;

  const placeFromTray = async (type: FriendType, cell: number): Promise<void> => {
    const friend = view.friends.find((f) => f.type === type && f.cell < 0);
    if (friend === undefined) return;
    if (await change({ type: 'place', friend: friend.id, cell, facing: facingFor(type) })) setSelection({ kind: 'friend', id: friend.id });
  };

  const moveTo = async (id: number, cell: number): Promise<void> => {
    const friend = view.friends.find((f) => f.id === id);
    if (friend === undefined || friend.cell === cell) return;
    if (await change({ type: 'place', friend: id, cell, facing: friend.facing })) setSelection({ kind: 'friend', id });
  };

  const toTray = async (id: number): Promise<void> => {
    setSelection(null);
    setMoving(false);
    await change({ type: 'toTray', friend: id });
  };

  const aim = async (facing: number): Promise<void> => {
    if (selectedFriend === undefined) return;
    lastFacing.current[selectedFriend.type] = facing;
    if (facing === selectedFriend.facing) return;
    await change({ type: 'turn', friend: selectedFriend.id, facing });
  };

  /** The small turn button: the next facing clockwise, for facings no square on the board stands for (at the edge). */
  const turn = (): void => {
    if (selectedFriend === undefined) return;
    const facings = view.facings[selectedFriend.type];
    void aim(facings[(facings.indexOf(selectedFriend.facing) + 1) % facings.length] ?? facings[0]!);
  };

  // The drop handler changes every render; the controller, made once, always calls the latest.
  const dropRef = useRef<(source: DragSource, cell: number | null) => void>(() => {});
  const [drag] = useState(() => new DragController(() => (source, cell) => dropRef.current(source, cell)));
  useEffect(() => {
    dropRef.current = (source, cell) => {
      if (!setup) return;
      setMoving(false);
      if (source.kind === 'tray') {
        if (cell !== null) void placeFromTray(source.type, cell);
      } else if (cell === null) void toTray(source.id);
      else void moveTo(source.id, cell);
    };
  });
  useEffect(() => () => drag.stop(), [drag]);

  const onFriendDown = (event: ReactPointerEvent<HTMLElement>, id: number): void => {
    const token = event.currentTarget.querySelector<HTMLElement>('.friend');
    if (setup && token !== null) drag.begin(event, { kind: 'friend', id }, token);
  };

  const onTrayDown = (event: ReactPointerEvent<HTMLElement>, type: FriendType): void => {
    const diagram = event.currentTarget.querySelector<HTMLElement>('.tray-token');
    if (setup && diagram !== null && view.friends.some((f) => f.type === type && f.cell < 0)) drag.begin(event, { kind: 'tray', type }, diagram);
  };

  const onCell = async (cell: number): Promise<void> => {
    if (drag.justDragged() === true) return;
    const friendHere = view.friends.find((f) => f.cell === cell);
    const kid = view.kids.find((k) => k.cell === cell);
    if (!setup) {
      if (kid !== undefined && kid.clue !== null) setClueKid(kid.id);
      return;
    }
    const empty = view.squares[cell] === 'open' && friendHere === undefined;
    if (moving && selectedFriend !== undefined) {
      setMoving(false);
      if (empty) await moveTo(selectedFriend.id, cell);
      else if (friendHere !== undefined && friendHere.id !== selectedFriend.id) setSelection({ kind: 'friend', id: friendHere.id });
      return;
    }
    const facing = aims.get(cell);
    if (facing !== undefined) {
      await aim(facing);
      return;
    }
    if (friendHere !== undefined) {
      setSelection(selection?.kind === 'friend' && selection.id === friendHere.id ? null : { kind: 'friend', id: friendHere.id });
      feedback?.cue('tap');
      return;
    }
    if (kid !== undefined) {
      if (kid.clue !== null) setClueKid(kid.id);
      return;
    }
    if (selection?.kind === 'tray') await placeFromTray(selection.type, cell);
    else if (selectedFriend !== undefined && empty) await moveTo(selectedFriend.id, cell);
    else setSelection(null);
  };

  const undo = async (): Promise<void> => {
    const last = history[history.length - 1];
    if (last === undefined) return;
    setHistory((h) => h.slice(0, -1));
    setMoving(false);
    for (const command of last) if (!(await submit(command))) return;
    feedback?.cue('tap');
  };

  const clear = async (): Promise<void> => {
    setConfirmClear(false);
    setSelection(null);
    setMoving(false);
    const plan = clearPlan(view.friends, phase.earlier);
    for (const command of plan.commands) if (!(await submit(command))) return;
    if (plan.undo.length > 0) setHistory((h) => [...h, plan.undo]);
  };

  const go = async (): Promise<void> => {
    drag.stop();
    setSelection(null);
    setMoving(false);
    setResult(null);
    beforeGo.current = view;
    if (!(await submit({ type: 'go' }))) beforeGo.current = null;
  };

  // The result over the board: the wave just watched, or after a reload the last wave of a finished day.
  const report = playback !== null ? null : result !== null ? { wave: result.wave, label: (id: number) => result.before.kids.find((k) => k.id === id)?.label ?? kidLetter(id) } : view.phase !== 'setup' && view.lastWave !== null ? { wave: view.lastWave, label: kidLetter } : null;

  const hint = !setup
    ? playback !== null
      ? 'Watch the snacks fly…'
      : ' '
    : view.loopWarning
      ? '⚠️ A snack would go round in circles. Aim a friend so it can get out.'
      : selection?.kind === 'tray'
        ? `Tap a grey square for the ${FRIEND_NAME[selection.type]}, or drag it there.`
        : 'Tap or drag a friend from the tray onto a grey square.';

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

      {view.mode === 'main' && shown.kids.length > 0 && (
        <ul className={`cluebar${crowded ? ' crowded' : ''}`} aria-label="Kids’ cards" style={{ ['--n' as string]: shown.kids.length }}>
          {shown.kids.map((k) => (
            <li key={k.id}>
              <button type="button" className="clue-chip" aria-label={`Kid ${k.label}’s card: ${k.clue ?? ''}`} onClick={() => setClueKid(k.id)}>
                <span className="clue-kid" style={{ background: SHIRTS[k.look.shirt % SHIRTS.length] }}>
                  {k.label}
                </span>
                <span className="clue-chip-text">
                  {kidBadges(k)}
                  {kidBadges(k) !== '' && ' '}
                  {crowded ? shortClue(k.clue ?? '') : k.clue}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <main className="board-area">
        <Board
          view={shown}
          selected={setup && selectedFriend !== undefined ? selectedFriend.id : null}
          aims={aims}
          heals={heals}
          preview={setup}
          onCell={(cell) => void onCell(cell)}
          onFriendDown={onFriendDown}
          overlayRef={overlayRef}
          boardRef={boardRef}
        />
        {report !== null && (
          <ResultOverlay wave={report.wave} label={report.label} hungry={view.hungry} hungryAllowed={view.hungryAllowed} main={view.mode === 'main'}>
            {view.phase === 'setup' && (
              <button type="button" className="btn btn-primary btn-wide" onClick={() => setResult(null)}>
                Set up wave {view.wave}
              </button>
            )}
            {view.phase === 'won' && (
              <div className="day-end" aria-label="Day won">
                <p>
                  <strong>🎉 Everyone got a snack today!</strong> {view.fed} kids fed{view.mode === 'main' ? `, ${view.hungry} went home hungry` : ''}.
                </p>
                {view.round === 'daily' && view.mode === 'main' && (
                  <button type="button" className="btn btn-primary btn-wide" onClick={() => void host.bonus()}>
                    Play today’s bonus round
                  </button>
                )}
                <button type="button" className="btn btn-wide" onClick={() => void host.practice()}>
                  New practice board
                </button>
              </div>
            )}
            {view.phase === 'lost' && (
              <div className="day-end" aria-label="Day lost">
                <p>
                  <strong>Too many kids went home hungry.</strong> The board goes back to how it was before you pressed Go.
                </p>
                <button type="button" className="btn btn-primary btn-wide" onClick={() => {
                    setResult(null);
                    void submit({ type: 'retry' });
                  }}>
                  Try wave {view.wave} again
                </button>
              </div>
            )}
          </ResultOverlay>
        )}
      </main>

      <footer className="dock">
        <div className="dock-row friend-row" aria-label="Selected friend">
          {setup && selectedFriend !== undefined ? (
            <>
              <span className={`dock-what t-${selectedFriend.type}`}>
                <PatternDiagram type={selectedFriend.type} />
                <span className="dock-what-text">
                  <strong>{FRIEND_NAME[selectedFriend.type]}</strong>
                  <span className="muted">{moving ? 'tap a grey square' : selectedFriend.type === 'nurse' ? 'heals pink squares' : 'tap green to aim'}</span>
                </span>
              </span>
              {selectedFriend.type !== 'nurse' && !moving && (
                <button type="button" className="btn btn-turn" aria-label="Turn right" title="Turn (or tap a green square)" onClick={turn}>
                  ↻
                </button>
              )}
              <button type="button" className={`btn btn-small${moving ? ' on' : ''}`} aria-pressed={moving} onClick={() => setMoving(!moving)}>
                Move
              </button>
              <button type="button" className="btn btn-small" onClick={() => void toTray(selectedFriend.id)}>
                To tray
              </button>
              <button type="button" className="btn btn-quiet btn-turn" aria-label="Done" onClick={() => setSelection(null)}>
                ✓
              </button>
            </>
          ) : (
            <p className={`dock-hint${view.loopWarning && setup ? ' warn' : ' muted'}`}>{hint}</p>
          )}
        </div>

        <div className="dock-row tray" role="group" aria-label="Tray">
          {owned.length === 0 && <span className="muted small">No friends yet</span>}
          {owned.map(({ type, left }) => (
            <button
              key={type}
              type="button"
              className={`btn tray-btn${selection?.kind === 'tray' && selection.type === type ? ' on' : ''}`}
              disabled={!setup || left === 0}
              aria-label={`${FRIEND_NAME[type]}, ${left} left`}
              title={`${FRIEND_NAME[type]}: ${FRIEND_HOW[type]}`}
              onPointerDown={(event) => onTrayDown(event, type)}
              onClick={() => {
                if (drag.justDragged() === true) return;
                setMoving(false);
                setSelection(selection?.kind === 'tray' && selection.type === type ? null : { kind: 'tray', type });
              }}
            >
              <span className={`tray-token t-${type}`}>
                <PatternDiagram type={type} />
              </span>
              <span className="tray-name">{FRIEND_NAME[type]}</span>
              <span className="tray-count">×{left}</span>
            </button>
          ))}
          {view.shop.length > 0 && (
            <button type="button" className="btn tray-btn tray-shop" disabled={!setup} onClick={() => setShop(true)}>
              <span className="tray-token" aria-hidden="true">
                🛒
              </span>
              <span className="tray-name">Shop</span>
              <span className="tray-count">⭐{short(view.points)}</span>
            </button>
          )}
        </div>

        <div className="dock-row actions">
          <button type="button" className="btn btn-small" disabled={!setup || history.length === 0} onClick={() => void undo()}>
            ↶ Undo
          </button>
          <button type="button" className="btn btn-small" disabled={!setup || toClear.commands.length === 0} onClick={() => setConfirmClear(true)}>
            Clear board
          </button>
          <button type="button" className={`btn btn-primary btn-go${view.loopWarning && setup ? ' warn' : ''}`} disabled={!setup} onClick={() => void go()}>
            Go! Wave {Math.min(view.wave, view.waves)}
          </button>
        </div>
      </footer>

      {clueOf !== undefined && clueOf.clue !== null && <ClueCard view={shown} kid={clueOf} onClose={() => setClueKid(null)} />}

      {confirmClear && (
        <Sheet title="Clear the board?" onClose={() => setConfirmClear(false)}>
          <p className="sheet-note">
            {toClear.commands.length === 1 ? 'The friend' : `The ${toClear.commands.length} friends`} you put out for this wave go back to the tray.
            {phase.earlier.size > 0 ? ' Friends from earlier waves stay where they are.' : ''} You can undo this.
          </p>
          <div className="sheet-actions">
            <button type="button" className="btn btn-primary btn-wide" onClick={() => void clear()}>
              Yes, clear the board
            </button>
            <button type="button" className="btn btn-wide" onClick={() => setConfirmClear(false)}>
              Keep them
            </button>
          </div>
        </Sheet>
      )}

      {shop && (
        <Sheet title={`Shop · ⭐ ${view.points}`} onClose={() => setShop(false)}>
          <p className="sheet-note">Points come from fed kids. What you buy is yours for today only.</p>
          <ul className="shop">
            {view.shop.map((item) => (
              <li key={item.type}>
                <PatternDiagram type={item.type} className="shop-diagram" />
                <span className="shop-what">
                  <strong>{FRIEND_NAME[item.type]}</strong>
                  <span className="muted small">{FRIEND_HOW[item.type]}</span>
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={!item.canBuy}
                  aria-label={`Buy a ${FRIEND_NAME[item.type]} for ${item.price} points`}
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
