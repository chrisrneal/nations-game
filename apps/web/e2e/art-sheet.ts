/**
 * The art sheet (docs/ART.md): every picture in the game on one page,
 * rendered by the real components and photographed in headless Chromium.
 * `npx tsx e2e/art-sheet.ts out.png` (from apps/web). A tool for drawing and
 * reviewing the art, not a test; the tests are art.test.ts and the visual
 * check.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createElement as h, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright-core';
import type { AvatarId, FriendType, KidLook, SnackId } from '@snacks/contracts';
import { AvatarArt } from '../src/ui/art/Avatars.tsx';
import { FriendArt } from '../src/ui/art/Friend.tsx';
import { ICON_NAMES, Icon } from '../src/ui/art/Icons.tsx';
import { KidArt, KidHead } from '../src/ui/art/Kid.tsx';
import { FactIcons, FeatureIcon, TraitIcon } from '../src/ui/art/Marks.tsx';
import { LunchboxArt, ObstacleArt, TableArt } from '../src/ui/art/Scenery.tsx';
import { SnackArt } from '../src/ui/art/Snack.tsx';

const SNACKS: [SnackId, string][] = [
  ['apple', 'red'],
  ['cookie', 'brown'],
  ['banana', 'yellow'],
  ['cheese', 'orange'],
  ['pretzel', 'brown'],
  ['grapes', 'green'],
];
const FRIENDS: FriendType[] = ['straight', 'diagonal', 'short', 'bouncer', 'nurse'];
const AVATARS: AvatarId[] = ['dog', 'cat', 'fox', 'panda', 'frog', 'owl', 'bunny', 'tiger'];
const look = (o: Partial<KidLook>): KidLook => ({ shirt: 0, hat: false, glasses: false, backpack: false, sister: 0, ...o });

function row(title: string, items: ReactElement[], size: number): string {
  const cells = items.map((el) => `<div class="cell" style="width:${size}px;height:${size}px">${renderToStaticMarkup(el)}</div>`).join('');
  return `<h2>${title}</h2><div class="row">${cells}</div>`;
}

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const body = [
  row('Snacks', SNACKS.map(([s]) => h(SnackArt, { snack: s })), 64),
  row('Lunchboxes', SNACKS.map(([s, c]) => h(LunchboxArt, { snack: s, colour: c })), 64),
  row('Snacks at board size (40 px)', SNACKS.map(([s, c]) => h(LunchboxArt, { snack: s, colour: c })), 40),
  row('Colours, feel, taste, shape', [
    ...['red', 'brown', 'yellow', 'orange', 'green'].map((v) => h(TraitIcon, { trait: 'colour', value: v })),
    ...['crunchy', 'soft'].map((v) => h(TraitIcon, { trait: 'feel', value: v })),
    ...['sweet', 'salty'].map((v) => h(TraitIcon, { trait: 'taste', value: v })),
    ...['round', 'long', 'twisty'].map((v) => h(TraitIcon, { trait: 'shape', value: v })),
    h(FeatureIcon, { feature: 'hat', same: true }),
    h(FeatureIcon, { feature: 'glasses', same: true }),
    h(FeatureIcon, { feature: 'sister', not: true }),
    h(TraitIcon, { trait: 'colour', value: 'red', not: true }),
    h(TraitIcon, { trait: 'feel', value: 'soft', not: true }),
  ], 28),
  row('A clue: Something sweet, not red', [h(FactIcons, { facts: [{ kind: 'is', trait: 'taste', value: 'sweet' }, { kind: 'not', trait: 'colour', value: 'red' }] })], 64),
  row('Kids: six shirts', [0, 1, 2, 3, 4, 5].map((s) => h(KidArt, { id: s + 1, look: look({ shirt: s }) })), 64),
  row('Kids: hat, glasses, backpack, all, sisters', [
    h(KidArt, { id: 7, look: look({ shirt: 3, hat: true }) }),
    h(KidArt, { id: 8, look: look({ shirt: 1, glasses: true }) }),
    h(KidArt, { id: 9, look: look({ shirt: 4, backpack: true }) }),
    h(KidArt, { id: 10, look: look({ shirt: 2, hat: true, glasses: true, backpack: true }) }),
    h(KidArt, { id: 11, look: look({ shirt: 5, sister: 1 }) }),
    h(KidArt, { id: 12, look: look({ shirt: 5, sister: 1, glasses: true }) }),
  ], 64),
  `<h2>Moods: ok, yum, ache, sad</h2><div class="row">${(['ok', 'yum', 'ache', 'sad'] as const).map((m) => `<div class="cell" data-mood="${m}" style="width:64px;height:64px">${renderToStaticMarkup(h(KidArt, { id: 3, look: look({ shirt: 0 }) }))}</div>`).join('')}${(['ok', 'yum', 'ache', 'sad'] as const).map((m) => `<div class="cell" style="width:40px;height:40px">${renderToStaticMarkup(h(KidHead, { id: 4, mood: m }))}</div>`).join('')}</div>`,
  row('Friends', FRIENDS.map((t) => h(FriendArt, { type: t })), 64),
  row('Friends at board size (40 px)', FRIENDS.map((t) => h(FriendArt, { type: t })), 40),
  row('Obstacles and the parents’ table', [h(ObstacleArt, { kind: 'tree' }), h(ObstacleArt, { kind: 'bench' }), h(ObstacleArt, { kind: 'sandpit' }), h(TableArt, {})], 64),
  row('Avatars', AVATARS.map((a) => h(AvatarArt, { id: a })), 64),
  row('Icons', ICON_NAMES.map((n) => h(Icon, { name: n })), 32),
].join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
body{background:#fff8ec;padding:12px;font-family:system-ui;height:auto}
#sheet h2{font-size:13px;margin:10px 0 4px}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cell{display:grid;place-items:center;background:#ffffff;border-radius:8px}
.cell svg{width:100%;height:100%}
.facts svg{width:28px;height:28px}
</style></head><body><div id="sheet">${body}</div></body></html>`;

const out = process.argv[2] ?? 'art-sheet.png';
const exe = ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => existsSync(p));
const browser = await chromium.launch(exe === undefined ? {} : { executablePath: exe });
const page = await browser.newPage({ viewport: { width: 560, height: 400 }, deviceScaleFactor: Number(process.env.DPR ?? 2) });
await page.setContent(html);
await page.locator('#sheet').screenshot({ path: out });
await browser.close();
console.log(`wrote ${out}`);
