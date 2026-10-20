import { describe, expect, it } from 'vitest';
import type { Clue, KidLook, Puzzle, PuzzleKid, SnackId } from '@snacks/contracts';
import { clueProblems, clueText, directClues, wordCount } from './clues.ts';
import { fixturePuzzle } from './fixture.ts';

const plain: KidLook = { shirt: 0, hat: false, glasses: false, backpack: false, sister: 0 };

function kid(id: number, wave: number, wants: SnackId, clue: Clue, look: Partial<KidLook> = {}): PuzzleKid {
  return { id, wave, cell: id, wants, clue, look: { ...plain, ...look } };
}

function puzzleWith(kids: PuzzleKid[], snacks: SnackId[] = ['apple', 'banana', 'cheese']): Puzzle {
  return { ...fixturePuzzle(['a b h']), snacks, kids, waves: 2 };
}

const isRed: Clue = { facts: [{ kind: 'is', trait: 'colour', value: 'red' }] };
const isSoft: Clue = { facts: [{ kind: 'is', trait: 'feel', value: 'soft' }] };

describe('clue cards (RULES 6)', () => {
  it('read as short plain sentences', () => {
    expect(clueText({ facts: [{ kind: 'is', trait: 'feel', value: 'crunchy' }] })).toBe('Something crunchy');
    expect(clueText({ facts: [{ kind: 'not', trait: 'colour', value: 'red' }] })).toBe('Not red');
    expect(clueText({ facts: [{ kind: 'is', trait: 'taste', value: 'sweet' }, { kind: 'is', trait: 'shape', value: 'long' }] })).toBe('Something sweet and long');
    expect(clueText({ facts: [{ kind: 'not', trait: 'colour', value: 'red' }, { kind: 'not', trait: 'feel', value: 'soft' }] })).toBe('Not red, not soft');
    expect(clueText({ facts: [{ kind: 'same', feature: 'hat' }] })).toBe('Same as the kid in the hat'); // 7 words: the spec's own example (RULES 6)
    expect(clueText({ facts: [{ kind: 'is', trait: 'taste', value: 'sweet' }, { kind: 'notSister' }] })).toBe('Something sweet, not their sister’s');
  });

  it('the generator’s direct clues each pin exactly their snack, in six words or fewer', () => {
    const snacks: SnackId[] = ['apple', 'banana', 'cheese'];
    for (const target of snacks) {
      const clues = directClues([target], snacks);
      expect(clues.length).toBeGreaterThan(0);
      for (const c of clues) {
        expect(wordCount(clueText(c))).toBeLessThanOrEqual(6);
        const p = puzzleWith([kid(1, 1, target, c)], snacks);
        expect(clueProblems(p)).toEqual([]);
      }
    }
  });
});

describe('the clue checker (RULES 10)', () => {
  it('accepts a card that pins the snack the kid wants', () => {
    expect(clueProblems(puzzleWith([kid(1, 1, 'apple', isRed)]))).toEqual([]);
  });

  it('flags a card that leaves more than one snack, or the wrong one', () => {
    expect(clueProblems(puzzleWith([kid(1, 1, 'banana', isSoft)]))[0]).toMatch(/leaves 2/);
    expect(clueProblems(puzzleWith([kid(1, 1, 'banana', isRed)]))[0]).toMatch(/pins Apple/);
  });

  it('"same as the kid in the hat" works when that kid is the only one in a hat and their own card pins it', () => {
    const same: Clue = { facts: [{ kind: 'same', feature: 'hat' }] };
    expect(clueProblems(puzzleWith([kid(1, 1, 'apple', isRed, { hat: true }), kid(2, 1, 'apple', same)]))).toEqual([]);
    expect(clueProblems(puzzleWith([kid(1, 1, 'apple', isRed, { hat: true }), kid(2, 1, 'apple', same, { hat: true })]))[0]).toMatch(/no single kid/);
    // A kid from the wave before could still be on the board, healed, in a hat of their own.
    expect(clueProblems(puzzleWith([kid(3, 1, 'apple', isRed, { hat: true }), kid(1, 2, 'apple', isRed, { hat: true }), kid(2, 2, 'apple', same)]))).toContain('kid 2: no single kid with hat');
  });

  it('allows only one logic step: the kid pointed at must be pinned by their own card', () => {
    const same: Clue = { facts: [{ kind: 'same', feature: 'glasses' }] };
    const sameHat: Clue = { facts: [{ kind: 'same', feature: 'hat' }] };
    const p = puzzleWith([kid(1, 1, 'apple', isRed, { hat: true }), kid(2, 1, 'apple', sameHat, { glasses: true }), kid(3, 1, 'apple', same)]);
    expect(clueProblems(p)).toContain('kid 3: the kid with glasses is not pinned by their own card');
  });

  it('"not their sister’s" removes the sister’s snack', () => {
    const notSister: Clue = { facts: [{ kind: 'is', trait: 'feel', value: 'soft' }, { kind: 'notSister' }] };
    const sisters = [kid(1, 1, 'cheese', { facts: [{ kind: 'is', trait: 'taste', value: 'salty' }] }, { sister: 1 }), kid(2, 1, 'banana', notSister, { sister: 1 })];
    expect(clueProblems(puzzleWith(sisters))).toEqual([]);
    expect(clueProblems(puzzleWith([sisters[0]!, kid(2, 1, 'banana', notSister)]))[0]).toMatch(/no sister/);
  });

  it('Kindy kids carry no clue', () => {
    const p = { ...puzzleWith([kid(1, 1, 'apple', isRed)]), mode: 'kindy' as const };
    expect(clueProblems(p)).toHaveLength(1);
    expect(clueProblems({ ...p, kids: [{ ...p.kids[0]!, clue: null }] })).toEqual([]);
  });
});
