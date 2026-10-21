import type { ReactElement } from 'react';
import { INK } from './palette.ts';
import { Svg } from './Svg.tsx';

/**
 * The game's small pictures in the same style (docs/ART.md), in place of
 * emoji, which look different on every phone: points (a star), the streak
 * (a flame), the wave, hungry, the Nurse's plaster, and Kindy's basket, hand,
 * trophy, balloons, sun, moon, sunrise, house and "a new board". Each is in a
 * 24-unit box with a thicker line, so it reads at 18 px.
 */
export type IconName =
  | 'star'
  | 'flame'
  | 'wave'
  | 'sad'
  | 'yum'
  | 'ache'
  | 'plaster'
  | 'basket'
  | 'hand'
  | 'trophy'
  | 'balloon'
  | 'again'
  | 'house'
  | 'sun'
  | 'sleepy-sun'
  | 'moon'
  | 'sunrise'
  | 'shop'
  | 'party'
  | 'sparkle'
  | 'bulb'
  | 'heart'
  | 'phone'
  | 'menu'
  | 'book'
  | 'arrow-left'
  | 'arrow-right';

const STAR = 'M12 2.2 L14.6 8.4 L21.3 8.9 L16.2 13.2 L17.8 19.8 L12 16.3 L6.2 19.8 L7.8 13.2 L2.7 8.9 L9.4 8.4 Z';

const face = (mouth: ReactElement, fill = '#ffd23f'): ReactElement => (
  <>
    <circle cx={12} cy={12} r={9.5} fill={fill} />
    <circle cx={8.8} cy={10} r={1.2} fill={INK} stroke="none" />
    <circle cx={15.2} cy={10} r={1.2} fill={INK} stroke="none" />
    {mouth}
  </>
);

const DRAW: Readonly<Record<IconName, () => ReactElement>> = {
  star: () => <path d={STAR} fill="#ffd23f" />,
  flame: () => (
    <>
      <path d="M12 22 C5.5 22 4 16 6.5 12 C7.5 14.5 9 15 9 15 C8 10 11 5 14.5 2.5 C14 7 19.5 9.5 19 15.5 C18.7 19.5 16 22 12 22 Z" fill="#ff8a3d" />
      <path d="M12 21 C9.5 21 8.5 18.5 10 16.5 C10.5 18 11.5 18 11.5 18 C11.5 15.5 13 13.5 14.5 13 C14.5 16 16.3 17 15.5 19 C15 20.3 13.8 21 12 21 Z" fill="#ffd23f" strokeWidth={1.2} />
    </>
  ),
  wave: () => (
    <>
      <path d="M2.5 15 Q5.5 9 9 12 Q12 15 15 11 Q18 7 21.5 11 V21.5 H2.5 Z" fill="#5aa8e6" />
      <path d="M4 18 Q7 15.5 10 17.5 Q13 19.5 16 17 Q19 14.5 21 17" fill="none" stroke="#ffffff" strokeWidth={1.4} />
    </>
  ),
  sad: () => face(<path d="M8.5 16.5 Q12 13.5 15.5 16.5" fill="none" />, '#9fd3ff'),
  yum: () => face(<path d="M7.5 13.5 Q12 20 16.5 13.5 Z" fill="#9c3434" strokeWidth={1.4} />),
  ache: () => face(<path d="M7.5 16 Q8.75 14.5 10 16 Q11.25 17.5 12.5 16 Q13.75 14.5 15 16 Q16.25 17.5 17 16" fill="none" strokeWidth={1.4} />, '#a8dd8f'),
  plaster: () => (
    <>
      <rect x={2} y={8} width={20} height={8} rx={4} fill="#f6c59a" transform="rotate(-30 12 12)" />
      <rect x={8.5} y={9} width={7} height={6} rx={1.5} fill="#ffe7d1" transform="rotate(-30 12 12)" />
    </>
  ),
  basket: () => (
    <>
      <path d="M6 10 Q6 3 12 3 Q18 3 18 10" fill="none" strokeWidth={2} />
      <path d="M2.5 10 H21.5 L19 21 H5 Z" fill="#d4934f" />
      <path d="M7 12 L8 19.5 M12 12 V19.5 M17 12 L16 19.5 M3.6 14.5 H20.4" fill="none" stroke="#9a6235" strokeWidth={1.3} />
    </>
  ),
  hand: () => (
    <path d="M9 21.5 C6.5 19 4.5 16 4.5 13.5 C4.5 12 6.5 11.6 7.5 13 L8.5 14.5 V4 C8.5 2.2 11 2.2 11 4 V10.5 C11 9 13.5 9 13.5 10.5 V11.5 C13.5 10 16 10 16 11.5 V12.5 C16 11 18.5 11 18.5 12.5 V16 C18.5 18.5 17.5 20 16.5 21.5 Z" fill="#fbd9bd" />
  ),
  trophy: () => (
    <>
      <path d="M7 4 H17 V9 C17 13 14.5 15 12 15 C9.5 15 7 13 7 9 Z" fill="#ffd23f" />
      <path d="M7 6 H3.5 Q3.5 11 7.5 11 M17 6 H20.5 Q20.5 11 16.5 11" fill="none" strokeWidth={1.6} />
      <path d="M10.5 15 H13.5 V18 H10.5 Z M7.5 18 H16.5 V21.5 H7.5 Z" fill="#e0a83a" />
      <path d="M12 6.5 L12.8 8.4 L14.8 8.5 L13.3 9.8 L13.8 11.7 L12 10.6 L10.2 11.7 L10.7 9.8 L9.2 8.5 L11.2 8.4 Z" fill="#ffffff" strokeWidth={1} />
    </>
  ),
  balloon: () => (
    <>
      <path d="M12 16 Q11 19 13 21.5" fill="none" strokeWidth={1.2} />
      <ellipse cx={12} cy={9} rx={6.5} ry={7.5} fill="#ef6f6c" />
      <path d="M10.8 16.3 H13.2 L12 17.6 Z" fill="#ef6f6c" strokeWidth={1.2} />
      <path d="M8.5 6.5 Q9.5 4 12 3.8" fill="none" stroke="#ffffff" strokeWidth={1.4} />
    </>
  ),
  again: () => (
    <>
      <path d="M19 12 A7 7 0 1 1 16.5 6.6" fill="none" strokeWidth={4.6} />
      <path d="M19 12 A7 7 0 1 1 16.5 6.6" fill="none" stroke="#5aa8e6" strokeWidth={2.2} />
      <path d="M14 2.5 L20 5 L15.5 9.5 Z" fill="#5aa8e6" />
    </>
  ),
  house: () => (
    <>
      <path d="M4.5 11 V21 H19.5 V11" fill="#ffe4b8" />
      <path d="M2 12 L12 3 L22 12 Z" fill="#ef6f6c" />
      <rect x={9.5} y={14} width={5} height={7} rx={1} fill="#9a6235" />
    </>
  ),
  sun: () => (
    <>
      <path d="M12 0.8 V4 M12 20 V23.2 M0.8 12 H4 M20 12 H23.2 M4 4 L6.2 6.2 M17.8 17.8 L20 20 M20 4 L17.8 6.2 M4 20 L6.2 17.8" fill="none" stroke="#f0a020" strokeWidth={2} />
      {face(<path d="M9 14 Q12 17 15 14" fill="none" />)}
    </>
  ),
  'sleepy-sun': () => (
    <>
      <circle cx={12} cy={12} r={9.5} fill="#ffe08a" />
      <path d="M7.5 10.5 Q8.8 12 10.1 10.5 M13.9 10.5 Q15.2 12 16.5 10.5" fill="none" strokeWidth={1.4} />
      <ellipse cx={12} cy={15.5} rx={1.6} ry={1.2} fill={INK} stroke="none" />
      <path d="M17 3 H20.5 L17 6.5 H20.5" fill="none" stroke="#5aa8e6" strokeWidth={1.5} />
    </>
  ),
  moon: () => <path d="M15.5 2.5 A9.5 9.5 0 1 0 21.5 17 A7.5 7.5 0 1 1 15.5 2.5 Z" fill="#fff1a8" />,
  sunrise: () => (
    <>
      <path d="M5 17 A7 7 0 0 1 19 17 Z" fill="#ffb13b" />
      <path d="M12 4 V7 M4.5 9 L6.5 11 M19.5 9 L17.5 11" fill="none" stroke="#f0a020" strokeWidth={1.8} />
      <path d="M1.5 17 H22.5 M4 20.5 H20" fill="none" strokeWidth={1.8} />
    </>
  ),
  shop: () => (
    <>
      <path d="M3 10 H21 V21 H3 Z" fill="#fff4d6" />
      <path d="M2 4 H22 L21 10 H3 Z" fill="#ef6f6c" />
      <path d="M8.5 4 L8 10 M15.5 4 L16 10" fill="none" />
      <path d="M2 4 H22" fill="none" />
      <rect x={9} y={14} width={6} height={7} rx={1} fill="#5aa8e6" />
    </>
  ),
  party: () => (
    <>
      <path d="M3 21 L8 7 L17 16 Z" fill="#b48be0" />
      <path d="M5 15.5 L9.5 19 M6.5 11 L13 17" fill="none" stroke="#ffd23f" strokeWidth={1.6} />
      <circle cx={16} cy={5} r={1.5} fill="#ef6f6c" />
      <circle cx={20.5} cy={10} r={1.5} fill="#5aa8e6" />
      <path d="M12 3 L13 6 M19 14 L21.5 15" fill="none" strokeWidth={1.6} />
    </>
  ),
  sparkle: () => <path d="M12 1.5 Q13 11 22.5 12 Q13 13 12 22.5 Q11 13 1.5 12 Q11 11 12 1.5 Z" fill="#ffe36b" strokeWidth={1.2} />,
  // The main-mode hint (RULES 8b, K11): a light bulb.
  bulb: () => (
    <>
      <path d="M12 2.5 C7.6 2.5 5 5.6 5 9.2 C5 11.8 6.4 13.4 7.6 14.6 C8.4 15.4 8.8 16.2 8.8 17 H15.2 C15.2 16.2 15.6 15.4 16.4 14.6 C17.6 13.4 19 11.8 19 9.2 C19 5.6 16.4 2.5 12 2.5 Z" fill="#ffe36b" />
      <path d="M9 19.2 H15 M10 21.5 H14" fill="none" strokeWidth={1.8} />
      <path d="M10.2 12.5 L12 9.5 L13.8 12.5" fill="none" stroke="#e0a400" strokeWidth={1.3} />
    </>
  ),
  heart: () => <path d="M12 20.5 C2.5 14 3.5 6 8 5.5 C10 5.3 11.5 6.8 12 8 C12.5 6.8 14 5.3 16 5.5 C20.5 6 21.5 14 12 20.5 Z" fill="#ff7fa8" />,
  menu: () => <path d="M4 6.5 H20 M4 12 H20 M4 17.5 H20" fill="none" strokeWidth={2.4} />,
  phone: () => (
    <>
      <rect x={6} y={2} width={12} height={20} rx={3} fill="#ffffff" />
      <rect x={8} y={5} width={8} height={11} rx={1} fill="#c9eec0" strokeWidth={1.2} />
      <circle cx={12} cy={19} r={1} fill={INK} stroke="none" />
    </>
  ),
  book: () => (
    <>
      <path d="M2.5 5 Q7.5 3 12 5.5 V20.5 Q7.5 18.5 2.5 20.5 Z" fill="#ffd9a0" />
      <path d="M21.5 5 Q16.5 3 12 5.5 V20.5 Q16.5 18.5 21.5 20.5 Z" fill="#ffe9c4" />
      <path d={STAR} transform="translate(13.2 8) scale(0.36)" fill="#ffd23f" strokeWidth={3} />
      <path d="M4.5 9 H9.5 M4.5 12 H9.5 M4.5 15 H9.5" fill="none" strokeWidth={1.2} />
    </>
  ),
  'arrow-left': () => <path d="M3.5 12 L11 4 V8.5 H20.5 V15.5 H11 V20 Z" fill="#ffd23f" />,
  'arrow-right': () => <path d="M20.5 12 L13 4 V8.5 H3.5 V15.5 H13 V20 Z" fill="#ffd23f" />,
};

export function Icon(props: { name: IconName; className?: string | undefined; label?: string | undefined }): ReactElement {
  return (
    <Svg kind={`icon icon-${props.name}`} box="0 0 24 24" line={1.8} className={props.className} label={props.label}>
      {DRAW[props.name]()}
    </Svg>
  );
}

export const ICON_NAMES = Object.keys(DRAW) as IconName[];
