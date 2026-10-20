import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AvatarId, FriendType, KidLook, SnackId } from '@snacks/contracts';
import { AvatarArt } from './Avatars.tsx';
import { FriendArt } from './Friend.tsx';
import { ICON_NAMES, Icon } from './Icons.tsx';
import { KidArt, KidHead } from './Kid.tsx';
import { FeatureIcon, TraitIcon } from './Marks.tsx';
import { SHIRTS, SNACK_COLOURS, SNACK_DRAWN } from './palette.ts';
import { LunchboxArt, ObstacleArt, TableArt } from './Scenery.tsx';
import { SnackArt } from './Snack.tsx';

/**
 * The art must be readable without colour (K9, docs/ART.md): a picture with
 * every colour taken out must still be different from every other picture
 * of its kind. These tests fail if two snacks, lunchbox tags, shirts,
 * friends, avatars or clue pictures would differ only in colour, and if any
 * picture could put text on the page (Kindy, RULES 11).
 */

const SNACKS: readonly SnackId[] = ['apple', 'cookie', 'banana', 'cheese', 'pretzel', 'grapes'];
const FRIENDS: readonly FriendType[] = ['straight', 'diagonal', 'short', 'bouncer', 'nurse'];
const AVATARS: readonly AvatarId[] = ['dog', 'cat', 'fox', 'panda', 'frog', 'owl', 'bunny', 'tiger'];
const look = (o: Partial<KidLook> = {}): KidLook => ({ shirt: 0, hat: false, glasses: false, backpack: false, sister: 0, ...o });

const markup = (el: ReactElement): string => renderToStaticMarkup(el);

/** The picture with every colour made the same, its class names and clip ids taken out: what a colour-blind eye gets. */
export function withoutColour(svg: string): string {
  return svg
    .replace(/#[0-9a-fA-F]{3,8}\b/g, 'C')
    .replace(/(fill|stroke)="(?!none)[a-z]+"/g, '$1="C"')
    .replace(/ class="[^"]*"/g, '')
    .replace(/(id="|url\(#)[^")]*/g, '$1x');
}

function allDifferent(name: string, pictures: readonly [string, ReactElement][]): void {
  const seen = new Map<string, string>();
  for (const [what, el] of pictures) {
    const plain = withoutColour(markup(el));
    expect(seen.get(plain), `${name}: ${what} and ${seen.get(plain)} differ only in colour`).toBeUndefined();
    seen.set(plain, what);
  }
}

describe('the art can be read without colour (K9)', () => {
  it('the colour-blind view catches two pictures that differ only in colour', () => {
    const red = '<svg><path d="M0 0" fill="#e8483f"/></svg>';
    const green = '<svg><path d="M0 0" fill="#79c64e"/></svg>';
    expect(withoutColour(red)).toBe(withoutColour(green));
  });

  it('no two snacks differ only in colour', () => {
    allDifferent(
      'snacks',
      SNACKS.map((s) => [s, h(SnackArt, { snack: s })]),
    );
    const drawn = SNACKS.map((s) => `${SNACK_DRAWN[s].silhouette} / ${SNACK_DRAWN[s].pattern}`);
    expect(new Set(drawn).size).toBe(SNACKS.length);
    expect(new Set(SNACKS.map((s) => SNACK_DRAWN[s].silhouette)).size).toBe(SNACKS.length);
  });

  it('every snack colour has its own mark, and the marks differ in shape', () => {
    const marks = Object.values(SNACK_COLOURS).map((c) => c.mark);
    expect(new Set(marks).size).toBe(marks.length);
    allDifferent(
      'colour chips',
      Object.keys(SNACK_COLOURS).map((c) => [c, h(TraitIcon, { trait: 'colour', value: c })]),
    );
  });

  it('a lunchbox tag carries its colour’s mark, so boxes of different colours differ without colour', () => {
    for (const [a, colourA] of [
      ['apple', 'red'],
      ['banana', 'yellow'],
    ] as const) {
      for (const colourB of Object.keys(SNACK_COLOURS).filter((c) => c !== colourA)) {
        const one = withoutColour(markup(h(LunchboxArt, { snack: a, colour: colourA })));
        const other = withoutColour(markup(h(LunchboxArt, { snack: a, colour: colourB })));
        expect(one, `${colourA} and ${colourB} tags`).not.toBe(other);
      }
    }
  });

  it('every shirt has its own colour and its own pattern, so sisters match and nobody else does', () => {
    expect(SHIRTS).toHaveLength(6);
    expect(new Set(SHIRTS.map((s) => s.pattern)).size).toBe(6);
    expect(new Set(SHIRTS.map((s) => s.fill)).size).toBe(6);
    allDifferent(
      'shirts',
      SHIRTS.map((_, shirt) => [`shirt ${shirt}`, h(KidArt, { id: 1, look: look({ shirt, sister: 1 }) })]),
    );
    // Sisters (one sister group, one shirt) are drawn alike, glasses aside.
    const sister = (id: number): string => markup(h(KidArt, { id, look: look({ shirt: 2, sister: 3 }) }));
    expect(withoutColour(sister(4))).toBe(withoutColour(sister(9)));
  });

  it('the hat, the glasses and the backpack each show, without colour', () => {
    const plain = withoutColour(markup(h(KidArt, { id: 1, look: look() })));
    for (const feature of ['hat', 'glasses', 'backpack'] as const) {
      const html = markup(h(KidArt, { id: 1, look: look({ [feature]: true }) }));
      expect(withoutColour(html), feature).not.toBe(plain);
      expect(html).toContain(feature === 'backpack' ? 'kid-pack' : `kid-${feature}`);
    }
    expect(markup(h(KidArt, { id: 1, look: look() }))).not.toMatch(/kid-hat|kid-glasses|kid-pack/);
  });

  it('a kid has every face drawn, for the replay to show one', () => {
    const html = markup(h(KidArt, { id: 1, look: look() }));
    for (const mood of ['ok', 'yum', 'ache', 'sad']) expect(html).toContain(`face-${mood}`);
    allDifferent(
      'moods',
      (['ok', 'yum', 'ache', 'sad'] as const).map((m) => [m, h(KidHead, { id: 1, mood: m })]),
    );
  });

  it('no two friends differ only in colour', () => {
    allDifferent(
      'friends',
      FRIENDS.map((t) => [t, h(FriendArt, { type: t })]),
    );
  });

  it('no two avatars differ only in colour', () => {
    allDifferent(
      'avatars',
      AVATARS.map((a) => [a, h(AvatarArt, { id: a })]),
    );
  });

  it('every clue picture differs from every other, and "not" changes it', () => {
    const traits = [
      ['feel', 'crunchy'],
      ['feel', 'soft'],
      ['taste', 'sweet'],
      ['taste', 'salty'],
      ['shape', 'round'],
      ['shape', 'long'],
      ['shape', 'twisty'],
    ] as const;
    allDifferent('clue pictures', [
      ...traits.map(([trait, value]): [string, ReactElement] => [value, h(TraitIcon, { trait, value })]),
      ...traits.map(([trait, value]): [string, ReactElement] => [`not ${value}`, h(TraitIcon, { trait, value, not: true })]),
      ...Object.keys(SNACK_COLOURS).map((c): [string, ReactElement] => [`not ${c}`, h(TraitIcon, { trait: 'colour', value: c, not: true })]),
      ['same hat', h(FeatureIcon, { feature: 'hat', same: true })],
      ['same glasses', h(FeatureIcon, { feature: 'glasses', same: true })],
      ['not sister', h(FeatureIcon, { feature: 'sister', not: true })],
    ]);
  });

  it('no picture holds text, so Kindy shows none (RULES 11)', () => {
    const everything: ReactElement[] = [
      ...SNACKS.map((s) => h(SnackArt, { snack: s })),
      ...SNACKS.map((s) => h(LunchboxArt, { snack: s, colour: 'red' })),
      ...FRIENDS.map((t) => h(FriendArt, { type: t })),
      ...AVATARS.map((a) => h(AvatarArt, { id: a })),
      ...ICON_NAMES.map((n) => h(Icon, { name: n })),
      h(KidArt, { id: 1, look: look({ hat: true, glasses: true, backpack: true }) }),
      h(ObstacleArt, { kind: 'tree' }),
      h(ObstacleArt, { kind: 'bench' }),
      h(ObstacleArt, { kind: 'sandpit' }),
      h(TableArt, {}),
    ];
    for (const el of everything) {
      const html = markup(el);
      expect(html).not.toMatch(/<text|<title|<desc|<foreignObject/);
      // Nothing between tags: no text node at all.
      expect(html.replace(/<[^>]*>/g, '').trim()).toBe('');
    }
  });

  it('a picture is hidden from screen readers unless it is given a name', () => {
    expect(markup(h(SnackArt, { snack: 'apple' }))).toContain('aria-hidden="true"');
    const named = markup(h(SnackArt, { snack: 'apple', label: 'Apple' }));
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Apple"');
  });
});
