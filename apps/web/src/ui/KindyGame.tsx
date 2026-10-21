import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import type { FriendView, GameCommand, GameView, ProfileView, SnackId, WaveResult } from '@snacks/contracts';
import type { Feedback, GameHost, Speech } from '../platform/index.ts';
import { lineEnds } from './aim.ts';
import { Avatar } from './Avatar.tsx';
import { FriendArt } from './art/Friend.tsx';
import { Board } from './Board.tsx';
import { DragController, type DragSource } from './drag.ts';
import { HINT_LINES, fedSlots, hintPath, type Spot } from './kindy.ts';
import { KindyDone } from './KindyDone.tsx';
import { Icon, type IconName } from './art/Icons.tsx';
import { KidHead } from './art/Kid.tsx';
import { SnackArt } from './art/Snack.tsx';
import { playWave } from './replay.ts';

const BEAT_MS = 220;
/** With reduced motion: a little quicker, and no arcs, spins or dances (K10). */
const CALM_BEAT_MS = 160;
/** How long a refused tap wiggles the square. */
const NOPE_MS = 450;

/** A wave being played back: the board as it stood at Go, and what happened. */
interface Playback {
  readonly before: GameView;
  readonly wave: WaveResult;
  /** This wave fed the day's last kid: the party follows. */
  readonly ends: boolean;
}

/** Which game this is: a new one is a new day or a new practice board. */
const gameKey = (view: GameView): string => `${view.round}-${view.day}-${view.seed}`;

/**
 * Kindy mode on screen (RULES 11, K8), for a child who doesn't read: no text
 * anywhere, every picture drawn as SVG with no text in it (art/), every target at least 64 px.
 *
 * - **Set up:** tap a friend in the tray, then the square it goes on (or
 *   drag it there); it lights one big arrow square for each way it can
 *   throw, and a tap there aims it. A friend on the board moves the same way,
 *   or goes back to the basket. Then the big green play button.
 * - **Watch:** the snacks fly; a fed kid dances, a wrong snack bounces off and
 *   the kid shakes their head and waits for the next wave, with the board as
 *   it was (D15). Nothing to read, nothing to close.
 * - **Hints:** after `hintIdle` seconds without a tap, or a tap on the
 *   question mark, a hand points at the next step from the puzzle's stored
 *   solution (the View's `hint`), and the phone's voice says it once speech
 *   was unlocked by a tap (D16).
 * - **The end:** a party with every kid dancing, then the sleeping sun of
 *   done for today (KindyDone).
 *
 * Everything the child does is a command to the host; nothing here keeps
 * game state. The replay, the hand and the wiggles are direct DOM writes and
 * CSS animations (P7).
 */
export function KindyGame(props: {
  host: GameHost;
  view: GameView;
  profile: ProfileView;
  wave: WaveResult | null;
  /** Seconds without a tap before a hint shows itself. */
  hintIdle: number;
  feedback?: Feedback | undefined;
  speech?: Speech | undefined;
  /** The picture in the top bar: back to the picker. */
  onProfiles: () => void;
}): ReactElement {
  const { host, view, profile, feedback, speech } = props;
  const [selected, setSelected] = useState<number | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [party, setParty] = useState(false);
  const [hintOn, setHintOn] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLSpanElement>(null);
  const beforeGo = useRef<GameView | null>(null);
  // This screen watched the day being won, so the done screen's star is new (and sounds like it).
  const watched = useRef(false);
  const lastFacing = useRef<number | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlocked = useRef(false);

  // A new wave, a new game or the day's end: nothing selected; a new game has no party yet.
  const [phase, setPhase] = useState(`${gameKey(view)}-${view.wave}-${view.phase}`);
  const phaseNow = `${gameKey(view)}-${view.wave}-${view.phase}`;
  if (phase !== phaseNow) {
    if (!phase.startsWith(`${gameKey(view)}-`)) setParty(false);
    setPhase(phaseNow);
    setSelected(null);
  }
  // A new step to hint at: the old hand goes, and the idle clock starts again.
  const hintKey = JSON.stringify(view.hint);
  const [shownFor, setShownFor] = useState(hintKey);
  if (shownFor !== hintKey) {
    setShownFor(hintKey);
    setHintOn(false);
  }

  const setup = view.phase === 'setup' && playback === null;
  const shown = playback?.before ?? view;
  const chosen = view.friends.find((f) => f.id === selected);
  const aims = useMemo(() => (setup && chosen !== undefined && chosen.cell >= 0 ? lineEnds(view, chosen) : new Map<number, number>()), [setup, chosen, view]);

  // A new wave result: play it over the board as it stood when Go was pressed.
  useEffect(() => {
    if (props.wave === null || beforeGo.current === null) return;
    setPlayback({ before: beforeGo.current, wave: props.wave, ends: view.phase === 'won' });
    beforeGo.current = null;
    // The View that came with this wave result says whether it ended the day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.wave]);

  useEffect(() => {
    if (playback === null || overlayRef.current === null || boardRef.current === null) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    const r = playWave(overlayRef.current, boardRef.current, playback.before, playback.wave, {
      beatMs: reduce ? CALM_BEAT_MS : BEAT_MS,
      calm: reduce,
      healRange: 1,
      onCue: (cue) => {
        feedback?.cue(cue);
        if (cue === 'catch') feedback?.haptic('catch');
      },
    });
    let live = true;
    void r.done.then(() => {
      if (!live) return;
      setPlayback(null);
      feedback?.haptic('waveEnd');
      if (playback.ends) {
        setParty(true);
        watched.current = true;
        feedback?.cue('dayWin');
      } else if (playback.wave.kids.some((k) => k.end === 'happy')) feedback?.cue('waveWin');
    });
    return () => {
      live = false;
      r.cancel();
    };
  }, [playback, feedback]);

  // The idle clock: restarted by every touch, without a render (P7).
  const armIdle = (): void => {
    if (idle.current !== null) clearTimeout(idle.current);
    idle.current = setTimeout(() => setHintOn(true), props.hintIdle * 1000);
  };
  useEffect(() => {
    if (!setup || view.hint === null || hintOn) return;
    armIdle();
    return () => {
      if (idle.current !== null) clearTimeout(idle.current);
    };
    // armIdle reads only refs and props.hintIdle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, hintKey, hintOn, props.hintIdle]);

  // A hint that shows itself is said out loud too (once speech is unlocked by a tap).
  useEffect(() => {
    if (hintOn && view.hint !== null) speech?.say(HINT_LINES[view.hint.kind]);
    // Said once when the hint appears, not again on every change of the board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintOn, hintKey, speech]);
  useEffect(() => () => speech?.stop(), [speech]);

  // The hand: from the friend to where it goes, as CSS variables on one element (P7).
  useEffect(() => {
    const root = rootRef.current;
    const hand = handRef.current;
    if (root === null || hand === null) return;
    const path = hintOn && setup && view.hint !== null ? hintPath(view, view.hint, selected) : null;
    const find = (spot: Spot): HTMLElement | null => {
      switch (spot.kind) {
        case 'cell':
          return boardRef.current?.querySelector<HTMLElement>(`[data-cell="${spot.cell}"]`) ?? null;
        case 'tray':
          return root.querySelector<HTMLElement>(`[data-tray-friend="${spot.friend}"]`);
        case 'basket':
          return root.querySelector<HTMLElement>('.kindy-basket');
        case 'go':
          return root.querySelector<HTMLElement>('.kindy-go');
      }
    };
    const from = path?.from === null || path === null ? null : find(path.from);
    const to = path === null ? null : find(path.to);
    if (to === null) {
      hand.dataset.on = 'no';
      return;
    }
    const base = root.getBoundingClientRect();
    const spot = (el: HTMLElement): [number, number] => {
      const b = el.getBoundingClientRect();
      return [b.left - base.left + b.width / 2, b.top - base.top + b.height / 2];
    };
    const [x1, y1] = spot(to);
    const [x0, y0] = from === null ? [x1, y1] : spot(from);
    hand.style.setProperty('--x0', `${x0}px`);
    hand.style.setProperty('--y0', `${y0}px`);
    hand.style.setProperty('--x1', `${x1}px`);
    hand.style.setProperty('--y1', `${y1}px`);
    hand.dataset.on = from === null ? 'tap' : 'move';
    if (from !== null) from.dataset.hint = 'from';
    to.dataset.hint = 'to';
    return () => {
      hand.dataset.on = 'no';
      if (from !== null) delete from.dataset.hint;
      delete to.dataset.hint;
    };
  }, [hintOn, setup, view, selected]);

  const submit = async (command: GameCommand): Promise<boolean> => (await host.submit(command)) === null;

  /** A tap that can't do anything: the square (or button) wiggles, and nothing is written. */
  const nope = (el: HTMLElement | null | undefined): void => {
    if (el === null || el === undefined) return;
    el.dataset.nope = '1';
    setTimeout(() => delete el.dataset.nope, NOPE_MS);
  };
  const cellEl = (cell: number): HTMLElement | null => boardRef.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`) ?? null;

  /** A friend to a square: from the tray (facing the way the last one was aimed) or moved on the board. It stays picked, so its arrows show. */
  const put = async (friend: FriendView, cell: number): Promise<void> => {
    const facing = friend.cell >= 0 ? friend.facing : (lastFacing.current ?? friend.facing);
    if (await submit({ type: 'place', friend: friend.id, cell, facing })) {
      setSelected(friend.id);
      feedback?.cue('tap');
    } else nope(cellEl(cell));
  };

  const aim = async (friend: FriendView, facing: number): Promise<void> => {
    lastFacing.current = facing;
    setSelected(null);
    if (facing !== friend.facing && (await submit({ type: 'turn', friend: friend.id, facing }))) feedback?.cue('tap');
  };

  const back = async (id: number): Promise<void> => {
    setSelected(null);
    if (await submit({ type: 'toTray', friend: id })) feedback?.cue('tap');
  };

  const onCell = async (cell: number): Promise<void> => {
    if (drag.justDragged() || !setup) return;
    const here = view.friends.find((f) => f.cell === cell);
    const facing = aims.get(cell);
    if (chosen !== undefined && chosen.cell >= 0 && facing !== undefined) return aim(chosen, facing);
    if (here !== undefined) {
      setSelected(selected === here.id ? null : here.id);
      feedback?.cue('tap');
      return;
    }
    if (chosen !== undefined && view.squares[cell] === 'open') return put(chosen, cell);
    nope(cellEl(cell));
  };

  // Drag too, as in main mode (K6): tray to square, square to square, off the board to the basket.
  const dropRef = useRef<(source: DragSource, cell: number | null) => void>(() => {});
  const [drag] = useState(() => new DragController(() => (source, cell) => dropRef.current(source, cell)));
  useEffect(() => {
    dropRef.current = (source, cell) => {
      if (!setup) return;
      if (source.kind === 'tray') {
        const friend = view.friends.find((f) => f.id === selected && f.cell < 0) ?? view.friends.find((f) => f.cell < 0);
        if (friend !== undefined && cell !== null) void put(friend, cell);
        return;
      }
      if (cell === null) void back(source.id);
      else {
        const friend = view.friends.find((f) => f.id === source.id);
        if (friend !== undefined && friend.cell !== cell) void put(friend, cell);
      }
    };
  });
  useEffect(() => () => drag.stop(), [drag]);

  const onFriendDown = (event: ReactPointerEvent<HTMLElement>, id: number): void => {
    const token = event.currentTarget.querySelector<HTMLElement>('.friend');
    if (setup && token !== null) drag.begin(event, { kind: 'friend', id }, token);
  };

  const go = async (): Promise<void> => {
    if (!setup) return;
    drag.stop();
    setSelected(null);
    setHintOn(false);
    speech?.stop();
    beforeGo.current = view;
    if (!(await submit({ type: 'go' }))) beforeGo.current = null;
  };

  const unlock = (): void => {
    if (speech === undefined || unlocked.current) return;
    unlocked.current = true;
    speech.unlock();
    if (hintOn && view.hint !== null) speech.say(HINT_LINES[view.hint.kind]);
  };

  const askHint = (): void => {
    if (view.hint === null) return;
    setHintOn(true);
    // Asked for again while showing: say it again.
    if (hintOn) speech?.say(HINT_LINES[view.hint.kind]);
  };

  const done = view.round === 'daily' && view.phase === 'won' && playback === null && !party;
  useEffect(() => {
    if (!done || !watched.current) return;
    watched.current = false;
    feedback?.cue('sticker');
  }, [done, feedback]);
  // A won practice board (or one reopened after it was won) shows the party: there is no done screen for practice.
  const partying = view.phase === 'won' && playback === null && !done;
  const tray = view.friends.filter((f) => f.cell < 0);

  return (
    <section
      className="kindy-game"
      aria-label="Kindy"
      ref={rootRef}
      onPointerDownCapture={() => {
        if (setup) armIdle();
      }}
      // iOS allows speech only from a tap: the first one unlocks it, and says the hint showing, if any.
      onPointerUpCapture={() => unlock()}
      onClickCapture={() => unlock()}
    >
      <header className="kindy-bar">
        <button type="button" className="kindy-btn kindy-avatar" aria-label="Switch player" onClick={props.onProfiles}>
          <Avatar id={profile.avatar} size={52} />
        </button>
        <ol className="kindy-slots" aria-label="Kids fed today">
          {fedSlots(view).map((fed, i) => (
            <li key={i} className={fed ? 'fed' : ''}>
              <KidHead className="pic" id={i + 1} mood={fed ? 'yum' : 'ok'} />
            </li>
          ))}
        </ol>
        {setup && view.hint !== null ? (
          <button type="button" className="kindy-btn kindy-ask" aria-label="Help" onClick={askHint}>
            <Icon className="pic" name="hand" />
          </button>
        ) : (
          <span className="kindy-btn-space" aria-hidden="true" />
        )}
      </header>

      {done ? (
        <KindyDone host={host} view={view} profile={profile} />
      ) : (
        <>
          <main className="board-area kindy-area">
            <Board
              view={shown}
              selected={setup && chosen !== undefined && chosen.cell >= 0 ? chosen.id : null}
              aims={aims}
              heals={new Set()}
              preview={setup}
              onCell={(cell) => void onCell(cell)}
              onFriendDown={onFriendDown}
              overlayRef={overlayRef}
              boardRef={boardRef}
            />
          </main>

          <footer className="kindy-dock">
            <div className="kindy-tray" role="group" aria-label="Friends to put out">
              {tray.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`kindy-btn kindy-friend${selected === f.id ? ' on' : ''}`}
                  data-tray-friend={f.id}
                  aria-label="A thrower"
                  aria-pressed={selected === f.id}
                  disabled={!setup}
                  onPointerDown={(event) => {
                    const token = event.currentTarget.querySelector<HTMLElement>('.art');
                    if (setup && token !== null) drag.begin(event, { kind: 'tray', type: f.type }, token);
                  }}
                  onClick={() => {
                    if (drag.justDragged()) return;
                    setSelected(selected === f.id ? null : f.id);
                    feedback?.cue('tap');
                  }}
                >
                  <FriendArt type="straight" />
                </button>
              ))}
            </div>
            <button
              type="button"
              className="kindy-btn kindy-basket"
              aria-label="Back in the basket"
              disabled={!setup}
              onClick={(event) => {
                if (chosen !== undefined && chosen.cell >= 0) void back(chosen.id);
                else nope(event.currentTarget);
              }}
            >
              <Icon className="pic" name="basket" />
            </button>
            <button type="button" className="kindy-btn kindy-go" aria-label="Go" disabled={!setup} onClick={() => void go()}>
              <span className="kindy-go-arrow" aria-hidden="true" />
            </button>
          </footer>
        </>
      )}

      {partying && (
        <div className="kindy-party" role="dialog" aria-label="Everyone is fed">
          <div className="kindy-confetti" aria-hidden="true">
            {CONFETTI.map((piece, i) => (
              <span key={i} className="pic confetti" style={{ ['--i' as string]: i }}>
                {piece.snack !== undefined ? <SnackArt snack={piece.snack} /> : <Icon name={piece.icon!} />}
              </span>
            ))}
          </div>
          <Icon className="pic kindy-party-star" name="trophy" />
          <ol className="kindy-party-kids" aria-hidden="true">
            {fedSlots(view).map((_, i) => (
              <li key={i} style={{ ['--i' as string]: i }}>
                <KidHead className="pic" id={i + 1} mood="yum" />
              </li>
            ))}
          </ol>
          <div className="kindy-party-actions">
            {view.round === 'daily' ? (
              <button type="button" className="kindy-btn kindy-next" aria-label="Done" onClick={() => setParty(false)}>
                <span className="kindy-go-arrow" aria-hidden="true" />
              </button>
            ) : (
              <>
                <button type="button" className="kindy-btn kindy-again" aria-label="Another board" onClick={() => void host.practice()}>
                  <Icon className="pic" name="again" />
                </button>
                <button type="button" className="kindy-btn kindy-home" aria-label="Today" onClick={() => void host.daily()}>
                  <Icon className="pic" name="house" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <span className="kindy-hand" data-on="no" ref={handRef} aria-hidden="true">
        <Icon name="hand" />
      </span>
    </section>
  );
}

/** The party's confetti: stars, balloons, poppers and the day's snacks, all drawn (no text, RULES 11). */
const CONFETTI: readonly { readonly icon?: IconName; readonly snack?: SnackId }[] = [
  { icon: 'party' },
  { icon: 'star' },
  { snack: 'apple' },
  { icon: 'balloon' },
  { snack: 'banana' },
  { icon: 'star' },
  { icon: 'party' },
  { snack: 'cookie' },
  { icon: 'balloon' },
  { icon: 'star' },
  { snack: 'grapes' },
  { icon: 'party' },
  { snack: 'cheese' },
  { icon: 'star' },
  { snack: 'pretzel' },
  { icon: 'balloon' },
];
