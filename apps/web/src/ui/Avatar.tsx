import type { ReactElement } from 'react';
import type { AvatarId, Worn } from '@snacks/contracts';
import { AvatarArt } from './art/Avatars.tsx';
import { AvatarCosmetics } from './art/Cosmetics.tsx';

/**
 * A profile's picture: an animal face drawn as SVG (art/Avatars.tsx), with no
 * text in it. It wears the child's hat and outfit when given (RULES 9a, K12):
 * this is the one place in the game that does.
 */
export function Avatar(props: { id: AvatarId; size: number; className?: string; worn?: Worn | undefined }): ReactElement {
  return (
    <span className={`avatar${props.className === undefined ? '' : ` ${props.className}`}`} style={{ width: props.size, height: props.size }} data-avatar={props.id} aria-hidden="true">
      <AvatarArt id={props.id} />
      <AvatarCosmetics worn={props.worn} />
    </span>
  );
}
