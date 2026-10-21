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
 * generator are exported for the harness; Kindy hints (`hint.ts`) reach the
 * interface in the View.
 */
export { SNACK_TUNABLES, type SnackTunableId } from './tunables.ts';
export { canonicalJson, hashState, hashString } from './hash.ts';
export { mix32, nextUint32, randomInt, seedRng } from './rng.ts';
export { COMPASS, FACINGS, KNIGHT, THROWERS } from './geometry.ts';
export { SNACKS, SNACK_IDS } from './snacks.ts';
export { resolveSnacks, type Flights, type WaveInput, type WaveKid } from './resolve.ts';
export { SCHEMA_VERSION, boughtThisSetup, placementProblem, priceOf, startGame, step, type StepResult } from './game.ts';
export { clueProblems, clueText } from './clues.ts';
export { feedSome, routesTo, solveDay, solveWave, stuckKindySet, type Budget, type DaySolution, type Progress, type WaveSolution } from './solver.ts';
export { kindyHint } from './hint.ts';
export { bonusCluesAt, bonusFriendsAt, daySeed, generatePuzzle, shortestRoutes, tryGenerate } from './generate.ts';
export { trayUse, type TrayUse } from './tray.ts';
export { kidLabel, gameView } from './view.ts';
export { MIGRATIONS, createSave, loadSave, migrateSave, type LoadedGame } from './save.ts';
export { GameSession, newGame } from './session.ts';
export {
  AVATARS,
  BOOK_MIGRATIONS,
  PROFILE_BOOK_VERSION,
  acknowledgeStickers,
  addProfile,
  editProfile,
  emptyBook,
  equipCosmetic,
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
export { CATALOGUE, COSMETICS, MILESTONES, STICKERS, STICKER_PAGES, cosmeticFor, stickerFor } from './stickers.ts';
export { fixturePuzzle, parseFixture, type Fixture } from './fixture.ts';
export { playWitness, witnessCommands } from './witness.ts';
