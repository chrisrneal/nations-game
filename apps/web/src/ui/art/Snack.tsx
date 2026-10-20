import type { ReactElement } from 'react';
import type { SnackId } from '@snacks/contracts';
import { INK } from './palette.ts';
import { Shine, Svg } from './Svg.tsx';

/**
 * The six snacks (RULES 4), each with its own outline and its own pattern
 * (palette.ts, SNACK_DRAWN), so no two are told apart by colour alone: the
 * apple has a stem and leaf, the cookie a bite and chips, the banana is a long
 * curved moon, the cheese stick a straight stick with holes, the pretzel a
 * salted knot and the grapes a bunch of little balls.
 */
export const SNACK_FILL: Readonly<Record<SnackId, string>> = {
  apple: '#e8483f',
  cookie: '#c98d52',
  banana: '#ffd23f',
  cheese: '#ff9a2e',
  pretzel: '#b9783f',
  grapes: '#79c64e',
};

const DRAW: Readonly<Record<SnackId, () => ReactElement>> = {
  apple: () => (
    <>
      <path d="M24 15 C18 10 8 12 8 24 C8 36 17 43 24 40 C31 43 40 36 40 24 C40 12 30 10 24 15 Z" fill={SNACK_FILL.apple} />
      <path d="M24 15 Q23.5 9 27 5" fill="none" strokeWidth={3} />
      <path d="M26.5 10 Q33 4 38 8 Q32 14 26.5 10 Z" fill="#6cbf4a" />
      <Shine d="M13 22 Q14 16 19 16 Q15 19 15 25 Z" />
    </>
  ),
  cookie: () => (
    <>
      <path d="M31.5 12 A15 15 0 1 0 38.1 19.9 Q33.5 21 34.5 16 Q30.5 16 31.5 12 Z" fill={SNACK_FILL.cookie} />
      <g fill="#5b3a24" stroke="none">
        <ellipse cx={17} cy={20} rx={2.6} ry={2.1} />
        <ellipse cx={26} cy={25} rx={2.4} ry={2.8} />
        <ellipse cx={16} cy={30} rx={2.8} ry={2.2} />
        <ellipse cx={28} cy={34} rx={2.5} ry={2} />
        <ellipse cx={22} cy={15} rx={1.8} ry={1.5} />
        <ellipse cx={34} cy={27} rx={2} ry={1.8} />
      </g>
    </>
  ),
  banana: () => (
    <>
      <path d="M9 22 C16 31 31 31 38.5 19.5 L40.5 15 L44 16.5 L43 21 C36 37 15 40 6.5 28 Q5.5 23.5 9 22 Z" fill={SNACK_FILL.banana} />
      <path d="M10.5 27.5 C18 34 32 33 40 22.5" fill="none" stroke="#d9a300" strokeWidth={1.8} />
      <path d="M40.5 15 L44 16.5 L43.5 19 L40 18 Z" fill="#7a5a2a" strokeWidth={1.5} />
      <circle cx={7} cy={27} r={1.6} fill={INK} stroke="none" />
      <Shine d="M15 29 Q24 33 33 28 Q24 31 15 29 Z" />
    </>
  ),
  cheese: () => (
    <g transform="rotate(-32 24 24)">
      <path d="M33 19 C35 12 40 10 43 13" fill="none" strokeWidth={6} />
      <path d="M33 19 C35 12 40 10 43 13" fill="none" stroke="#ffc074" strokeWidth={2.5} />
      <rect x={6} y={18.5} width={36} height={11} rx={5.5} fill={SNACK_FILL.cheese} />
      <g fill="#d96f08" stroke="none">
        <circle cx={13} cy={22.5} r={1.7} />
        <circle cx={20} cy={26} r={1.4} />
        <circle cx={27} cy={22} r={1.8} />
        <circle cx={34} cy={25.5} r={1.5} />
      </g>
      <Shine d="M10 21 L36 21 Q36 22.5 34 22.5 L12 22.5 Q10 22.5 10 21 Z" />
    </g>
  ),
  pretzel: () => {
    const loop = 'M17 38 C4 32 5 12 16 11.5 C22 11 25 17 24 23 C23 17 26 11 32 11.5 C43 12 44 32 31 38';
    const left = 'M17 38 L39 22.5';
    const right = 'M31 38 L9 22.5';
    const rope = (d: string): ReactElement => (
      <>
        <path d={d} fill="none" strokeWidth={9.5} />
        <path d={d} fill="none" stroke={SNACK_FILL.pretzel} strokeWidth={5} />
      </>
    );
    return (
      <>
        {rope(loop)}
        {rope(right)}
        {rope(left)}
        <g fill="#ffffff" stroke="none">
          <rect x={10} y={17} width={2.2} height={1.6} rx={0.5} />
          <rect x={18} y={13} width={2.2} height={1.6} rx={0.5} />
          <rect x={30} y={13.5} width={2.2} height={1.6} rx={0.5} />
          <rect x={37} y={19} width={2.2} height={1.6} rx={0.5} />
          <rect x={23} y={29} width={2.2} height={1.6} rx={0.5} />
          <rect x={14} y={31} width={2.2} height={1.6} rx={0.5} />
          <rect x={33} y={32} width={2.2} height={1.6} rx={0.5} />
        </g>
      </>
    );
  },
  grapes: () => (
    <>
      <path d="M24 15 Q24 10 26 6" fill="none" strokeWidth={3} />
      <path d="M25.5 10 Q31 4 37 8 Q31 13 25.5 10 Z" fill="#4f9e3a" />
      {(
        [
          [24, 36],
          [19.5, 28],
          [28.5, 28],
          [15, 20],
          [24, 19.5],
          [33, 20],
        ] as const
      ).map(([cx, cy]) => (
        <g key={`${cx},${cy}`}>
          <circle cx={cx} cy={cy} r={5.6} fill={SNACK_FILL.grapes} />
          <circle cx={cx - 1.8} cy={cy - 1.8} r={1.3} fill="#ffffff" stroke="none" opacity={0.6} />
        </g>
      ))}
    </>
  ),
};

export function SnackArt(props: { snack: SnackId; label?: string | undefined; className?: string | undefined }): ReactElement {
  return (
    <Svg kind={`snack snack-${props.snack}`} label={props.label} className={props.className}>
      {DRAW[props.snack]()}
    </Svg>
  );
}
