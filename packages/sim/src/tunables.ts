import type { Tunable } from '@snacks/contracts';

/**
 * Every balance number in Snack Attack, with the band it may move inside
 * (docs/RULES.md, Tunables; packages/harness/src/rules.test.ts keeps the two
 * identical).
 *
 * - No balance number lives anywhere else: not inline, not in the interface.
 * - Each entry has a note saying what it is and why the band is what it is.
 * - All values are whole numbers: squares, waves, beats, points.
 */
export const SNACK_TUNABLES = {
  passCap: { value: 12, min: 4, max: 32, note: 'Passes a snack may make before it is dropped (RULES 5): ends every loop; a real route on a 6x8 board never needs more than a handful.' },
  nurseRange: { value: 1, min: 1, max: 3, note: 'How far a Nurse reaches, in squares any way including diagonally (1 = the 8 squares around it, RULES 7).' },
  hungryAllowed: { value: 3, min: 0, max: 5, note: 'Kids who may go home hungry before the day is lost (RULES 8): the 4th loses.' },
  mainWaves: { value: 10, min: 5, max: 15, note: 'Waves in a main-mode day, and in its bonus round (RULES 8).' },
  kindyWaves: { value: 5, min: 3, max: 8, note: 'Waves in a Kindy day, one new kid each (RULES 11, D15).' },
  mainWidth: { value: 6, min: 5, max: 8, note: 'Main board width in squares (D1): 6 keeps squares over 50 px on a 360 px phone.' },
  mainHeight: { value: 8, min: 6, max: 10, note: 'Main board height in squares (D1): portrait, with room for the tray under it.' },
  kindySize: { value: 4, min: 4, max: 5, note: 'Kindy board width and height (RULES 11): 4x4, big squares for small fingers.' },
  pointsPerKid: { value: 1, min: 1, max: 3, note: 'Points for each kid fed (RULES 8, D20).' },
  priceShort: { value: 1, min: 1, max: 5, note: 'Shop price of a Short friend (D20): the cheapest, it only reaches next door.' },
  priceStraight: { value: 2, min: 1, max: 5, note: 'Shop price of a Straight friend (D20).' },
  priceDiagonal: { value: 2, min: 1, max: 5, note: 'Shop price of a Diagonal friend (D20).' },
  priceBouncer: { value: 3, min: 1, max: 6, note: 'Shop price of a Bouncer (D20): jumping over things is worth more.' },
  priceNurse: { value: 3, min: 1, max: 6, note: 'Shop price of a Nurse (D20).' },
  snacksPerDay: { value: 3, min: 2, max: 4, note: 'Snacks in a main-mode day (D14), one lunchbox each.' },
  kindySnacks: { value: 2, min: 1, max: 3, note: 'Snacks in a Kindy day: two, so there is a choice, with the picture showing which.' },
  bouncerBeats: { value: 2, min: 1, max: 3, note: 'Beats a Bouncer hop takes (RULES 7): an L is two squares of travel; decides who gets there first.' },
  routeMax: { value: 3, min: 2, max: 4, note: 'Most friends in one snack route the solver and generator look at (RULES 10): 3 keeps a day under a second on a phone.' },
  solverTries: { value: 4000, min: 500, max: 50000, note: 'Route combinations the solver checks for one wave before giving up on it; it then gives up on the board, and the generator moves to the next seed.' },
  generatorSeeds: { value: 200, min: 20, max: 1000, note: 'Seeds the generator tries for one day before it fails; the harness checks 1000 days never get near it.' },
  obstaclesMin: { value: 2, min: 0, max: 6, note: 'Fewest obstacles (trees, benches) on a main board.' },
  obstaclesMax: { value: 4, min: 0, max: 8, note: 'Most obstacles on a main board.' },
  bonusObstacles: { value: 2, min: 0, max: 4, note: 'Extra obstacles on a bonus board: fewer clear lines.' },
  bonusFriendsFirst: { value: 3, min: 2, max: 6, note: 'Friends the shortest routes of bonus wave 1 add up to, for its 2 kids (RULES 10): the bonus round starts about where the daily is by wave 6.' },
  bonusFriendsLast: { value: 5, min: 4, max: 6, note: 'Friends the shortest routes of the last bonus wave add up to (RULES 10): 5 is one kid on a 3-friend route and one on 2, harder than any daily wave; at 6 a bonus day skips about 23 seeds and nears `generatorSeeds`.' },
  bonusCluesFirst: { value: 30, min: 0, max: 100, note: 'Percent chance bonus wave 1 has a card that points at another kid (RULES 10).' },
  bonusCluesLast: { value: 90, min: 0, max: 100, note: 'Percent chance the last bonus wave has a card that points at another kid; the waves between ramp evenly.' },
  decoys: { value: 2, min: 1, max: 4, note: 'Extra friends in a main-mode starting tray beyond what the planted day needs (RULES 10, K9), so the tray does not give the answer away.' },
  maxProfiles: { value: 6, min: 2, max: 8, note: 'Profiles on one device (RULES 12): six big pictures fit the picker on a 360 x 740 phone; there are 8 pictures.' },
  nameLength: { value: 12, min: 6, max: 20, note: 'Longest profile name, in characters (RULES 12): it sits under a picture.' },
  historyKept: { value: 400, min: 60, max: 3650, note: 'Finished days each profile keeps (RULES 9): over a year; the best streak is kept apart, so trimming never loses it.' },
  kindyHintIdle: { value: 8, min: 4, max: 20, note: 'Seconds a Kindy child may go without a tap before the next hint shows itself (RULES 11): the interface counts them, never the sim.' },
  recentDays: { value: 7, min: 3, max: 14, note: 'Finished days the done-for-today screen can show (RULES 9): a week.' },
} as const satisfies Record<string, Tunable>;

export type SnackTunableId = keyof typeof SNACK_TUNABLES;
