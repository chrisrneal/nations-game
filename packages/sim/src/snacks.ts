import type { SnackId, SnackInfo, SnackTrait } from '@snacks/contracts';

/**
 * The snack pool (RULES 4). Clues point at these four traits, so the words
 * are ones a grade-4 reader knows. Every pair of snacks differs in at least
 * one trait.
 */
export const SNACKS: Readonly<Record<SnackId, SnackInfo>> = {
  apple: { id: 'apple', name: 'Apple', colour: 'red', feel: 'crunchy', taste: 'sweet', shape: 'round' },
  cookie: { id: 'cookie', name: 'Cookie', colour: 'brown', feel: 'crunchy', taste: 'sweet', shape: 'round' },
  banana: { id: 'banana', name: 'Banana', colour: 'yellow', feel: 'soft', taste: 'sweet', shape: 'long' },
  cheese: { id: 'cheese', name: 'Cheese stick', colour: 'orange', feel: 'soft', taste: 'salty', shape: 'long' },
  pretzel: { id: 'pretzel', name: 'Pretzel', colour: 'brown', feel: 'crunchy', taste: 'salty', shape: 'twisty' },
  grapes: { id: 'grapes', name: 'Grapes', colour: 'green', feel: 'soft', taste: 'sweet', shape: 'round' },
};

/** The pool in a fixed order, for the generator. */
export const SNACK_IDS: readonly SnackId[] = ['apple', 'cookie', 'banana', 'cheese', 'pretzel', 'grapes'];

export const TRAITS: readonly SnackTrait[] = ['colour', 'feel', 'taste', 'shape'];

export function trait(snack: SnackId, which: SnackTrait): string {
  return SNACKS[snack][which];
}
