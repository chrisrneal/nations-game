import { useId, type ReactElement } from 'react';
import type { KidLook } from '@snacks/contracts';
import { HAIRS, INK, SHIRTS, SKINS, type ShirtPattern } from './palette.ts';
import { Shadow, Svg, clipId } from './Svg.tsx';

/**
 * A hungry kid (RULES 6): a big round head, a shirt in one of six colours,
 * each with its own pattern (stripes, dots, a star, checks, zigzags, a heart),
 * and the things clues point at drawn big enough to see on a phone: a blue
 * sun hat, round glasses, a backpack's straps and sides. Sisters share their
 * shirt, and their hair too, so they look alike.
 *
 * Every face is drawn and CSS shows one (`data-mood` on an ancestor, set by
 * the replay without a render, P7): ok, yum (fed), ache, sad (hungry).
 */
export type Mood = 'ok' | 'yum' | 'ache' | 'sad';

export const HAT = '#4f8fe0';
const PACK = '#5f8ea0';

function Pattern(props: { pattern: ShirtPattern; ink: string }): ReactElement {
  const { ink } = props;
  switch (props.pattern) {
    case 'stripes':
      return (
        <g fill={ink} stroke="none">
          <rect x={6} y={33.5} width={36} height={2.6} />
          <rect x={6} y={38.8} width={36} height={2.6} />
          <rect x={6} y={44} width={36} height={2.6} />
        </g>
      );
    case 'dots':
      return (
        <g fill={ink} stroke="none">
          {[
            [17, 35],
            [24, 33.5],
            [31, 35],
            [20.5, 40],
            [27.5, 40],
            [15, 44],
            [24, 44.5],
            [33, 44],
          ].map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={1.7} />
          ))}
        </g>
      );
    case 'star':
      return <path d="M24 33 L25.8 36.8 L29.9 37.2 L26.8 40 L27.7 44 L24 41.9 L20.3 44 L21.2 40 L18.1 37.2 L22.2 36.8 Z" fill={ink} stroke="none" />;
    case 'checks':
      return (
        <g fill={ink} stroke="none">
          {[0, 1, 2, 3].flatMap((row) =>
            [0, 1, 2, 3, 4, 5, 6].filter((col) => (row + col) % 2 === 0).map((col) => <rect key={`${row},${col}`} x={9 + col * 4.4} y={31 + row * 4.4} width={4.4} height={4.4} />),
          )}
        </g>
      );
    case 'zigzag':
      return <path d="M8 36 L12 33 L16 36 L20 33 L24 36 L28 33 L32 36 L36 33 L40 36 M8 43 L12 40 L16 43 L20 40 L24 43 L28 40 L32 43 L36 40 L40 43" fill="none" stroke={ink} strokeWidth={2.2} />;
    case 'heart':
      return <path d="M24 44.5 C17 39.5 18.5 34 21.5 34 C23 34 24 35.5 24 36.5 C24 35.5 25 34 26.5 34 C29.5 34 31 39.5 24 44.5 Z" fill={ink} stroke="none" />;
  }
}

function Hair(props: { style: number; colour: string; hat: boolean }): ReactElement {
  const cap = 'M13.5 18.5 Q13 8 24 8 Q35 8 34.5 18.5 Q30 13 24 13.5 Q18 13 13.5 18.5 Z';
  const fill = props.colour;
  switch (props.hat ? 0 : props.style % 4) {
    case 1:
      return (
        <g fill={fill}>
          <circle cx={14.5} cy={10.5} r={4.2} />
          <circle cx={33.5} cy={10.5} r={4.2} />
          <path d={cap} />
        </g>
      );
    case 2:
      return (
        <g fill={fill}>
          <ellipse cx={11.5} cy={23} rx={3} ry={4.8} />
          <ellipse cx={36.5} cy={23} rx={3} ry={4.8} />
          <path d={cap} />
        </g>
      );
    case 3:
      return <path d="M13.5 19.5 Q10.5 15 14 12 Q14 8 18.5 8 Q21 5.5 24 7 Q27 5.5 29.5 8 Q34 8 34 12 Q37.5 15 34.5 19.5 Q30 14 24 14.5 Q18 14 13.5 19.5 Z" fill={fill} />;
    default:
      return <path d={cap} fill={fill} />;
  }
}

function Faces(props: { only?: Mood | undefined }): ReactElement {
  const show = (mood: Mood): boolean => props.only === undefined || props.only === mood;
  return (
    <>
      {show('ok') && (
        <g className="face face-ok">
          <circle cx={20} cy={19.5} r={1.6} fill={INK} stroke="none" />
          <circle cx={28} cy={19.5} r={1.6} fill={INK} stroke="none" />
          <path d="M21 23.2 Q24 25.8 27 23.2" fill="none" strokeWidth={1.8} />
        </g>
      )}
      {show('yum') && (
        <g className="face face-yum">
          <path d="M18.3 20 Q20 17.6 21.7 20 M26.3 20 Q28 17.6 29.7 20" fill="none" strokeWidth={1.8} />
          <path d="M20 22.3 Q24 29 28 22.3 Z" fill="#9c3434" strokeWidth={1.6} />
          <path d="M22 25.6 Q24 24.4 26 25.6 Q24 27.6 22 25.6 Z" fill="#ff8a8a" stroke="none" />
        </g>
      )}
      {show('ache') && (
        <g className="face face-ache">
          <ellipse cx={24} cy={23.5} rx={8.5} ry={5} fill="#86cf6c" stroke="none" opacity={0.55} />
          <path d="M18.5 18.5 L21.5 20 L18.5 21.5 M29.5 18.5 L26.5 20 L29.5 21.5" fill="none" strokeWidth={1.6} />
          <path d="M20 25 Q21 23.4 22 25 Q23 26.6 24 25 Q25 23.4 26 25 Q27 26.6 28 25" fill="none" strokeWidth={1.6} />
          <path d="M33 12 Q31.5 15 33 16 Q34.5 15 33 12 Z" fill="#9fdcff" strokeWidth={1.2} />
        </g>
      )}
      {show('sad') && (
        <g className="face face-sad">
          <circle cx={20} cy={20} r={1.6} fill={INK} stroke="none" />
          <circle cx={28} cy={20} r={1.6} fill={INK} stroke="none" />
          <path d="M18 16.8 L21.5 17.8 M30 16.8 L26.5 17.8" fill="none" strokeWidth={1.5} />
          <path d="M21 25.6 Q24 23 27 25.6" fill="none" strokeWidth={1.8} />
          <path d="M18.6 21.8 Q17 25 18.6 26 Q20.2 25 18.6 21.8 Z" fill="#9fdcff" strokeWidth={1.1} />
        </g>
      )}
    </>
  );
}

/** Looks (skin, hair) from the kid's id, or from their sister group so sisters look alike. */
export function kidStyle(id: number, look: Pick<KidLook, 'sister'>): { skin: string; hair: string; hairStyle: number } {
  const seed = look.sister > 0 ? 50 + look.sister * 11 : id;
  return { skin: SKINS[(seed * 2 + 1) % SKINS.length]!, hair: HAIRS[(seed * 5 + 2) % HAIRS.length]!, hairStyle: (seed * 3) % 4 };
}

/** The head alone: Kindy's row of faces, the party. */
export function KidHead(props: { id: number; mood: Mood; className?: string | undefined; label?: string | undefined }): ReactElement {
  const style = kidStyle(props.id, { sister: 0 });
  return (
    <Svg kind="kid-head" box="9 3 30 30" className={props.className} label={props.label}>
      <circle cx={13.5} cy={20.5} r={2.6} fill={style.skin} />
      <circle cx={34.5} cy={20.5} r={2.6} fill={style.skin} />
      <circle cx={24} cy={19.5} r={10.6} fill={style.skin} />
      <Hair style={style.hairStyle} colour={style.hair} hat={false} />
      <circle cx={18} cy={23} r={1.9} fill="#ff8f9c" stroke="none" opacity={0.55} />
      <circle cx={30} cy={23} r={1.9} fill="#ff8f9c" stroke="none" opacity={0.55} />
      <Faces only={props.mood} />
    </Svg>
  );
}

export function KidArt(props: { id: number; look: KidLook; className?: string | undefined; label?: string | undefined }): ReactElement {
  const { look } = props;
  const shirt = SHIRTS[look.shirt % SHIRTS.length]!;
  const style = kidStyle(props.id, look);
  const clip = clipId(useId(), 'shirt');
  const body = 'M11 47 Q11 31 24 30 Q37 31 37 47 Z';
  return (
    <Svg kind="kid" className={props.className} label={props.label}>
      <Shadow cy={46} rx={13} />
      {look.backpack && <rect className="kid-pack" x={7.5} y={31} width={33} height={14} rx={5} fill={PACK} />}
      <clipPath id={clip}>
        <path d={body} />
      </clipPath>
      <path d={body} fill={shirt.fill} />
      <g clipPath={`url(#${clip})`}>
        <Pattern pattern={shirt.pattern} ink={shirt.ink} />
      </g>
      <path d={body} fill="none" />
      {look.backpack && <path className="kid-straps" d="M16.5 31.2 L15.5 46.5 M31.5 31.2 L32.5 46.5" fill="none" stroke="#3f6676" strokeWidth={3.2} />}
      <circle cx={13.5} cy={20.5} r={2.6} fill={style.skin} />
      <circle cx={34.5} cy={20.5} r={2.6} fill={style.skin} />
      <circle cx={24} cy={19.5} r={10.6} fill={style.skin} />
      <Hair style={style.hairStyle} colour={style.hair} hat={look.hat} />
      <circle cx={18} cy={23} r={1.9} fill="#ff8f9c" stroke="none" opacity={0.55} />
      <circle cx={30} cy={23} r={1.9} fill="#ff8f9c" stroke="none" opacity={0.55} />
      <Faces />
      {look.glasses && (
        <g className="kid-glasses">
          <circle cx={20} cy={19.7} r={4.4} fill="#e8f6ff" fillOpacity={0.35} strokeWidth={2.2} />
          <circle cx={28} cy={19.7} r={4.4} fill="#e8f6ff" fillOpacity={0.35} strokeWidth={2.2} />
          <path d="M23.6 19.2 Q24 18.4 24.4 19.2 M15.6 19 L13.6 18" fill="none" strokeWidth={2} />
        </g>
      )}
      {look.hat && (
        <g className="kid-hat">
          <path d="M14 14.5 Q14.5 4 24 4 Q33.5 4 34 14.5 Z" fill={HAT} />
          <path d="M14.6 12 Q24 9.8 33.4 12" fill="none" stroke="#ffd23f" strokeWidth={2.6} />
          <path d="M7 16.5 Q24 10 41 16.5 Q24 14.2 7 16.5 Z" fill={HAT} />
        </g>
      )}
    </Svg>
  );
}
