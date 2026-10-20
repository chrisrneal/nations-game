import type { ReactElement } from 'react';
import type { FriendType } from '@snacks/contracts';
import { FRIEND_COLOURS, INK } from './palette.ts';
import { Shadow, Svg } from './Svg.tsx';

/**
 * The five friends (RULES 5), each a playground kid standing on a round base
 * like a game piece, so friends never look like the hungry kids. Each is
 * known by its outline, and both its hat and the badge on its top hint at
 * how it throws:
 * - Straight: a castle-tower helmet (the rook) and a plus: up, down, sideways.
 * - Diagonal: a tall tipped hat (the bishop) and a cross: the diagonals.
 * - Short: a little crown (the king), a short round body and a ring: one step any way.
 * - Bouncer: a pony hood with ears (the knight) on a spring, and an L hop.
 * - Nurse: a nurse's cap with a heart, and a heart: heals, never throws.
 */
const SKIN = '#fbd9bd';

/** A white badge with an ink edge: the path drawn twice. */
function Badge(props: { d: string }): ReactElement {
  return (
    <>
      <path d={props.d} fill="none" strokeWidth={5.4} />
      <path d={props.d} fill="none" stroke="#ffffff" strokeWidth={2.6} />
    </>
  );
}

function Hat(props: { type: FriendType; colour: string }): ReactElement | null {
  const { colour } = props;
  switch (props.type) {
    case 'straight':
      return <path d="M14 15.5 V5.5 H18.2 V9 H21.8 V5.5 H26.2 V9 H29.8 V5.5 H34 V15.5 Z" fill={colour} />;
    case 'diagonal':
      return (
        <>
          <path d="M14.5 15 L30 2.5 L34 15 Z" fill={colour} />
          <path d="M21 9.5 L32 13" fill="none" stroke="#ffffff" strokeWidth={2} />
          <circle cx={30} cy={3} r={2.4} fill="#ffd23f" />
        </>
      );
    case 'short':
      return <path d="M15.5 13 L16 5.5 L20.2 9.2 L24 4 L27.8 9.2 L32 5.5 L32.5 13 Z" fill="#ffd23f" />;
    case 'bouncer':
      return (
        <>
          <path d="M14.5 13.5 L13 3 L21 9.5 Z M33.5 13.5 L35 3 L27 9.5 Z" fill={colour} />
          <path d="M13.2 23 Q12 9 24 9 Q36 9 34.8 23" fill="none" stroke={colour} strokeWidth={4.5} />
          <path d="M13.2 23 Q12 9 24 9 Q36 9 34.8 23" fill="none" strokeWidth={1.4} />
          <path d="M21 9.5 Q23 3.5 27.5 7.5 Q25 6.5 24.5 9.5" fill="#7a4421" strokeWidth={1.6} />
        </>
      );
    case 'nurse':
      return (
        <>
          <path d="M15 13 L16.5 5.5 Q24 3 31.5 5.5 L33 13 Q24 10.5 15 13 Z" fill="#ffffff" />
          <path d="M24 11 C21 8.6 21.6 6.4 23 6.4 C23.6 6.4 24 7 24 7.4 C24 7 24.4 6.4 25 6.4 C26.4 6.4 27 8.6 24 11 Z" fill={colour} strokeWidth={1.2} />
        </>
      );
  }
}

const BADGE: Readonly<Record<Exclude<FriendType, 'nurse'>, string>> = {
  straight: 'M24 31.5 V40.5 M19.5 36 H28.5',
  diagonal: 'M20.5 32.5 L27.5 39.5 M27.5 32.5 L20.5 39.5',
  short: 'M24 32.4 V32.4 M26.5 33.5 V33.5 M27.6 36 V36 M26.5 38.5 V38.5 M24 39.6 V39.6 M21.5 38.5 V38.5 M20.4 36 V36 M21.5 33.5 V33.5',
  bouncer: 'M21.5 31.5 V39.5 H28 M26 37.5 L28 39.5 L26 41.5',
};

export function FriendArt(props: { type: FriendType; className?: string | undefined; label?: string | undefined }): ReactElement {
  const { type } = props;
  const colour = FRIEND_COLOURS[type];
  const short = type === 'short';
  const body = short ? 'M10.5 43 Q10.5 30 24 30 Q37.5 30 37.5 43 Z' : 'M13 43 Q13 29.5 24 29 Q35 29.5 35 43 Z';
  return (
    <Svg kind={`friend friend-${type}`} className={props.className} label={props.label}>
      <Shadow cy={44.5} rx={15} />
      <ellipse className="friend-base" cx={24} cy={42.5} rx={15.5} ry={4.5} fill={colour} />
      {type === 'bouncer' && <path d="M17 44 L31 41.5 L17 39 L31 36.5" fill="none" strokeWidth={2.4} stroke="#8f9aa3" />}
      <path d={type === 'bouncer' ? 'M13 37 Q13 29.5 24 29 Q35 29.5 35 37 Z' : body} fill={colour} />
      <circle cx={short ? 10.5 : 12.5} cy={31.5} r={3.2} fill={SKIN} />
      <circle cx={short ? 37.5 : 35.5} cy={31.5} r={3.2} fill={SKIN} />
      <circle cx={24} cy={short ? 21 : 19.5} r={9.6} fill={SKIN} />
      <g transform={short ? 'translate(0 1.5)' : undefined}>
        <path d="M19.4 19.8 Q21 18 22.6 19.8 M25.4 19.8 Q27 18 28.6 19.8" fill="none" strokeWidth={1.7} />
        <path d="M21.2 23 Q24 25.8 26.8 23" fill="none" strokeWidth={1.7} />
        <circle cx={18.5} cy={23} r={1.7} fill="#ff8f9c" stroke="none" opacity={0.55} />
        <circle cx={29.5} cy={23} r={1.7} fill="#ff8f9c" stroke="none" opacity={0.55} />
        <Hat type={type} colour={colour} />
      </g>
      {type === 'nurse' ? (
        <path d="M24 41 C16.5 36 18 30.5 21.2 30.5 C22.8 30.5 24 32 24 33 C24 32 25.2 30.5 26.8 30.5 C30 30.5 31.5 36 24 41 Z" fill="#ffffff" strokeWidth={1.8} />
      ) : (
        <g transform={type === 'bouncer' ? 'translate(0 -3) scale(1)' : undefined}>
          <Badge d={BADGE[type]} />
        </g>
      )}
      {short && <circle cx={24} cy={36} r={1} fill={INK} stroke="none" />}
    </Svg>
  );
}
