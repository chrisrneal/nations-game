/**
 * @snacks/sim - the pure rules core of Snack Attack (docs/RULES.md).
 *
 * Contract enforced by tsconfig, ESLint and a test in packages/harness: no DOM,
 * no network, no clock, no Math.random, no imports except @snacks/contracts.
 * Randomness comes from seeded RNGs; all maths is whole numbers.
 *
 * Surface: `step(state, command)` (S1), `newGame(spec)` and `GameSession` for
 * a host; the interface reads only `gameView(state)`. Profiles and the
 * streak (`profiles.ts`) are plain values the host keeps and passes today to. The solver and the
 * generator are exported for the harness.
 */
export { SNACK_TUNABLES, type SnackTunableId } from './tunables.ts';
export { canonicalJson, hashState, hashString } from './hash.ts';
export { mix32, nextUint32, randomInt, seedRng } from './rng.ts';
export { COMPASS, FACINGS, KNIGHT, THROWERS } from './geometry.ts';
export { SNACKS, SNACK_IDS } from './snacks.ts';
export { resolveSnacks, type Flights, type WaveInput, type WaveKid } from './resolve.ts';
export { SCHEMA_VERSION, placementProblem, priceOf, startGame, step, type StepResult } from './game.ts';
export { clueProblems, clueText } from './clues.ts';
export { routesTo, solveDay, solveWave, type Budget, type DaySolution, type WaveSolution } from './solver.ts';
export { daySeed, generatePuzzle, tryGenerate } from './generate.ts';
export { kidLabel, gameView } from './view.ts';
export { MIGRATIONS, createSave, loadSave, migrateSave, type LoadedGame } from './save.ts';
export { GameSession, newGame } from './session.ts';
export {
  AVATARS,
  BOOK_MIGRATIONS,
  PROFILE_BOOK_VERSION,
  addProfile,
  editProfile,
  emptyBook,
  homeView,
  legacyBook,
  longestStreak,
  profileView,
  readBook,
  recordBonus,
  recordDaily,
  removeProfile,
  setActive,
  streakOf,
  type BookChange,
  type BookMigration,
  type FinishedDay,
} from './profiles.ts';
export { fixturePuzzle, parseFixture, type Fixture } from './fixture.ts';
export { playWitness, witnessCommands } from './witness.ts';
