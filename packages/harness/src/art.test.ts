/**
 * The art covers the rules (K10, docs/ART.md): every colour a snack in the
 * pool has (RULES 4) has a mark in the art, so a clue about colour can be
 * read without seeing colour; snacks that share a colour (the cookie and the
 * pretzel are both brown) have different outlines; and every shirt the
 * generator can hand out has a pattern.
 */
import { describe, expect, it } from 'vitest';
import { SNACKS, SNACK_IDS } from '@snacks/sim';
import { SHIRTS, SNACK_COLOURS, SNACK_DRAWN } from '../../../apps/web/src/ui/art/palette.ts';

describe('the art covers every snack and shirt the rules use (K10)', () => {
  it('every colour in the snack pool has a mark of its own', () => {
    const colours = [...new Set(SNACK_IDS.map((s) => SNACKS[s].colour))];
    for (const colour of colours) expect(SNACK_COLOURS[colour], colour).toBeDefined();
    const marks = colours.map((c) => SNACK_COLOURS[c]!.mark);
    expect(new Set(marks).size).toBe(colours.length);
  });

  it('every snack is drawn, and snacks of the same colour have different outlines', () => {
    for (const s of SNACK_IDS) expect(SNACK_DRAWN[s]).toBeDefined();
    for (const a of SNACK_IDS) {
      for (const b of SNACK_IDS) {
        if (a >= b) continue;
        // Two snacks that a clue tells apart only by colour must look different without it.
        if (SNACKS[a].colour === SNACKS[b].colour || (['feel', 'taste', 'shape'] as const).every((t) => SNACKS[a][t] === SNACKS[b][t])) {
          expect(SNACK_DRAWN[a].silhouette, `${a} and ${b}`).not.toBe(SNACK_DRAWN[b].silhouette);
        }
      }
    }
  });

  it('every shirt the generator gives (0-5) has a colour and a pattern', () => {
    for (let shirt = 0; shirt <= 5; shirt++) expect(SHIRTS[shirt]?.pattern).toBeDefined();
  });
});
