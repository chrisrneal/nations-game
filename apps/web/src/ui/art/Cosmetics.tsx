import type { ReactElement } from 'react';
import type { Worn } from '@snacks/contracts';
import { INK } from './palette.ts';

/**
 * Hats and outfits (RULES 9a, K12): drawn over the player's OWN avatar and
 * nowhere else. Never on a kid, never on a friend. Kids' hats and clothes
 * are clue attributes ("the kid in the hat"), and a friend's hat and badge
 * hint at its pattern (K10), so a cosmetic there would be a false clue. This
 * file draws only into an avatar's 48-unit box and imports nothing a kid or a
 * friend is drawn from; `cosmetics.test.ts` keeps it that way.
 *
 * The colours are chosen to stay clear of the clue hat's blue (Kid.tsx) and
 * the shirt colours' patterns: pink and gold hats, a red scarf, a green cape.
 */
export const COSMETIC_COLOURS = {
  partyHat: '#ff7fb0',
  partyDots: '#ffd23f',
  pompom: '#ffffff',
  crown: '#ffc83d',
  jewel: '#c93c8a',
  scarf: '#d83a3a',
  scarfStripe: '#ffffff',
  cape: '#7a4fd0',
  clasp: '#ffd23f',
} as const;

/** The colours only cosmetics use. The others (white, gold) are common in the game's art, so they prove nothing in a test. */
export const COSMETIC_OWN_COLOURS: readonly string[] = [COSMETIC_COLOURS.partyHat, COSMETIC_COLOURS.crown, COSMETIC_COLOURS.jewel, COSMETIC_COLOURS.scarf, COSMETIC_COLOURS.cape];

const C = COSMETIC_COLOURS;

/** Each item, drawn in an avatar's 48-unit box so it sits on the head or shoulders. */
const DRAW: Readonly<Record<string, () => ReactElement>> = {
  'party-hat': () => (
    <>
      <path d="M24 1.5 L33 15 Q24 17.5 15 15 Z" fill={C.partyHat} />
      <g fill={C.partyDots} stroke="none">
        <circle cx={22} cy={10} r={1.5} />
        <circle cx={27.5} cy={12} r={1.5} />
        <circle cx={20.5} cy={14} r={1.2} />
      </g>
      <circle cx={24} cy={2.2} r={2.6} fill={C.pompom} />
    </>
  ),
  crown: () => (
    <>
      <path d="M14 15 L13 5.5 L19 10 L24 3.5 L29 10 L35 5.5 L34 15 Q24 17 14 15 Z" fill={C.crown} />
      <g fill={C.jewel} stroke="none">
        <circle cx={19.5} cy={13} r={1.4} />
        <circle cx={24} cy={13.4} r={1.4} />
        <circle cx={28.5} cy={13} r={1.4} />
      </g>
    </>
  ),
  scarf: () => (
    <>
      <path d="M10.5 35 Q24 41 37.5 35 L38.5 40.5 Q24 46.5 9.5 40.5 Z" fill={C.scarf} />
      <path d="M16 38.2 L15.2 43.6 M22 39.6 L21.4 45 M28 39.6 L28.6 45 M34 38.2 L34.8 43.4" fill="none" stroke={C.scarfStripe} strokeWidth={1.8} />
      <path d="M31 40.5 L35 40.5 L36 47 L31.5 47 Z" fill={C.scarf} />
      <path d="M31.4 43 H35.6 M31.6 45 H35.8" fill="none" stroke={C.scarfStripe} strokeWidth={1.4} />
    </>
  ),
  cape: () => (
    <>
      <path d="M5 33.5 Q24 40 43 33.5 L46 46 Q24 49.5 2 46 Z" fill={C.cape} />
      <path d="M9 41 Q24 45 39 41" fill="none" stroke={C.clasp} strokeWidth={1.4} strokeDasharray="2 2.4" />
      <circle cx={24} cy={38.2} r={2.6} fill={C.clasp} />
    </>
  ),
};

/** The ids this file can draw: the catalogue's cosmetics must all be among them (platform/catalogue.test.ts). */
export const COSMETIC_IDS: readonly string[] = Object.keys(DRAW);

/**
 * The layer over an avatar's face for what it wears; null when it wears nothing.
 * An outfit is drawn under the hat, so the hat never ends up behind it.
 */
export function AvatarCosmetics(props: { worn: Worn | undefined }): ReactElement | null {
  const worn = props.worn;
  if (worn === undefined) return null;
  const outfit = worn.outfit === null ? undefined : DRAW[worn.outfit];
  const hat = worn.hat === null ? undefined : DRAW[worn.hat];
  if (outfit === undefined && hat === undefined) return null;
  return (
    <svg className="cosmetic-layer" viewBox="0 0 48 48" focusable="false" aria-hidden="true" data-cosmetic={[worn.hat, worn.outfit].filter((x) => x !== null).join(' ')}>
      <g stroke={INK} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round">
        {outfit?.()}
        {hat?.()}
      </g>
    </svg>
  );
}
