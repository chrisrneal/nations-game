import type { ReactElement } from 'react';
import type { AvatarId } from '@snacks/contracts';
import { AvatarArt } from './art/Avatars.tsx';

/** A profile's picture: an animal face drawn as SVG (art/Avatars.tsx), with no text in it. */
export function Avatar(props: { id: AvatarId; size: number; className?: string }): ReactElement {
  return (
    <span className={`avatar${props.className === undefined ? '' : ` ${props.className}`}`} style={{ width: props.size, height: props.size }} data-avatar={props.id} aria-hidden="true">
      <AvatarArt id={props.id} />
    </span>
  );
}
