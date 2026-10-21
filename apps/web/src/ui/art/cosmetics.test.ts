import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FriendType, KidLook } from '@snacks/contracts';
import { Avatar } from '../Avatar.tsx';
import { AvatarCosmetics, COSMETIC_COLOURS, COSMETIC_IDS, COSMETIC_OWN_COLOURS } from './Cosmetics.tsx';
import { FriendArt } from './Friend.tsx';
import { HAT, KidArt, KidHead } from './Kid.tsx';

/**
 * Hats and outfits go on the player's own avatar and NEVER on kids (RULES 9a,
 * K12). Kids' hats, glasses and backpacks are clue attributes ("the kid in
 * the hat"), and a friend's hat and badge hint at its pattern (K10), so a
 * cosmetic on either would be a false signal. These tests fail if one ever
 * gets there.
 */

const UI = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file: string): string => readFileSync(join(UI, file), 'utf8');
const markup = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el);

const FRIENDS: readonly FriendType[] = ['straight', 'diagonal', 'short', 'bouncer', 'nurse'];
const ALL_LOOKS: KidLook[] = [0, 1, 2, 3, 4, 5].flatMap((shirt) =>
  [false, true].flatMap((hat) => [false, true].flatMap((glasses) => [false, true].map((backpack) => ({ shirt, hat, glasses, backpack, sister: 0 }) satisfies KidLook))),
);

/** Every file that draws or labels a kid, a clue about one, or a friend. */
const KID_AND_CLUE_FILES = ['art/Kid.tsx', 'art/Friend.tsx', 'art/Marks.tsx', 'KidBadge.tsx', 'ClueCard.tsx', 'Board.tsx', 'ResultOverlay.tsx', 'Shop.tsx', 'Diagram.tsx'];

function uiFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? uiFiles(join(dir, e.name)).map((f) => join(e.name, f)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [e.name] : []));
}

describe('cosmetics never go on kids or friends (RULES 9a)', () => {
  it('the files that draw kids, clues and friends do not know cosmetics exist', () => {
    for (const file of KID_AND_CLUE_FILES) {
      const text = source(file);
      expect(text, file).not.toMatch(/Cosmetics|Stickers|\bworn\b|cosmetic|outfit/i);
    }
  });

  it('only the avatar draws a hat or outfit: nothing else imports the cosmetics drawing', () => {
    const importers = uiFiles(UI).filter((f) => /from '(\.\.?\/)+(art\/)?Cosmetics\.tsx'|from '\.\/Cosmetics\.tsx'/.test(source(f)));
    expect(importers.sort()).toEqual(['Avatar.tsx']);
  });

  it('a kid is drawn the same whatever a child wears: KidArt and KidHead take no cosmetic and never draw one', () => {
    const items = COSMETIC_OWN_COLOURS;
    for (const look of ALL_LOOKS) {
      const plain = markup(h(KidArt, { id: 3, look }));
      expect(plain).not.toContain('cosmetic');
      for (const colour of items) expect(plain.toLowerCase()).not.toContain(colour.toLowerCase());
    }
    for (const mood of ['ok', 'yum', 'ache', 'sad'] as const) expect(markup(h(KidHead, { id: 2, mood }))).not.toContain('cosmetic');
    // @ts-expect-error a kid has no `worn`: if KidArt ever accepts one, this stops compiling.
    h(KidArt, { id: 1, look: ALL_LOOKS[0]!, worn: { hat: 'crown', outfit: null } });
  });

  it('a friend is drawn the same whatever a child wears: its hat and badge say its pattern, nothing else', () => {
    for (const type of FRIENDS) {
      const plain = markup(h(FriendArt, { type }));
      expect(plain).not.toContain('cosmetic');
      for (const colour of COSMETIC_OWN_COLOURS) expect(plain.toLowerCase()).not.toContain(colour.toLowerCase());
    }
    // @ts-expect-error a friend has no `worn` either.
    h(FriendArt, { type: 'straight', worn: { hat: 'crown', outfit: null } });
  });

  it('no hat or outfit is drawn in the clue hat’s blue, so none can be read as "the kid in the hat"', () => {
    const colours = Object.values(COSMETIC_COLOURS).map((c) => c.toLowerCase());
    expect(colours).not.toContain(HAT.toLowerCase());
    for (const id of COSMETIC_IDS) {
      const draw = markup(h(AvatarCosmetics, { worn: { hat: id, outfit: null } }));
      const drawOutfit = markup(h(AvatarCosmetics, { worn: { hat: null, outfit: id } }));
      expect((draw + drawOutfit).toLowerCase()).not.toContain(HAT.toLowerCase());
    }
  });
});

describe('what the avatar wears', () => {
  it('draws nothing when nothing is worn, and a layer over the face when something is', () => {
    expect(markup(h(AvatarCosmetics, { worn: undefined }))).toBe('');
    expect(markup(h(AvatarCosmetics, { worn: { hat: null, outfit: null } }))).toBe('');
    const dressed = markup(h(Avatar, { id: 'dog', size: 40, worn: { hat: 'party-hat', outfit: 'scarf' } }));
    expect(dressed).toContain('cosmetic-layer');
    expect(dressed).toContain('data-cosmetic="party-hat scarf"');
    expect(markup(h(Avatar, { id: 'dog', size: 40 }))).not.toContain('cosmetic');
  });

  it('draws every hat and outfit differently, with no text in them', () => {
    const seen = new Map<string, string>();
    for (const id of COSMETIC_IDS) {
      const slot = id === 'party-hat' || id === 'crown' ? { hat: id, outfit: null } : { hat: null, outfit: id };
      const svg = markup(h(AvatarCosmetics, { worn: slot }));
      expect(svg, id).not.toMatch(/<text|<title|<desc/);
      const plain = svg.replace(/#[0-9a-fA-F]{3,8}\b/g, 'C').replace(/data-cosmetic="[^"]*"/, '');
      expect(seen.get(plain), `${id} and ${seen.get(plain)} differ only in colour`).toBeUndefined();
      seen.set(plain, id);
    }
    expect([...COSMETIC_IDS].sort()).toEqual(['cape', 'crown', 'party-hat', 'scarf']);
  });
});
