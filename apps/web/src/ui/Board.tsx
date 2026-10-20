import type { PointerEvent as ReactPointerEvent, ReactElement, Ref } from 'react';
import type { GameView } from '@snacks/contracts';
import { throwLine } from './aim.ts';
import { PatternDiagram } from './Diagram.tsx';
import { Pic } from './Pic.tsx';
import { FRIEND_NAME, SHIRTS, SNACK_EMOJI, SNACK_NAME, facingAngle, kidBadges } from './labels.ts';

/**
 * The board: grey playground squares, the sandy path, lunchboxes, obstacles,
 * parents' tables, friends (their throw pattern, an arrow for their facing)
 * and kids (a letter badge, their shirt colour). Every square is a button.
 *
 * During setup every friend shows where its next throw lands (D12): a dashed
 * line to that square, never the whole route. The selected friend's aim
 * squares (or a Nurse's heal range) are highlighted.
 *
 * Kindy (RULES 11): pictures only, drawn by CSS (Pic.tsx), so nothing on the
 * board is text: a friend is a thrower, a kid has the snack they want over
 * their head, and each aim square carries a big arrow the way it throws.
 */
/** A Kindy friend: a thrower (Kindy has Straight friends only). */
export const KINDY_FRIEND = '🙋';

export function Board(props: {
  view: GameView;
  selected: number | null;
  /** Squares a tap aims the selected friend at. */
  aims: ReadonlyMap<number, number>;
  /** Squares the selected Nurse heals. */
  heals: ReadonlySet<number>;
  /** Squares a main-mode hint lights up: the kid, their lunchbox, the friend it put out (RULES 8b). */
  hinted?: ReadonlySet<number>;
  /** Show the next-throw lines (setup only). */
  preview: boolean;
  onCell: (cell: number) => void;
  onFriendDown: (event: ReactPointerEvent<HTMLElement>, friend: number) => void;
  overlayRef: Ref<HTMLDivElement>;
  boardRef: Ref<HTMLDivElement>;
}): ReactElement {
  const { view, selected, aims, heals, overlayRef, boardRef } = props;
  const kindy = view.mode === 'kindy';
  const selectedTarget = view.friends.find((f) => f.id === selected)?.target ?? -1;
  return (
    <div
      className={`board-wrap${kindy ? ' kindy' : ''}`}
      style={{ ['--cols' as string]: view.width, ['--rows' as string]: view.height }}
    >
      <div className="board" ref={boardRef} style={{ gridTemplateColumns: `repeat(${view.width}, 1fr)` }} role="grid" aria-label="The playground">
        {view.squares.map((square, cell) => {
          const friend = view.friends.find((f) => f.cell === cell);
          const kid = view.kids.find((k) => k.cell === cell);
          const box = view.lunchboxes.find((l) => l.cell === cell);
          const classes = ['sq', `sq-${square}`];
          if (aims.has(cell)) classes.push('sq-aimable');
          if (heals.has(cell)) classes.push('sq-heal');
          if (props.hinted?.has(cell) === true) classes.push('sq-hint');
          if (cell === selectedTarget) classes.push('sq-target');
          if (friend !== undefined && friend.id === selected) classes.push('sq-selected');
          let label = square === 'path' ? 'path' : square === 'open' ? 'playground' : square;
          let content: ReactElement | string | null = null;
          if (box !== undefined) {
            label = `${SNACK_NAME[box.snack]} lunchbox`;
            content = <Pic className="sq-box" glyph={SNACK_EMOJI[box.snack]} />;
          } else if (square === 'obstacle') content = <Pic glyph="🌳" />;
          else if (square === 'table') content = <Pic glyph="👪" />;
          if (friend !== undefined) {
            label = `${FRIEND_NAME[friend.type]} friend${friend.picker ? ', picks up snacks' : ''}`;
            content = (
              <span className={`friend t-${friend.type}${friend.picker ? ' picker' : ''}`}>
                {kindy ? <Pic className="friend-pic" glyph={KINDY_FRIEND} /> : <PatternDiagram type={friend.type} />}
                {friend.type !== 'nurse' && (
                  <span className="friend-arrow" style={{ transform: `rotate(${facingAngle(friend.type, friend.facing)}deg)` }} aria-hidden="true">
                    <span className="friend-arrow-tip" />
                  </span>
                )}
              </span>
            );
          }
          if (kid !== undefined) {
            label = `Kid ${kid.label}${kid.clue !== null ? `: ${kid.clue}` : ''}${kid.healed ? ', healed once' : ''}`;
            content = (
              <span className="kid" style={{ borderColor: SHIRTS[kid.look.shirt % SHIRTS.length] }}>
                {kid.wants !== null && <Pic className="kid-wants" glyph={SNACK_EMOJI[kid.wants]} />}
                {kindy ? (
                  <Pic className="kid-label" glyph="🧒" />
                ) : (
                  <span className="kid-label" style={{ background: SHIRTS[kid.look.shirt % SHIRTS.length] }}>
                    {kid.label}
                  </span>
                )}
                {kidBadges(kid) !== '' && <Pic className="kid-badges" glyph={kidBadges(kid)} />}
                {kid.healed && <Pic className="kid-healed" glyph="🩹" />}
              </span>
            );
          }
          return (
            <button
              key={cell}
              type="button"
              className={classes.join(' ')}
              data-cell={cell}
              aria-label={label}
              onClick={() => props.onCell(cell)}
              onPointerDown={friend === undefined ? undefined : (event) => props.onFriendDown(event, friend.id)}
            >
              {content}
              {kindy && aims.has(cell) && <span className="aim-arrow" style={{ transform: `rotate(${facingAngle('straight', aims.get(cell)!)}deg)` }} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      {props.preview && <ThrowPreview view={view} selected={selected} />}
      <div className="board-overlay" ref={overlayRef} aria-hidden="true" />
    </div>
  );
}

/** Every friend's next throw (D12): a dashed line from the friend to where it lands, and a ring there. */
function ThrowPreview(props: { view: GameView; selected: number | null }): ReactElement {
  const { view } = props;
  return (
    <svg className="board-preview" viewBox={`0 0 ${view.width} ${view.height}`} preserveAspectRatio="none" aria-hidden="true">
      {view.friends.map((friend) => {
        const line = throwLine(view, friend);
        if (line === null) return null;
        const [x2, y2] = [line.to[0] + 0.5, line.to[1] + 0.5];
        // Start at the edge of the friend's token, not under it.
        const dx = line.to[0] - line.from[0];
        const dy = line.to[1] - line.from[1];
        const len = Math.hypot(dx, dy);
        const [x1, y1] = [line.from[0] + 0.5 + (dx / len) * 0.42, line.from[1] + 0.5 + (dy / len) * 0.42];
        const on = friend.id === props.selected ? ' on' : '';
        return (
          <g key={friend.id} className={`throw throw-${line.lands}${on}`} data-friend={friend.id}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} vectorEffect="non-scaling-stroke" />
            {line.lands !== 'off' && <circle cx={x2} cy={y2} r={0.36} vectorEffect="non-scaling-stroke" />}
          </g>
        );
      })}
    </svg>
  );
}
