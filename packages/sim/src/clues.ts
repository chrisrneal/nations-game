import type { Clue, ClueFact, KidFeature, Puzzle, PuzzleKid, SnackId } from '@snacks/contracts';
import { SNACKS, TRAITS, trait } from './snacks.ts';

/**
 * Clues (RULES 6): what a kid's card says, and the checker that proves every
 * kid's snack can be worked out from the cards on the board, with at most one
 * logic step.
 */

const FEATURE_WORDS: Readonly<Record<KidFeature, string>> = {
  hat: 'the kid in the hat',
  glasses: 'the kid with glasses',
};

/** The card's text, for a grade-4 reader. */
export function clueText(clue: Clue): string {
  const is = clue.facts.filter((f) => f.kind === 'is').map((f) => f.value);
  const not = clue.facts.filter((f) => f.kind === 'not').map((f) => f.value);
  const same = clue.facts.find((f) => f.kind === 'same');
  const sister = clue.facts.some((f) => f.kind === 'notSister');
  if (same !== undefined) return `Same as ${FEATURE_WORDS[same.feature]}`;
  const parts: string[] = [];
  if (is.length > 0) parts.push(`Something ${is.join(' and ')}`);
  for (const value of not) parts.push(parts.length === 0 ? `Not ${value}` : `not ${value}`);
  if (sister) parts.push(parts.length === 0 ? 'Not their sister’s' : 'not their sister’s');
  return parts.join(', ');
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w !== '').length;
}

/** True when a snack fits every direct fact (is, not) of a clue. */
function fits(snack: SnackId, facts: readonly ClueFact[]): boolean {
  return facts.every((f) => {
    if (f.kind === 'is') return trait(snack, f.trait) === f.value;
    if (f.kind === 'not') return trait(snack, f.trait) !== f.value;
    return true;
  });
}

/** The snacks a clue's own direct facts allow. */
export function directCandidates(clue: Clue, snacks: readonly SnackId[]): SnackId[] {
  return snacks.filter((s) => fits(s, clue.facts));
}

function isDirect(clue: Clue): boolean {
  return clue.facts.every((f) => f.kind === 'is' || f.kind === 'not');
}

/** Every fact about one trait value, for the generator to build clues from. */
function allFacts(snacks: readonly SnackId[]): ClueFact[] {
  const facts: ClueFact[] = [];
  for (const t of TRAITS) {
    const values = [...new Set(snacks.map((s) => trait(s, t)))];
    for (const value of values) {
      facts.push({ kind: 'is', trait: t, value });
      facts.push({ kind: 'not', trait: t, value });
    }
  }
  return facts;
}

function sameSet(a: readonly SnackId[], b: readonly SnackId[]): boolean {
  return a.length === b.length && a.every((s) => b.includes(s));
}

/**
 * Direct clues (one or two facts) that leave exactly `target` among `snacks`,
 * in a fixed order: one fact first. Two-fact clues are kept only when neither
 * fact alone would do, so the second fact is always needed.
 */
export function directClues(target: readonly SnackId[], snacks: readonly SnackId[]): Clue[] {
  const facts = allFacts(snacks);
  const clues: Clue[] = [];
  const one = (f: ClueFact): boolean => sameSet(directCandidates({ facts: [f] }, snacks), target);
  for (const f of facts) if (one(f)) clues.push({ facts: [f] });
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const a = facts[i]!;
      const b = facts[j]!;
      if (a.kind === 'not' && b.kind === 'is') continue; // "Something x, not y" reads better than the other way
      if (a.kind === 'is' && b.kind === 'not' && a.trait === b.trait) continue;
      if (one(a) || one(b)) continue;
      const pair: Clue = { facts: [a, b] };
      if (sameSet(directCandidates(pair, snacks), target)) clues.push(pair);
    }
  }
  return clues.filter((c) => wordCount(clueText(c)) <= 6);
}

/** Kids who may be on the board together with wave `wave`'s kids: theirs, and a healed kid from the wave before. */
function present(puzzle: Puzzle, wave: number): PuzzleKid[] {
  return puzzle.kids.filter((k) => k.wave === wave || k.wave === wave - 1);
}

/**
 * What a kid's clue pins, using the other cards of their wave, or why it
 * cannot. The one-step rule: a "same as" or "not their sister's" fact may
 * only point at a kid whose own card is direct and pins one snack.
 */
export function solveClue(puzzle: Puzzle, kid: PuzzleKid): { snack: SnackId } | { problem: string } {
  const clue = kid.clue;
  if (clue === null) return { problem: `kid ${kid.id} has no clue` };
  if (clue.facts.length < 1 || clue.facts.length > 2) return { problem: `kid ${kid.id} has ${clue.facts.length} facts` };
  const words = wordCount(clueText(clue));
  if (words < 2 || words > 7) return { problem: `kid ${kid.id}'s card has ${words} words` };
  let candidates = directCandidates(clue, puzzle.snacks);
  const wave = puzzle.kids.filter((k) => k.wave === kid.wave);
  const pinnedBy = (other: PuzzleKid): SnackId | null => {
    if (other.clue === null || !isDirect(other.clue)) return null;
    const c = directCandidates(other.clue, puzzle.snacks);
    return c.length === 1 ? c[0]! : null;
  };
  for (const fact of clue.facts) {
    if (fact.kind === 'same') {
      const withIt = present(puzzle, kid.wave).filter((k) => k.look[fact.feature]);
      const ref = withIt[0];
      if (withIt.length !== 1 || ref === undefined || ref.wave !== kid.wave || ref.id === kid.id) return { problem: `kid ${kid.id}: no single kid with ${fact.feature}` };
      const snack = pinnedBy(ref);
      if (snack === null) return { problem: `kid ${kid.id}: the kid with ${fact.feature} is not pinned by their own card` };
      candidates = candidates.filter((s) => s === snack);
    } else if (fact.kind === 'notSister') {
      const sisters = wave.filter((k) => k.id !== kid.id && kid.look.sister > 0 && k.look.sister === kid.look.sister);
      const sister = sisters[0];
      if (sisters.length !== 1 || sister === undefined) return { problem: `kid ${kid.id}: no sister on the board` };
      const snack = pinnedBy(sister);
      if (snack === null) return { problem: `kid ${kid.id}: their sister is not pinned by her own card` };
      candidates = candidates.filter((s) => s !== snack);
    }
  }
  if (candidates.length !== 1) return { problem: `kid ${kid.id}'s card leaves ${candidates.length} snacks` };
  return { snack: candidates[0]! };
}

/** The clue checker (RULES 10): every main-mode kid's card pins exactly the snack they want. */
export function clueProblems(puzzle: Puzzle): string[] {
  if (puzzle.mode === 'kindy') return puzzle.kids.filter((k) => k.clue !== null).map((k) => `kid ${k.id} has a clue in Kindy mode`);
  const problems: string[] = [];
  for (const kid of puzzle.kids) {
    const result = solveClue(puzzle, kid);
    if ('problem' in result) problems.push(result.problem);
    else if (result.snack !== kid.wants) problems.push(`kid ${kid.id}'s card pins ${SNACKS[result.snack].name}, but they want ${SNACKS[kid.wants].name}`);
  }
  return problems;
}
