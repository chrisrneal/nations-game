import type { ReactElement, Ref } from 'react';
import type { GameView } from '@snacks/contracts';
import { FRIEND_GLYPH, FRIEND_NAME, SHIRTS, SNACK_EMOJI, SNACK_NAME, facingAngle, kidBadges, stepOf } from './labels.ts';

/** Squares a friend's next throw crosses and where it lands, for the setup preview (D12). */
export function throwPreview(view: GameView, friendId: number | null): { line: Set<number>; target: number } {
  const line = new Set<number>();
  const friend = view.friends.find((f) => f.id === friendId);
  if (friend === undefined || friend.cell < 0 || friend.type === 'nurse') return { line, target: -1 };
  if (friend.type === 'straight' || friend.type === 'diagonal') {
    const [dx, dy] = stepOf(friend.type, friend.facing);
    let x = (friend.cell % view.width) + dx;
    let y = Math.floor(friend.cell / view.width) + dy;
    while (x >= 0 && y >= 0 && x < view.width && y < view.height) {
      const cell = y * view.width + x;
      if (cell === friend.target) break;
      line.add(cell);
      x += dx;
      y += dy;
    }
  }
  return { line, target: friend.target };
}

/**
 * The board: grey playground squares, the sandy path, lunchboxes, obstacles,
 * parents' tables, friends (chess symbols, an arrow for their facing) and
 * kids (a letter, their shirt colour). Every square is a button.
 */
export function Board(props: {
  view: GameView;
  selected: number | null;
  onCell: (cell: number) => void;
  overlayRef: Ref<HTMLDivElement>;
  boardRef: Ref<HTMLDivElement>;
}): ReactElement {
  const { view, selected, overlayRef, boardRef } = props;
  const preview = throwPreview(view, selected);
  const targets = new Set(view.friends.filter((f) => f.cell >= 0 && f.target >= 0).map((f) => f.target));
  const kindy = view.mode === 'kindy';
  return (
    <div className={`board-wrap${kindy ? ' kindy' : ''}`}>
      <div className="board" ref={boardRef} style={{ gridTemplateColumns: `repeat(${view.width}, 1fr)` }} role="grid" aria-label="The playground">
        {view.squares.map((square, cell) => {
          const friend = view.friends.find((f) => f.cell === cell);
          const kid = view.kids.find((k) => k.cell === cell);
          const box = view.lunchboxes.find((l) => l.cell === cell);
          const classes = ['sq', `sq-${square}`];
          if (preview.line.has(cell)) classes.push('sq-line');
          if (cell === preview.target) classes.push('sq-target');
          else if (targets.has(cell)) classes.push('sq-aim');
          if (friend !== undefined && friend.id === selected) classes.push('sq-selected');
          let label = square === 'path' ? 'path' : square === 'open' ? 'playground' : square;
          let content: ReactElement | string | null = null;
          if (box !== undefined) {
            label = `${SNACK_NAME[box.snack]} lunchbox`;
            content = <span className="sq-box">{SNACK_EMOJI[box.snack]}</span>;
          } else if (square === 'obstacle') content = '🌳';
          else if (square === 'table') content = '👪';
          if (friend !== undefined) {
            label = `${FRIEND_NAME[friend.type]} friend${friend.picker ? ', picks up snacks' : ''}`;
            content = (
              <span className={`friend friend-${friend.type}${friend.picker ? ' picker' : ''}`}>
                <span className="friend-glyph">{FRIEND_GLYPH[friend.type]}</span>
                {friend.type !== 'nurse' && (
                  <span className="friend-arrow" style={{ transform: `rotate(${facingAngle(friend.type, friend.facing)}deg)` }} aria-hidden="true">
                    ↑
                  </span>
                )}
              </span>
            );
          }
          if (kid !== undefined) {
            label = `Kid ${kid.label}${kid.healed ? ', healed once' : ''}`;
            content = (
              <span className="kid" style={{ borderColor: SHIRTS[kid.look.shirt % SHIRTS.length] }}>
                {kid.wants !== null && <span className="kid-wants">{SNACK_EMOJI[kid.wants]}</span>}
                <span className="kid-label">{kindy ? '🙂' : kid.label}</span>
                <span className="kid-badges">{kidBadges(kid)}</span>
                {kid.healed && <span className="kid-healed">🩹</span>}
              </span>
            );
          }
          return (
            <button key={cell} type="button" className={classes.join(' ')} data-cell={cell} aria-label={label} onClick={() => props.onCell(cell)}>
              {content}
            </button>
          );
        })}
      </div>
      <div className="board-overlay" ref={overlayRef} aria-hidden="true" />
    </div>
  );
}
