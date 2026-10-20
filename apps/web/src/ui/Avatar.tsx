import type { ReactElement } from 'react';
import type { AvatarId } from '@snacks/contracts';
import { AVATAR_LOOK } from './people.ts';

/** A profile's picture: a placeholder animal on a coloured circle (art comes in build step 8). */
export function Avatar(props: { id: AvatarId; size: number; className?: string }): ReactElement {
  const look = AVATAR_LOOK[props.id];
  return (
    <span
      className={`avatar${props.className === undefined ? '' : ` ${props.className}`}`}
      style={{ width: props.size, height: props.size, fontSize: Math.round(props.size * 0.6), background: look.colour }}
      aria-hidden="true"
    >
      {look.emoji}
    </span>
  );
}
