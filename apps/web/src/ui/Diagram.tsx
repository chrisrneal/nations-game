import type { ReactElement } from 'react';
import type { FriendType } from '@snacks/contracts';
import { patternCells } from './aim.ts';

/**
 * A friend's throw pattern drawn as a tiny 5 x 5 grid: the friend in the
 * middle, a dot on every square it can throw to (the Nurse: the squares it
 * heals). Used in the tray, on the board and in the shop instead of chess
 * symbols.
 */
export function PatternDiagram(props: { type: FriendType; className?: string }): ReactElement {
  const { type } = props;
  return (
    <svg className={`diagram diagram-${type}${props.className ? ` ${props.className}` : ''}`} viewBox="0 0 5 5" aria-hidden="true" focusable="false">
      {patternCells(type).map(([x, y]) => (
        <rect key={`${x},${y}`} className="diagram-dot" x={x + 2 + 0.18} y={y + 2 + 0.18} width={0.64} height={0.64} rx={0.32} />
      ))}
      {type === 'nurse' ? (
        <path className="diagram-me" d="M2.35 1.9h0.3v0.45h0.45v0.3h-0.45v0.45h-0.3v-0.45h-0.45v-0.3h0.45z" />
      ) : (
        <rect className="diagram-me" x={2.08} y={2.08} width={0.84} height={0.84} rx={0.2} />
      )}
    </svg>
  );
}
