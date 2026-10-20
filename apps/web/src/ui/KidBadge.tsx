import type { ReactElement } from 'react';
import type { KidView } from '@snacks/contracts';
import { KidArt } from './art/Kid.tsx';

/**
 * A kid as their card shows them (K10): the same picture as on the board (so
 * the shirt, hat, glasses and backpack match) with their letter.
 */
export function KidBadge(props: { kid: KidView; big?: boolean }): ReactElement {
  return (
    <span className={`clue-kid${props.big === true ? ' big' : ''}`}>
      <KidArt id={props.kid.id} look={props.kid.look} />
      <span className="clue-kid-letter">{props.kid.label}</span>
    </span>
  );
}
