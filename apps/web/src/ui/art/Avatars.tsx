import type { ReactElement } from 'react';
import type { AvatarId } from '@snacks/contracts';
import { INK } from './palette.ts';
import { Svg } from './Svg.tsx';

/**
 * Profile pictures (RULES 12): eight animal faces on coloured circles, each
 * with its own outline (ears, beak, stripes), so a 4-year-old finds theirs
 * by shape as much as by colour.
 */
export const AVATAR_BG: Readonly<Record<AvatarId, string>> = {
  dog: '#f6d7a7',
  cat: '#f9c6d0',
  fox: '#ffd6b0',
  panda: '#d8e2ec',
  frog: '#c9eec0',
  owl: '#e3d3f5',
  bunny: '#fbe3ef',
  tiger: '#fde8a6',
};

const eyes = (y: number, gap = 6, r = 1.9): ReactElement => (
  <g fill={INK} stroke="none">
    <circle cx={24 - gap} cy={y} r={r} />
    <circle cx={24 + gap} cy={y} r={r} />
  </g>
);

const smile = (y: number): ReactElement => <path d={`M21 ${y} Q24 ${y + 3} 27 ${y}`} fill="none" strokeWidth={1.8} />;
const cheeks = (y: number): ReactElement => (
  <g fill="#ff8f9c" stroke="none" opacity={0.5}>
    <circle cx={15} cy={y} r={2.2} />
    <circle cx={33} cy={y} r={2.2} />
  </g>
);

const FACE: Readonly<Record<AvatarId, () => ReactElement>> = {
  dog: () => (
    <>
      <path d="M12 14 Q5 15 7 28 Q12 29 14 22 Z M36 14 Q43 15 41 28 Q36 29 34 22 Z" fill="#8a5a33" />
      <circle cx={24} cy={25} r={13} fill="#e6b47a" />
      <ellipse cx={24} cy={30.5} rx={6.5} ry={5} fill="#fbe8cf" />
      <ellipse cx={24} cy={27.5} rx={2.6} ry={2} fill={INK} stroke="none" />
      {eyes(22)}
      {smile(31)}
    </>
  ),
  cat: () => (
    <>
      <path d="M13 18 L12 6 L21 13 Z M35 18 L36 6 L27 13 Z" fill="#9aa3ad" />
      <circle cx={24} cy={26} r={13} fill="#b7c0c9" />
      <path d="M14 9.5 L16 13 M34 9.5 L32 13" fill="none" stroke="#f9c6d0" strokeWidth={2.4} />
      {eyes(24)}
      <path d="M22.5 27.5 L24 29 L25.5 27.5 Z" fill="#f08cc4" strokeWidth={1.4} />
      <path d="M21 31 Q22.5 32.5 24 31 Q25.5 32.5 27 31 M9 27 L16 28 M9 31 L16 30 M39 27 L32 28 M39 31 L32 30" fill="none" strokeWidth={1.4} />
    </>
  ),
  fox: () => (
    <>
      <path d="M12 19 L10 5 L21 13 Z M36 19 L38 5 L27 13 Z" fill="#f08a2e" />
      <path d="M11 22 Q12 10 24 10 Q36 10 37 22 Q35 34 24 39 Q13 34 11 22 Z" fill="#f59a3a" />
      <path d="M11.5 24 Q17 27 24 39 Q31 27 36.5 24 Q34 35 24 39 Q14 35 11.5 24 Z" fill="#ffffff" />
      {eyes(22, 5.5)}
      <ellipse cx={24} cy={33} rx={2.3} ry={1.8} fill={INK} stroke="none" />
    </>
  ),
  panda: () => (
    <>
      <circle cx={13} cy={13} r={5} fill={INK} />
      <circle cx={35} cy={13} r={5} fill={INK} />
      <circle cx={24} cy={25} r={13.5} fill="#ffffff" />
      <ellipse cx={18} cy={23} rx={3.6} ry={4.4} fill={INK} transform="rotate(-25 18 23)" />
      <ellipse cx={30} cy={23} rx={3.6} ry={4.4} fill={INK} transform="rotate(25 30 23)" />
      <g fill="#ffffff" stroke="none">
        <circle cx={18.6} cy={22.6} r={1.3} />
        <circle cx={29.4} cy={22.6} r={1.3} />
      </g>
      <ellipse cx={24} cy={29} rx={2.4} ry={1.8} fill={INK} stroke="none" />
      {smile(31.5)}
    </>
  ),
  frog: () => (
    <>
      <circle cx={16} cy={14} r={6} fill="#6cc37a" />
      <circle cx={32} cy={14} r={6} fill="#6cc37a" />
      <ellipse cx={24} cy={27} rx={15} ry={11.5} fill="#6cc37a" />
      <circle cx={16} cy={14} r={3.4} fill="#ffffff" />
      <circle cx={32} cy={14} r={3.4} fill="#ffffff" />
      <g fill={INK} stroke="none">
        <circle cx={16.5} cy={14.5} r={1.7} />
        <circle cx={32.5} cy={14.5} r={1.7} />
      </g>
      <path d="M15 28 Q24 36 33 28" fill="none" strokeWidth={2} />
      {cheeks(27)}
    </>
  ),
  owl: () => (
    <>
      <path d="M12 16 L11 6 L18 12 Z M36 16 L37 6 L30 12 Z" fill="#8a6fb0" />
      <path d="M10 22 Q10 10 24 10 Q38 10 38 22 Q38 37 24 39 Q10 37 10 22 Z" fill="#a689cf" />
      <circle cx={18} cy={22} r={5.6} fill="#ffffff" />
      <circle cx={30} cy={22} r={5.6} fill="#ffffff" />
      <g fill={INK} stroke="none">
        <circle cx={18} cy={22.5} r={2.4} />
        <circle cx={30} cy={22.5} r={2.4} />
      </g>
      <path d="M22 28 L26 28 L24 32 Z" fill="#ffb13b" />
      <path d="M17 34 Q18 32 19 34 M23 35 Q24 33 25 35 M29 34 Q30 32 31 34" fill="none" stroke="#7a5fa0" strokeWidth={1.4} />
    </>
  ),
  bunny: () => (
    <>
      <ellipse cx={18} cy={11} rx={4} ry={9.5} fill="#ffffff" transform="rotate(-10 18 11)" />
      <ellipse cx={30} cy={11} rx={4} ry={9.5} fill="#ffffff" transform="rotate(10 30 11)" />
      <ellipse cx={18} cy={11} rx={1.8} ry={6} fill="#f9b6d0" stroke="none" transform="rotate(-10 18 11)" />
      <ellipse cx={30} cy={11} rx={1.8} ry={6} fill="#f9b6d0" stroke="none" transform="rotate(10 30 11)" />
      <circle cx={24} cy={28} r={12} fill="#ffffff" />
      {eyes(26, 5)}
      <path d="M22.5 29.5 L24 31 L25.5 29.5 Z" fill="#f08cc4" strokeWidth={1.3} />
      <path d="M24 31 V33 M22 34 Q24 35.5 26 34" fill="none" strokeWidth={1.4} />
      {cheeks(31)}
    </>
  ),
  tiger: () => (
    <>
      <circle cx={13.5} cy={14} r={4.5} fill="#f59a3a" />
      <circle cx={34.5} cy={14} r={4.5} fill="#f59a3a" />
      <circle cx={24} cy={25.5} r={13.5} fill="#f8a948" />
      <path d="M24 12 V17 M19 12.8 L20 16.5 M29 12.8 L28 16.5 M10.8 22 L15 23.5 M10.8 28 L15 27.5 M37.2 22 L33 23.5 M37.2 28 L33 27.5" fill="none" strokeWidth={2.2} />
      <ellipse cx={24} cy={31} rx={6.5} ry={4.5} fill="#ffffff" />
      {eyes(23)}
      <ellipse cx={24} cy={29} rx={2.3} ry={1.7} fill={INK} stroke="none" />
      <path d="M22 32.5 Q24 34 26 32.5" fill="none" strokeWidth={1.4} />
    </>
  ),
};

export function AvatarArt(props: { id: AvatarId; className?: string | undefined; label?: string | undefined }): ReactElement {
  return (
    <Svg kind={`avatar avatar-${props.id}`} className={props.className} label={props.label}>
      <circle cx={24} cy={24} r={22.5} fill={AVATAR_BG[props.id]} strokeWidth={2} />
      {FACE[props.id]()}
    </Svg>
  );
}
