import type { ReactElement } from 'react';
import { FriendArt } from './Friend.tsx';
import { Icon, type IconName } from './Icons.tsx';
import { INK } from './palette.ts';
import { LunchboxArt } from './Scenery.tsx';
import { SnackArt } from './Snack.tsx';
import { Svg } from './Svg.tsx';
import type { FriendType, SnackId } from '@snacks/contracts';

/**
 * The sticker book's pictures (RULES 9a, K12): each sticker is a picture the
 * game already draws, on a backing whose SHAPE says which page it is on
 * (a circle, a square, a scalloped flower, a hexagon, a gold star), so a page
 * can be told apart without colour or words. A sticker not yet earned is the
 * same drawing as a silhouette (CSS), still its own shape. No text anywhere.
 */

/** A closed outline of `spikes` spikes (so 2 x spikes corners) alternating between two radii (equal radii: a regular polygon). */
function outline(spikes: number, outer: number, inner: number): string {
  const corners = Array.from({ length: spikes * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    return `${(24 + r * Math.cos(a)).toFixed(2)} ${(24 + r * Math.sin(a)).toFixed(2)}`;
  });
  return `M${corners.join(' L')} Z`;
}

/** The backing for each page: its shape tells the pages apart without colour. */
const BACKING: Readonly<Record<string, { fill: string; shape: () => ReactElement }>> = {
  snacks: { fill: '#fff3c4', shape: () => <circle cx={24} cy={24} r={21.5} /> },
  friends: { fill: '#d6ecff', shape: () => <rect x={3.5} y={3.5} width={41} height={41} rx={10} /> },
  sky: { fill: '#ffdbe8', shape: () => <path d={outline(10, 22, 18.4)} /> },
  school: { fill: '#dff3d4', shape: () => <path d={outline(3, 22, 22)} /> },
  gold: { fill: '#ffd23f', shape: () => <path d={outline(8, 23, 15.5)} /> },
};

const ICONS: Readonly<Record<string, IconName>> = { sun: 'sun', moon: 'moon', sunrise: 'sunrise', balloon: 'balloon', party: 'party', sparkle: 'sparkle', house: 'house', trophy: 'trophy', bulb: 'bulb', heart: 'heart', basket: 'basket', plaster: 'plaster' };

function Picture(props: { page: string; key_: string }): ReactElement | null {
  const { page, key_ } = props;
  if (page === 'snacks' || page === 'gold') return <SnackArt snack={key_ as SnackId} />;
  if (page === 'friends') return key_ === 'lunchbox' ? <LunchboxArt snack="apple" colour="red" /> : <FriendArt type={key_ as FriendType} />;
  const icon = ICONS[key_];
  return icon === undefined ? null : <Icon name={icon} />;
}

/** The ids of the stickers this file can draw: every catalogue sticker must be among them. */
export const STICKER_PICTURE_IDS: readonly string[] = [
  ...['apple', 'cookie', 'banana', 'cheese', 'pretzel', 'grapes'].map((k) => `snacks-${k}`),
  ...['straight', 'diagonal', 'short', 'bouncer', 'nurse', 'lunchbox'].map((k) => `friends-${k}`),
  ...Object.keys(ICONS)
    .filter((k) => ['sun', 'moon', 'sunrise', 'balloon', 'party', 'sparkle'].includes(k))
    .map((k) => `sky-${k}`),
  ...Object.keys(ICONS)
    .filter((k) => ['house', 'trophy', 'bulb', 'heart', 'basket', 'plaster'].includes(k))
    .map((k) => `school-${k}`),
  ...['apple', 'cookie', 'banana', 'cheese', 'pretzel', 'grapes'].map((k) => `gold-${k}`),
];

/** One sticker, earned (in colour) or not yet (a silhouette). Sized by its parent. */
export function StickerArt(props: { id: string; locked?: boolean; className?: string | undefined; label?: string | undefined }): ReactElement {
  const dash = props.id.indexOf('-');
  const page = props.id.slice(0, dash);
  const key = props.id.slice(dash + 1);
  const back = BACKING[page] ?? BACKING.snacks!;
  const label = props.locked === true ? undefined : props.label;
  return (
    <span className={`sticker sticker-${page}${props.locked === true ? ' sticker-locked' : ''}${props.className === undefined ? '' : ` ${props.className}`}`} data-sticker={props.id} role={label === undefined ? undefined : 'img'} aria-label={label} aria-hidden={label === undefined ? true : undefined}>
      <Svg kind={`sticker-back sticker-back-${page}`} line={2.2}>
        <g fill={back.fill} stroke={INK}>
          {back.shape()}
        </g>
      </Svg>
      <span className="sticker-pic">
        <Picture page={page} key_={key} />
      </span>
    </span>
  );
}
