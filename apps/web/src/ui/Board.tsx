import type { PointerEvent as ReactPointerEvent, ReactElement, Ref } from 'react';
import type { GameView } from '@snacks/contracts';
import { throwLine } from './aim.ts';
import { FriendArt } from './art/Friend.tsx';
import { Icon } from './art/Icons.tsx';
import { KidArt } from './art/Kid.tsx';
import { LunchboxArt, ObstacleArt, TableArt, obstacleKind } from './art/Scenery.tsx';
import { SnackArt } from './art/Snack.tsx';
import { FRIEND_NAME, SNACK_NAME, facingAngle } from './labels.ts';

/**
 * The board, drawn as the schoolyard (docs/ART.md, K10): grass for the
 * playground, sandy paving for the path, open lunchboxes with their snack and
 * its colour's mark, trees, benches and sandpits, the parents' picnic table,
 * friends on their round bases with an arrow for their facing, and kids in
 * their shirts, hats, glasses and backpacks. Every square is a button.
 *
 * During setup every friend shows where its next throw lands (D12): a dashed
 * line to that square, never the whole route. The selected friend's aim
 * squares (or a Nurse's heal range) are highlighted.
 *
 * Kindy (RULES 11): the same art bigger, with the snack each kid wants in a
 * bubble over their head and a big arrow on each aim square; no text at all.
 */
export function Board(props: {
  view: GameView;
  selected: number | null;
  /** Squares a tap aims the selected friend at. */
  aims: ReadonlyMap<number, number>;
  /** Squares the selected Nurse heals. */
  heals: ReadonlySet<number>;
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
          if (cell === selectedTarget) classes.push('sq-target');
          if ((cell % view.width) % 2 === Math.floor(cell / view.width) % 2) classes.push('sq-alt');
          if (friend !== undefined && friend.id === selected) classes.push('sq-selected');
          let label = square === 'path' ? 'path' : square === 'open' ? 'playground' : square;
          let content: ReactElement | string | null = null;
          if (box !== undefined) {
            label = `${SNACK_NAME[box.snack]} lunchbox`;
            content = <LunchboxArt className="sq-box" snack={box.snack} colour={view.snacks.find((s) => s.id === box.snack)?.colour ?? ''} />;
          } else if (square === 'obstacle') content = <ObstacleArt className="sq-thing" kind={obstacleKind(cell)} />;
          else if (square === 'table') content = <TableArt className="sq-thing" />;
          if (friend !== undefined) {
            label = `${FRIEND_NAME[friend.type]} friend${friend.picker ? ', picks up snacks' : ''}`;
            content = (
              <span className={`friend t-${friend.type}${friend.picker ? ' picker' : ''}`}>
                <FriendArt type={friend.type} />
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
              <span className="kid">
                {kid.wants !== null && (
                  <span className="kid-wants">
                    <SnackArt snack={kid.wants} />
                  </span>
                )}
                <KidArt id={kid.id} look={kid.look} />
                {!kindy && <span className="kid-label">{kid.label}</span>}
                {kid.healed && <Icon className="kid-healed" name="plaster" />}
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
